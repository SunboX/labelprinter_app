import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { IconRasterUtils } from '../src/IconRasterUtils.mjs'

describe('icon-raster-utils', () => {
    it('converts dark pixels to opaque black', () => {
        const pixels = new Uint8ClampedArray([20, 20, 20, 255])
        const result = IconRasterUtils.convertRgbaToMonochromeIcon(pixels)

        assert.deepEqual(Array.from(result), [0, 0, 0, 255])
    })

    it('converts bright pixels to transparent black', () => {
        const pixels = new Uint8ClampedArray([240, 240, 240, 255])
        const result = IconRasterUtils.convertRgbaToMonochromeIcon(pixels)

        assert.deepEqual(Array.from(result), [0, 0, 0, 0])
    })

    it('drops near-transparent pixels', () => {
        const pixels = new Uint8ClampedArray([0, 0, 0, 9])
        const result = IconRasterUtils.convertRgbaToMonochromeIcon(pixels)

        assert.deepEqual(Array.from(result), [0, 0, 0, 0])
    })
})
