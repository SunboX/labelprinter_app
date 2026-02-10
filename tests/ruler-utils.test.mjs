import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RulerUtils } from '../src/RulerUtils.mjs'

describe('computeRulerScale', () => {
    it('returns scale and offset for a valid axis length', () => {
        const { pixelsPerMm, startPx, usableLengthPx } = RulerUtils.computeRulerScale(100, 1000, 20)
        assert.equal(startPx, 20)
        assert.equal(usableLengthPx, 980)
        assert.equal(pixelsPerMm, 9.8)
    })

    it('clamps offset to the axis length', () => {
        const { startPx, usableLengthPx } = RulerUtils.computeRulerScale(50, 120, 200)
        assert.equal(startPx, 120)
        assert.equal(usableLengthPx, 0)
    })

    it('accepts a zero offset without shrinking the axis', () => {
        const { pixelsPerMm, startPx, usableLengthPx } = RulerUtils.computeRulerScale(130, 260, 0)
        assert.equal(startPx, 0)
        assert.equal(usableLengthPx, 260)
        assert.equal(pixelsPerMm, 2)
    })

    it('preserves mm scale when the axis override includes a positive start offset', () => {
        const { pixelsPerMm, startPx, usableLengthPx } = RulerUtils.computeRulerScale(140, 640, 10)
        assert.equal(startPx, 10)
        assert.equal(usableLengthPx, 630)
        assert.equal(pixelsPerMm, 4.5)
    })
})

describe('computeRulerHighlight', () => {
    it('returns a clamped highlight range', () => {
        const highlight = RulerUtils.computeRulerHighlight(10, 2, 12, 30)
        assert.equal(highlight.startPx, 10)
        assert.equal(highlight.endPx, 30)
        assert.equal(highlight.lengthPx, 20)
    })

    it('handles a zero axis length', () => {
        const highlight = RulerUtils.computeRulerHighlight(4, 3, 8, 0)
        assert.equal(highlight.startPx, 0)
        assert.equal(highlight.endPx, 0)
        assert.equal(highlight.lengthPx, 0)
    })
})

describe('computeRulerLabelPosition', () => {
    it('keeps edge labels inside the axis bounds with inset', () => {
        assert.equal(RulerUtils.computeRulerLabelPosition(0, 0, 200, 10), 10)
        assert.equal(RulerUtils.computeRulerLabelPosition(195, 0, 200, 10), 190)
    })

    it('respects a positive axis start offset', () => {
        assert.equal(RulerUtils.computeRulerLabelPosition(4, 12, 200, 6), 18)
        assert.equal(RulerUtils.computeRulerLabelPosition(80, 12, 200, 6), 80)
    })
})

describe('isAxisPositionVisible', () => {
    it('returns true for positions within the visible axis span', () => {
        assert.equal(RulerUtils.isAxisPositionVisible(0, 200), true)
        assert.equal(RulerUtils.isAxisPositionVisible(120, 200), true)
        assert.equal(RulerUtils.isAxisPositionVisible(200, 200), true)
    })

    it('supports a bleed margin and hides far out-of-range positions', () => {
        assert.equal(RulerUtils.isAxisPositionVisible(-1, 200, 1), true)
        assert.equal(RulerUtils.isAxisPositionVisible(201, 200, 1), true)
        assert.equal(RulerUtils.isAxisPositionVisible(-3, 200, 1), false)
        assert.equal(RulerUtils.isAxisPositionVisible(204, 200, 1), false)
    })
})
