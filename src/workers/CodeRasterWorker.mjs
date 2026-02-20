/**
 * Handles incoming QR/barcode rasterization requests.
 * This worker intentionally uses classic-script runtime loading for parity with app runtimes.
 * @param {MessageEvent<any>} event
 */
async function handleWorkerMessage(event) {
    const data = event?.data || {}
    if (String(data?.type || '') !== 'buildCodeRaster') return
    const requestId = Number(data?.requestId)
    if (!Number.isInteger(requestId) || requestId < 1) return

    try {
        ensureCodeRuntimes()
        const payload = await buildCodeRasterPayload(data?.payload)
        postSuccess(requestId, payload)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Code rasterization failed.'
        postError(requestId, message)
    }
}

/** @type {boolean} */
let runtimesLoaded = false

/**
 * Loads QR and barcode browser runtimes once.
 */
function ensureCodeRuntimes() {
    if (runtimesLoaded) return
    if (typeof importScripts !== 'function') {
        throw new Error('Worker runtime cannot load QR/barcode scripts.')
    }
    importScripts('/node_modules/qrcode/build/qrcode.js')
    importScripts('/node_modules/jsbarcode/dist/JsBarcode.all.min.js')
    runtimesLoaded = true
}

/**
 * Posts a success response.
 * @param {number} requestId
 * @param {{ cacheKey: string, bitmap: ImageBitmap, width: number, height: number }} payload
 */
function postSuccess(requestId, payload) {
    globalThis.postMessage(
        {
            type: 'buildCodeRaster:ok',
            requestId,
            payload
        },
        [payload.bitmap]
    )
}

/**
 * Posts an error response.
 * @param {number} requestId
 * @param {string} message
 */
function postError(requestId, message) {
    globalThis.postMessage({
        type: 'buildCodeRaster:error',
        requestId,
        error: { message: String(message || 'Code rasterization failed.') }
    })
}

/**
 * Builds one code raster payload.
 * @param {any} payload
 * @returns {Promise<{ cacheKey: string, bitmap: ImageBitmap, width: number, height: number }>}
 */
async function buildCodeRasterPayload(payload) {
    if (typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') {
        throw new Error('Offscreen raster APIs are unavailable.')
    }
    const mode = String(payload?.mode || '').trim().toLowerCase()
    if (mode !== 'qr' && mode !== 'barcode') {
        throw new Error('Unsupported code raster mode.')
    }

    const data = String(payload?.data || '')
    const width = Math.max(1, Math.round(Number(payload?.width) || 1))
    const height = Math.max(1, Math.round(Number(payload?.height) || width))
    const cacheKey = String(payload?.cacheKey || '')

    const canvas = mode === 'qr'
        ? await buildQrCanvas(data, width, payload?.options)
        : buildBarcodeCanvas(data, width, height, payload?.options)
    const bitmap = await createImageBitmap(canvas)
    return {
        cacheKey,
        bitmap,
        width: canvas.width,
        height: canvas.height
    }
}

/**
 * Builds one QR raster canvas.
 * @param {string} value
 * @param {number} size
 * @param {any} options
 * @returns {Promise<OffscreenCanvas>}
 */
async function buildQrCanvas(value, size, options) {
    const qrRuntime = globalThis.QRCode
    if (!qrRuntime || typeof qrRuntime.create !== 'function') {
        throw new Error('QRCode runtime is unavailable.')
    }

    const normalizedOptions = normalizeQrOptions(options)
    const payload = buildQrPayload(value, normalizedOptions.qrEncodingMode)
    const qrCreateOptions = {
        errorCorrectionLevel: normalizedOptions.qrErrorCorrectionLevel
    }
    if (normalizedOptions.qrVersion > 0) {
        qrCreateOptions.version = normalizedOptions.qrVersion
    }

    const qrResult = qrRuntime.create(payload, qrCreateOptions)
    const moduleMatrix = qrResult?.modules
    const moduleCount = Number(moduleMatrix?.size || 0)
    if (!moduleCount) {
        throw new Error('Failed to build QR module matrix.')
    }

    const source = new OffscreenCanvas(moduleCount, moduleCount)
    const sourceCtx = source.getContext('2d')
    if (!sourceCtx) {
        throw new Error('Unable to allocate QR source canvas context.')
    }
    sourceCtx.fillStyle = '#ffffff'
    sourceCtx.fillRect(0, 0, moduleCount, moduleCount)
    sourceCtx.fillStyle = '#000000'
    for (let y = 0; y < moduleCount; y += 1) {
        for (let x = 0; x < moduleCount; x += 1) {
            if (moduleMatrix.get(y, x)) {
                sourceCtx.fillRect(x, y, 1, 1)
            }
        }
    }

    const target = new OffscreenCanvas(size, size)
    const targetCtx = target.getContext('2d')
    if (!targetCtx) {
        throw new Error('Unable to allocate QR target canvas context.')
    }
    targetCtx.fillStyle = '#ffffff'
    targetCtx.fillRect(0, 0, size, size)
    targetCtx.imageSmoothingEnabled = false
    targetCtx.drawImage(source, 0, 0, size, size)
    return target
}

/**
 * Builds one barcode raster canvas.
 * @param {string} value
 * @param {number} width
 * @param {number} height
 * @param {any} options
 * @returns {OffscreenCanvas}
 */
function buildBarcodeCanvas(value, width, height, options) {
    const normalizedValue = String(value || '').trim()
    const normalizedOptions = normalizeBarcodeOptions(options)
    if (!normalizedValue) {
        return buildFallbackBarcodeCanvas(width, height)
    }

    const barcodeRuntime = globalThis.JsBarcode
    if (typeof barcodeRuntime !== 'function') {
        throw new Error('JsBarcode runtime is unavailable.')
    }

    const source = new OffscreenCanvas(8, 8)
    const showText = Boolean(normalizedOptions.barcodeShowText)
    const reservedTextHeight = showText ? 14 : 0
    const drawHeight = Math.max(8, height - reservedTextHeight)
    try {
        barcodeRuntime(source, normalizedValue, {
            format: normalizedOptions.barcodeFormat,
            displayValue: showText,
            width: Math.max(1, Number(normalizedOptions.barcodeModuleWidth) || 2),
            height: drawHeight,
            margin: Math.max(0, Number(normalizedOptions.barcodeMargin) || 0),
            lineColor: '#000000',
            background: '#ffffff',
            font: 'monospace',
            fontOptions: 'bold',
            fontSize: 12,
            textMargin: 2
        })
        if (!source.width || !source.height) {
            return buildFallbackBarcodeCanvas(width, height)
        }
    } catch (_error) {
        return buildFallbackBarcodeCanvas(width, height)
    }

    const target = new OffscreenCanvas(width, height)
    const targetCtx = target.getContext('2d')
    if (!targetCtx) {
        throw new Error('Unable to allocate barcode target canvas context.')
    }
    targetCtx.fillStyle = '#ffffff'
    targetCtx.fillRect(0, 0, width, height)
    targetCtx.imageSmoothingEnabled = false
    targetCtx.drawImage(source, 0, 0, width, height)
    return target
}

/**
 * Builds a fallback barcode placeholder canvas.
 * @param {number} width
 * @param {number} height
 * @returns {OffscreenCanvas}
 */
function buildFallbackBarcodeCanvas(width, height) {
    const canvas = new OffscreenCanvas(Math.max(16, width), Math.max(16, height))
    const context = canvas.getContext('2d')
    if (!context) {
        throw new Error('Unable to allocate fallback barcode canvas context.')
    }
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = '#9aa0ad'
    context.lineWidth = 1
    context.setLineDash([3, 2])
    context.strokeRect(0.5, 0.5, Math.max(0, canvas.width - 1), Math.max(0, canvas.height - 1))
    context.setLineDash([])
    return canvas
}

/**
 * Normalizes QR options.
 * @param {any} options
 * @returns {{ qrErrorCorrectionLevel: 'L' | 'M' | 'Q' | 'H', qrVersion: number, qrEncodingMode: 'auto' | 'byte' | 'alphanumeric' | 'numeric' }}
 */
function normalizeQrOptions(options) {
    const safeOptions = options && typeof options === 'object' ? options : {}
    const errorLevel = String(safeOptions.qrErrorCorrectionLevel || safeOptions.errorCorrectionLevel || 'M')
        .trim()
        .toUpperCase()
    const version = Math.round(Number(safeOptions.qrVersion ?? safeOptions.version))
    const mode = String(safeOptions.qrEncodingMode || safeOptions.encodingMode || 'auto')
        .trim()
        .toLowerCase()
    return {
        qrErrorCorrectionLevel: ['L', 'M', 'Q', 'H'].includes(errorLevel) ? errorLevel : 'M',
        qrVersion: Number.isFinite(version) && version > 0 ? Math.max(1, Math.min(40, version)) : 0,
        qrEncodingMode: ['auto', 'byte', 'alphanumeric', 'numeric'].includes(mode) ? mode : 'auto'
    }
}

/**
 * Builds QR payload for the selected encoding mode.
 * @param {string} data
 * @param {'auto' | 'byte' | 'alphanumeric' | 'numeric'} encodingMode
 * @returns {string | Array<{ data: string, mode: string }>}
 */
function buildQrPayload(data, encodingMode) {
    const safeData = String(data || '')
    if (encodingMode === 'auto') {
        return safeData
    }
    return [{ data: safeData, mode: encodingMode }]
}

/**
 * Normalizes barcode options.
 * @param {any} options
 * @returns {{ barcodeFormat: string, barcodeShowText: boolean, barcodeModuleWidth: number, barcodeMargin: number }}
 */
function normalizeBarcodeOptions(options) {
    const safeOptions = options && typeof options === 'object' ? options : {}
    const format = normalizeBarcodeFormat(safeOptions.barcodeFormat ?? safeOptions.format)
    const showText = normalizeBoolean(safeOptions.barcodeShowText ?? safeOptions.displayValue, false)
    const moduleWidth = clampInteger(safeOptions.barcodeModuleWidth ?? safeOptions.moduleWidth, 1, 6, 2)
    const margin = clampInteger(safeOptions.barcodeMargin ?? safeOptions.margin, 0, 30, 0)
    return {
        barcodeFormat: format,
        barcodeShowText: showText,
        barcodeModuleWidth: moduleWidth,
        barcodeMargin: margin
    }
}

/**
 * Normalizes barcode format values.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeBarcodeFormat(value) {
    const supportedFormats = new Set([
        'CODE128',
        'CODE128A',
        'CODE128B',
        'CODE128C',
        'CODE39',
        'EAN13',
        'EAN8',
        'EAN5',
        'EAN2',
        'UPC',
        'UPCE',
        'ITF14',
        'MSI',
        'MSI10',
        'MSI11',
        'MSI1010',
        'MSI1110',
        'codabar',
        'pharmacode'
    ])
    const normalized = String(value || '').trim()
    if (!normalized) return 'CODE128'
    if (supportedFormats.has(normalized)) return normalized
    const upper = normalized.toUpperCase()
    if (supportedFormats.has(upper)) return upper
    if (normalized.toLowerCase() === 'codabar') return 'codabar'
    if (normalized.toLowerCase() === 'pharmacode') return 'pharmacode'
    return 'CODE128'
}

/**
 * Clamps one numeric value as integer.
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @returns {number}
 */
function clampInteger(value, min, max, fallback) {
    const numeric = Math.round(Number(value))
    if (!Number.isFinite(numeric)) return fallback
    return Math.max(min, Math.min(max, numeric))
}

/**
 * Normalizes unknown values into booleans.
 * @param {unknown} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
function normalizeBoolean(value, fallback) {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
        if (['0', 'false', 'no', 'off'].includes(normalized)) return false
    }
    return fallback
}

globalThis.onmessage = (event) => {
    void handleWorkerMessage(event)
}
