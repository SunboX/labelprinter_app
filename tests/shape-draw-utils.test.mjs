import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShapeDrawUtils } from '../src/ShapeDrawUtils.mjs'

describe('shape-draw-utils', () => {
    it('keeps default interaction bounds for non-polygon shapes', () => {
        const bounds = ShapeDrawUtils.computeInteractionBounds({ shapeType: 'rect', strokeWidth: 2 }, 10, 20, 80, 24)
        assert.deepEqual(bounds, { x: 10, y: 20, width: 80, height: 24 })
    })

    it('uses actual rendered polygon bounds for interaction', () => {
        const x = 10
        const y = 20
        const width = 180
        const height = 52
        const bounds = ShapeDrawUtils.computeInteractionBounds({ shapeType: 'polygon', sides: 6, strokeWidth: 2 }, x, y, width, height)
        assert.ok(bounds.width < width)
        assert.ok(bounds.width > 40)
        assert.ok(bounds.width < 70)
        assert.ok(bounds.x > x)
        assert.ok(bounds.y <= y)
        assert.ok(bounds.x + bounds.width < x + width)
    })
})
