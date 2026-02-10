import { PreviewLayoutUtils } from '../PreviewLayoutUtils.mjs'
import { RulerUtils } from '../RulerUtils.mjs'
import { ParameterTemplateUtils } from '../ParameterTemplateUtils.mjs'
import { ImageRasterUtils } from '../ImageRasterUtils.mjs'
import { QrCodeUtils } from '../QrCodeUtils.mjs'
import { Media, Resolution } from 'labelprinterkit-web/src/index.mjs'
import { PreviewRendererBase } from './PreviewRendererBase.mjs'

/**
 * Canvas construction and low-level rendering helpers for preview output.
 */
export class PreviewRendererCanvasBuild extends PreviewRendererBase {
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
