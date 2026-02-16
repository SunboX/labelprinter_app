import { BarcodeUtils } from '../BarcodeUtils.mjs'
import { QrCodeUtils } from '../QrCodeUtils.mjs'

/**
 * Shared helpers for canvas barcode rendering and text metric fitting.
 */
export class PreviewRendererCanvasSupport {
    /**
     * Builds a canvas font declaration for text rendering/measurement.
     * @param {{ size: number, family: string, bold?: boolean, italic?: boolean }} options
     * @returns {string}
     */
    static buildTextFontDeclaration({ size, family, bold = false, italic = false }) {
        const safeSize = Math.max(1, Math.round(Number(size) || 1))
        const safeFamily = String(family || 'sans-serif')
        const style = italic ? 'italic ' : ''
        const weight = bold ? '700 ' : ''
        return `${style}${weight}${safeSize}px ${safeFamily}`.trim()
    }

    /**
     * Computes underline metrics in canvas units.
     * @param {number} size
     * @param {number} [verticalScale=1]
     * @returns {{ offset: number, thickness: number, extraHeight: number }}
     */
    static computeUnderlineMetrics(size, verticalScale = 1) {
        const safeSize = Math.max(1, Number(size) || 1)
        const scale = Math.max(0.25, Number(verticalScale) || 1)
        const offset = Math.max(1, safeSize * 0.08 * scale)
        const thickness = Math.max(1, safeSize * 0.06 * scale)
        return { offset, thickness, extraHeight: offset + thickness }
    }

    /**
     * Computes strikethrough metrics in canvas units.
     * @param {number} size
     * @param {number} [verticalScale=1]
     * @returns {{ offset: number, thickness: number }}
     */
    static computeStrikethroughMetrics(size, verticalScale = 1) {
        const safeSize = Math.max(1, Number(size) || 1)
        const scale = Math.max(0.25, Number(verticalScale) || 1)
        const offset = Math.max(1, safeSize * 0.32 * scale)
        const thickness = Math.max(1, safeSize * 0.055 * scale)
        return { offset, thickness }
    }

    /**
     * Returns a cached QR canvas or generates a new one.
     * @param {object} renderer
     * @param {string} data
     * @param {number} size
     * @param {object} [item={}]
     * @returns {Promise<HTMLCanvasElement>}
     */
    static async getCachedQrCanvas(renderer, data, size, item = {}) {
        const safeSize = Math.max(1, Math.round(Number(size) || 1))
        const normalizedOptions = QrCodeUtils.normalizeItemOptions(item)
        const cacheKey = `${safeSize}::${normalizedOptions.qrErrorCorrectionLevel}::${normalizedOptions.qrVersion}::${normalizedOptions.qrEncodingMode}::${String(data || '')}`
        if (renderer._qrRenderCache?.has(cacheKey)) {
            const cached = renderer._qrRenderCache.get(cacheKey)
            renderer._qrRenderCache.delete(cacheKey)
            renderer._qrRenderCache.set(cacheKey, cached)
            return cached
        }
        const builtCanvas = await PreviewRendererCanvasSupport.#buildQrCanvas(renderer, data, safeSize, normalizedOptions)
        renderer._qrRenderCache?.set(cacheKey, builtCanvas)
        const maxEntries = 96
        if ((renderer._qrRenderCache?.size || 0) > maxEntries) {
            const oldestKey = renderer._qrRenderCache.keys().next().value
            if (oldestKey) {
                renderer._qrRenderCache.delete(oldestKey)
            }
        }
        return builtCanvas
    }

    /**
     * Returns a cached barcode canvas or generates a new one.
     * @param {object} renderer
     * @param {string} data
     * @param {number} width
     * @param {number} height
     * @param {object} [item={}]
     * @returns {HTMLCanvasElement}
     */
    static getCachedBarcodeCanvas(renderer, data, width, height, item = {}) {
        const safeWidth = Math.max(16, Math.round(Number(width) || 16))
        const safeHeight = Math.max(16, Math.round(Number(height) || 16))
        const normalizedOptions = BarcodeUtils.normalizeItemOptions(item)
        const hashPart =
            typeof renderer?._hashString === 'function'
                ? renderer._hashString(String(data || ''))
                : PreviewRendererCanvasSupport.#hashString(String(data || ''))
        const cacheKey = [
            `${safeWidth}x${safeHeight}`,
            normalizedOptions.barcodeFormat,
            normalizedOptions.barcodeShowText ? '1' : '0',
            String(normalizedOptions.barcodeModuleWidth),
            String(normalizedOptions.barcodeMargin),
            hashPart
        ].join('::')

        if (renderer._barcodeRenderCache?.has(cacheKey)) {
            const cached = renderer._barcodeRenderCache.get(cacheKey)
            renderer._barcodeRenderCache.delete(cacheKey)
            renderer._barcodeRenderCache.set(cacheKey, cached)
            return cached
        }

        const builtCanvas = PreviewRendererCanvasSupport.buildBarcodeCanvas(
            renderer,
            data,
            safeWidth,
            safeHeight,
            normalizedOptions
        )
        renderer._barcodeRenderCache?.set(cacheKey, builtCanvas)
        const maxEntries = 96
        if ((renderer._barcodeRenderCache?.size || 0) > maxEntries) {
            const oldestKey = renderer._barcodeRenderCache.keys().next().value
            if (oldestKey) {
                renderer._barcodeRenderCache.delete(oldestKey)
            }
        }
        return builtCanvas
    }

    /**
     * Builds a barcode canvas for preview rendering.
     * Falls back to a visible placeholder when content/options are invalid.
     * @param {object} renderer
     * @param {string} data
     * @param {number} width
     * @param {number} height
     * @param {{ barcodeFormat: string, barcodeShowText: boolean, barcodeModuleWidth: number, barcodeMargin: number }} options
     * @returns {HTMLCanvasElement}
     */
    static buildBarcodeCanvas(renderer, data, width, height, options) {
        const safeWidth = Math.max(16, Math.round(Number(width) || 16))
        const safeHeight = Math.max(16, Math.round(Number(height) || 16))
        const value = String(data || '').trim()
        const placeholderText = typeof renderer?.translate === 'function' ? renderer.translate('itemsEditor.typeBarcode') : 'Barcode'
        if (!value) {
            return PreviewRendererCanvasSupport.buildFallbackBarcodeCanvas(safeWidth, safeHeight, placeholderText)
        }
        const jsBarcode = renderer._requireBarcode()
        const canvas = document.createElement('canvas')
        const showText = Boolean(options?.barcodeShowText)
        const reservedTextHeight = showText ? 14 : 0
        const drawHeight = Math.max(8, safeHeight - reservedTextHeight)
        try {
            jsBarcode(canvas, value, {
                format: options?.barcodeFormat || BarcodeUtils.getDefaultFormat(),
                displayValue: showText,
                width: Math.max(1, Number(options?.barcodeModuleWidth) || 2),
                height: drawHeight,
                margin: Math.max(0, Number(options?.barcodeMargin) || 0),
                lineColor: '#000000',
                background: '#ffffff',
                font: 'monospace',
                fontOptions: 'bold',
                fontSize: 12,
                textMargin: 2
            })
            if (!canvas.width || !canvas.height) {
                return PreviewRendererCanvasSupport.buildFallbackBarcodeCanvas(safeWidth, safeHeight, placeholderText)
            }
            return canvas
        } catch (_error) {
            return PreviewRendererCanvasSupport.buildFallbackBarcodeCanvas(safeWidth, safeHeight, placeholderText)
        }
    }

    /**
     * Builds a simple placeholder canvas for invalid/missing barcodes.
     * @param {number} width
     * @param {number} height
     * @param {string} [label='Barcode']
     * @returns {HTMLCanvasElement}
     */
    static buildFallbackBarcodeCanvas(width, height, label = 'Barcode') {
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(16, Math.round(Number(width) || 16))
        canvas.height = Math.max(16, Math.round(Number(height) || 16))
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.strokeStyle = '#9aa0ad'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 2])
        ctx.strokeRect(0.5, 0.5, Math.max(0, canvas.width - 1), Math.max(0, canvas.height - 1))
        ctx.setLineDash([])
        if (canvas.width >= 42 && canvas.height >= 18) {
            ctx.fillStyle = '#6f7480'
            ctx.font = '10px Barlow, sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(String(label || 'Barcode'), canvas.width / 2, canvas.height / 2)
        }
        return canvas
    }

    /**
     * Builds a QR code canvas for preview rendering.
     * @param {object} renderer
     * @param {string} data
     * @param {number} size
     * @param {object} options
     * @returns {Promise<HTMLCanvasElement>}
     */
    static async #buildQrCanvas(renderer, data, size, options = {}) {
        const canvas = document.createElement('canvas')
        const qrCode = renderer._requireQrCode()
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
     * Resolves text metrics while ensuring the rendered text fits the available height.
     * @param {{
     *  ctx: CanvasRenderingContext2D,
     *  text: string,
     *  family: string,
     *  requestedSize: number,
     *  maxHeight: number,
     *  bold?: boolean,
     *  italic?: boolean,
     *  underline?: boolean,
     *  strikethrough?: boolean
     * }} options
     * @returns {{
     *  size: number,
     *  advanceWidth: number,
     *  height: number,
     *  ascent: number,
     *  descent: number,
     *  inkLeft: number,
     *  inkRight: number,
     *  inkWidth: number,
     *  lineGap: number,
     *  lines: string[],
     *  lineMetrics: Array<{
     *   text: string,
     *   advanceWidth: number,
     *   ascent: number,
     *   descent: number,
     *   inkLeft: number,
     *   inkRight: number,
     *   inkWidth: number
     *  }>,
     *  totalHeight: number,
     *  underlineOffset: number,
     *  underlineThickness: number,
     *  underlineExtra: number,
     *  strikethroughOffset: number,
     *  strikethroughThickness: number
     * }}
     */
    static resolveTextMetrics({
        ctx,
        text,
        family,
        requestedSize,
        maxHeight,
        bold = false,
        italic = false,
        underline = false,
        strikethrough = false
    }) {
        const limit = Math.max(4, maxHeight)
        const lines = PreviewRendererCanvasSupport.#normalizeTextLines(text)
        let size = Math.min(Math.max(4, requestedSize), limit * 3)
        let metrics = PreviewRendererCanvasSupport.#measureTextLines(ctx, lines, size, family, bold, italic, underline, strikethrough)
        while (metrics.height > limit && size > 4) {
            size -= 1
            metrics = PreviewRendererCanvasSupport.#measureTextLines(ctx, lines, size, family, bold, italic, underline, strikethrough)
        }
        return {
            size,
            advanceWidth: metrics.advanceWidth,
            height: Math.min(metrics.height, limit),
            ascent: metrics.ascent,
            descent: metrics.descent,
            inkLeft: metrics.inkLeft,
            inkRight: metrics.inkRight,
            inkWidth: metrics.inkWidth,
            lineGap: metrics.lineGap,
            lines,
            lineMetrics: metrics.lineMetrics,
            totalHeight: metrics.height,
            underlineOffset: metrics.underlineOffset,
            underlineThickness: metrics.underlineThickness,
            underlineExtra: metrics.underlineExtra,
            strikethroughOffset: metrics.strikethroughOffset,
            strikethroughThickness: metrics.strikethroughThickness
        }
    }

    /**
     * Splits text into drawable lines while preserving blank rows.
     * @param {string} text
     * @returns {string[]}
     */
    static #normalizeTextLines(text) {
        const lines = String(text || '').replace(/\r/g, '').split('\n')
        return lines.length ? lines : ['']
    }

    /**
     * Measures multiline text metrics using the provided canvas context.
     * @param {CanvasRenderingContext2D} ctx
     * @param {string[]} lines
     * @param {number} size
     * @param {string} family
     * @param {boolean} bold
     * @param {boolean} italic
     * @param {boolean} underline
     * @param {boolean} strikethrough
     * @returns {{
     *  advanceWidth: number,
     *  height: number,
     *  ascent: number,
     *  descent: number,
     *  inkLeft: number,
     *  inkRight: number,
     *  inkWidth: number,
     *  lineGap: number,
     *  lineMetrics: Array<{
     *   text: string,
     *   advanceWidth: number,
     *   ascent: number,
     *   descent: number,
     *   inkLeft: number,
     *   inkRight: number,
     *   inkWidth: number
     *  }>
     *  underlineOffset: number,
     *  underlineThickness: number,
     *  underlineExtra: number,
     *  strikethroughOffset: number,
     *  strikethroughThickness: number
     * }}
     */
    static #measureTextLines(ctx, lines, size, family, bold, italic, underline, strikethrough) {
        ctx.font = PreviewRendererCanvasSupport.buildTextFontDeclaration({ size, family, bold, italic })
        const safeLines = Array.isArray(lines) && lines.length ? lines : ['']
        const lineGap = safeLines.length > 1 ? Math.max(1, Math.round(size * 0.22)) : 0
        const underlineMetrics = PreviewRendererCanvasSupport.computeUnderlineMetrics(size)
        const strikethroughMetrics = PreviewRendererCanvasSupport.computeStrikethroughMetrics(size)
        let advanceWidth = 0
        let maxAscent = 0
        let maxDescent = 0
        let totalHeight = 0
        let inkLeft = 0
        let inkRight = 0
        let hasInkBounds = false
        const lineMetrics = safeLines.map((lineText) => {
            const metrics = ctx.measureText(lineText || '')
            const ascent = metrics.actualBoundingBoxAscent || size
            const descent = metrics.actualBoundingBoxDescent || 0
            const localInkLeft = Number.isFinite(metrics.actualBoundingBoxLeft) ? metrics.actualBoundingBoxLeft : 0
            const localInkRight = Number.isFinite(metrics.actualBoundingBoxRight) ? metrics.actualBoundingBoxRight : metrics.width
            const localInkWidth = Math.max(0, localInkRight - localInkLeft)
            const localAdvanceWidth = Math.ceil(metrics.width)

            advanceWidth = Math.max(advanceWidth, localAdvanceWidth)
            maxAscent = Math.max(maxAscent, ascent)
            maxDescent = Math.max(maxDescent, descent)
            const underlineExtra = underline ? underlineMetrics.extraHeight : 0
            totalHeight += Math.ceil(ascent + descent + underlineExtra)
            if (hasInkBounds) {
                inkLeft = Math.min(inkLeft, localInkLeft)
                inkRight = Math.max(inkRight, localInkRight)
            } else {
                inkLeft = localInkLeft
                inkRight = localInkRight
                hasInkBounds = true
            }
            return {
                text: lineText || '',
                advanceWidth: localAdvanceWidth,
                ascent,
                descent,
                inkLeft: localInkLeft,
                inkRight: localInkRight,
                inkWidth: localInkWidth,
                underlineOffset: underlineMetrics.offset,
                underlineThickness: underlineMetrics.thickness,
                strikethroughOffset: strikethroughMetrics.offset,
                strikethroughThickness: strikethroughMetrics.thickness
            }
        })
        if (safeLines.length > 1) {
            totalHeight += lineGap * (safeLines.length - 1)
        }
        const totalInkWidth = Math.max(0, inkRight - inkLeft)
        return {
            advanceWidth,
            height: Math.max(1, totalHeight),
            ascent: maxAscent || size,
            descent: maxDescent,
            inkLeft: hasInkBounds ? inkLeft : 0,
            inkRight: hasInkBounds ? inkRight : advanceWidth,
            inkWidth: totalInkWidth,
            lineGap,
            lineMetrics,
            underlineOffset: underlineMetrics.offset,
            underlineThickness: underlineMetrics.thickness,
            underlineExtra: underline ? underlineMetrics.extraHeight : 0,
            strikethroughOffset: strikethrough ? strikethroughMetrics.offset : 0,
            strikethroughThickness: strikethrough ? strikethroughMetrics.thickness : 0
        }
    }

    /**
     * Computes a small non-cryptographic hash for cache keys.
     * @param {string} value
     * @returns {string}
     */
    static #hashString(value) {
        let hash = 2166136261
        for (let i = 0; i < value.length; i += 1) {
            hash ^= value.charCodeAt(i)
            hash = Math.imul(hash, 16777619)
        }
        return (hash >>> 0).toString(16)
    }
}
