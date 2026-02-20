import { ImageRasterUtils } from '../ImageRasterUtils.mjs'

const SOURCE_BITMAP_CACHE_LIMIT = 32

/** @type {Map<string, ImageBitmap>} */
const sourceBitmapCache = new Map()

/**
 * Handles incoming rasterization requests.
 * @param {MessageEvent<any>} event
 */
async function handleWorkerMessage(event) {
    const data = event?.data || {}
    if (String(data?.type || '') !== 'rasterize') return
    const requestId = Number(data?.requestId)
    if (!Number.isInteger(requestId) || requestId < 1) return

    try {
        const payload = await rasterizePayload(data?.payload)
        postSuccess(requestId, payload)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Rasterization failed.'
        postError(requestId, message)
    }
}

/**
 * Posts a success response.
 * @param {number} requestId
 * @param {{ cacheKey: string, bitmap: ImageBitmap, width: number, height: number }} payload
 */
function postSuccess(requestId, payload) {
    globalThis.postMessage(
        {
            type: 'rasterize:ok',
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
        type: 'rasterize:error',
        requestId,
        error: { message: String(message || 'Rasterization failed.') }
    })
}

/**
 * Rasterizes one image/icon payload.
 * @param {any} payload
 * @returns {Promise<{ cacheKey: string, bitmap: ImageBitmap, width: number, height: number }>}
 */
async function rasterizePayload(payload) {
    if (typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') {
        throw new Error('Offscreen raster APIs are unavailable.')
    }
    const mode = String(payload?.mode || '')
    if (mode !== 'image' && mode !== 'icon') {
        throw new Error('Unsupported raster mode.')
    }
    const source = String(payload?.source || '').trim()
    if (!source) {
        throw new Error('Raster source is required.')
    }
    const width = Math.max(1, Math.round(Number(payload?.width) || 1))
    const height = Math.max(1, Math.round(Number(payload?.height) || 1))
    const cacheKey = String(payload?.cacheKey || '')

    const sourceBitmap = await getSourceBitmap(source)
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
        throw new Error('Unable to allocate offscreen canvas context.')
    }

    if (mode === 'icon') {
        rasterizeIcon(context, sourceBitmap, width, height)
    } else {
        rasterizeImage(context, sourceBitmap, width, height, payload?.options)
    }
    const bitmap = await createImageBitmap(canvas)
    return { cacheKey, bitmap, width, height }
}

/**
 * Draws and rasterizes one image source to monochrome RGBA output.
 * @param {OffscreenCanvasRenderingContext2D} context
 * @param {ImageBitmap} sourceBitmap
 * @param {number} width
 * @param {number} height
 * @param {unknown} options
 */
function rasterizeImage(context, sourceBitmap, width, height, options) {
    const normalizedOptions = ImageRasterUtils.normalizeItemOptions(options)
    context.fillStyle = '#fff'
    context.fillRect(0, 0, width, height)
    context.imageSmoothingEnabled = normalizedOptions.imageSmoothing !== 'off'
    if (context.imageSmoothingEnabled && 'imageSmoothingQuality' in context) {
        context.imageSmoothingQuality =
            normalizedOptions.imageSmoothing === 'high'
                ? 'high'
                : normalizedOptions.imageSmoothing === 'low'
                  ? 'low'
                  : 'medium'
    }
    context.drawImage(sourceBitmap, 0, 0, width, height)
    const imageData = context.getImageData(0, 0, width, height)
    const monochromePixels = ImageRasterUtils.convertRgbaToMonochrome(imageData.data, width, height, normalizedOptions)
    imageData.data.set(monochromePixels)
    context.putImageData(imageData, 0, 0)
}

/**
 * Draws and rasterizes one icon source to strict black/transparent output.
 * @param {OffscreenCanvasRenderingContext2D} context
 * @param {ImageBitmap} sourceBitmap
 * @param {number} width
 * @param {number} height
 */
function rasterizeIcon(context, sourceBitmap, width, height) {
    context.clearRect(0, 0, width, height)
    context.imageSmoothingEnabled = true
    if ('imageSmoothingQuality' in context) {
        context.imageSmoothingQuality = 'high'
    }
    context.drawImage(sourceBitmap, 0, 0, width, height)
    const imageData = context.getImageData(0, 0, width, height)
    imageData.data.set(convertRgbaToMonochromeIcon(imageData.data))
    context.putImageData(imageData, 0, 0)
}

/**
 * Converts icon RGBA pixels to black/transparent RGBA output.
 * @param {Uint8ClampedArray} pixels
 * @returns {Uint8ClampedArray}
 */
function convertRgbaToMonochromeIcon(pixels) {
    const output = new Uint8ClampedArray(pixels.length)
    for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3]
        if (alpha < 10) {
            output[index + 3] = 0
            continue
        }
        const luminance = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722
        output[index] = 0
        output[index + 1] = 0
        output[index + 2] = 0
        output[index + 3] = luminance < 160 ? 255 : 0
    }
    return output
}

/**
 * Resolves a cached source bitmap or loads a fresh one.
 * @param {string} source
 * @returns {Promise<ImageBitmap>}
 */
async function getSourceBitmap(source) {
    if (sourceBitmapCache.has(source)) {
        const cached = sourceBitmapCache.get(source)
        sourceBitmapCache.delete(source)
        sourceBitmapCache.set(source, cached)
        return cached
    }
    const response = await fetch(source, { cache: 'force-cache' })
    if (!response.ok) {
        throw new Error(`Failed to load source image: HTTP ${response.status}`)
    }
    const blob = await response.blob()
    const bitmap = await createImageBitmap(blob)
    sourceBitmapCache.set(source, bitmap)
    pruneSourceBitmapCache()
    return bitmap
}

/**
 * Prunes source bitmap cache and closes evicted bitmap resources.
 */
function pruneSourceBitmapCache() {
    while (sourceBitmapCache.size > SOURCE_BITMAP_CACHE_LIMIT) {
        const oldestKey = sourceBitmapCache.keys().next().value
        if (!oldestKey) return
        const oldestValue = sourceBitmapCache.get(oldestKey)
        if (oldestValue && typeof oldestValue.close === 'function') {
            oldestValue.close()
        }
        sourceBitmapCache.delete(oldestKey)
    }
}

globalThis.onmessage = (event) => {
    void handleWorkerMessage(event)
}
