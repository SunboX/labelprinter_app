import { BarcodeUtils } from '../BarcodeUtils.mjs'
import { QrCodeUtils } from '../QrCodeUtils.mjs'

/**
 * Shared helpers for canvas barcode rendering and text metric fitting.
 */
export class PreviewRendererCanvasSupport {
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
     *  maxHeight: number
     * }} options
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
    static resolveTextMetrics({ ctx, text, family, requestedSize, maxHeight }) {
        const limit = Math.max(4, maxHeight)
        let size = Math.min(Math.max(4, requestedSize), limit * 3)
        let { advanceWidth, height, inkLeft, inkRight, inkWidth } = PreviewRendererCanvasSupport.#measureText(
            ctx,
            text,
            size,
            family
        )
        while (height > limit && size > 4) {
            size -= 1
            const nextMetrics = PreviewRendererCanvasSupport.#measureText(ctx, text, size, family)
            advanceWidth = nextMetrics.advanceWidth
            height = nextMetrics.height
            inkLeft = nextMetrics.inkLeft
            inkRight = nextMetrics.inkRight
            inkWidth = nextMetrics.inkWidth
        }
        const { ascent, descent } = PreviewRendererCanvasSupport.#measureText(ctx, text, size, family)
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
    static #measureText(ctx, text, size, family) {
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
