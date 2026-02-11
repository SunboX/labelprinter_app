import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RotationUtils } from '../src/RotationUtils.mjs'

describe('rotation-utils', () => {
    it('normalizes degree values to -180..180', () => {
        assert.equal(RotationUtils.normalizeDegrees(0), 0)
        assert.equal(RotationUtils.normalizeDegrees(180), 180)
        assert.equal(RotationUtils.normalizeDegrees(181), -179)
        assert.equal(RotationUtils.normalizeDegrees(360), 0)
        assert.equal(RotationUtils.normalizeDegrees(-450), -90)
    })

    it('returns fallback degrees when value is invalid', () => {
        assert.equal(RotationUtils.normalizeDegrees('bad', 12), 12)
        assert.equal(RotationUtils.normalizeDegrees(undefined, -33), -33)
    })

    it('computes rotated axis-aligned bounds for right-angle rotations', () => {
        const rotated = RotationUtils.computeRotatedBounds({ x: 10, y: 20, width: 40, height: 20 }, 90)
        assert.equal(Math.round(rotated.x), 20)
        assert.equal(Math.round(rotated.y), 10)
        assert.equal(Math.round(rotated.width), 20)
        assert.equal(Math.round(rotated.height), 40)
    })

    it('keeps bounds unchanged for zero rotation', () => {
        const bounds = { x: 4, y: 7, width: 33, height: 12 }
        assert.deepEqual(RotationUtils.computeRotatedBounds(bounds, 0), bounds)
    })
})
