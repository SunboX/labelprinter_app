// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { it } from 'node:test'
import { ItemsEditorImageDimensions } from '../src/ui/ItemsEditorImageDimensions.mjs'
import { ImageDimensionUtils } from '../src/ImageDimensionUtils.mjs'
import { PreviewRenderer } from '../src/ui/PreviewRenderer.mjs'

/** Minimal DOM element supporting the dimension controls' public events. */
class Element {
    children = []
    listeners = {}
    attributes = {}
    value = ''
    /** Records a DOM attribute. */
    setAttribute(key, value) {
        this.attributes[key] = value
    }
    /** Records an event listener. */
    addEventListener(key, callback) {
        this.listeners[key] = callback
    }
    /** Appends child elements in order. */
    append(...children) {
        this.children.push(...children)
    }
}

it('edits decimal millimetres on displayed axes and steps by 0.1 mm after rotation', () => {
    const original = globalThis.document
    globalThis.document = { createElement: () => new Element(), createElementNS: () => new Element() }
    try {
        for (const rotation of [0, 90, -90, 180]) {
            const item = { width: 80, height: 80, rotation }
            const state = { media: 'W24', resolution: 'HIGH', orientation: 'horizontal' }
            let changes = 0
            const { widthCtrl, heightCtrl, sync } = ItemsEditorImageDimensions.create({
                item,
                state,
                translate: (key) => key,
                onChange: () => changes++
            })
            const [minus, input, plus] = widthCtrl.children[1].children
            assert.equal(minus.children[0].attributes['aria-hidden'], 'true')
            assert.equal(minus.children[0].children[0].attributes.d, 'M5 12h14')
            assert.equal(plus.children[0].children[0].attributes.d, 'M5 12h14M12 5v14')
            input.value = '42.5'
            input.listeners.input()
            const key = ImageDimensionUtils.swapsAxes(rotation) ? 'height' : 'width'
            assert.ok(Math.abs(item[key] - (42.5 * 180) / 25.4) < 0.00001)
            plus.listeners.click()
            assert.equal(input.value, '42.6')
            minus.listeners.click()
            assert.equal(input.value, '42.5')
            input.value = ''
            input.listeners.input()
            assert.ok(item[key] > 0)
            input.listeners.change()
            assert.equal(input.value, '42.5')
            input.value = '500.5'
            input.listeners.input()
            assert.ok(Math.abs(item[key] - (500.5 * 180) / 25.4) < 0.00001, 'typing has no slider maximum')
            const heightInput = heightCtrl.children[1].children[1]
            heightInput.value = '8.5'
            heightInput.listeners.input()
            const crossKey = key === 'width' ? 'height' : 'width'
            assert.ok(Math.abs(item[crossKey] - (8.5 * 320) / 25.4) < 0.00001)
            const crossBefore = item[crossKey]
            sync()
            plus.listeners.click()
            assert.equal(item[crossKey], crossBefore, 'length changes preserve the other dimension')
            assert.ok(changes >= 5)
        }
    } finally {
        globalThis.document = original
    }
})

it('does not progressively shrink stored dimensions while rotating through intermediate angles', () => {
    const original = globalThis.document
    globalThis.document = { createElement: () => new Element(), createElementNS: () => new Element() }
    try {
        const item = { width: 120, height: 400, rotation: -90 }
        const state = { media: 'W24', resolution: 'LOW', orientation: 'horizontal' }
        const { sync } = ItemsEditorImageDimensions.create({ item, state, translate: (key) => key, onChange: () => {} })
        for (let angle = -90; angle <= 90; angle++) {
            item.rotation = angle
            sync()
        }
        assert.equal(item.width, 120)
        assert.equal(item.height, 400)
    } finally {
        globalThis.document = original
    }
})

it('maps preview resize dimensions back into a rotated image', () => {
    const state = { media: 'W24', orientation: 'horizontal' }
    const renderer = new PreviewRenderer(
        {},
        state,
        () => {},
        (key) => key
    )
    const item = { type: 'image', width: 80, height: 120, rotation: -90 }
    renderer._resizeConstrainedImageLikeItem(item, { rect: { width: 400, height: 80 } }, 8)
    assert.equal(item.width, 80)
    assert.equal(item.height, 400)
})
