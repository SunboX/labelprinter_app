import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PreviewLayoutUtils } from '../src/PreviewLayoutUtils.mjs'

describe('computePreviewMetrics', () => {
    it('uses minimum layout bounds for small labels', () => {
        const metrics = PreviewLayoutUtils.computePreviewMetrics(20, 8)
        assert.equal(metrics.displayWidthMm, 260)
        assert.equal(metrics.displayHeightMm, 140)
        assert.equal(metrics.pxPerMm, 4.5)
    })

    it('expands layout bounds when labels are larger', () => {
        const metrics = PreviewLayoutUtils.computePreviewMetrics(220, 120)
        assert.equal(metrics.displayWidthMm, 260)
        assert.equal(metrics.displayHeightMm, 160)
    })

    it('shrinks the scale to respect a max width', () => {
        const metrics = PreviewLayoutUtils.computePreviewMetrics(200, 80, 780)
        assert.equal(metrics.displayWidthMm, 260)
        assert.equal(metrics.pxPerMm, 3)
    })
})

describe('computeLabelTagLayout', () => {
    it('offsets the tape and centers the label tag', () => {
        const layout = PreviewLayoutUtils.computeLabelTagLayout(50, 40, 18, 20, 10, 6)
        assert.equal(layout.tapeOffset, 28)
        assert.equal(layout.labelLeft, 28)
        assert.equal(layout.labelTop, 41)
    })

    it('clamps the label tag left edge to zero', () => {
        const layout = PreviewLayoutUtils.computeLabelTagLayout(20, 16, 30, 12, 10, 6)
        assert.equal(layout.tapeOffset, 40)
        assert.equal(layout.labelLeft, 0)
        assert.equal(layout.labelTop, 7)
    })
})

describe('computeLabelMmDimensions', () => {
    it('uses the media width as the tape height when horizontal', () => {
        const dims = PreviewLayoutUtils.computeLabelMmDimensions(64, 64, 7.1, 7.1, 9, true)
        assert.equal(dims.labelMmHeight, 9)
        assert.equal(dims.labelMmWidth, 64 / 7.1)
    })

    it('uses the media width as the tape width when vertical', () => {
        const dims = PreviewLayoutUtils.computeLabelMmDimensions(64, 128, 7.1, 7.1, 12, false)
        assert.equal(dims.labelMmWidth, 12)
        assert.equal(dims.labelMmHeight, 128 / 7.1)
    })
})

describe('computeMarginMarkerRect', () => {
    it('returns a rect that respects margins and inset', () => {
        const rect = PreviewLayoutUtils.computeMarginMarkerRect(200, 40, 10, 20, 2)
        assert.equal(rect.x, 10)
        assert.equal(rect.y, 2)
        assert.equal(rect.width, 170)
        assert.equal(rect.height, 36)
    })

    it('clamps values when margins exceed width', () => {
        const rect = PreviewLayoutUtils.computeMarginMarkerRect(30, 20, 40, 10, 4)
        assert.equal(rect.x, 30)
        assert.equal(rect.width, 0)
        assert.equal(rect.height, 12)
    })
})

describe('computeAutoLabelLengthDots', () => {
    it('extends when content passes the baseline length', () => {
        const length = PreviewLayoutUtils.computeAutoLabelLengthDots(120, 140, 8, 60)
        assert.equal(length, 148)
    })

    it('shrinks to rendered content when items overlap on the flow axis', () => {
        const length = PreviewLayoutUtils.computeAutoLabelLengthDots(120, 90, 8, 60)
        assert.equal(length, 98)
    })

    it('respects min length when baseline is short', () => {
        const length = PreviewLayoutUtils.computeAutoLabelLengthDots(40, 20, 8, 80)
        assert.equal(length, 80)
    })
})
