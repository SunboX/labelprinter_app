// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createCanvas } from 'canvas'
import { ItemsEditorImageSupport } from '../src/ui/ItemsEditorImageSupport.mjs'
import { PreviewRenderer } from '../src/ui/PreviewRenderer.mjs'

/** Returns label state with a long image rotated along the feed axis. */
function imageState(orientation = 'horizontal', rotation = -90) {
    return {
        media: 'W24',
        resolution: 'LOW',
        orientation,
        items: [{ id: 'image-1', type: 'image', width: 80, height: 400, rotation, xOffset: 4, yOffset: 0 }]
    }
}

describe('rotated image dimensions', () => {
    it('lets the local height grow along a horizontal label after a quarter turn', () => {
        const state = imageState()
        assert.deepEqual(ItemsEditorImageSupport.constrainImageDimensionsForOrientation(80, 400, state, -90), {
            width: 80,
            height: 400
        })
    })
    it('limits the rotated cross axis instead of the original height', () => {
        const state = imageState()
        assert.deepEqual(ItemsEditorImageSupport.constrainImageDimensionsForOrientation(248, 800, state, 90), {
            width: 124,
            height: 400
        })
    })
    it('keeps a long rotated image inside the preview and print canvas', async () => {
        const originalDocument = globalThis.document
        globalThis.document = { createElement: () => createCanvas(1, 1) }
        try {
            for (const [orientation, rotation] of [
                ['horizontal', -90],
                ['horizontal', 90],
                ['horizontal', 180],
                ['vertical', 90]
            ]) {
                const state = imageState(orientation, rotation)
                if (rotation === 180 || orientation === 'vertical') {
                    state.items[0].width = 400
                    state.items[0].height = 80
                }
                const renderer = new PreviewRenderer(
                    {},
                    state,
                    () => {},
                    (key) => key
                )
                const result = await renderer.buildCanvasFromState()
                const bounds = result.layoutItems[0].bounds
                const feedSize = orientation === 'horizontal' ? bounds.width : bounds.height
                assert.ok(Math.abs(feedSize - 400) < 1, `${orientation}/${rotation}: ${feedSize}`)
                assert.ok(bounds.x >= -0.01 && bounds.y >= -0.01, JSON.stringify(bounds))
                assert.ok(bounds.x + bounds.width <= result.width + 0.01)
                assert.ok(bounds.y + bounds.height <= result.height + 0.01)
            }
        } finally {
            globalThis.document = originalDocument
        }
    })
})
