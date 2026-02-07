import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ZoomUtils } from '../src/ZoomUtils.mjs'

describe('zoom-utils', () => {
    it('clampZoom keeps values within range', () => {
        assert.equal(ZoomUtils.clampZoom(0.1), 0.5)
        assert.equal(ZoomUtils.clampZoom(1.25), 1.25)
        assert.equal(ZoomUtils.clampZoom(8), 2.5)
    })

    it('stepZoom increments and decrements in fixed steps', () => {
        assert.equal(ZoomUtils.stepZoom(1, 1), 1.1)
        assert.equal(ZoomUtils.stepZoom(1, -1), 0.9)
    })

    it('formatZoomLabel outputs rounded percentages', () => {
        assert.equal(ZoomUtils.formatZoomLabel(1), '100%')
        assert.equal(ZoomUtils.formatZoomLabel(1.236), '124%')
    })
})
