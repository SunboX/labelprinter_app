// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { it } from 'node:test'
import { ItemsEditorTextSupport } from '../src/ui/ItemsEditorTextSupport.mjs'
import { ItemsEditorSelectionSupport } from '../src/ui/ItemsEditorSelectionSupport.mjs'
import { PreviewRenderer } from '../src/ui/PreviewRenderer.mjs'
import { ProjectIoUtils } from '../src/ProjectIoUtils.mjs'
import { AppRuntimeConfig } from '../src/AppRuntimeConfig.mjs'

/** Small DOM model for font inputs and panel card selection. */
class Element {
    children = []
    listeners = {}
    attributes = {}
    value = ''
    style = {}
    dataset = {}
    selected = false
    classList = { toggle: (_name, selected) => (this.selected = selected) }
    /** Records attributes. */
    setAttribute(key, value) {
        this.attributes[key] = value
    }
    /** Records public events. */
    addEventListener(type, callback) {
        this.listeners[type] = callback
    }
    /** Appends children. */
    append(...children) {
        this.children.push(...children)
    }
}

it('edits nominal font size in 0.1 mm steps without changing existing project units', () => {
    const original = globalThis.document
    globalThis.document = { createElement: () => new Element(), createElementNS: () => new Element() }
    try {
        for (const resolution of ['LOW', 'HIGH']) {
            for (const media of ['W9', 'W24']) {
                for (const orientation of ['horizontal', 'vertical']) {
                    const item = { id: 'text', type: 'text', text: 'Sample', fontSize: 24 }
                    const state = { resolution, media, orientation }
                    const options = { item, state, translate: (key) => key, onChange: () => {} }
                    const field = ItemsEditorTextSupport.createFontSizeControl(options)
                    const [minus, input, plus] = field.children[1].children
                    assert.equal(field.children[0].textContent, 'itemsEditor.sliderFontSize (mm)')
                    assert.equal(input.value, '6.35')
                    assert.equal(item.fontSize, 24, 'opening settings keeps the old appearance')
                    assert.equal(input.step, '0.1')
                    plus.listeners.click()
                    assert.equal(input.value, '6.45')
                    assert.ok(Math.abs(item.fontSize - (6.45 * 96) / 25.4) < 0.000001)
                    minus.listeners.click()
                    assert.equal(input.value, '6.35')
                    input.value = '5.'
                    input.listeners.input()
                    assert.equal(input.value, '5.')
                    input.value = '5.3'
                    input.listeners.input()
                    const saved = item.fontSize
                    ItemsEditorTextSupport.createFontSizeControl(options)
                    assert.equal(item.fontSize, saved)
                    const defaults = AppRuntimeConfig.createDefaultState(() => 'default')
                    const payload = ProjectIoUtils.buildProjectPayload({ ...defaults, ...state, items: [item] })
                    assert.equal(ProjectIoUtils.normalizeProjectState(payload, defaults).state.items[0].fontSize, saved)
                }
            }
        }
    } finally {
        globalThis.document = original
    }
})

it('selects panel cards and supports modifier/keyboard selection without rebuilding controls', () => {
    const a = new Element()
    const b = new Element()
    a.dataset.itemId = 'a'
    b.dataset.itemId = 'b'
    const root = new Element()
    root.contains = (card) => [a, b].includes(card)
    root.querySelectorAll = () => [a, b]
    const emitted = []
    const editor = {
        els: { items: root },
        state: { items: [{ id: 'a' }, { id: 'b' }] },
        selectedItemIds: new Set(),
        onSelectionChange: (ids) => emitted.push(ids)
    }
    ItemsEditorSelectionSupport.bind(editor)
    const input = { closest: (selector) => (selector === '.item-card' ? a : null) }
    root.listeners.click({ target: input })
    assert.equal(a.selected, true)
    assert.equal(b.selected, false)
    assert.deepEqual(emitted.at(-1), ['a'])
    root.listeners.click({ target: { closest: (selector) => (selector === '.item-card' ? b : null) }, ctrlKey: true })
    assert.deepEqual(emitted.at(-1), ['a', 'b'])
    b.matches = () => true
    root.listeners.keydown({ target: b, key: 'Enter', preventDefault: () => {} })
    assert.deepEqual(emitted.at(-1), ['b'])
    assert.equal(a.selected, false)
    assert.equal(b.selected, true)
    const before = emitted.length
    root.listeners.click({ target: { closest: () => b } })
    assert.equal(emitted.length, before, 'delete/collapse controls do not change selection')
})

it('gives the selected overlapping object priority for drag and resize without reordering the label', () => {
    const items = ['back', 'middle', 'front'].map((id) => ({
        id,
        type: 'shape',
        shapeType: 'rect',
        width: 80,
        height: 40,
        xOffset: 0,
        yOffset: 0
    }))
    const renderer = new PreviewRenderer(
        {},
        { items },
        () => {},
        (key) => key
    )
    renderer._debugLog = () => {}
    renderer._queueRender = () => {}
    let notifications = 0
    let itemChanges = 0
    renderer.onSelectionChange = () => notifications++
    renderer.onItemChange = () => itemChanges++
    for (const item of items) {
        const entry = { id: item.id, type: 'shape', item, boundsCss: { x: 0, y: 0, width: 80, height: 40 } }
        renderer._interactiveItems.push(entry)
        renderer._interactiveItemsById.set(item.id, entry)
        const element = new Element()
        element.dataset.itemId = item.id
        renderer._interactionElements.set(item.id, element)
    }
    renderer.setSelectedItemIds(['back'], { emitChange: false })
    assert.equal(notifications, 0, 'panel selection avoids a focus-destroying callback loop')
    const back = renderer._interactionElements.get('back')
    assert.ok(Number(back.style.zIndex) > Number(renderer._interactionElements.get('front').style.zIndex))
    const event = { currentTarget: back, edges: { right: true, bottom: true }, rect: { width: 80, height: 40 } }
    renderer._handleInteractDragStart(event)
    renderer._handleInteractDragMove({ ...event, dx: 10, dy: 5 })
    renderer._handleInteractDragEnd(event)
    assert.equal(items[0].xOffset, 10)
    assert.equal(items[1].xOffset, 0)
    assert.equal(items[2].xOffset, 0)
    renderer._handleInteractResizeStart(event)
    renderer._handleInteractResizeMove({ ...event, rect: { width: 100, height: 50 } })
    renderer._handleInteractResizeEnd(event)
    assert.equal(items[0].width, 100)
    assert.equal(items[0].height, 50)
    assert.equal(items[2].width, 80)
    assert.equal(itemChanges, 2, 'panel values refresh after drag and resize')
    assert.deepEqual(
        items.map((item) => item.id),
        ['back', 'middle', 'front']
    )
    renderer.setSelectedItemIds([])
    assert.ok(Number(back.style.zIndex) < Number(renderer._interactionElements.get('front').style.zIndex))
})
