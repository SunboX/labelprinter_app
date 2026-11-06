// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { it } from 'node:test'
import { createCanvas } from 'canvas'
import { PreviewRenderer } from '../src/ui/PreviewRenderer.mjs'
import { PreviewGroupResizeSupport } from '../src/ui/PreviewGroupResizeSupport.mjs'

/** Builds a mixed layout with overlapping frames after the text. @param {string} orientation @returns {object} */
function createRenderer(orientation) {
    const horizontal = orientation === 'horizontal'
    const state = {
        media: 'W24',
        resolution: 'LOW',
        orientation,
        items: [
            { id: 'text', type: 'text', text: 'New text', fontSize: 16 },
            {
                id: 'frame',
                type: 'shape',
                shapeType: 'rect',
                width: horizontal ? 240 : 100,
                height: horizontal ? 100 : 240,
                xOffset: horizontal ? -60 : 0,
                yOffset: horizontal ? 0 : -12
            },
            { id: 'square', type: 'shape', shapeType: 'rect', width: 40, height: 40 }
        ]
    }
    const renderer = new PreviewRenderer(
        {},
        state,
        () => {},
        (key) => key
    )
    renderer._debugLog = () => {}
    renderer._drawOverlay = () => {}
    renderer._queueRender = () => {}
    renderer._dotsPerPxX = renderer._dotsPerPxY = 1
    return renderer
}

/** Installs the same interactive bounds used by the browser. @param {object} renderer @returns {Promise<object>} */
async function capture(renderer) {
    const result = await renderer.buildCanvasFromState()
    renderer._interactiveItems = result.layoutItems
    renderer._interactiveItemsById = new Map(result.layoutItems.map((entry) => [entry.id, entry]))
    result.layoutItems.forEach((entry) => {
        entry.item._layoutBounds = { ...entry.bounds }
    })
    return result
}

for (const orientation of ['horizontal', 'vertical']) {
    for (const operation of ['drag', 'resize', 'group-resize', 'align']) {
        it(`preserves later rectangles when ${operation} takes text out of ${orientation} flow`, async () => {
            const original = globalThis.document
            globalThis.document = { createElement: () => createCanvas(1, 1) }
            try {
                const renderer = createRenderer(orientation)
                const before = await capture(renderer)
                const text = renderer._interactiveItemsById.get('text')
                renderer._getEntryFromEvent = () => text
                renderer._selectedItemIds = new Set(operation === 'group-resize' ? ['text', 'frame'] : ['text'])
                if (operation === 'drag') {
                    renderer._handleInteractDragStart({})
                    renderer._handleInteractDragMove({ dx: 5, dy: 5 })
                } else if (operation === 'resize') {
                    renderer._handleInteractResizeStart({ edges: { right: true, bottom: true }, rect: text.bounds })
                } else if (operation === 'group-resize') {
                    PreviewGroupResizeSupport.start(renderer, { rect: { width: 300, height: 100 }, edges: { right: true } })
                } else {
                    renderer.els.preview = before.preview
                    renderer.alignSelectedItems('left', 'label')
                }
                const after = await capture(renderer)
                for (const id of ['frame', 'square']) {
                    const first = before.layoutItems.find((entry) => entry.id === id).bounds
                    const placed = after.layoutItems.find((entry) => entry.id === id).bounds
                    assert.deepEqual(placed, first, `${id} moved when text left flow`)
                    assert.ok(placed.x >= 0 && placed.y >= 0, `${id} moved before label origin`)
                    assert.ok(placed.x + placed.width <= after.width, `${id} clipped at label right`)
                    assert.ok(placed.y + placed.height <= after.height, `${id} clipped at label bottom`)
                }
                const feedLength = orientation === 'horizontal' ? 'width' : 'height'
                assert.ok(after[feedLength] >= before[feedLength], 'stationary rectangles must keep the label long enough')
            } finally {
                globalThis.document = original
            }
        })
    }
}
