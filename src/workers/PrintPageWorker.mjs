const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g
const QR_FEED_PADDING_DOTS = 10

/** @type {boolean} */
let codeRuntimesLoaded = false

/**
 * Handles incoming print-page rendering requests.
 * @param {MessageEvent<any>} event
 */
async function handleWorkerMessage(event) {
    const data = event?.data || {}
    if (String(data?.type || '') !== 'renderPrintPage') return
    const requestId = Number(data?.requestId)
    if (!Number.isInteger(requestId) || requestId < 1) return

    try {
        ensureCodeRuntimes()
        const payload = await renderPrintPage(data?.payload)
        postSuccess(requestId, payload)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Print page rendering failed.'
        postError(requestId, message)
    }
}

/**
 * Loads QR/barcode browser runtimes once.
 */
function ensureCodeRuntimes() {
    if (codeRuntimesLoaded) return
    if (typeof importScripts !== 'function') {
        throw new Error('Worker runtime cannot load QR/barcode scripts.')
    }
    importScripts('/node_modules/qrcode/build/qrcode.js')
    importScripts('/node_modules/jsbarcode/dist/JsBarcode.all.min.js')
    codeRuntimesLoaded = true
}

/**
 * Posts a successful response.
 * @param {number} requestId
 * @param {{ pageIndex: number, bitmap: ImageBitmap, width: number, height: number, res: object, media: object }} payload
 */
function postSuccess(requestId, payload) {
    globalThis.postMessage(
        {
            type: 'renderPrintPage:ok',
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
        type: 'renderPrintPage:error',
        requestId,
        error: { message: String(message || 'Print page rendering failed.') }
    })
}

/**
 * Renders one print page.
 * Supports text/qr/barcode items that remain in flow mode with no rotation.
 * @param {{ pageIndex?: number, stateSnapshot?: any, parameterValues?: Record<string, string> }} payload
 * @returns {Promise<{ pageIndex: number, bitmap: ImageBitmap, width: number, height: number, res: object, media: object }>}
 */
async function renderPrintPage(payload) {
    if (typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') {
        throw new Error('Offscreen print APIs are unavailable.')
    }
    const pageIndex = Math.max(0, Math.round(Number(payload?.pageIndex) || 0))
    const state = normalizeStateSnapshot(payload?.stateSnapshot)
    assertSupportedStateForWorker(state)
    const parameterValues = normalizeParameterValues(payload?.parameterValues)

    const media = state.media
    const res = state.resolution
    const isHorizontal = state.orientation === 'horizontal'
    const printWidth = Math.max(8, Math.round(Number(media?.printArea) || 128))
    const marginStart = Math.max(0, Math.round(Number(media?.lmargin) || 0))
    const marginEnd = Math.max(0, Math.round(Number(media?.rmargin) || 0))

    const baseDotScale = resolveDotsPerInch(res, 1) / 96
    const mediaCompensatedDotScale = computeMediaCompensatedDotScale({
        resolutionDpi: resolveDotsPerInch(res, 1),
        printAreaDots: printWidth,
        mediaWidthMm: Number(media?.width) || 9,
        referencePrintAreaDots: Number(state.referencePrintAreaDots) || 64,
        referenceWidthMm: Number(state.referenceWidthMm) || 9
    })
    const textVerticalScale = isHorizontal ? mediaCompensatedDotScale / Math.max(0.0001, baseDotScale) : 1
    const textDotScale = baseDotScale
    const maxFontDots = Math.max(8, printWidth)

    const measureCanvas = new OffscreenCanvas(1, 1)
    const measureCtx = measureCanvas.getContext('2d')
    if (!measureCtx) {
        throw new Error('Unable to allocate text measurement context.')
    }

    const feedPadStart = 2
    const feedPadEnd = 8
    const blocks = []

    for (const item of state.items) {
        if (item.type === 'text') {
            const resolvedText = resolveTemplateString(item.text || '', parameterValues)
            const family = item.fontFamily || 'sans-serif'
            const requestedSizeDots = Math.round((Number(item.fontSize) || 16) * textDotScale)
            const metrics = resolveTextMetrics({
                ctx: measureCtx,
                text: resolvedText,
                family,
                requestedSize: requestedSizeDots,
                maxHeight: maxFontDots,
                bold: Boolean(item.textBold),
                italic: Boolean(item.textItalic)
            })
            const textTotalHeight = Math.max(1, metrics.totalHeight * textVerticalScale)
            const span = isHorizontal
                ? Math.max(metrics.advanceWidth, textTotalHeight)
                : Math.max(textTotalHeight + 4, textTotalHeight)
            blocks.push({
                ref: item,
                type: 'text',
                span,
                resolvedText,
                family,
                fontSizeDots: metrics.size,
                textAdvanceWidth: metrics.advanceWidth,
                textInkLeft: metrics.inkLeft,
                textInkWidth: metrics.inkWidth,
                textVerticalScale,
                textLines: metrics.lines,
                textLineMetrics: metrics.lineMetrics,
                textLineGap: metrics.lineGap,
                ascent: metrics.ascent * textVerticalScale,
                descent: metrics.descent * textVerticalScale,
                textTotalHeight
            })
            continue
        }

        if (item.type === 'barcode') {
            const resolvedBarcodeData = resolveTemplateString(item.data || '', parameterValues)
            const rawBarcodeWidth = Math.max(16, Math.round(Number(item.width) || 220))
            const rawBarcodeHeight = Math.max(16, Math.round(Number(item.height) || 64))
            const constrained = constrainDimensionsToPrintWidth(rawBarcodeWidth, rawBarcodeHeight, printWidth, isHorizontal)
            const barcodeCanvas = buildBarcodeCanvas(
                resolvedBarcodeData,
                constrained.width,
                constrained.height,
                item
            )
            const span = isHorizontal ? constrained.width : Math.max(constrained.height + 4, constrained.height)
            blocks.push({
                ref: item,
                type: 'barcode',
                span,
                barcodeWidth: constrained.width,
                barcodeHeight: constrained.height,
                barcodeCanvas
            })
            continue
        }

        if (item.type === 'qr') {
            const resolvedQrData = resolveTemplateString(item.data || '', parameterValues)
            const qrSize = clampQrSizeToLabel(state, Number(item.size) || 1)
            const qrCanvas = await buildQrCanvas(resolvedQrData, qrSize, item)
            blocks.push({
                ref: item,
                type: 'qr',
                span: qrSize,
                qrSize,
                qrCanvas
            })
        }
    }

    const baseTotalLength = feedPadStart + blocks.reduce((sum, block) => sum + Math.max(0, Number(block?.span || 0)), 0) + feedPadEnd
    const minLength = Math.max(1, Math.round(Number(res?.minLength) || 1))
    const contentAxisEnd = feedPadStart + blocks.reduce((sum, block) => sum + Math.max(0, Number(block?.span || 0)), 0)
    const autoLengthDots = Math.max(minLength, contentAxisEnd + feedPadEnd)
    const forcedLengthDots = resolveForcedLengthDots(state, res)
    const length = forcedLengthDots ? Math.max(forcedLengthDots, autoLengthDots) : autoLengthDots

    const canvas = new OffscreenCanvas(isHorizontal ? length : printWidth, isHorizontal ? printWidth : length)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
        throw new Error('Unable to allocate page canvas context.')
    }
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#000'

    let flowCursor = feedPadStart
    for (const block of blocks) {
        if (block.type === 'text') {
            renderTextFlowBlock({ ctx, canvas, block, flowCursor, feedPadStart, isHorizontal, textDotScale, maxFontDots })
        } else if (block.type === 'qr') {
            renderQrFlowBlock({ ctx, canvas, block, flowCursor, feedPadStart, isHorizontal })
        } else if (block.type === 'barcode') {
            renderBarcodeFlowBlock({ ctx, canvas, block, flowCursor, feedPadStart, isHorizontal })
        }
        flowCursor += Math.max(0, Number(block?.span || 0))
    }

    const printCanvas = isHorizontal ? canvas : rotateForPrint(canvas)
    const effectiveMedia = {
        ...media,
        printArea: printWidth,
        lmargin: marginStart,
        rmargin: marginEnd
    }
    const bitmap = await createImageBitmap(printCanvas)
    return {
        pageIndex,
        bitmap,
        width: printCanvas.width,
        height: printCanvas.height,
        res,
        media: effectiveMedia
    }
}

/**
 * Normalizes incoming worker state payload.
 * @param {any} stateSnapshot
 * @returns {{
 *  media: object,
 *  resolution: object,
 *  orientation: 'horizontal' | 'vertical',
 *  mediaLengthMm: number | null,
 *  items: Array<Record<string, any>>,
 *  referencePrintAreaDots: number,
 *  referenceWidthMm: number
 * }}
 */
function normalizeStateSnapshot(stateSnapshot) {
    const safeState = stateSnapshot && typeof stateSnapshot === 'object' ? stateSnapshot : {}
    const media = safeState.media && typeof safeState.media === 'object' ? safeState.media : {}
    const resolution = safeState.resolution && typeof safeState.resolution === 'object' ? safeState.resolution : {}
    const orientation = String(safeState.orientation || 'horizontal').trim().toLowerCase() === 'vertical'
        ? 'vertical'
        : 'horizontal'
    const mediaLengthMm = Number(safeState.mediaLengthMm)
    return {
        media,
        resolution,
        orientation,
        mediaLengthMm: Number.isFinite(mediaLengthMm) && mediaLengthMm > 0 ? mediaLengthMm : null,
        items: Array.isArray(safeState.items) ? safeState.items : [],
        referencePrintAreaDots: Number(safeState.referencePrintAreaDots) || 64,
        referenceWidthMm: Number(safeState.referenceWidthMm) || 9
    }
}

/**
 * Ensures payload state only uses worker-supported print features.
 * @param {{ items: Array<Record<string, any>> }} state
 */
function assertSupportedStateForWorker(state) {
    const unsupportedItem = state.items.find((item) => {
        const type = String(item?.type || '').trim().toLowerCase()
        const mode = String(item?.positionMode || 'flow').trim().toLowerCase()
        const rotation = Math.round(Number(item?.rotation || 0))
        return !['text', 'qr', 'barcode'].includes(type) || mode !== 'flow' || rotation !== 0
    })
    if (unsupportedItem) {
        throw new Error('unsupported-worker-print-layout')
    }
}

/**
 * Normalizes worker parameter value payload.
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
function normalizeParameterValues(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const normalized = {}
    Object.entries(value).forEach(([key, entry]) => {
        normalized[String(key)] = stringifyValue(entry)
    })
    return normalized
}

/**
 * Resolves template placeholders with provided values.
 * @param {string} template
 * @param {Record<string, string>} values
 * @returns {string}
 */
function resolveTemplateString(template, values) {
    const text = String(template || '')
    return text.replace(PLACEHOLDER_PATTERN, (_full, placeholderName) => {
        if (Object.hasOwn(values || {}, placeholderName)) {
            return stringifyValue(values[placeholderName])
        }
        return `{{${placeholderName}}}`
    })
}

/**
 * Converts unknown values into printable text.
 * @param {unknown} value
 * @returns {string}
 */
function stringifyValue(value) {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    try {
        return JSON.stringify(value)
    } catch (_error) {
        return String(value)
    }
}

/**
 * Resolves DPI from a resolution-like payload.
 * @param {object} resolution
 * @param {0 | 1} axis
 * @returns {number}
 */
function resolveDotsPerInch(resolution, axis) {
    const dots = Array.isArray(resolution?.dots) ? resolution.dots : []
    return Number(dots[axis] || dots[0] || 180)
}

/**
 * Computes media-aware text scale.
 * @param {{ resolutionDpi: number, printAreaDots: number, mediaWidthMm: number, referencePrintAreaDots: number, referenceWidthMm: number }} options
 * @returns {number}
 */
function computeMediaCompensatedDotScale(options) {
    const safeResolutionDpi = Math.max(1, Number(options?.resolutionDpi) || 180)
    const baseScale = safeResolutionDpi / 96
    const safePrintAreaDots = Math.max(1, Number(options?.printAreaDots) || 1)
    const safeMediaWidthMm = Math.max(1, Number(options?.mediaWidthMm) || 1)
    const safeReferencePrintAreaDots = Math.max(1, Number(options?.referencePrintAreaDots) || 64)
    const safeReferenceWidthMm = Math.max(1, Number(options?.referenceWidthMm) || 9)
    const currentDotsPerMm = safePrintAreaDots / safeMediaWidthMm
    const referenceDotsPerMm = safeReferencePrintAreaDots / safeReferenceWidthMm
    if (!Number.isFinite(currentDotsPerMm) || !Number.isFinite(referenceDotsPerMm) || referenceDotsPerMm <= 0) {
        return baseScale
    }
    return baseScale * (currentDotsPerMm / referenceDotsPerMm)
}

/**
 * Resolves forced media length in dots from a millimeter override.
 * @param {{ mediaLengthMm: number | null }} state
 * @param {{ dots?: number[], minLength?: number }} resolution
 * @returns {number | null}
 */
function resolveForcedLengthDots(state, resolution) {
    const lengthMm = Number(state?.mediaLengthMm)
    if (!Number.isFinite(lengthMm) || lengthMm <= 0) return null
    const dotsPerInch = resolveDotsPerInch(resolution, 1)
    const minLength = Math.max(0, Math.round(Number(resolution?.minLength) || 0))
    const forcedLengthDots = Math.max(minLength, Math.round((lengthMm / 25.4) * dotsPerInch))
    return Math.max(1, forcedLengthDots)
}

/**
 * Constrains image-like dimensions to printable width.
 * @param {number} width
 * @param {number} height
 * @param {number} printWidth
 * @param {boolean} isHorizontal
 * @returns {{ width: number, height: number }}
 */
function constrainDimensionsToPrintWidth(width, height, printWidth, isHorizontal) {
    const safeWidth = Math.max(1, Math.round(Number(width) || 1))
    const safeHeight = Math.max(1, Math.round(Number(height) || 1))
    if (!isHorizontal) {
        return { width: safeWidth, height: safeHeight }
    }
    const crossAxisLimit = Math.max(8, Math.round(Number(printWidth) || 8))
    if (safeHeight <= crossAxisLimit) {
        return { width: safeWidth, height: safeHeight }
    }
    const scale = crossAxisLimit / safeHeight
    return {
        width: Math.max(8, Math.round(safeWidth * scale)),
        height: Math.max(8, Math.round(safeHeight * scale))
    }
}

/**
 * Clamps QR size to media constraints.
 * @param {{ media: object, resolution: object, mediaLengthMm: number | null }} state
 * @param {number} value
 * @returns {number}
 */
function clampQrSizeToLabel(state, value) {
    const maxByWidth = Math.max(1, Number(state?.media?.printArea) || 120)
    const dotsPerInch = resolveDotsPerInch(state?.resolution || {}, 1)
    const minLength = Math.max(0, Number(state?.resolution?.minLength) || 0)
    let maxByLength = Number.POSITIVE_INFINITY
    if (Number.isFinite(state?.mediaLengthMm) && Number(state.mediaLengthMm) > 0) {
        const forcedLengthDots = Math.max(minLength, Math.round((Number(state.mediaLengthMm) / 25.4) * dotsPerInch))
        maxByLength = Math.max(1, forcedLengthDots - QR_FEED_PADDING_DOTS)
    }
    const maxSize = Math.max(1, Math.floor(Math.min(maxByWidth, maxByLength)))
    const safeValue = Number.isFinite(value) ? Number(value) : 120
    return Math.max(1, Math.min(maxSize, Math.round(safeValue)))
}

/**
 * Renders one text block.
 * @param {{
 *  ctx: OffscreenCanvasRenderingContext2D,
 *  canvas: OffscreenCanvas,
 *  block: any,
 *  flowCursor: number,
 *  feedPadStart: number,
 *  isHorizontal: boolean,
 *  textDotScale: number,
 *  maxFontDots: number
 * }} options
 */
function renderTextFlowBlock({ ctx, canvas, block, flowCursor, feedPadStart, isHorizontal, textDotScale, maxFontDots }) {
    const item = block.ref
    const resolvedSize =
        block.fontSizeDots || Math.min(Math.max(8, Math.round((Number(item.fontSize) || 16) * textDotScale)), maxFontDots)
    ctx.font = buildTextFontDeclaration({
        size: resolvedSize,
        family: block.family || item.fontFamily || 'sans-serif',
        bold: Boolean(item.textBold),
        italic: Boolean(item.textItalic)
    })
    ctx.textBaseline = 'alphabetic'

    const verticalScale = Number.isFinite(block.textVerticalScale) ? block.textVerticalScale : 1
    const textLines = Array.isArray(block.textLines) && block.textLines.length ? block.textLines : [block.resolvedText || '']
    const lineMetrics = Array.isArray(block.textLineMetrics) ? block.textLineMetrics : []
    const scaledLineGap = Math.max(0, Number(block.textLineGap || 0) * verticalScale)
    const fallbackAscent = Math.max(1, Number(block.ascent || resolvedSize * verticalScale))
    const fallbackDescent = Math.max(0, Number(block.descent || 0))
    const yAdjust = Number(item.yOffset || 0)

    const drawX = isHorizontal ? flowCursor + Number(item.xOffset || 0) : Number(item.xOffset || 0)

    const blockHeight = Math.max(1, Number(block.textTotalHeight || fallbackAscent + fallbackDescent))
    const blockTop = isHorizontal
        ? (canvas.height - blockHeight) / 2 + yAdjust
        : flowCursor + Math.max(0, (Math.max(1, Number(block.span || blockHeight)) - blockHeight) / 2 + yAdjust)

    let cursorY = blockTop
    textLines.forEach((line, index) => {
        const metric = lineMetrics[index]
        const lineAscent = Math.max(1, Number(metric?.ascent || fallbackAscent / Math.max(1, verticalScale)))
        const lineDescent = Math.max(0, Number(metric?.descent || fallbackDescent / Math.max(1, verticalScale)))
        const scaledAscent = lineAscent * verticalScale
        const scaledDescent = lineDescent * verticalScale
        const baselineY = cursorY + scaledAscent

        ctx.save()
        ctx.translate(drawX, baselineY)
        ctx.scale(1, verticalScale)
        ctx.fillText(String(line || ''), 0, 0)
        ctx.restore()

        cursorY += scaledAscent + scaledDescent
        if (index < textLines.length - 1) {
            cursorY += scaledLineGap
        }
    })
}

/**
 * Renders one QR block.
 * @param {{
 *  ctx: OffscreenCanvasRenderingContext2D,
 *  canvas: OffscreenCanvas,
 *  block: any,
 *  flowCursor: number,
 *  feedPadStart: number,
 *  isHorizontal: boolean
 * }} options
 */
function renderQrFlowBlock({ ctx, canvas, block, flowCursor, feedPadStart, isHorizontal }) {
    const item = block.ref
    const drawSize = Math.max(1, Number(block.qrSize || item.size || 1))
    const drawX = isHorizontal
        ? flowCursor + Number(item.xOffset || 0)
        : Math.max(0, (canvas.width - drawSize) / 2 + Number(item.xOffset || 0))
    const drawY = isHorizontal
        ? Math.max(0, (canvas.height - drawSize) / 2 + Number(item.yOffset || 0))
        : flowCursor + Math.max(0, (Math.max(1, Number(block.span || drawSize)) - drawSize) / 2 + Number(item.yOffset || 0))
    ctx.drawImage(block.qrCanvas, drawX, drawY, drawSize, drawSize)
}

/**
 * Renders one barcode block.
 * @param {{
 *  ctx: OffscreenCanvasRenderingContext2D,
 *  canvas: OffscreenCanvas,
 *  block: any,
 *  flowCursor: number,
 *  feedPadStart: number,
 *  isHorizontal: boolean
 * }} options
 */
function renderBarcodeFlowBlock({ ctx, canvas, block, flowCursor, feedPadStart, isHorizontal }) {
    const item = block.ref
    const drawWidth = Math.max(16, Number(block.barcodeWidth || item.width || 16))
    const drawHeight = Math.max(16, Number(block.barcodeHeight || item.height || 16))
    const drawX = isHorizontal
        ? flowCursor + Number(item.xOffset || 0)
        : Math.max(0, (canvas.width - drawWidth) / 2 + Number(item.xOffset || 0))
    const drawY = isHorizontal
        ? Math.max(0, (canvas.height - drawHeight) / 2 + Number(item.yOffset || 0))
        : flowCursor + Math.max(0, (Math.max(1, Number(block.span || drawHeight)) - drawHeight) / 2 + Number(item.yOffset || 0))
    ctx.drawImage(block.barcodeCanvas, drawX, drawY, drawWidth, drawHeight)
}

/**
 * Rotates a canvas for vertical print orientation.
 * @param {OffscreenCanvas} canvas
 * @returns {OffscreenCanvas}
 */
function rotateForPrint(canvas) {
    const rotated = new OffscreenCanvas(canvas.height, canvas.width)
    const ctx = rotated.getContext('2d')
    if (!ctx) {
        throw new Error('Unable to allocate rotated print canvas context.')
    }
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, rotated.width, rotated.height)
    ctx.translate(rotated.width / 2, rotated.height / 2)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2)
    return rotated
}

/**
 * Builds QR code options from an item-like payload.
 * @param {any} item
 * @returns {{ qrErrorCorrectionLevel: 'L' | 'M' | 'Q' | 'H', qrVersion: number, qrEncodingMode: 'auto' | 'byte' | 'alphanumeric' | 'numeric' }}
 */
function normalizeQrOptions(item) {
    const source = item && typeof item === 'object' ? item : {}
    const errorLevel = String(source.qrErrorCorrectionLevel || source.errorCorrectionLevel || 'M')
        .trim()
        .toUpperCase()
    const version = Math.round(Number(source.qrVersion ?? source.version))
    const mode = String(source.qrEncodingMode || source.encodingMode || 'auto')
        .trim()
        .toLowerCase()
    return {
        qrErrorCorrectionLevel: ['L', 'M', 'Q', 'H'].includes(errorLevel) ? errorLevel : 'M',
        qrVersion: Number.isFinite(version) && version > 0 ? Math.max(1, Math.min(40, version)) : 0,
        qrEncodingMode: ['auto', 'byte', 'alphanumeric', 'numeric'].includes(mode) ? mode : 'auto'
    }
}

/**
 * Builds one QR canvas.
 * @param {string} value
 * @param {number} size
 * @param {any} item
 * @returns {Promise<OffscreenCanvas>}
 */
async function buildQrCanvas(value, size, item) {
    const qrRuntime = globalThis.QRCode
    if (!qrRuntime || typeof qrRuntime.create !== 'function') {
        throw new Error('QRCode runtime is unavailable.')
    }

    const options = normalizeQrOptions(item)
    const payload = options.qrEncodingMode === 'auto'
        ? String(value || '')
        : [{ data: String(value || ''), mode: options.qrEncodingMode }]
    const qrCreateOptions = {
        errorCorrectionLevel: options.qrErrorCorrectionLevel
    }
    if (options.qrVersion > 0) {
        qrCreateOptions.version = options.qrVersion
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
 * Builds one barcode canvas.
 * @param {string} value
 * @param {number} width
 * @param {number} height
 * @param {any} item
 * @returns {OffscreenCanvas}
 */
function buildBarcodeCanvas(value, width, height, item) {
    const normalizedValue = String(value || '').trim()
    const normalizedOptions = normalizeBarcodeOptions(item)
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
 * Normalizes barcode options from item-like payloads.
 * @param {any} item
 * @returns {{ barcodeFormat: string, barcodeShowText: boolean, barcodeModuleWidth: number, barcodeMargin: number }}
 */
function normalizeBarcodeOptions(item) {
    const source = item && typeof item === 'object' ? item : {}
    return {
        barcodeFormat: normalizeBarcodeFormat(source.barcodeFormat ?? source.format),
        barcodeShowText: normalizeBoolean(source.barcodeShowText ?? source.displayValue, false),
        barcodeModuleWidth: clampInteger(source.barcodeModuleWidth ?? source.moduleWidth, 1, 6, 2),
        barcodeMargin: clampInteger(source.barcodeMargin ?? source.margin, 0, 30, 0)
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

/**
 * Builds a canvas font declaration.
 * @param {{ size: number, family: string, bold?: boolean, italic?: boolean }} options
 * @returns {string}
 */
function buildTextFontDeclaration({ size, family, bold = false, italic = false }) {
    const safeSize = Math.max(1, Math.round(Number(size) || 1))
    const safeFamily = String(family || 'sans-serif')
    const style = italic ? 'italic ' : ''
    const weight = bold ? '700 ' : ''
    return `${style}${weight}${safeSize}px ${safeFamily}`.trim()
}

/**
 * Resolves text metrics while constraining rendered height.
 * @param {{
 *  ctx: OffscreenCanvasRenderingContext2D,
 *  text: string,
 *  family: string,
 *  requestedSize: number,
 *  maxHeight: number,
 *  bold?: boolean,
 *  italic?: boolean
 * }} options
 * @returns {{
 *  size: number,
 *  advanceWidth: number,
 *  ascent: number,
 *  descent: number,
 *  inkLeft: number,
 *  inkWidth: number,
 *  lineGap: number,
 *  lines: string[],
 *  lineMetrics: Array<{ text: string, advanceWidth: number, ascent: number, descent: number, inkLeft: number, inkWidth: number }>,
 *  totalHeight: number
 * }}
 */
function resolveTextMetrics({ ctx, text, family, requestedSize, maxHeight, bold = false, italic = false }) {
    const limit = Math.max(4, maxHeight)
    const lines = normalizeTextLines(text)
    let size = Math.min(Math.max(4, requestedSize), limit * 3)
    let metrics = measureTextLines(ctx, lines, size, family, bold, italic)
    while (metrics.height > limit && size > 4) {
        size -= 1
        metrics = measureTextLines(ctx, lines, size, family, bold, italic)
    }
    return {
        size,
        advanceWidth: metrics.advanceWidth,
        ascent: metrics.ascent,
        descent: metrics.descent,
        inkLeft: metrics.inkLeft,
        inkWidth: metrics.inkWidth,
        lineGap: metrics.lineGap,
        lines,
        lineMetrics: metrics.lineMetrics,
        totalHeight: metrics.height
    }
}

/**
 * Normalizes text into drawable lines.
 * @param {string} text
 * @returns {string[]}
 */
function normalizeTextLines(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n')
    return lines.length ? lines : ['']
}

/**
 * Measures line-level text metrics.
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {string[]} lines
 * @param {number} size
 * @param {string} family
 * @param {boolean} bold
 * @param {boolean} italic
 * @returns {{
 *  advanceWidth: number,
 *  height: number,
 *  ascent: number,
 *  descent: number,
 *  inkLeft: number,
 *  inkWidth: number,
 *  lineGap: number,
 *  lineMetrics: Array<{ text: string, advanceWidth: number, ascent: number, descent: number, inkLeft: number, inkWidth: number }>
 * }}
 */
function measureTextLines(ctx, lines, size, family, bold, italic) {
    ctx.font = buildTextFontDeclaration({ size, family, bold, italic })
    const safeLines = Array.isArray(lines) && lines.length ? lines : ['']
    const lineGap = safeLines.length > 1 ? Math.max(1, Math.round(size * 0.22)) : 0

    const lineMetrics = safeLines.map((lineText) => {
        const measured = ctx.measureText(String(lineText || ''))
        const ascent = Number.isFinite(measured.actualBoundingBoxAscent)
            ? measured.actualBoundingBoxAscent
            : size * 0.8
        const descent = Number.isFinite(measured.actualBoundingBoxDescent)
            ? measured.actualBoundingBoxDescent
            : size * 0.2
        const inkLeft = Number.isFinite(measured.actualBoundingBoxLeft) ? measured.actualBoundingBoxLeft : 0
        const inkRight = Number.isFinite(measured.actualBoundingBoxRight)
            ? measured.actualBoundingBoxRight
            : measured.width
        const clampedInkLeft = Math.max(0, inkLeft)
        const clampedInkWidth = Math.max(1, Math.max(clampedInkLeft, inkRight) - clampedInkLeft)
        return {
            text: String(lineText || ''),
            advanceWidth: Math.max(1, measured.width),
            ascent: Math.max(1, ascent),
            descent: Math.max(0, descent),
            inkLeft: clampedInkLeft,
            inkWidth: clampedInkWidth
        }
    })

    const advanceWidth = lineMetrics.reduce((maxValue, metric) => Math.max(maxValue, metric.advanceWidth), 1)
    const inkLeft = lineMetrics.reduce((minValue, metric) => Math.min(minValue, metric.inkLeft), Infinity)
    const rightMostInk = lineMetrics.reduce(
        (maxValue, metric) => Math.max(maxValue, metric.inkLeft + metric.inkWidth),
        0
    )
    const ascent = lineMetrics.reduce((maxValue, metric) => Math.max(maxValue, metric.ascent), 1)
    const descent = lineMetrics.reduce((maxValue, metric) => Math.max(maxValue, metric.descent), 0)
    const lineHeightSum = lineMetrics.reduce((sum, metric) => sum + metric.ascent + metric.descent, 0)
    const height = Math.max(1, lineHeightSum + lineGap * Math.max(0, safeLines.length - 1))

    return {
        advanceWidth,
        height,
        ascent,
        descent,
        inkLeft: Number.isFinite(inkLeft) ? inkLeft : 0,
        inkWidth: Math.max(1, rightMostInk - (Number.isFinite(inkLeft) ? inkLeft : 0)),
        lineGap,
        lineMetrics
    }
}

globalThis.onmessage = (event) => {
    void handleWorkerMessage(event)
}
