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
     *  cache: Map<string, HTMLCanvasElement>,
     *  loadSourceImage: (imageData: string) => Promise<HTMLImageElement | null>
     * }} options
     * @returns {Promise<HTMLCanvasElement | null>}
     */
    static async getCachedIconCanvas({ item, width, height, cache, loadSourceImage }) {
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
        const sourceImage = await loadSourceImage(IconLibraryUtils.getIconSvgDataUrl(iconId, { validate: false }))
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
        for (let index = 0; index < imageData.data.length; index += 4) {
            const alpha = imageData.data[index + 3]
            if (alpha < 10) {
                imageData.data[index + 3] = 0
                continue
            }
            const luminance =
                imageData.data[index] * 0.2126 +
                imageData.data[index + 1] * 0.7152 +
                imageData.data[index + 2] * 0.0722
            const isBlack = luminance < 160
            imageData.data[index] = 0
            imageData.data[index + 1] = 0
            imageData.data[index + 2] = 0
            imageData.data[index + 3] = isBlack ? 255 : 0
        }
        ctx.putImageData(imageData, 0, 0)
        return canvas
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
            cache.delete(oldestKey)
        }
    }
}
