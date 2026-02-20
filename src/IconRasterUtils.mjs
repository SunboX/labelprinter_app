import { IconLibraryUtils } from './IconLibraryUtils.mjs'

/**
 * Rasterization helpers for monochrome SVG icon rendering.
 */
export class IconRasterUtils {
    /**
     * Returns a cached icon canvas or rasterizes a new one.
     * @param {{
     *  item: object,
     *  width: number,
     *  height: number,
     *  cache: Map<string, CanvasImageSource>,
     *  loadSourceImage: (imageData: string) => Promise<HTMLImageElement | null>,
     *  rasterWorkerClient?: { isAvailable?: () => boolean, rasterizeIcon?: (request: { source: string, width: number, height: number, cacheKey: string }) => Promise<{ bitmap: ImageBitmap }> } | null
     * }} options
     * @returns {Promise<CanvasImageSource | null>}
     */
    static async getCachedIconCanvas({ item, width, height, cache, loadSourceImage, rasterWorkerClient = null }) {
        const iconId = await IconLibraryUtils.ensureIconUsable(item?.iconId)
        const safeWidth = Math.max(1, Math.round(Number(width) || 1))
        const safeHeight = Math.max(1, Math.round(Number(height) || 1))
        const cacheKey = `icon:${iconId}:${safeWidth}x${safeHeight}`
        if (cache.has(cacheKey)) {
            const cached = cache.get(cacheKey)
            cache.delete(cacheKey)
            cache.set(cacheKey, cached)
            return cached
        }
        const iconSource = IconLibraryUtils.getIconSvgDataUrl(iconId, { validate: false })
        const workerIconSource = IconRasterUtils.#resolveWorkerSourceUrl(iconSource)
        if (rasterWorkerClient?.isAvailable?.() && typeof rasterWorkerClient.rasterizeIcon === 'function') {
            try {
                const workerResult = await rasterWorkerClient.rasterizeIcon({
                    source: workerIconSource,
                    width: safeWidth,
                    height: safeHeight,
                    cacheKey
                })
                if (workerResult?.bitmap) {
                    cache.set(cacheKey, workerResult.bitmap)
                    IconRasterUtils.#pruneCache(cache, 96)
                    return workerResult.bitmap
                }
            } catch (_error) {}
        }
        const sourceImage = await loadSourceImage(iconSource)
        if (!sourceImage) return null
        const canvas = IconRasterUtils.buildMonochromeIconCanvas(sourceImage, safeWidth, safeHeight)
        cache.set(cacheKey, canvas)
        IconRasterUtils.#pruneCache(cache, 96)
        return canvas
    }

    /**
     * Builds a strict black/transparent icon canvas from SVG source pixels.
     * @param {CanvasImageSource} sourceImage
     * @param {number} width
     * @param {number} height
     * @returns {HTMLCanvasElement}
     */
    static buildMonochromeIconCanvas(sourceImage, width, height) {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.clearRect(0, 0, width, height)
        ctx.imageSmoothingEnabled = true
        if ('imageSmoothingQuality' in ctx) {
            ctx.imageSmoothingQuality = 'high'
        }
        ctx.drawImage(sourceImage, 0, 0, width, height)
        const imageData = ctx.getImageData(0, 0, width, height)
        imageData.data.set(IconRasterUtils.convertRgbaToMonochromeIcon(imageData.data))
        ctx.putImageData(imageData, 0, 0)
        return canvas
    }

    /**
     * Converts icon RGBA pixels to strict black/transparent RGBA pixels.
     * @param {Uint8ClampedArray} pixels
     * @returns {Uint8ClampedArray}
     */
    static convertRgbaToMonochromeIcon(pixels) {
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
     * Prunes a cache map to a max entry size.
     * @param {Map<string, unknown>} cache
     * @param {number} maxEntries
     */
    static #pruneCache(cache, maxEntries) {
        if (cache.size <= maxEntries) return
        const oldestKey = cache.keys().next().value
        if (oldestKey) {
            const removed = cache.get(oldestKey)
            if (removed && typeof removed.close === 'function') {
                removed.close()
            }
            cache.delete(oldestKey)
        }
    }

    /**
     * Resolves icon source URL for worker fetch contexts.
     * @param {string} source
     * @returns {string}
     */
    static #resolveWorkerSourceUrl(source) {
        const normalized = String(source || '').trim()
        if (!normalized) return ''
        try {
            if (typeof location === 'undefined') return normalized
            return new URL(normalized, location.href).toString()
        } catch (_error) {
            return normalized
        }
    }
}
