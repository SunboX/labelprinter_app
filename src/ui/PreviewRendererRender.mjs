import { PreviewLayoutUtils } from '../PreviewLayoutUtils.mjs'
import { ZoomUtils } from '../ZoomUtils.mjs'
import { InteractionUtils } from '../InteractionUtils.mjs'
import { Media } from 'labelprinterkit-web/src/index.mjs'
import { PreviewRendererCanvasBuild } from './PreviewRendererCanvasBuild.mjs'

/**
 * Preview rendering and overlay drawing layer.
 */
export class PreviewRendererRender extends PreviewRendererCanvasBuild {
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
            this._rulerContext = {
                res,
                dotsPerMmX,
                dotsPerMmY,
                displayWidthMm,
                displayHeightMm,
                labelMmWidth,
                labelMmHeight
            }
            this._syncRulersFromViewport(wrapRect, plateRect)
            this._updateInteractiveItems(layoutItems, previewRect)
            this._syncInteractionLayer(previewRect, wrapRect)
            this._syncHitboxes()
            this._syncInlineTextEditor()
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
     * Schedules a lightweight viewport sync after canvas-wrap scroll.
     */
    scheduleViewportSync() {
        if (this._viewportSyncFrame) return
        this._viewportSyncFrame = window.requestAnimationFrame(() => {
            this._viewportSyncFrame = null
            const wrapRect = this.els.canvasWrap?.getBoundingClientRect()
            const plateRect = this.els.labelPlate?.getBoundingClientRect()
            if (!wrapRect || !plateRect) return
            this._syncRulersFromViewport(wrapRect, plateRect)
            const previewRect = this.els.preview?.getBoundingClientRect()
            if (!previewRect || !previewRect.width || !previewRect.height) return
            this._syncInteractionLayer(previewRect, wrapRect)
            this._syncInlineTextEditor()
            this._updateOverlayCanvas(previewRect, wrapRect)
            this._drawOverlay()
        })
    }

    /**
     * Draws both rulers using current viewport and scroll offsets.
     * @param {DOMRect | undefined} wrapRect
     * @param {DOMRect | undefined} plateRect
     */
    _syncRulersFromViewport(wrapRect, plateRect) {
        if (!wrapRect || !plateRect || !this._rulerContext) return
        const { res, dotsPerMmX, dotsPerMmY, displayWidthMm, displayHeightMm, labelMmWidth, labelMmHeight } = this._rulerContext
        const scrollLeft = Number(this.els.canvasWrap?.scrollLeft || 0)
        const scrollTop = Number(this.els.canvasWrap?.scrollTop || 0)
        const rulerOffsetX = Math.max(0, plateRect.left - wrapRect.left + scrollLeft)
        const rulerWidthPx = Math.max(0, plateRect.width + rulerOffsetX)
        const rulerOffsetY = Math.max(0, plateRect.top - wrapRect.top + scrollTop)
        const rulerHeightPx = Math.max(0, wrapRect.height + rulerOffsetY)
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
                labelMmWidth,
                scrollLeft
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
                labelMmHeight,
                scrollTop
            )
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
        if (this._inlineTextItemId && !validIds.has(this._inlineTextItemId)) {
            this._commitInlineTextEdit({ applyChanges: true })
        }
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
        const scrollLeft = Number(this.els.canvasWrap?.scrollLeft || 0)
        const scrollTop = Number(this.els.canvasWrap?.scrollTop || 0)
        const offsetLeft = previewRect.left - wrapRect.left + scrollLeft - overlayPadding
        const offsetTop = previewRect.top - wrapRect.top + scrollTop - overlayPadding
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
            this._drawSelectionHandles(ctx, handlesItem, overlayPadding)
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
     * @param {{ item: object, boundsCss: { x: number, y: number, width: number, height: number } }} entry
     * @param {number} overlayPadding
     */
    _drawSelectionHandles(ctx, entry, overlayPadding) {
        const boundsCss = entry?.boundsCss
        if (!boundsCss) return
        const { x, y, width, height } = boundsCss
        if (width <= 0 || height <= 0) return
        const handleRadius = this._handleRadius || 3
        const handleFill = '#2d7dff'
        const handleStroke = '#e7efff'
        const drawX = x + overlayPadding
        const drawY = y + overlayPadding
        const allowedHandles = InteractionUtils.getAllowedResizeHandleNames(entry.item)
        const handles = InteractionUtils.computeHandlePositions({ x: drawX, y: drawY, width, height }, allowedHandles)
        handles.forEach((handle) => {
            ctx.beginPath()
            ctx.arc(handle.x, handle.y, handleRadius, 0, Math.PI * 2)
            ctx.fillStyle = handleFill
            ctx.fill()
            ctx.strokeStyle = handleStroke
            ctx.stroke()
        })
    }
}
