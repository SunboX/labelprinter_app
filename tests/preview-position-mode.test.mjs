import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PreviewRendererCanvasBuild } from '../src/ui/PreviewRendererCanvasBuild.mjs'
import { PreviewPositionModeUtils } from '../src/ui/PreviewPositionModeUtils.mjs'

/**
 * Creates a shape block fixture for feed-axis end computation tests.
 * @param {{
 *  id: string,
 *  positionMode?: 'flow' | 'absolute',
 *  xOffset?: number,
 *  yOffset?: number,
 *  width: number,
 *  height: number,
 *  span: number
 * }} options
 * @returns {{ ref: Record<string, any>, span: number, shapeWidth: number, shapeHeight: number }}
 */
function createShapeBlock({ id, positionMode = 'flow', xOffset = 0, yOffset = 0, width, height, span }) {
    return {
        ref: {
            id,
            type: 'shape',
            positionMode,
            xOffset,
            yOffset,
            width,
            height,
            rotation: 0
        },
        span,
        shapeWidth: width,
        shapeHeight: height
    }
}

describe('preview-position-mode', () => {
    it('resolves horizontal absolute feed-axis starts without flow cursor accumulation', () => {
        const start = PreviewPositionModeUtils.resolveFeedAxisStart({
            item: { type: 'text', positionMode: 'absolute', xOffset: 4 },
            flowCursor: 120,
            feedPadStart: 2,
            isHorizontal: true,
            span: 40,
            drawSpan: 30,
            feedOffset: 4
        })
        assert.equal(start, 6)
    })

    it('resolves vertical absolute feed-axis starts without flow cursor accumulation', () => {
        const start = PreviewPositionModeUtils.resolveFeedAxisStart({
            item: { type: 'shape', positionMode: 'absolute', yOffset: 8 },
            flowCursor: 90,
            feedPadStart: 2,
            isHorizontal: false,
            span: 20,
            drawSpan: 10,
            feedOffset: 8,
            centerInFlowSpan: true
        })
        assert.equal(start, 10)
    })

    it('advances flow cursor for flow-positioned items', () => {
        const nextCursor = PreviewPositionModeUtils.resolveNextFlowCursor({
            item: { type: 'shape', positionMode: 'flow' },
            flowCursor: 6,
            span: 14
        })
        assert.equal(nextCursor, 20)
    })

    it('does not advance flow cursor for absolute-positioned items', () => {
        const nextCursor = PreviewPositionModeUtils.resolveNextFlowCursor({
            item: { type: 'shape', positionMode: 'absolute' },
            flowCursor: 6,
            span: 14
        })
        assert.equal(nextCursor, 6)
    })

    it('computes horizontal mixed-mode feed-axis end with absolute items excluded from cursor advancement', () => {
        const blocks = [
            createShapeBlock({ id: 'flow-1', positionMode: 'flow', width: 20, height: 10, span: 20 }),
            createShapeBlock({ id: 'abs-1', positionMode: 'absolute', xOffset: 5, width: 10, height: 10, span: 10 }),
            createShapeBlock({ id: 'flow-2', positionMode: 'flow', width: 8, height: 10, span: 8 })
        ]
        const end = PreviewRendererCanvasBuild.prototype._computeMaxFlowAxisEnd.call({}, blocks, true, 2)
        assert.equal(end, 30)
    })

    it('computes vertical mixed-mode feed-axis end with absolute items excluded from cursor advancement', () => {
        const blocks = [
            createShapeBlock({ id: 'flow-1', positionMode: 'flow', width: 12, height: 18, span: 18 }),
            createShapeBlock({ id: 'abs-1', positionMode: 'absolute', yOffset: 4, width: 12, height: 10, span: 10 }),
            createShapeBlock({ id: 'flow-2', positionMode: 'flow', width: 12, height: 6, span: 6 })
        ]
        const end = PreviewRendererCanvasBuild.prototype._computeMaxFlowAxisEnd.call({}, blocks, false, 2)
        assert.equal(end, 26)
    })
})
