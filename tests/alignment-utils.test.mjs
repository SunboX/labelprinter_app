import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AlignmentUtils } from '../src/AlignmentUtils.mjs'

describe('computeBoundingRect', () => {
    it('returns the outer bounds for multiple rectangles', () => {
        const rect = AlignmentUtils.computeBoundingRect([
            { x: 10, y: 20, width: 20, height: 10 },
            { x: 30, y: 15, width: 15, height: 40 }
        ])
        assert.deepEqual(rect, { x: 10, y: 15, width: 35, height: 40 })
    })
})

describe('resolveAlignmentReferenceRect', () => {
    const entries = [
        { bounds: { x: 10, y: 20, width: 20, height: 10 } },
        { bounds: { x: 40, y: 10, width: 10, height: 10 } },
        { bounds: { x: 15, y: 30, width: 30, height: 20 } }
    ]

    it('resolves selection bounds', () => {
        const rect = AlignmentUtils.resolveAlignmentReferenceRect(entries, 'selection', { x: 0, y: 0, width: 120, height: 60 })
        assert.deepEqual(rect, { x: 10, y: 10, width: 40, height: 40 })
    })

    it('resolves the largest entry bounds', () => {
        const rect = AlignmentUtils.resolveAlignmentReferenceRect(entries, 'largest', { x: 0, y: 0, width: 120, height: 60 })
        assert.deepEqual(rect, { x: 15, y: 30, width: 30, height: 20 })
    })

    it('resolves the smallest entry bounds', () => {
        const rect = AlignmentUtils.resolveAlignmentReferenceRect(entries, 'smallest', { x: 0, y: 0, width: 120, height: 60 })
        assert.deepEqual(rect, { x: 40, y: 10, width: 10, height: 10 })
    })

    it('uses label bounds for label mode', () => {
        const labelRect = { x: 0, y: 0, width: 120, height: 60 }
        const rect = AlignmentUtils.resolveAlignmentReferenceRect(entries, 'label', labelRect)
        assert.deepEqual(rect, labelRect)
    })
})

describe('computeAlignmentDelta', () => {
    const bounds = { x: 20, y: 10, width: 12, height: 8 }
    const reference = { x: 10, y: 20, width: 40, height: 30 }

    it('computes horizontal deltas', () => {
        assert.deepEqual(AlignmentUtils.computeAlignmentDelta(bounds, reference, 'left'), { deltaX: -10, deltaY: 0 })
        assert.deepEqual(AlignmentUtils.computeAlignmentDelta(bounds, reference, 'center'), { deltaX: 4, deltaY: 0 })
        assert.deepEqual(AlignmentUtils.computeAlignmentDelta(bounds, reference, 'right'), { deltaX: 18, deltaY: 0 })
    })

    it('computes vertical deltas', () => {
        assert.deepEqual(AlignmentUtils.computeAlignmentDelta(bounds, reference, 'top'), { deltaX: 0, deltaY: 10 })
        assert.deepEqual(AlignmentUtils.computeAlignmentDelta(bounds, reference, 'middle'), { deltaX: 0, deltaY: 21 })
        assert.deepEqual(AlignmentUtils.computeAlignmentDelta(bounds, reference, 'bottom'), { deltaX: 0, deltaY: 32 })
    })
})
