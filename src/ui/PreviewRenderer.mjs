import { PreviewLayoutUtils } from '../PreviewLayoutUtils.mjs'
import { AlignmentUtils } from '../AlignmentUtils.mjs'
import { ZoomUtils } from '../ZoomUtils.mjs'
import { RulerUtils } from '../RulerUtils.mjs'
import { InteractionUtils } from '../InteractionUtils.mjs'
import { QrSizeUtils } from '../QrSizeUtils.mjs'
import { QrCodeUtils } from '../QrCodeUtils.mjs'
import { ParameterTemplateUtils } from '../ParameterTemplateUtils.mjs'
import { ImageRasterUtils } from '../ImageRasterUtils.mjs'
import { Media, Resolution } from 'labelprinterkit-web/src/index.mjs'

/**
 * Handles preview rendering, ruler drawing, and print canvas preparation.
 */
export class PreviewRenderer {
    #onSelectionChange = null

    /**
     * @param {object} els
     * @param {object} state
     * @param {(text: string, type?: string) => void} setStatus
     * @param {(key: string, params?: Record<string, string | number>) => string} translate
     */
    constructor(els, state, setStatus, translate) {
        this.els = els
        this.state = state
        this.setStatus = setStatus
        this.translate = typeof translate === 'function' ? translate : (key) => key
        this._previewBusy = false
        this._previewQueued = false
        this._overlayCanvas = null
        this._interactionLayer = null
        this._interactiveItems = []
        this._interactiveItemsById = new Map()
        this._interactionElements = new Map()
        this._interactables = new Map()
        this._hoverItemId = null
        this._activeItemId = null
        this._selectedItemIds = new Set()
        this.onSelectionChange = null
        this._interaction = null
        this._interactionFrame = null
        this._dotsPerPxX = 1
        this._dotsPerPxY = 1
        this._templateValues = {}
        this._qrRenderCache = new Map()
        this._imageRenderCache = new Map()
        this._sourceImageCache = new Map()
        // Resize handles are part of the editor interaction model (drag via body, scale via dots/edges).
        this._enablePreviewResize = true
        this._handleRadius = 3
        this._overlayPadding = 0
        this._interactionsBound = false
        this._handleHitboxEnter = this._handleHitboxEnter.bind(this)
        this._handleHitboxLeave = this._handleHitboxLeave.bind(this)
        this._handleHitboxPointerDown = this._handleHitboxPointerDown.bind(this)
        this._handleLayerPointerDown = this._handleLayerPointerDown.bind(this)
        this._handleInteractionContextMenu = this._handleInteractionContextMenu.bind(this)
        this._handleInteractDragStart = this._handleInteractDragStart.bind(this)
        this._handleInteractDragMove = this._handleInteractDragMove.bind(this)
        this._handleInteractDragEnd = this._handleInteractDragEnd.bind(this)
        this._handleInteractResizeStart = this._handleInteractResizeStart.bind(this)
        this._handleInteractResizeMove = this._handleInteractResizeMove.bind(this)
        this._handleInteractResizeEnd = this._handleInteractResizeEnd.bind(this)
        this._getInteractCursor = this._getInteractCursor.bind(this)
    }

    /**
     * Returns the locally loaded InteractJS runtime.
     * @returns {Function}
     */
    _requireInteract() {
        if (typeof globalThis.interact !== 'function') {
            throw new Error('interactjs is not loaded. Ensure /node_modules/interactjs/dist/interact.min.js is available.')
        }
        return globalThis.interact
    }

    /**
     * Returns the locally loaded QRCode runtime.
     * @returns {{ toCanvas: Function }}
     */
    _requireQrCode() {
        if (!globalThis.QRCode || typeof globalThis.QRCode.toCanvas !== 'function') {
            throw new Error('qrcode is not loaded. Ensure /node_modules/qrcode/build/qrcode.js is available.')
        }
        return globalThis.QRCode
    }

    /**
     * Builds the preview and print canvases based on the current state.
     * @param {{ parameterValues?: Record<string, string> }} [options={}]
     * @returns {Promise<{
     *  preview: HTMLCanvasElement,
     *  printCanvas: HTMLCanvasElement,
     *  width: number,
     *  height: number,
     *  res: { dots: number[], minLength: number },
     *  printWidth: number,
     *  marginStart: number,
     *  marginEnd: number,
     *  isHorizontal: boolean,
     *  media: object
     * }>}
     */
    async buildCanvasFromState(options = {}) {
        const media = Media[this.state.media] || Media.W24
        const res = Resolution[this.state.resolution] || Resolution.LOW
        const printWidth = media.printArea || 128
        const marginStart = media.lmargin || 0
        const marginEnd = media.rmargin || 0
        const dotScale = (res?.dots?.[1] || 180) / 96 // interpret font sizes as CSS px and scale to printer dots
        const isHorizontal = this.state.orientation === 'horizontal'
        const maxFontDots = Math.max(8, printWidth)
        const parameterValues = this._resolveParameterValues(options.parameterValues)

        const measureCtx = document.createElement('canvas').getContext('2d')
        const feedPadStart = 2 // dots of leading whitespace so print matches preview
        const feedPadEnd = 8 // trailing whitespace
        const blocks = []
        const layoutItems = []
        for (const item of this.state.items) {
            if (item.type === 'text') {
                const resolvedText = ParameterTemplateUtils.resolveTemplateString(item.text || '', parameterValues)
                const family = item.fontFamily || 'sans-serif'
                const requestedSizeDots = Math.round((item.fontSize || 16) * dotScale)
                const {
                    size: fontSizeDots,
                    advanceWidth: textAdvanceWidth,
                    height: textHeight,
                    ascent,
                    descent,
                    inkLeft,
                    inkWidth
                } = this._resolveTextMetrics(resolvedText, family, requestedSizeDots, maxFontDots, measureCtx)
                // Keep base flow dimensions stable while dragging; offsets are visual translation only.
                const span = isHorizontal ? Math.max(textAdvanceWidth, textHeight) : Math.max(textHeight + 4, textHeight)
                blocks.push({
                    ref: item,
                    resolvedText,
                    span,
                    fontSizeDots,
                    textHeight,
                    textAdvanceWidth,
                    textInkLeft: inkLeft,
                    textInkWidth: inkWidth,
                    family,
                    ascent,
                    descent
                })
                continue
            }

            if (item.type === 'shape') {
                const shapeWidth = Math.max(item.width || 120, 4)
                const shapeHeight = Math.max(item.height || 12, 2)
                // Keep base flow dimensions stable while dragging; offsets are visual translation only.
                const span = isHorizontal ? shapeWidth : Math.max(shapeHeight + 4, shapeHeight)
                blocks.push({ ref: item, span, shapeWidth, shapeHeight })
                continue
            }

            if (item.type === 'image') {
                const rawImageWidth = Math.max(8, Math.round(Number(item.width) || 80))
                const rawImageHeight = Math.max(8, Math.round(Number(item.height) || 80))
                const { width: imageWidth, height: imageHeight } = this._constrainImageDimensionsToPrintWidth(
                    rawImageWidth,
                    rawImageHeight,
                    printWidth,
                    isHorizontal
                )
                const imageCanvas = item.imageData
                    ? await this._getCachedImageCanvas(item, imageWidth, imageHeight)
                    : null
                const span = isHorizontal ? imageWidth : Math.max(imageHeight + 4, imageHeight)
                blocks.push({ ref: item, span, imageWidth, imageHeight, imageCanvas })
                continue
            }

            if (item.type === 'qr') {
                const resolvedQrData = ParameterTemplateUtils.resolveTemplateString(item.data || '', parameterValues)
                const qrCanvas = await this._getCachedQrCanvas(resolvedQrData, item.size, item)
                const span = Math.max(item.height, item.size)
                blocks.push({ ref: item, span, qrSize: item.size, qrCanvas })
            }
        }

        const baseTotalLength = feedPadStart + blocks.reduce((sum, block) => sum + block.span, 0) + feedPadEnd
        const contentAxisEnd = this._computeMaxFlowAxisEnd(blocks, isHorizontal, feedPadStart)
        const minLength = res.minLength
        const autoLengthDots = PreviewLayoutUtils.computeAutoLabelLengthDots(baseTotalLength, contentAxisEnd, feedPadEnd, minLength)
        const forcedLengthDots = this.state.mediaLengthMm
            ? Math.max(minLength, Math.round((this.state.mediaLengthMm / 25.4) * res.dots[1]))
            : null
        const length = forcedLengthDots ? Math.max(forcedLengthDots, autoLengthDots) : autoLengthDots
        const canvas = document.createElement('canvas')
        canvas.width = isHorizontal ? length : printWidth
        canvas.height = isHorizontal ? printWidth : length
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#000'

        if (isHorizontal) {
            let x = feedPadStart
            for (const {
                ref: item,
                span,
                fontSizeDots,
                family,
                ascent,
                descent,
                shapeWidth,
                shapeHeight,
                imageWidth,
                imageHeight,
                textAdvanceWidth,
                resolvedText,
                qrCanvas,
                imageCanvas
            } of blocks) {
                const yAdjust = item.yOffset || 0
                if (item.type === 'text') {
                    const resolvedSize =
                        fontSizeDots || Math.min(Math.max(8, Math.round((item.fontSize || 16) * dotScale)), maxFontDots)
                    ctx.font = `${resolvedSize}px ${family || item.fontFamily || 'sans-serif'}`
                    ctx.textBaseline = 'alphabetic'
                    const a = ascent || resolvedSize
                    const d = descent || 0
                    const blockH = a + d
                    const baselineY = (canvas.height - blockH) / 2 + a + yAdjust
                    const drawX = (item.xOffset || 0) + x
                    const textMetrics = ctx.measureText(resolvedText || '')
                    const inkLeft = Number.isFinite(textMetrics.actualBoundingBoxLeft)
                        ? textMetrics.actualBoundingBoxLeft
                        : 0
                    const inkRight = Number.isFinite(textMetrics.actualBoundingBoxRight)
                        ? textMetrics.actualBoundingBoxRight
                        : textMetrics.width
                    const actualAscent = Number.isFinite(textMetrics.actualBoundingBoxAscent)
                        ? textMetrics.actualBoundingBoxAscent
                        : a
                    const actualDescent = Number.isFinite(textMetrics.actualBoundingBoxDescent)
                        ? textMetrics.actualBoundingBoxDescent
                        : d
                    const clampedInkLeft = Math.max(0, inkLeft)
                    const clampedInkRight = Math.max(clampedInkLeft, inkRight)
                    const inkWidth = Math.max(1, clampedInkRight - clampedInkLeft)
                    ctx.fillText(resolvedText || '', drawX, baselineY)
                    const inkOffsetX = drawX + clampedInkLeft
                    layoutItems.push({
                        id: item.id,
                        type: item.type,
                        item,
                        bounds: {
                            x: inkOffsetX,
                            y: baselineY - actualAscent,
                            width: inkWidth || textAdvanceWidth || 1,
                            height: Math.max(1, actualAscent + actualDescent)
                        }
                    })
                } else if (item.type === 'qr') {
                    const qrY = Math.max(0, (canvas.height - item.size) / 2 + yAdjust)
                    const drawX = (item.xOffset || 0) + x
                    ctx.drawImage(qrCanvas, drawX, qrY, item.size, item.size)
                    layoutItems.push({
                        id: item.id,
                        type: item.type,
                        item,
                        bounds: {
                            x: drawX,
                            y: qrY,
                            width: item.size,
                            height: item.size
                        }
                    })
                } else if (item.type === 'image') {
                    const drawWidth = Math.max(1, imageWidth || item.width || 1)
                    const drawHeight = Math.max(1, imageHeight || item.height || 1)
                    const drawY = Math.max(0, (canvas.height - drawHeight) / 2 + yAdjust)
                    const drawX = (item.xOffset || 0) + x
                    if (imageCanvas) {
                        ctx.drawImage(imageCanvas, drawX, drawY, drawWidth, drawHeight)
                    }
                    layoutItems.push({
                        id: item.id,
                        type: item.type,
                        item,
                        bounds: {
                            x: drawX,
                            y: drawY,
                            width: drawWidth,
                            height: drawHeight
                        }
                    })
                } else if (item.type === 'shape') {
                    const drawX = (item.xOffset || 0) + x
                    const drawY = Math.max(0, (canvas.height - shapeHeight) / 2 + yAdjust)
                    this._drawShape(ctx, item, drawX, drawY, shapeWidth, shapeHeight)
                    layoutItems.push({
                        id: item.id,
                        type: item.type,
                        item,
                        bounds: {
                            x: drawX,
                            y: drawY,
                            width: shapeWidth,
                            height: shapeHeight
                        }
                    })
                }
                x += span
            }
        } else {
            let y = feedPadStart
            for (const {
                ref: item,
                span,
                fontSizeDots,
                family,
                ascent,
                descent,
                shapeWidth,
                shapeHeight,
                imageWidth,
                imageHeight,
                textAdvanceWidth,
                resolvedText,
                qrCanvas,
                imageCanvas
            } of blocks) {
                const yAdjust = item.yOffset || 0
                if (item.type === 'text') {
                    const resolvedSize =
                        fontSizeDots || Math.min(Math.max(8, Math.round((item.fontSize || 16) * dotScale)), maxFontDots)
                    ctx.font = `${resolvedSize}px ${family || item.fontFamily || 'sans-serif'}`
                    ctx.textBaseline = 'alphabetic'
                    const a = ascent || resolvedSize
                    const d = descent || 0
                    const blockH = a + d
                    const baselineY = y + (span - blockH) / 2 + a + yAdjust
                    const drawX = item.xOffset || 0
                    const textMetrics = ctx.measureText(resolvedText || '')
                    const inkLeft = Number.isFinite(textMetrics.actualBoundingBoxLeft)
                        ? textMetrics.actualBoundingBoxLeft
                        : 0
                    const inkRight = Number.isFinite(textMetrics.actualBoundingBoxRight)
                        ? textMetrics.actualBoundingBoxRight
                        : textMetrics.width
                    const actualAscent = Number.isFinite(textMetrics.actualBoundingBoxAscent)
                        ? textMetrics.actualBoundingBoxAscent
                        : a
                    const actualDescent = Number.isFinite(textMetrics.actualBoundingBoxDescent)
                        ? textMetrics.actualBoundingBoxDescent
                        : d
                    const clampedInkLeft = Math.max(0, inkLeft)
                    const clampedInkRight = Math.max(clampedInkLeft, inkRight)
                    const inkWidth = Math.max(1, clampedInkRight - clampedInkLeft)
                    ctx.fillText(resolvedText || '', drawX, baselineY)
                    const inkOffsetX = drawX + clampedInkLeft
                    layoutItems.push({
                        id: item.id,
                        type: item.type,
                        item,
                        bounds: {
                            x: inkOffsetX,
                            y: baselineY - actualAscent,
                            width: inkWidth || textAdvanceWidth || 1,
                            height: Math.max(1, actualAscent + actualDescent)
                        }
                    })
                } else if (item.type === 'qr') {
                    const qrY = y + Math.max(0, (span - item.size) / 2 + yAdjust)
                    const drawX = item.xOffset || 0
                    ctx.drawImage(qrCanvas, drawX, qrY, item.size, item.size)
                    layoutItems.push({
                        id: item.id,
                        type: item.type,
                        item,
                        bounds: {
                            x: drawX,
                            y: qrY,
                            width: item.size,
                            height: item.size
                        }
                    })
                } else if (item.type === 'image') {
                    const drawWidth = Math.max(1, imageWidth || item.width || 1)
                    const drawHeight = Math.max(1, imageHeight || item.height || 1)
                    const drawY = y + Math.max(0, (span - drawHeight) / 2 + yAdjust)
                    const drawX = item.xOffset || 0
                    if (imageCanvas) {
                        ctx.drawImage(imageCanvas, drawX, drawY, drawWidth, drawHeight)
                    }
                    layoutItems.push({
                        id: item.id,
                        type: item.type,
                        item,
                        bounds: {
                            x: drawX,
                            y: drawY,
                            width: drawWidth,
                            height: drawHeight
                        }
                    })
                } else if (item.type === 'shape') {
                    const drawX = Math.max(0, (canvas.width - shapeWidth) / 2 + (item.xOffset || 0))
                    const drawY = y + Math.max(0, (span - shapeHeight) / 2 + yAdjust)
                    this._drawShape(ctx, item, drawX, drawY, shapeWidth, shapeHeight)
                    layoutItems.push({
                        id: item.id,
                        type: item.type,
                        item,
                        bounds: {
                            x: drawX,
                            y: drawY,
                            width: shapeWidth,
                            height: shapeHeight
                        }
                    })
                }
                y += span
            }
        }

        // Preview shows only the printable area; margins are hinted in render().
        const preview = canvas
        const printCanvas = isHorizontal ? canvas : this._rotateForPrint(canvas)
        const effectiveMedia = { ...media, printArea: printWidth, lmargin: marginStart, rmargin: marginEnd }
        return {
            preview,
            printCanvas,
            width: preview.width,
            height: preview.height,
            res,
            printWidth,
            marginStart,
            marginEnd,
            isHorizontal,
            media: effectiveMedia,
            layoutItems
        }
    }

    /**
     * Constrains image dimensions to the printable cross-axis width.
     * Horizontal layout constrains image height, vertical layout constrains image width.
     * @param {number} width
     * @param {number} height
     * @param {number} printWidth
     * @param {boolean} isHorizontal
     * @returns {{ width: number, height: number }}
     */
    _constrainImageDimensionsToPrintWidth(width, height, printWidth, isHorizontal) {
        const safeWidth = Math.max(8, Math.round(Number(width) || 8))
        const safeHeight = Math.max(8, Math.round(Number(height) || 8))
        const crossAxisLimit = Math.max(8, Math.round(Number(printWidth) || 8))
        if (isHorizontal && safeHeight > crossAxisLimit) {
            const scale = crossAxisLimit / safeHeight
            return {
                width: Math.max(8, Math.round(safeWidth * scale)),
                height: crossAxisLimit
            }
        }
        if (!isHorizontal && safeWidth > crossAxisLimit) {
            const scale = crossAxisLimit / safeWidth
            return {
                width: crossAxisLimit,
                height: Math.max(8, Math.round(safeHeight * scale))
            }
        }
        return { width: safeWidth, height: safeHeight }
    }

    /**
     * Estimates the farthest occupied position on the flow axis.
     * @param {Array<{
     *  ref: object,
     *  span: number,
     *  textAdvanceWidth?: number,
     *  textInkLeft?: number,
     *  textInkWidth?: number,
     *  ascent?: number,
     *  descent?: number,
     *  fontSizeDots?: number,
     *  shapeWidth?: number,
     *  shapeHeight?: number,
     *  imageWidth?: number,
     *  imageHeight?: number,
     *  qrSize?: number
     * }>} blocks
     * @param {boolean} isHorizontal
     * @param {number} feedPadStart
     * @returns {number}
     */
    _computeMaxFlowAxisEnd(blocks, isHorizontal, feedPadStart) {
        let cursor = Math.max(0, feedPadStart || 0)
        let maxEnd = cursor
        blocks.forEach((block) => {
            const item = block.ref || {}
            if (isHorizontal) {
                let start = cursor
                let size = Math.max(1, block.span || 1)
                if (item.type === 'text') {
                    const inkLeft = Math.max(0, block.textInkLeft || 0)
                    const inkWidth = Math.max(1, block.textInkWidth || block.textAdvanceWidth || 1)
                    start = cursor + (item.xOffset || 0) + inkLeft
                    size = inkWidth
                } else if (item.type === 'shape') {
                    start = cursor + (item.xOffset || 0)
                    size = Math.max(1, block.shapeWidth || item.width || 1)
                } else if (item.type === 'image') {
                    start = cursor + (item.xOffset || 0)
                    size = Math.max(1, block.imageWidth || item.width || 1)
                } else if (item.type === 'qr') {
                    start = cursor + (item.xOffset || 0)
                    size = Math.max(1, block.qrSize || item.size || 1)
                }
                maxEnd = Math.max(maxEnd, start + size)
            } else {
                let start = cursor
                let size = Math.max(1, block.span || 1)
                const yAdjust = item.yOffset || 0
                if (item.type === 'text') {
                    const ascent = block.ascent || block.fontSizeDots || 0
                    const descent = block.descent || 0
                    const textHeight = Math.max(1, ascent + descent)
                    start = cursor + (Math.max(0, (block.span || textHeight) - textHeight) / 2 + yAdjust)
                    size = textHeight
                } else if (item.type === 'shape') {
                    const shapeHeight = Math.max(1, block.shapeHeight || item.height || 1)
                    start = cursor + Math.max(0, ((block.span || shapeHeight) - shapeHeight) / 2 + yAdjust)
                    size = shapeHeight
                } else if (item.type === 'image') {
                    const imageHeight = Math.max(1, block.imageHeight || item.height || 1)
                    start = cursor + Math.max(0, ((block.span || imageHeight) - imageHeight) / 2 + yAdjust)
                    size = imageHeight
                } else if (item.type === 'qr') {
                    const qrSize = Math.max(1, block.qrSize || item.size || 1)
                    start = cursor + Math.max(0, ((block.span || qrSize) - qrSize) / 2 + yAdjust)
                    size = qrSize
                }
                maxEnd = Math.max(maxEnd, start + size)
            }
            cursor += Math.max(0, block.span || 0)
        })
        return maxEnd
    }

    /**
     * Binds pointer interactions for hover, drag, and resize.
     */
    bindInteractions() {
        if (this._interactionsBound) return
        this._ensureOverlayCanvas()
        this._ensureInteractionLayer()
        this._interactionsBound = true
    }

    /**
     * Returns the currently selected interactive item ids.
     * @returns {string[]}
     */
    getSelectedItemIds() {
        return Array.from(this._selectedItemIds)
    }

    /**
     * Sets template values used during preview rendering.
     * @param {Record<string, string>} values
     */
    setTemplateValues(values) {
        this._templateValues = values && typeof values === 'object' ? { ...values } : {}
    }

    /**
     * Sets the selection change callback.
     * @param {(selectedIds: string[]) => void} callback
     */
    set onSelectionChange(callback) {
        this.#onSelectionChange = typeof callback === 'function' ? callback : null
    }

    /**
     * Returns the current selection change callback.
     * @returns {((selectedIds: string[]) => void) | null}
     */
    get onSelectionChange() {
        return this.#onSelectionChange
    }

    /**
     * Replaces the current interactive selection.
     * @param {string[]} itemIds
     */
    setSelectedItemIds(itemIds) {
        const nextIds = new Set(Array.isArray(itemIds) ? itemIds.filter((id) => typeof id === 'string' && id) : [])
        let changed = false
        if (nextIds.size !== this._selectedItemIds.size) {
            changed = true
        } else {
            for (const id of nextIds) {
                if (!this._selectedItemIds.has(id)) {
                    changed = true
                    break
                }
            }
        }
        if (!changed) return
        this._selectedItemIds = nextIds
        if (this._activeItemId && !this._selectedItemIds.has(this._activeItemId)) {
            this._activeItemId = null
        }
        this._emitSelectionChange()
        this._drawOverlay()
    }

    /**
     * Aligns the currently selected items.
     * @param {'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'} alignMode
     * @param {'selection' | 'largest' | 'smallest' | 'label'} [referenceMode='selection']
     * @returns {{ changed: boolean, reason?: string, count: number }}
     */
    alignSelectedItems(alignMode, referenceMode = 'selection') {
        const selectedEntries = this._interactiveItems.filter((entry) => this._selectedItemIds.has(entry.id))
        if (!selectedEntries.length) {
            return { changed: false, reason: 'no-selection', count: 0 }
        }
        if (referenceMode !== 'label' && selectedEntries.length < 2) {
            return { changed: false, reason: 'need-multiple', count: selectedEntries.length }
        }
        const labelBounds = {
            x: 0,
            y: 0,
            width: this.els.preview?.width || 0,
            height: this.els.preview?.height || 0
        }
        const referenceRect = AlignmentUtils.resolveAlignmentReferenceRect(selectedEntries, referenceMode, labelBounds)
        if (!referenceRect) {
            return { changed: false, reason: 'missing-reference', count: selectedEntries.length }
        }
        let changed = false
        selectedEntries.forEach((entry) => {
            const { deltaX, deltaY } = AlignmentUtils.computeAlignmentDelta(entry.bounds, referenceRect, alignMode)
            const nextDeltaX = Math.round(deltaX)
            const nextDeltaY = Math.round(deltaY)
            if (nextDeltaX) {
                entry.item.xOffset = Math.round((entry.item.xOffset || 0) + nextDeltaX)
                changed = true
            }
            if (nextDeltaY) {
                entry.item.yOffset = Math.round((entry.item.yOffset || 0) + nextDeltaY)
                changed = true
            }
        })
        return { changed, count: selectedEntries.length }
    }

    /**
     * Emits selection updates for external UI sync.
     */
    _emitSelectionChange() {
        if (typeof this.onSelectionChange !== 'function') return
        this.onSelectionChange(this.getSelectedItemIds())
    }

    /**
     * Renders the preview with rulers, margins, and label markers.
     * @returns {Promise<void>}
     */
    async render() {
        if (this._previewBusy) {
            this._previewQueued = true
            return
        }
        this._previewBusy = true
        this._previewQueued = false
        try {
            const { preview, width, height, res, printWidth, marginStart, marginEnd, isHorizontal, layoutItems } =
                await this.buildCanvasFromState()
            const ctx = this.els.preview.getContext('2d')
            this.els.preview.width = width
            this.els.preview.height = height
            this._debugLog('render:size', {
                width,
                height,
                interaction: this._interaction?.type || null,
                activeItemId: this._activeItemId
            })
            const dotsPerMmX = (res?.dots?.[0] || 180) / 25.4
            const dotsPerMmY = (res?.dots?.[1] || res?.dots?.[0] || 180) / 25.4
            const mediaInfo = Media[this.state.media]
            const { labelMmWidth, labelMmHeight } = PreviewLayoutUtils.computeLabelMmDimensions(
                width,
                height,
                dotsPerMmX,
                dotsPerMmY,
                mediaInfo?.width ?? null,
                isHorizontal
            )
            const labelTagGap = 6
            const labelTagInset = 12
            let labelTagRectWidth = 0
            let labelTagRectHeight = 0
            if (this.els.labelWidth) {
                this.els.labelWidth.textContent = mediaInfo?.width ? `${mediaInfo.width}mm` : ''
                this.els.labelWidth.style.left = '0px'
                this.els.labelWidth.style.top = '0px'
                const tagRect = this.els.labelWidth.getBoundingClientRect()
                labelTagRectWidth = tagRect?.width || 0
                labelTagRectHeight = tagRect?.height || 0
            }
            const tapeOffset = labelTagRectWidth ? labelTagRectWidth + labelTagGap : 0
            let maxPreviewWidthPx = 0
            if (this.els.canvasWrap) {
                const wrapStyles = window.getComputedStyle(this.els.canvasWrap)
                const paddingLeft = Number.parseFloat(wrapStyles.paddingLeft) || 0
                const paddingRight = Number.parseFloat(wrapStyles.paddingRight) || 0
                maxPreviewWidthPx = Math.max(
                    0,
                    this.els.canvasWrap.clientWidth - paddingLeft - paddingRight - tapeOffset
                )
            }
            const { displayWidthMm, displayHeightMm, pxPerMm } = PreviewLayoutUtils.computePreviewMetrics(
                labelMmWidth,
                labelMmHeight,
                maxPreviewWidthPx
            )
            const zoomFactor = ZoomUtils.clampZoom(this.state.zoom ?? 1)
            const effectivePxPerMm = pxPerMm * zoomFactor
            const displayWidthPx = displayWidthMm * effectivePxPerMm
            const displayHeightPx = displayHeightMm * effectivePxPerMm
            const labelPxWidth = labelMmWidth * effectivePxPerMm
            const labelPxHeight = labelMmHeight * effectivePxPerMm
            const isDragging = this._interaction?.type === 'drag'
            const allowVerticalLayoutUpdate = !isDragging || this.state.orientation === 'vertical'

            this.els.preview.style.width = `${Math.max(labelPxWidth, 1)}px`
            if (allowVerticalLayoutUpdate) {
                this.els.preview.style.height = `${Math.max(labelPxHeight, 1)}px`
            }
            if (this.els.labelPlate) {
                this.els.labelPlate.style.width = `${displayWidthPx}px`
                if (allowVerticalLayoutUpdate) {
                    this.els.labelPlate.style.height = `${Math.max(labelPxHeight, 24)}px`
                }
                this.els.labelPlate.style.marginLeft = `${tapeOffset}px`
            }
            if (allowVerticalLayoutUpdate && this.els.canvasWrap) {
                this.els.canvasWrap.style.height = `${displayHeightPx}px`
                this.els.canvasWrap.style.minHeight = `${displayHeightPx}px`
            }
            if (allowVerticalLayoutUpdate) {
                const stageBody = this.els.canvasWrap?.closest('.stage-body')
                if (stageBody) {
                    stageBody.style.height = `${displayHeightPx}px`
                    stageBody.style.minHeight = `${displayHeightPx}px`
                }
                const verticalRuler = this.els.rulerY?.parentElement
                if (verticalRuler) {
                    verticalRuler.style.height = `${displayHeightPx}px`
                    verticalRuler.style.minHeight = `${displayHeightPx}px`
                }
                if (this.els.rulerY) {
                    this.els.rulerY.style.height = `${displayHeightPx}px`
                }
            }
            const previewRect = this.els.preview.getBoundingClientRect()
            this._dotsPerPxX = previewRect.width ? width / previewRect.width : 1
            this._dotsPerPxY = previewRect.height ? height / previewRect.height : 1
            this._debugLog('render:metrics', {
                labelMmWidth,
                labelMmHeight,
                zoomFactor,
                labelPxHeight,
                displayHeightPx,
                previewHeightPx: previewRect.height
            })
            ctx.clearRect(0, 0, width, height)
            ctx.drawImage(preview, 0, 0)
            this._drawMissingImagePlaceholders(ctx, layoutItems)
            ctx.save()
            const marginInsetPx = 2
            // The preview canvas already represents the printable tape width, so the marker spans the full label.
            const marginRect = PreviewLayoutUtils.computeMarginMarkerRect(width, height, 0, 0, marginInsetPx)
            if (marginRect.width > 0 && marginRect.height > 0) {
                ctx.strokeStyle = '#7c7c7c'
                ctx.lineWidth = 1
                ctx.setLineDash([1, 3])
                ctx.lineCap = 'round'
                ctx.strokeRect(
                    marginRect.x + 0.5,
                    marginRect.y + 0.5,
                    Math.max(0, marginRect.width - 1),
                    Math.max(0, marginRect.height - 1)
                )
            }
            ctx.restore()

            const orientationLabel =
                this.state.orientation === 'horizontal'
                    ? this.translate('preview.orientationHorizontal')
                    : this.translate('preview.orientationVertical')
            const printableLabel = this.translate('formats.printable', { printWidth })
            const marginLabel =
                marginStart || marginEnd
                    ? this.translate('formats.margins', { start: marginStart, end: marginEnd })
                    : ''
            this.els.dimensions.textContent = this.translate('formats.dimensions', {
                media: this.state.media,
                printableLabel,
                marginLabel,
                orientationLabel
            })
            const wrapRect = this.els.canvasWrap?.getBoundingClientRect()
            const plateRect = this.els.labelPlate?.getBoundingClientRect()
            const rulerOffsetX = wrapRect && plateRect ? Math.max(0, plateRect.left - wrapRect.left) : 0
            const rulerWidthPx = wrapRect && plateRect ? Math.max(0, plateRect.width + rulerOffsetX) : 0
            const rulerOffsetY = wrapRect && plateRect ? Math.max(0, plateRect.top - wrapRect.top) : 0
            const rulerHeightPx = wrapRect ? Math.max(0, wrapRect.height + rulerOffsetY) : 0
            if (this.els.labelWidth && wrapRect && plateRect && labelTagRectWidth && labelTagRectHeight) {
                const tapeStartX = plateRect.left - wrapRect.left
                const centerTop = plateRect.top - wrapRect.top + plateRect.height / 2
                const { labelLeft, labelTop } = PreviewLayoutUtils.computeLabelTagLayout(
                    tapeStartX,
                    centerTop,
                    labelTagRectWidth,
                    labelTagRectHeight,
                    labelTagGap,
                    labelTagInset
                )
                this.els.labelWidth.style.left = `${labelLeft}px`
                this.els.labelWidth.style.top = `${labelTop}px`
            }
            if (this.els.rulerX) {
                const rulerSpanDots = displayWidthMm * dotsPerMmX
                this._drawRulerAxis(
                    this.els.rulerX,
                    rulerSpanDots,
                    res?.dots?.[0] || res?.dots?.[1] || 180,
                    'x',
                    false,
                    rulerOffsetX,
                    rulerWidthPx,
                    labelMmWidth
                )
            }
            if (this.els.rulerY) {
                const rulerSpanDotsY = displayHeightMm * dotsPerMmY
                this._drawRulerAxis(
                    this.els.rulerY,
                    rulerSpanDotsY,
                    res?.dots?.[1] || res?.dots?.[0] || 180,
                    'y',
                    false,
                    rulerOffsetY,
                    rulerHeightPx,
                    labelMmHeight
                )
            }
            this._updateInteractiveItems(layoutItems, previewRect)
            this._syncInteractionLayer(previewRect, wrapRect)
            this._syncHitboxes()
            this._updateOverlayCanvas(previewRect, wrapRect)
            this._drawOverlay()
        } catch (err) {
            console.error(err)
            this.setStatus(this.translate('preview.failed'), 'error')
        } finally {
            this._previewBusy = false
            if (this._previewQueued) {
                this.render()
            }
        }
    }

    /**
     * Draws visual placeholders for image items without uploaded source data.
     * This is preview-only and does not change the generated print canvas.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Array<{ id: string, type: string, item: object, bounds: { x: number, y: number, width: number, height: number } }>} layoutItems
     */
    _drawMissingImagePlaceholders(ctx, layoutItems) {
        if (!Array.isArray(layoutItems)) return
        layoutItems.forEach((entry) => {
            if (entry?.type !== 'image') return
            const sourceData = typeof entry.item?.imageData === 'string' ? entry.item.imageData.trim() : ''
            if (sourceData) return
            this._drawMissingImagePlaceholder(ctx, entry.bounds)
        })
    }

    /**
     * Draws a dashed placeholder block for a missing image source.
     * @param {CanvasRenderingContext2D} ctx
     * @param {{ x: number, y: number, width: number, height: number }} bounds
     */
    _drawMissingImagePlaceholder(ctx, bounds) {
        if (!bounds) return
        const x = Number(bounds.x) || 0
        const y = Number(bounds.y) || 0
        const width = Math.max(1, Number(bounds.width) || 1)
        const height = Math.max(1, Number(bounds.height) || 1)
        ctx.save()
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
        ctx.fillRect(x, y, width, height)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 3])
        ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1))
        ctx.setLineDash([])
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)'
        ctx.beginPath()
        ctx.moveTo(x + 1, y + 1)
        ctx.lineTo(x + width - 1, y + height - 1)
        ctx.moveTo(x + width - 1, y + 1)
        ctx.lineTo(x + 1, y + height - 1)
        ctx.stroke()
        if (width >= 30 && height >= 14) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
            const fontSize = Math.max(9, Math.min(12, Math.floor(height * 0.22)))
            ctx.font = `${fontSize}px Barlow, sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(this.translate('itemsEditor.typeImage'), x + width / 2, y + height / 2)
        }
        ctx.restore()
    }

    /**
     * Updates the list of interactive items with CSS-space bounds.
     * @param {Array<{ id: string, type: string, item: object, bounds: { x: number, y: number, width: number, height: number } }>} layoutItems
     * @param {DOMRect} previewRect
     */
    _updateInteractiveItems(layoutItems, previewRect) {
        const scaleX = previewRect.width ? previewRect.width / (this.els.preview.width || 1) : 1
        const scaleY = previewRect.height ? previewRect.height / (this.els.preview.height || 1) : 1
        this._interactiveItemsById.clear()
        this._interactiveItems = layoutItems
            .filter((entry) => InteractionUtils.isInteractiveItemType(entry.type))
            .map((entry) => {
                const enriched = {
                    ...entry,
                    boundsCss: {
                        x: entry.bounds.x * scaleX,
                        y: entry.bounds.y * scaleY,
                        width: entry.bounds.width * scaleX,
                        height: entry.bounds.height * scaleY
                    }
                }
                this._interactiveItemsById.set(entry.id, enriched)
                return enriched
            })
        let selectionChanged = false
        const validIds = new Set(this._interactiveItems.map((entry) => entry.id))
        for (const id of Array.from(this._selectedItemIds)) {
            if (validIds.has(id)) continue
            this._selectedItemIds.delete(id)
            selectionChanged = true
        }
        if (this._activeItemId && !validIds.has(this._activeItemId)) {
            this._activeItemId = null
        }
        if (this._hoverItemId && !validIds.has(this._hoverItemId)) {
            this._hoverItemId = null
        }
        if (selectionChanged) {
            this._emitSelectionChange()
        }
    }

    /**
     * Ensures the overlay canvas exists for interactive handles.
     * @returns {HTMLCanvasElement}
     */
    _ensureOverlayCanvas() {
        if (this._overlayCanvas) return this._overlayCanvas
        const overlay = document.createElement('canvas')
        overlay.dataset.previewOverlay = 'true'
        overlay.className = 'preview-overlay'
        overlay.style.position = 'absolute'
        overlay.style.left = '0'
        overlay.style.top = '0'
        overlay.style.pointerEvents = 'none'
        overlay.style.zIndex = '2'
        if (this.els.canvasWrap) {
            this.els.canvasWrap.appendChild(overlay)
        }
        this._overlayCanvas = overlay
        return overlay
    }

    /**
     * Aligns the overlay canvas to match the preview canvas.
     * @param {DOMRect} previewRect
     * @param {DOMRect | undefined} wrapRect
     */
    _updateOverlayCanvas(previewRect, wrapRect) {
        const overlay = this._ensureOverlayCanvas()
        if (!previewRect.width || !previewRect.height || !wrapRect) return
        const overlayPadding = (this._handleRadius || 0) + 1
        this._overlayPadding = overlayPadding
        const offsetLeft = previewRect.left - wrapRect.left - overlayPadding
        const offsetTop = previewRect.top - wrapRect.top - overlayPadding
        const overlayWidth = previewRect.width + overlayPadding * 2
        const overlayHeight = previewRect.height + overlayPadding * 2
        overlay.style.left = `${offsetLeft}px`
        overlay.style.top = `${offsetTop}px`
        overlay.style.width = `${overlayWidth}px`
        overlay.style.height = `${overlayHeight}px`
        const dpr = window.devicePixelRatio || 1
        overlay.width = Math.max(1, Math.round(overlayWidth * dpr))
        overlay.height = Math.max(1, Math.round(overlayHeight * dpr))
    }

    /**
     * Draws selection handles for the active or hovered item.
     */
    _drawOverlay() {
        const overlay = this._overlayCanvas
        if (!overlay) return
        const ctx = overlay.getContext('2d')
        const rect = overlay.getBoundingClientRect()
        if (!rect.width || !rect.height) return
        const dpr = window.devicePixelRatio || 1
        ctx.save()
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, rect.width, rect.height)
        const selectedItems = this._interactiveItems.filter((entry) => this._selectedItemIds.has(entry.id))
        const hoverItem = this._interactiveItems.find((entry) => entry.id === this._hoverItemId) || null
        const activeItem = this._interactiveItems.find((entry) => entry.id === this._activeItemId) || null
        if (!selectedItems.length && !hoverItem && !activeItem) {
            ctx.restore()
            return
        }
        const overlayPadding = this._overlayPadding || 0
        selectedItems.forEach((entry) => this._drawSelectionOutline(ctx, entry.boundsCss, overlayPadding, '#2d7dff', [3, 2]))
        if (!selectedItems.length && hoverItem) {
            this._drawSelectionOutline(ctx, hoverItem.boundsCss, overlayPadding, '#2d7dff', [3, 2])
        }
        let handlesItem = null
        if (selectedItems.length) {
            if (InteractionUtils.shouldRenderResizeHandles(selectedItems.length)) {
                handlesItem = selectedItems.find((entry) => entry.id === this._activeItemId) || selectedItems[0] || null
            }
        } else {
            handlesItem = activeItem || hoverItem
        }
        if (handlesItem) {
            this._drawSelectionHandles(ctx, handlesItem.boundsCss, overlayPadding)
        }
        ctx.restore()
    }

    /**
     * Draws a selection rectangle.
     * @param {CanvasRenderingContext2D} ctx
     * @param {{ x: number, y: number, width: number, height: number }} boundsCss
     * @param {number} overlayPadding
     * @param {string} strokeStyle
     * @param {number[]} dashPattern
     */
    _drawSelectionOutline(ctx, boundsCss, overlayPadding, strokeStyle, dashPattern) {
        const { x, y, width, height } = boundsCss
        if (width <= 0 || height <= 0) return
        const drawX = x + overlayPadding
        const drawY = y + overlayPadding
        ctx.strokeStyle = strokeStyle
        ctx.lineWidth = 1
        ctx.setLineDash(dashPattern)
        ctx.strokeRect(drawX, drawY, width, height)
        ctx.setLineDash([])
    }

    /**
     * Draws resize handles for a selected item.
     * @param {CanvasRenderingContext2D} ctx
     * @param {{ x: number, y: number, width: number, height: number }} boundsCss
     * @param {number} overlayPadding
     */
    _drawSelectionHandles(ctx, boundsCss, overlayPadding) {
        const { x, y, width, height } = boundsCss
        if (width <= 0 || height <= 0) return
        const handleRadius = this._handleRadius || 3
        const handleFill = '#2d7dff'
        const handleStroke = '#e7efff'
        const drawX = x + overlayPadding
        const drawY = y + overlayPadding
        const handles = InteractionUtils.computeHandlePositions({ x: drawX, y: drawY, width, height })
        handles.forEach((handle) => {
            ctx.beginPath()
            ctx.arc(handle.x, handle.y, handleRadius, 0, Math.PI * 2)
            ctx.fillStyle = handleFill
            ctx.fill()
            ctx.strokeStyle = handleStroke
            ctx.stroke()
        })
    }

    /**
     * Ensures the interaction layer exists for InteractJS targets.
     * @returns {HTMLDivElement}
     */
    _ensureInteractionLayer() {
        if (this._interactionLayer) return this._interactionLayer
        const layer = document.createElement('div')
        layer.className = 'preview-interaction-layer'
        layer.style.position = 'absolute'
        layer.style.left = '0'
        layer.style.top = '0'
        layer.style.pointerEvents = 'auto'
        layer.style.zIndex = '3'
        layer.addEventListener('pointerdown', this._handleLayerPointerDown)
        layer.addEventListener('contextmenu', this._handleInteractionContextMenu)
        if (this.els.canvasWrap) {
            this.els.canvasWrap.appendChild(layer)
        }
        this._interactionLayer = layer
        return layer
    }

    /**
     * Aligns the interaction layer with the preview canvas.
     * @param {DOMRect} previewRect
     * @param {DOMRect | undefined} wrapRect
     */
    _syncInteractionLayer(previewRect, wrapRect) {
        const layer = this._interactionLayer
        if (!layer || !wrapRect) return
        if (!previewRect.width || !previewRect.height) return
        const offsetLeft = previewRect.left - wrapRect.left
        const offsetTop = previewRect.top - wrapRect.top
        layer.style.left = `${offsetLeft}px`
        layer.style.top = `${offsetTop}px`
        layer.style.width = `${previewRect.width}px`
        layer.style.height = `${previewRect.height}px`
    }

    /**
     * Syncs hitbox elements for all interactive items.
     */
    _syncHitboxes() {
        const layer = this._interactionLayer
        if (!layer) return
        const seen = new Set()
        for (const entry of this._interactiveItems) {
            const id = entry.id
            seen.add(id)
            let element = this._interactionElements.get(id)
            if (!element) {
                element = this._createHitboxElement(id)
                layer.appendChild(element)
                this._interactionElements.set(id, element)
            }
            element.style.width = `${Math.max(1, entry.boundsCss.width)}px`
            element.style.height = `${Math.max(1, entry.boundsCss.height)}px`
            element.style.left = `${entry.boundsCss.x}px`
            element.style.top = `${entry.boundsCss.y}px`
            element.dataset.itemId = id
            this._ensureInteractable(element)
        }
        for (const [id, element] of this._interactionElements.entries()) {
            if (!seen.has(id)) {
                this._destroyInteractable(id)
                element.remove()
                this._interactionElements.delete(id)
            }
        }
    }

    /**
     * Creates a hitbox element for an interactive item.
     * @param {string} itemId
     * @returns {HTMLDivElement}
     */
    _createHitboxElement(itemId) {
        const element = document.createElement('div')
        element.className = 'preview-hitbox'
        element.dataset.itemId = itemId
        element.style.position = 'absolute'
        element.style.left = '0'
        element.style.top = '0'
        element.style.pointerEvents = 'auto'
        element.style.background = 'transparent'
        element.style.touchAction = 'none'
        element.addEventListener('pointerdown', this._handleHitboxPointerDown)
        element.addEventListener('pointerenter', this._handleHitboxEnter)
        element.addEventListener('pointerleave', this._handleHitboxLeave)
        return element
    }

    /**
     * Ensures an InteractJS instance exists for the hitbox element.
     * @param {HTMLElement} element
     */
    _ensureInteractable(element) {
        const itemId = element.dataset.itemId
        if (!itemId || this._interactables.has(itemId)) return
        const interact = this._requireInteract()
        const interactable = interact(element).draggable({
            listeners: {
                start: this._handleInteractDragStart,
                move: this._handleInteractDragMove,
                end: this._handleInteractDragEnd
            }
        })
        if (this._enablePreviewResize) {
            interactable.resizable({
                edges: { left: true, right: true, top: true, bottom: true },
                listeners: {
                    start: this._handleInteractResizeStart,
                    move: this._handleInteractResizeMove,
                    end: this._handleInteractResizeEnd
                }
            })
        }
        if (typeof interactable.actionChecker === 'function') {
            interactable.actionChecker((pointer, event, action, _interactable, targetElement) =>
                this._resolvePointerAction(pointer, event, targetElement, action)
            )
        }
        if (typeof interactable.styleCursor === 'function') {
            interactable.styleCursor(true)
        }
        if (typeof interactable.cursorChecker === 'function') {
            interactable.cursorChecker(this._getInteractCursor)
        }
        this._interactables.set(itemId, interactable)
    }

    /**
     * Tears down the InteractJS instance for an item id.
     * @param {string} itemId
     */
    _destroyInteractable(itemId) {
        const interactable = this._interactables.get(itemId)
        if (!interactable) return
        interactable.unset()
        this._interactables.delete(itemId)
    }

    /**
     * Gets the interactive entry for an event target.
     * @param {Event} event
     * @returns {{ id: string, type: string, item: object, bounds: object, boundsCss: object } | null}
     */
    _getEntryFromEvent(event) {
        const target = event.currentTarget
        const itemId = target?.dataset?.itemId
        if (!itemId) return null
        return this._interactiveItemsById.get(itemId) || null
    }

    /**
     * Handles hitbox hover entry to show resize handles.
     * @param {PointerEvent} event
     */
    _handleHitboxEnter(event) {
        const entry = this._getEntryFromEvent(event)
        if (!entry) return
        this._hoverItemId = entry.id
        this._drawOverlay()
    }

    /**
     * Handles hitbox hover leave to hide resize handles.
     * @param {PointerEvent} event
     */
    _handleHitboxLeave(event) {
        if (this._interaction) return
        const entry = this._getEntryFromEvent(event)
        if (!entry) return
        if (this._activeItemId === entry.id) return
        if (this._hoverItemId === entry.id) {
            this._hoverItemId = null
        }
        this._drawOverlay()
    }

    /**
     * Handles hitbox pointer down to update selection.
     * Ctrl/Cmd toggles additive multi-selection.
     * @param {PointerEvent} event
     */
    _handleHitboxPointerDown(event) {
        const entry = this._getEntryFromEvent(event)
        if (!entry) return
        const isAdditive = InteractionUtils.isAdditiveSelectionModifier(event)
        if (isAdditive) {
            // Keep modifier-click dedicated to additive selection in the editor.
            event.preventDefault()
            event.stopImmediatePropagation()
        }
        const previousIds = Array.from(this._selectedItemIds)
        const nextIds = InteractionUtils.resolveSelectionIds(entry.id, previousIds, isAdditive)
        const nextSelection = new Set(nextIds)
        let selectionChanged = nextSelection.size !== this._selectedItemIds.size
        if (!selectionChanged) {
            for (const id of nextSelection) {
                if (!this._selectedItemIds.has(id)) {
                    selectionChanged = true
                    break
                }
            }
        }
        if (selectionChanged) {
            this._selectedItemIds = nextSelection
        }
        if (this._selectedItemIds.has(entry.id)) {
            this._activeItemId = entry.id
        } else if (this._activeItemId === entry.id) {
            this._activeItemId = null
        }
        this._hoverItemId = entry.id
        if (selectionChanged) {
            this._emitSelectionChange()
        }
        this._drawOverlay()
    }

    /**
     * Handles layer pointer down to clear selection when clicking empty space.
     * @param {PointerEvent} event
     */
    _handleLayerPointerDown(event) {
        if (event.target !== this._interactionLayer) return
        if (InteractionUtils.isAdditiveSelectionModifier(event)) {
            event.preventDefault()
            return
        }
        if (!this._selectedItemIds.size) return
        this._selectedItemIds.clear()
        this._activeItemId = null
        this._hoverItemId = null
        this._emitSelectionChange()
        this._drawOverlay()
    }

    /**
     * Suppresses browser context menus for modifier-click interactions.
     * @param {MouseEvent} event
     */
    _handleInteractionContextMenu(event) {
        if (InteractionUtils.isAdditiveSelectionModifier(event)) {
            event.preventDefault()
        }
    }

    /**
     * Resolves the cursor for InteractJS pointer actions.
     * @param {{ name?: string, edges?: { left?: boolean, right?: boolean, top?: boolean, bottom?: boolean } } | null} action
     * @returns {string}
     */
    _getInteractCursor(action) {
        if (!action) return ''
        if (action.name === 'resize') {
            const handle = InteractionUtils.getHandleFromEdges(action.edges)
            return InteractionUtils.getCursorForHandle(handle)
        }
        if (action.name === 'drag') {
            return InteractionUtils.getCursorForHandle('move')
        }
        return ''
    }

    /**
     * Resolves the intended InteractJS action from pointer position.
     * Resize is active only when the pointer is on a visible handle dot.
     * @param {object} pointer
     * @param {object} event
     * @param {HTMLElement | null | undefined} targetElement
     * @param {{ name?: string, edges?: { left?: boolean, right?: boolean, top?: boolean, bottom?: boolean } } | null | undefined} fallbackAction
     * @returns {{ name: 'drag' | 'resize', edges: { left?: boolean, right?: boolean, top?: boolean, bottom?: boolean } | null} | null}
     */
    _resolvePointerAction(pointer, event, targetElement, fallbackAction) {
        if (InteractionUtils.isAdditiveSelectionModifier(event) || InteractionUtils.isAdditiveSelectionModifier(pointer)) {
            return null
        }
        const handle = this._getPointerHandle(pointer, event, targetElement)
        if (this._enablePreviewResize && handle && handle !== 'move') {
            const edges = InteractionUtils.getEdgesFromHandle(handle)
            if (edges) {
                return { name: 'resize', edges }
            }
        }
        if (fallbackAction?.name === 'drag') {
            return { name: 'drag', edges: null }
        }
        return { name: 'drag', edges: null }
    }

    /**
     * Finds the handle under the pointer within a hitbox element.
     * @param {object} pointer
     * @param {object} event
     * @param {HTMLElement | null | undefined} targetElement
     * @returns {string | null}
     */
    _getPointerHandle(pointer, event, targetElement) {
        if (!targetElement) return null
        const rect = targetElement.getBoundingClientRect()
        if (!rect.width || !rect.height) return null
        const clientX = Number.isFinite(event?.clientX) ? event.clientX : pointer?.clientX
        const clientY = Number.isFinite(event?.clientY) ? event.clientY : pointer?.clientY
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null
        const point = { x: clientX - rect.left, y: clientY - rect.top }
        const bounds = { x: 0, y: 0, width: rect.width, height: rect.height }
        // Resize should trigger only on the visible dots, not broad edge zones.
        const hitRadius = Math.max(1, this._handleRadius || 3)
        return InteractionUtils.getHandleAtPoint(point, bounds, hitRadius)
    }

    /**
     * Handles InteractJS drag start.
     * @param {object} event
     */
    _handleInteractDragStart(event) {
        if (InteractionUtils.isAdditiveSelectionModifier(event)) return
        const entry = this._getEntryFromEvent(event)
        if (!entry) return
        if (!this._selectedItemIds.has(entry.id)) {
            this._selectedItemIds.clear()
            this._selectedItemIds.add(entry.id)
            this._emitSelectionChange()
        }
        this._activeItemId = entry.id
        this._hoverItemId = entry.id
        const dragItemIds = InteractionUtils.resolveDragItemIds(entry.id, this._selectedItemIds)
        const dragEntries = dragItemIds
            .map((id) => this._interactiveItemsById.get(id) || null)
            .filter((candidate) => !!candidate)
        this._interaction = {
            type: 'drag',
            entries: dragEntries
        }
        this._debugLog('drag:start', {
            id: entry.id,
            count: dragEntries.length,
            xOffset: entry.item.xOffset || 0,
            yOffset: entry.item.yOffset || 0
        })
        this._drawOverlay()
    }

    /**
     * Handles InteractJS drag move.
     * @param {object} event
     */
    _handleInteractDragMove(event) {
        if (!this._interaction || this._interaction.type !== 'drag') return
        const entry = this._getEntryFromEvent(event)
        if (!entry) return
        const dxDots = (event.dx || 0) * this._dotsPerPxX
        const dyDots = (event.dy || 0) * this._dotsPerPxY
        const dragEntries = this._interaction.entries || []
        dragEntries.forEach((dragEntry) => {
            const item = dragEntry.item
            item.xOffset = Math.round((item.xOffset || 0) + dxDots)
            item.yOffset = Math.round((item.yOffset || 0) + dyDots)
        })
        this._debugLog('drag:move', {
            id: entry.id,
            count: dragEntries.length,
            dxDots,
            dyDots,
            xOffset: entry.item.xOffset || 0,
            yOffset: entry.item.yOffset || 0
        })
        this._queueRender()
    }

    /**
     * Handles InteractJS drag end.
     * @param {object} event
     */
    _handleInteractDragEnd(event) {
        if (!this._interaction || this._interaction.type !== 'drag') return
        const entry = this._getEntryFromEvent(event)
        if (entry) {
            this._hoverItemId = entry.id
            this._debugLog('drag:end', {
                id: entry.id,
                count: this._interaction?.entries?.length || 0,
                xOffset: entry.item.xOffset || 0,
                yOffset: entry.item.yOffset || 0
            })
        }
        this._interaction = null
        this._activeItemId = null
        this._drawOverlay()
    }

    /**
     * Handles InteractJS resize start.
     * @param {object} event
     */
    _handleInteractResizeStart(event) {
        if (!this._enablePreviewResize) return
        if (InteractionUtils.isAdditiveSelectionModifier(event)) return
        const entry = this._getEntryFromEvent(event)
        if (!entry) return
        if (!this._selectedItemIds.has(entry.id)) {
            this._selectedItemIds.clear()
            this._selectedItemIds.add(entry.id)
            this._emitSelectionChange()
        }
        const item = entry.item
        this._activeItemId = entry.id
        this._hoverItemId = entry.id
        this._interaction = {
            type: 'resize',
            handle: InteractionUtils.getHandleFromEdges(event.edges),
            item,
            startRect: {
                width: event.rect?.width || entry.boundsCss.width,
                height: event.rect?.height || entry.boundsCss.height
            },
            startItem: {
                xOffset: item.xOffset || 0,
                yOffset: item.yOffset || 0,
                width: item.width || 0,
                height: item.height || 0,
                fontSize: item.fontSize || 16
            }
        }
        this._debugLog('resize:start', {
            id: entry.id,
            edges: event.edges || null,
            shiftKey: !!event.shiftKey
        })
        this._drawOverlay()
    }

    /**
     * Handles InteractJS resize move.
     * @param {object} event
     */
    _handleInteractResizeMove(event) {
        if (!this._interaction || this._interaction.type !== 'resize') return
        const entry = this._getEntryFromEvent(event)
        if (!entry) return
        const item = entry.item
        const deltaLeft = (event.deltaRect?.left || 0) * this._dotsPerPxX
        const deltaTop = (event.deltaRect?.top || 0) * this._dotsPerPxY
        if (item.type === 'shape') {
            const widthDots = Math.max(4, Math.round((event.rect?.width || 0) * this._dotsPerPxX))
            const heightDots = Math.max(2, Math.round((event.rect?.height || 0) * this._dotsPerPxY))
            item.width = widthDots
            item.height = heightDots
            if (deltaLeft) {
                item.xOffset = Math.round((item.xOffset || 0) + deltaLeft)
            }
            if (deltaTop) {
                item.yOffset = Math.round((item.yOffset || 0) + deltaTop)
            }
        } else if (item.type === 'image') {
            const widthDots = Math.max(8, Math.round((event.rect?.width || 0) * this._dotsPerPxX))
            const heightDots = Math.max(8, Math.round((event.rect?.height || 0) * this._dotsPerPxY))
            const media = Media[this.state.media] || Media.W24
            const printWidth = Math.max(8, media?.printArea || 128)
            const constrained = this._constrainImageDimensionsToPrintWidth(
                widthDots,
                heightDots,
                printWidth,
                this.state.orientation === 'horizontal'
            )
            item.width = constrained.width
            item.height = constrained.height
            if (deltaLeft) {
                item.xOffset = Math.round((item.xOffset || 0) + deltaLeft)
            }
            if (deltaTop) {
                item.yOffset = Math.round((item.yOffset || 0) + deltaTop)
            }
        } else if (item.type === 'qr') {
            const widthDots = Math.max(1, Math.round((event.rect?.width || 0) * this._dotsPerPxX))
            const heightDots = Math.max(1, Math.round((event.rect?.height || 0) * this._dotsPerPxY))
            const sizeDots = QrSizeUtils.clampQrSizeToLabel(this.state, Math.max(widthDots, heightDots))
            item.size = sizeDots
            item.height = sizeDots
            if (deltaLeft) {
                item.xOffset = Math.round((item.xOffset || 0) + deltaLeft)
            }
            if (deltaTop) {
                item.yOffset = Math.round((item.yOffset || 0) + deltaTop)
            }
        } else if (item.type === 'text') {
            const startRect = this._interaction.startRect
            const scaleX = startRect.width ? (event.rect?.width || startRect.width) / startRect.width : 1
            const scaleY = startRect.height ? (event.rect?.height || startRect.height) / startRect.height : 1
            const scale = Math.max(scaleX, scaleY)
            item.fontSize = Math.max(8, Math.round((this._interaction.startItem.fontSize || 16) * scale))
            if (deltaLeft) {
                item.xOffset = Math.round((item.xOffset || 0) + deltaLeft)
            }
            if (deltaTop) {
                item.yOffset = Math.round((item.yOffset || 0) + deltaTop)
            }
        }
        this._debugLog('resize:move', {
            id: entry.id,
            type: item.type,
            rectWidth: event.rect?.width || 0,
            rectHeight: event.rect?.height || 0,
            deltaLeft,
            deltaTop
        })
        this._queueRender()
    }

    /**
     * Handles InteractJS resize end.
     * @param {object} event
     */
    _handleInteractResizeEnd(event) {
        if (!this._interaction || this._interaction.type !== 'resize') return
        const entry = this._getEntryFromEvent(event)
        if (entry) {
            this._hoverItemId = entry.id
            this._debugLog('resize:end', {
                id: entry.id
            })
        }
        this._interaction = null
        this._activeItemId = null
        this._drawOverlay()
    }

    /**
     * Queues a render on the next animation frame for interactive updates.
     */
    _queueRender() {
        if (this._interactionFrame) return
        this._interactionFrame = window.requestAnimationFrame(() => {
            this._interactionFrame = null
            this.render()
        })
    }

    /**
     * Writes preview interaction logs when debugging is enabled.
     * @param {string} event
     * @param {object} payload
     */
    _debugLog(event, payload) {
        if (!window.__LABEL_DEBUG_INTERACTIONS) return
        console.log(`[PreviewRenderer] ${event}`, payload)
    }

    /**
     * Resolves template values for the current render pass.
     * @param {Record<string, string> | undefined} values
     * @returns {Record<string, string>}
     */
    _resolveParameterValues(values) {
        if (values && typeof values === 'object') {
            return values
        }
        return this._templateValues && typeof this._templateValues === 'object' ? this._templateValues : {}
    }

    /**
     * Returns a cached QR canvas or generates a new one.
     * @param {string} data
     * @param {number} size
     * @param {object} item
     * @returns {Promise<HTMLCanvasElement>}
     */
    async _getCachedQrCanvas(data, size, item = {}) {
        const safeSize = Math.max(1, Math.round(Number(size) || 1))
        const normalizedOptions = QrCodeUtils.normalizeItemOptions(item)
        const cacheKey = `${safeSize}::${normalizedOptions.qrErrorCorrectionLevel}::${normalizedOptions.qrVersion}::${normalizedOptions.qrEncodingMode}::${String(data || '')}`
        if (this._qrRenderCache.has(cacheKey)) {
            const cached = this._qrRenderCache.get(cacheKey)
            this._qrRenderCache.delete(cacheKey)
            this._qrRenderCache.set(cacheKey, cached)
            return cached
        }
        const builtCanvas = await this._buildQrCanvas(data, safeSize, normalizedOptions)
        this._qrRenderCache.set(cacheKey, builtCanvas)
        const maxEntries = 96
        if (this._qrRenderCache.size > maxEntries) {
            const oldestKey = this._qrRenderCache.keys().next().value
            if (oldestKey) {
                this._qrRenderCache.delete(oldestKey)
            }
        }
        return builtCanvas
    }

    /**
     * Builds a QR code canvas for preview rendering.
     * @param {string} data
     * @param {number} size
     * @param {object} options
     * @returns {Promise<HTMLCanvasElement>}
     */
    async _buildQrCanvas(data, size, options = {}) {
        const canvas = document.createElement('canvas')
        const qrCode = this._requireQrCode()
        const normalizedOptions = QrCodeUtils.normalizeItemOptions(options)
        const payload = QrCodeUtils.buildQrPayload(data || '', normalizedOptions.qrEncodingMode)
        const qrOptions = {
            errorCorrectionLevel: normalizedOptions.qrErrorCorrectionLevel,
            margin: 0,
            width: size
        }
        if (normalizedOptions.qrVersion > 0) {
            qrOptions.version = normalizedOptions.qrVersion
        }
        await qrCode.toCanvas(canvas, payload, qrOptions)
        return canvas
    }

    /**
     * Returns a cached monochrome image canvas or generates one.
     * @param {object} item
     * @param {number} width
     * @param {number} height
     * @returns {Promise<HTMLCanvasElement | null>}
     */
    async _getCachedImageCanvas(item, width, height) {
        const imageData = String(item?.imageData || '')
        if (!imageData) return null
        const safeWidth = Math.max(1, Math.round(Number(width) || 1))
        const safeHeight = Math.max(1, Math.round(Number(height) || 1))
        const normalizedOptions = ImageRasterUtils.normalizeItemOptions(item)
        const cacheKey = this._buildImageCacheKey(imageData, safeWidth, safeHeight, normalizedOptions)
        if (this._imageRenderCache.has(cacheKey)) {
            const cached = this._imageRenderCache.get(cacheKey)
            this._imageRenderCache.delete(cacheKey)
            this._imageRenderCache.set(cacheKey, cached)
            return cached
        }
        const sourceImage = await this._getSourceImage(imageData)
        if (!sourceImage) return null
        const canvas = this._buildMonochromeImageCanvas(sourceImage, safeWidth, safeHeight, normalizedOptions)
        this._imageRenderCache.set(cacheKey, canvas)
        const maxEntries = 96
        if (this._imageRenderCache.size > maxEntries) {
            const oldestKey = this._imageRenderCache.keys().next().value
            if (oldestKey) {
                this._imageRenderCache.delete(oldestKey)
            }
        }
        return canvas
    }

    /**
     * Builds a stable cache key for rendered image variants.
     * @param {string} imageData
     * @param {number} width
     * @param {number} height
     * @param {{ imageDither: string, imageThreshold: number, imageSmoothing: string, imageInvert: boolean }} options
     * @returns {string}
     */
    _buildImageCacheKey(imageData, width, height, options) {
        const sourceHash = this._hashString(imageData)
        return `${sourceHash}:${width}x${height}:${options.imageDither}:${options.imageThreshold}:${options.imageSmoothing}:${options.imageInvert ? 1 : 0}`
    }

    /**
     * Computes a small non-cryptographic hash for cache keys.
     * @param {string} value
     * @returns {string}
     */
    _hashString(value) {
        let hash = 2166136261
        for (let i = 0; i < value.length; i += 1) {
            hash ^= value.charCodeAt(i)
            hash = Math.imul(hash, 16777619)
        }
        return (hash >>> 0).toString(16)
    }

    /**
     * Loads and caches image elements by source data URL.
     * @param {string} imageData
     * @returns {Promise<HTMLImageElement | null>}
     */
    async _getSourceImage(imageData) {
        if (!imageData) return null
        if (this._sourceImageCache.has(imageData)) {
            return this._sourceImageCache.get(imageData)
        }
        const imageElement = await this._loadImageElement(imageData)
        if (!imageElement) return null
        this._sourceImageCache.set(imageData, imageElement)
        const maxEntries = 32
        if (this._sourceImageCache.size > maxEntries) {
            const oldestKey = this._sourceImageCache.keys().next().value
            if (oldestKey) {
                this._sourceImageCache.delete(oldestKey)
            }
        }
        return imageElement
    }

    /**
     * Creates and decodes an HTML image element.
     * @param {string} imageData
     * @returns {Promise<HTMLImageElement | null>}
     */
    async _loadImageElement(imageData) {
        return new Promise((resolve) => {
            const imageElement = new Image()
            imageElement.onload = () => resolve(imageElement)
            imageElement.onerror = () => resolve(null)
            imageElement.src = imageData
        })
    }

    /**
     * Builds a monochrome image canvas from source pixels.
     * @param {CanvasImageSource} sourceImage
     * @param {number} width
     * @param {number} height
     * @param {{ imageDither: string, imageThreshold: number, imageSmoothing: string, imageInvert: boolean }} options
     * @returns {HTMLCanvasElement}
     */
    _buildMonochromeImageCanvas(sourceImage, width, height, options) {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, width, height)
        const smoothingMode = options.imageSmoothing
        ctx.imageSmoothingEnabled = smoothingMode !== 'off'
        if (ctx.imageSmoothingEnabled && 'imageSmoothingQuality' in ctx) {
            ctx.imageSmoothingQuality = smoothingMode === 'high' ? 'high' : smoothingMode === 'low' ? 'low' : 'medium'
        }
        ctx.drawImage(sourceImage, 0, 0, width, height)
        const imageData = ctx.getImageData(0, 0, width, height)
        const monochromePixels = ImageRasterUtils.convertRgbaToMonochrome(imageData.data, width, height, options)
        imageData.data.set(monochromePixels)
        ctx.putImageData(imageData, 0, 0)
        return canvas
    }

    /**
     * Measures text metrics using the provided canvas context.
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} text
     * @param {number} size
     * @param {string} family
     * @returns {{
     *  advanceWidth: number,
     *  height: number,
     *  ascent: number,
     *  descent: number,
     *  inkLeft: number,
     *  inkRight: number,
     *  inkWidth: number
     * }}
     */
    _measureText(ctx, text, size, family) {
        ctx.font = `${size}px ${family}`
        const metrics = ctx.measureText(text || '')
        const ascent = metrics.actualBoundingBoxAscent || size
        const descent = metrics.actualBoundingBoxDescent || 0
        const inkLeft = Number.isFinite(metrics.actualBoundingBoxLeft) ? metrics.actualBoundingBoxLeft : 0
        const inkRight = Number.isFinite(metrics.actualBoundingBoxRight) ? metrics.actualBoundingBoxRight : metrics.width
        const inkWidth = Math.max(0, inkRight - inkLeft)
        const advanceWidth = Math.ceil(metrics.width)
        const height = Math.ceil(ascent + descent)
        return { advanceWidth, height, ascent, descent, inkLeft, inkRight, inkWidth }
    }

    /**
     * Resolves text metrics while ensuring it fits within the available height.
     * @param {string} text
     * @param {string} family
     * @param {number} requestedSize
     * @param {number} maxHeight
     * @param {CanvasRenderingContext2D} ctx
     * @returns {{
     *  size: number,
     *  advanceWidth: number,
     *  height: number,
     *  ascent: number,
     *  descent: number,
     *  inkLeft: number,
     *  inkRight: number,
     *  inkWidth: number
     * }}
     */
    _resolveTextMetrics(text, family, requestedSize, maxHeight, ctx) {
        const limit = Math.max(4, maxHeight)
        let size = Math.min(Math.max(4, requestedSize), limit * 3) // allow overshoot; shrink only if needed
        let { advanceWidth, height, inkLeft, inkRight, inkWidth } = this._measureText(ctx, text, size, family)
        while (height > limit && size > 4) {
            size -= 1
            const nextMetrics = this._measureText(ctx, text, size, family)
            advanceWidth = nextMetrics.advanceWidth
            height = nextMetrics.height
            inkLeft = nextMetrics.inkLeft
            inkRight = nextMetrics.inkRight
            inkWidth = nextMetrics.inkWidth
        }
        const { ascent, descent } = this._measureText(ctx, text, size, family)
        return {
            size,
            advanceWidth,
            height: Math.min(height, limit),
            ascent,
            descent,
            inkLeft,
            inkRight,
            inkWidth
        }
    }

    /**
     * Draws basic shapes (rect, roundRect, oval, polygon, line) onto the canvas.
     * @param {CanvasRenderingContext2D} ctx
     * @param {object} item
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    _drawShape(ctx, item, x, y, width, height) {
        const type = item.shapeType || 'rect'
        const lw = Math.max(1, item.strokeWidth || 2)
        ctx.save()
        ctx.lineWidth = lw
        ctx.strokeStyle = '#000'
        ctx.beginPath()
        if (type === 'rect') {
            ctx.strokeRect(x, y, width, height)
        } else if (type === 'roundRect') {
            const r = Math.min(item.cornerRadius || 8, width / 2, height / 2)
            ctx.beginPath()
            ctx.moveTo(x + r, y)
            ctx.lineTo(x + width - r, y)
            ctx.quadraticCurveTo(x + width, y, x + width, y + r)
            ctx.lineTo(x + width, y + height - r)
            ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
            ctx.lineTo(x + r, y + height)
            ctx.quadraticCurveTo(x, y + height, x, y + height - r)
            ctx.lineTo(x, y + r)
            ctx.quadraticCurveTo(x, y, x + r, y)
            ctx.stroke()
        } else if (type === 'oval') {
            ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
            ctx.stroke()
        } else if (type === 'polygon') {
            const sides = Math.max(3, Math.min(12, Math.floor(item.sides || 6)))
            const cx = x + width / 2
            const cy = y + height / 2
            const radius = Math.min(width, height) / 2
            for (let i = 0; i < sides; i++) {
                const a = (-Math.PI / 2) + (i * 2 * Math.PI) / sides
                const px = cx + radius * Math.cos(a)
                const py = cy + radius * Math.sin(a)
                if (i === 0) ctx.moveTo(px, py)
                else ctx.lineTo(px, py)
            }
            ctx.closePath()
            ctx.stroke()
        } else if (type === 'line') {
            ctx.moveTo(x, y + height / 2)
            ctx.lineTo(x + width, y + height / 2)
            ctx.stroke()
        }
        ctx.restore()
    }

    /**
     * Draws a millimeter ruler axis into a canvas.
     * @param {HTMLCanvasElement} canvas
     * @param {number} lengthDots
     * @param {number} dpi
     * @param {'x' | 'y'} [orientation='x']
     * @param {boolean} [showUnitLabel=true]
     * @param {number} [offsetPx=0]
     * @param {number} [axisLengthPxOverride=0]
     * @param {number} [highlightLengthMm=0]
     */
    _drawRulerAxis(
        canvas,
        lengthDots,
        dpi,
        orientation = 'x',
        showUnitLabel = true,
        offsetPx = 0,
        axisLengthPxOverride = 0,
        highlightLengthMm = 0
    ) {
        if (!canvas || !dpi || !lengthDots) return
        const parent = canvas.parentElement
        const cssWidth = Math.max(
            1,
            Math.round(parent?.clientWidth || canvas.clientWidth || canvas.getBoundingClientRect().width || 0)
        )
        const cssHeight = Math.max(
            1,
            Math.round(parent?.clientHeight || canvas.clientHeight || canvas.getBoundingClientRect().height || 0)
        )
        if (!cssWidth || !cssHeight) return
        canvas.style.width = `${cssWidth}px`
        canvas.style.height = `${cssHeight}px`
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.max(1, Math.round(cssWidth * dpr))
        canvas.height = Math.max(1, Math.round(cssHeight * dpr))
        const ctx = canvas.getContext('2d')
        ctx.save()
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, cssWidth, cssHeight)
        const rootStyles = getComputedStyle(document.documentElement)
        const rulerBase = rootStyles.getPropertyValue('--ruler-base').trim() || '#23262f'
        ctx.fillStyle = rulerBase
        ctx.fillRect(0, 0, cssWidth, cssHeight)
        ctx.strokeStyle = '#5b606a'
        ctx.lineWidth = 1

        const dotsPerMm = dpi / 25.4
        const lengthMm = lengthDots / dotsPerMm
        const axisLengthPx = orientation === 'x' ? cssWidth : cssHeight
        // Keep ruler zoom in sync with the tape even when the tape is wider than the visible viewport.
        const scaleAxisPx = axisLengthPxOverride > 0 ? axisLengthPxOverride : axisLengthPx
        const { pixelsPerMm, startPx } = RulerUtils.computeRulerScale(lengthMm, scaleAxisPx, offsetPx)
        const { startPx: highlightStartPx, lengthPx: highlightLengthPx } = RulerUtils.computeRulerHighlight(
            startPx,
            pixelsPerMm,
            highlightLengthMm,
            axisLengthPx
        )
        if (highlightLengthPx > 0) {
            const highlightColor = rootStyles.getPropertyValue('--ruler').trim() || '#2a2f3a'
            ctx.fillStyle = highlightColor
            if (orientation === 'x') {
                ctx.fillRect(highlightStartPx, 0, highlightLengthPx, cssHeight)
            } else {
                ctx.fillRect(0, highlightStartPx, cssWidth, highlightLengthPx)
            }
        }

        const horizontalLabelInset = 6
        const verticalLabelInset = 6

        for (let mm = 0; mm <= lengthMm; mm += 1) {
            const pos = startPx + mm * pixelsPerMm
            const isMajor = mm % 10 === 0
            const isMid = mm % 5 === 0
            const size = isMajor ? 14 : isMid ? 9 : 6
            ctx.beginPath()
            if (orientation === 'x') {
                ctx.moveTo(pos, 0)
                ctx.lineTo(pos, size)
            } else {
                ctx.moveTo(0, pos)
                ctx.lineTo(size, pos)
            }
            ctx.stroke()
            if (isMajor) {
                ctx.fillStyle = '#d7dbe4'
                ctx.font = '10px Barlow, sans-serif'
                if (orientation === 'x') {
                    const labelX = RulerUtils.computeRulerLabelPosition(pos, startPx, axisLengthPx, horizontalLabelInset)
                    ctx.textAlign = 'center'
                    ctx.textBaseline = 'alphabetic'
                    ctx.fillText(`${mm}`, labelX, cssHeight - 6)
                } else {
                    const labelPos = RulerUtils.computeRulerLabelPosition(pos, startPx, axisLengthPx, verticalLabelInset)
                    ctx.save()
                    ctx.translate(cssWidth - 9, labelPos)
                    ctx.rotate(-Math.PI / 2)
                    ctx.textAlign = 'center'
                    ctx.textBaseline = 'middle'
                    ctx.fillText(`${mm}`, 0, 0)
                    ctx.restore()
                }
            }
        }

        if (showUnitLabel) {
            ctx.fillStyle = '#d7dbe4'
            ctx.font = '10px Barlow, sans-serif'
            ctx.textAlign = 'left'
            ctx.textBaseline = 'alphabetic'
            ctx.fillText('mm', 4, 12)
        }
        ctx.restore()
    }

    /**
     * Rotates a canvas so the print head width matches the expected orientation.
     * @param {HTMLCanvasElement} canvas
     * @returns {HTMLCanvasElement}
     */
    _rotateForPrint(canvas) {
        const rotated = document.createElement('canvas')
        rotated.width = canvas.height
        rotated.height = canvas.width
        const ctx = rotated.getContext('2d')
        // Rotate so the canvas height matches the print head width expected by Label/Job.
        ctx.translate(rotated.width, 0)
        ctx.rotate(Math.PI / 2)
        ctx.drawImage(canvas, 0, 0)
        return rotated
    }
}
