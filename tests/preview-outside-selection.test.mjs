// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { it } from 'node:test'
import { PreviewRenderer } from '../src/ui/PreviewRenderer.mjs'

/** Creates a renderer with a multi-selection and observable notifications. @returns {object} */
function fixture() {
    const renderer = new PreviewRenderer(
        {},
        { items: [] },
        () => {},
        (key) => key
    )
    const notifications = []
    renderer._selectedItemIds = new Set(['text', 'frame'])
    renderer._activeItemId = 'text'
    renderer._hoverItemId = 'frame'
    renderer.onSelectionChange = (ids) => notifications.push(ids)
    renderer._drawOverlay = () => {}
    return { renderer, notifications }
}

it('clears multi-selection and hover/active handles on the preview background or rulers', () => {
    for (const ctrlKey of [false, true]) {
        const { renderer, notifications } = fixture()
        renderer._handleLayerPointerDown({ target: {}, button: 0, ctrlKey })
        assert.deepEqual(renderer.getSelectedItemIds(), [])
        assert.equal(renderer._activeItemId, null)
        assert.equal(renderer._hoverItemId, null)
        assert.deepEqual(notifications, [[]])
        renderer._handleLayerPointerDown({ target: {}, button: 0 })
        assert.equal(notifications.length, 1, 'empty selection does not emit duplicate updates')
    }
})

it('preserves object and group handle interaction, inline editing, and active drags', () => {
    const { renderer, notifications } = fixture()
    renderer._inlineTextEditor = {}
    renderer._commitInlineTextEdit = () => assert.fail('editing must stay open on its own input')
    for (const selector of ['.preview-hitbox', '.preview-group-hitbox', '.preview-inline-text-editor']) {
        const target = { closest: (selectors) => (selectors.includes(selector) ? target : null) }
        renderer._handleLayerPointerDown({ target, button: 0 })
    }
    renderer._interaction = { type: 'drag' }
    renderer._handleLayerPointerDown({ target: {}, button: 0 })
    renderer._interaction = null
    renderer._handleLayerPointerDown({ target: {}, button: 2 })
    assert.deepEqual(renderer.getSelectedItemIds(), ['text', 'frame'])
    assert.equal(notifications.length, 0)
})

it('applies inline text edits before clearing selection outside the label', () => {
    const { renderer } = fixture()
    renderer._inlineTextEditor = {}
    let committed = false
    renderer._commitInlineTextEdit = (options) => {
        assert.equal(options.applyChanges, true)
        committed = true
        renderer._inlineTextEditor = null
    }
    renderer._handleLayerPointerDown({ target: {}, button: 0 })
    assert.equal(committed, true)
    assert.deepEqual(renderer.getSelectedItemIds(), [])
})

it('binds background deselection once on the preview stage and leaves tool controls outside its scope', () => {
    const original = globalThis.document
    const stage = { listeners: [], addEventListener: (...args) => stage.listeners.push(args) }
    const wrap = { closest: () => stage, appendChild: () => {} }
    const layer = { style: {}, addEventListener: () => {} }
    globalThis.document = { createElement: () => layer }
    try {
        const { renderer } = fixture()
        renderer.els.canvasWrap = wrap
        renderer._ensureInteractionLayer()
        renderer._ensureInteractionLayer()
        assert.equal(stage.listeners.length, 1)
        assert.equal(stage.listeners[0][0], 'pointerdown')
        assert.equal(stage.listeners[0][1], renderer._handleLayerPointerDown)
    } finally {
        globalThis.document = original
    }
})
