import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ImageRasterUtils } from '../src/ImageRasterUtils.mjs'

describe('image-raster-utils', () => {
    it('normalizes image raster options', () => {
        const normalized = ImageRasterUtils.normalizeItemOptions({
            imageDither: 'ORDERED',
            imageThreshold: 999,
            imageSmoothing: 'LOW',
            imageInvert: 1
        })
        assert.deepEqual(normalized, {
            imageDither: 'ordered',
            imageThreshold: 255,
            imageSmoothing: 'low',
            imageInvert: true
        })
    })

    it('applies threshold monochrome conversion', () => {
        const rgba = new Uint8ClampedArray([
            0, 0, 0, 255,
            255, 255, 255, 255,
            120, 120, 120, 255,
            220, 220, 220, 255
        ])
        const result = ImageRasterUtils.convertRgbaToMonochrome(rgba, 2, 2, {
            imageDither: 'threshold',
            imageThreshold: 128
        })
        const values = [result[0], result[4], result[8], result[12]]
        assert.deepEqual(values, [0, 255, 0, 255])
    })

    it('supports invert option', () => {
        const rgba = new Uint8ClampedArray([0, 0, 0, 255])
        const result = ImageRasterUtils.convertRgbaToMonochrome(rgba, 1, 1, {
            imageDither: 'threshold',
            imageThreshold: 128,
            imageInvert: true
        })
        assert.equal(result[0], 255)
    })
})
