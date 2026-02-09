/**
 * Utilities for converting uploaded images into printer-like monochrome output.
 */
export class ImageRasterUtils {
    static #ditherModes = Object.freeze(['threshold', 'floyd-steinberg', 'ordered'])
    static #smoothingModes = Object.freeze(['off', 'low', 'medium', 'high'])
    static #orderedMatrix4x4 = Object.freeze([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5])

    /**
     * Returns available dithering modes.
     * @returns {string[]}
     */
    static get DITHER_MODES() {
        return [...ImageRasterUtils.#ditherModes]
    }

    /**
     * Returns available image smoothing modes.
     * @returns {string[]}
     */
    static get SMOOTHING_MODES() {
        return [...ImageRasterUtils.#smoothingModes]
    }

    /**
     * Normalizes image item print options.
     * @param {object} item
     * @returns {{ imageDither: string, imageThreshold: number, imageSmoothing: string, imageInvert: boolean }}
     */
    static normalizeItemOptions(item) {
        const rawDither = String(item?.imageDither || '').trim().toLowerCase()
        const rawSmoothing = String(item?.imageSmoothing || '').trim().toLowerCase()
        const threshold = Number.isFinite(Number(item?.imageThreshold))
            ? Math.round(Number(item.imageThreshold))
            : 128
        return {
            imageDither: ImageRasterUtils.#ditherModes.includes(rawDither) ? rawDither : 'floyd-steinberg',
            imageThreshold: Math.max(0, Math.min(255, threshold)),
            imageSmoothing: ImageRasterUtils.#smoothingModes.includes(rawSmoothing) ? rawSmoothing : 'medium',
            imageInvert: Boolean(item?.imageInvert)
        }
    }

    /**
     * Converts RGBA pixels to monochrome RGBA pixels.
     * @param {Uint8ClampedArray} rgbaPixels
     * @param {number} width
     * @param {number} height
     * @param {{ imageDither?: string, imageThreshold?: number, imageSmoothing?: string, imageInvert?: boolean }} options
     * @returns {Uint8ClampedArray}
     */
    static convertRgbaToMonochrome(rgbaPixels, width, height, options = {}) {
        const normalizedOptions = ImageRasterUtils.normalizeItemOptions(options)
        const pixelCount = Math.max(0, Math.floor(width) * Math.floor(height))
        const luminance = ImageRasterUtils.#buildLuminanceBuffer(rgbaPixels, pixelCount, normalizedOptions.imageInvert)
        if (normalizedOptions.imageDither === 'floyd-steinberg') {
            return ImageRasterUtils.#applyFloydSteinberg(luminance, width, height, normalizedOptions.imageThreshold)
        }
        if (normalizedOptions.imageDither === 'ordered') {
            return ImageRasterUtils.#applyOrderedDither(luminance, width, height, normalizedOptions.imageThreshold)
        }
        return ImageRasterUtils.#applyThreshold(luminance, width, height, normalizedOptions.imageThreshold)
    }

    /**
     * Converts RGBA pixels into a luminance buffer, composited over white.
     * @param {Uint8ClampedArray} rgbaPixels
     * @param {number} pixelCount
     * @param {boolean} invert
     * @returns {Float32Array}
     */
    static #buildLuminanceBuffer(rgbaPixels, pixelCount, invert) {
        const luminance = new Float32Array(pixelCount)
        for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
            const rgbaOffset = pixelIndex * 4
            const red = rgbaPixels[rgbaOffset] || 0
            const green = rgbaPixels[rgbaOffset + 1] || 0
            const blue = rgbaPixels[rgbaOffset + 2] || 0
            const alpha = (rgbaPixels[rgbaOffset + 3] || 0) / 255
            const sourceLuminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
            const compositedOnWhite = sourceLuminance * alpha + 255 * (1 - alpha)
            luminance[pixelIndex] = invert ? 255 - compositedOnWhite : compositedOnWhite
        }
        return luminance
    }

    /**
     * Applies plain thresholding.
     * @param {Float32Array} luminance
     * @param {number} width
     * @param {number} height
     * @param {number} threshold
     * @returns {Uint8ClampedArray}
     */
    static #applyThreshold(luminance, width, height, threshold) {
        const output = new Uint8ClampedArray(Math.max(0, width * height * 4))
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const pixelIndex = y * width + x
                const rgbaOffset = pixelIndex * 4
                const value = luminance[pixelIndex] < threshold ? 0 : 255
                output[rgbaOffset] = value
                output[rgbaOffset + 1] = value
                output[rgbaOffset + 2] = value
                output[rgbaOffset + 3] = 255
            }
        }
        return output
    }

    /**
     * Applies 4x4 ordered dithering.
     * @param {Float32Array} luminance
     * @param {number} width
     * @param {number} height
     * @param {number} threshold
     * @returns {Uint8ClampedArray}
     */
    static #applyOrderedDither(luminance, width, height, threshold) {
        const output = new Uint8ClampedArray(Math.max(0, width * height * 4))
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const pixelIndex = y * width + x
                const rgbaOffset = pixelIndex * 4
                const matrixIndex = (y % 4) * 4 + (x % 4)
                const matrixValue = ImageRasterUtils.#orderedMatrix4x4[matrixIndex]
                const adjustedThreshold = threshold + (matrixValue - 7.5) * 8
                const value = luminance[pixelIndex] < adjustedThreshold ? 0 : 255
                output[rgbaOffset] = value
                output[rgbaOffset + 1] = value
                output[rgbaOffset + 2] = value
                output[rgbaOffset + 3] = 255
            }
        }
        return output
    }

    /**
     * Applies Floyd-Steinberg error diffusion.
     * @param {Float32Array} luminance
     * @param {number} width
     * @param {number} height
     * @param {number} threshold
     * @returns {Uint8ClampedArray}
     */
    static #applyFloydSteinberg(luminance, width, height, threshold) {
        const output = new Uint8ClampedArray(Math.max(0, width * height * 4))
        const workBuffer = new Float32Array(luminance)
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const pixelIndex = y * width + x
                const oldValue = workBuffer[pixelIndex]
                const newValue = oldValue < threshold ? 0 : 255
                const error = oldValue - newValue
                const rgbaOffset = pixelIndex * 4
                output[rgbaOffset] = newValue
                output[rgbaOffset + 1] = newValue
                output[rgbaOffset + 2] = newValue
                output[rgbaOffset + 3] = 255
                ImageRasterUtils.#addDiffusion(workBuffer, x + 1, y, width, height, error * (7 / 16))
                ImageRasterUtils.#addDiffusion(workBuffer, x - 1, y + 1, width, height, error * (3 / 16))
                ImageRasterUtils.#addDiffusion(workBuffer, x, y + 1, width, height, error * (5 / 16))
                ImageRasterUtils.#addDiffusion(workBuffer, x + 1, y + 1, width, height, error * (1 / 16))
            }
        }
        return output
    }

    /**
     * Adds diffusion error to a neighboring pixel.
     * @param {Float32Array} buffer
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     * @param {number} delta
     */
    static #addDiffusion(buffer, x, y, width, height, delta) {
        if (x < 0 || y < 0 || x >= width || y >= height) return
        const index = y * width + x
        buffer[index] = Math.max(0, Math.min(255, buffer[index] + delta))
    }
}
