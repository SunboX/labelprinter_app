// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { it } from 'node:test'
import { Resolution } from 'labelprinterkit-web/src/index.mjs'
import { AppRuntimeConfig } from '../src/AppRuntimeConfig.mjs'
import { ItemsEditorGeometrySupport } from '../src/ui/ItemsEditorGeometrySupport.mjs'
import { ItemsEditorControlSupport } from '../src/ui/ItemsEditorControlSupport.mjs'

/** Minimal DOM supporting public control events and polygon slider queries. */
class Element {
    children = []
    listeners = {}
    attributes = {}
    value = ''
    /** Records accessibility attributes. */
    setAttribute(key, value) {
        this.attributes[key] = value
    }
    /** Records an event callback. */
    addEventListener(key, callback) {
        this.listeners[key] = callback
    }
    /** Appends elements. */
    append(...children) {
        this.children.push(...children)
    }
    /** Finds slider controls used by the polygon settings. */
    querySelector(selector) {
        return this.children.find((child) => (selector === '.small' ? child.className === 'small' : child.type === 'range'))
    }
}

it('edits millimetres and steps line thickness by 0.1 mm for every shape at both resolutions', () => {
    const original = globalThis.document
    globalThis.document = { createElement: () => new Element(), createElementNS: () => new Element() }
    try {
        for (const resolution of ['LOW', 'HIGH']) {
            for (const orientation of ['horizontal', 'vertical']) {
                for (const { id: shapeType } of AppRuntimeConfig.createShapeTypes()) {
                    const item = { shapeType, width: 120, height: 40, strokeWidth: 2, cornerRadius: 0 }
                    const controls = new Element()
                    let changes = 0
                    ItemsEditorGeometrySupport.appendShapeControls({
                        item,
                        controls,
                        state: { resolution, orientation },
                        translate: (key) => key,
                        onChange: () => changes++,
                        createSlider: ItemsEditorControlSupport.createSlider
                    })
                    assert.equal(item.width, 120, 'opening settings preserves existing geometry')
                    assert.equal(controls.className, 'controls shape-controls')
                    assert.equal(item.height, 40)
                    assert.equal(item.strokeWidth, 2)
                    assert.equal(item.cornerRadius, 0)
                    for (const [index, key, label, mm, axis] of [
                        [0, 'width', 'sizeLength', 42.5, 0],
                        [1, 'height', 'sizeHeight', 7.5, 1],
                        [2, 'strokeWidth', 'sliderStroke', 0.3, 1]
                    ]) {
                        const field = controls.children[index]
                        assert.equal(field.children[0].textContent, `itemsEditor.${label} (mm)`)
                        const [minus, input, plus] = field.children[1].children
                        const range = field.children[2]
                        assert.equal(input.step, '0.1')
                        assert.equal(range.step, '0.1')
                        const dotsPerMm = Resolution[resolution].dots[axis] / 25.4
                        input.value = String(mm)
                        input.listeners.input()
                        assert.ok(Math.abs(item[key] - mm * dotsPerMm) < 0.000001)
                        plus.listeners.click()
                        assert.equal(Number(input.value), mm + 0.1)
                        assert.ok(Math.abs(item[key] - (mm + 0.1) * dotsPerMm) < 0.000001)
                        minus.listeners.click()
                        assert.equal(Number(input.value), mm)
                        range.value = '0.1'
                        range.listeners.input()
                        assert.ok(Math.abs(item[key] - 0.1 * dotsPerMm) < 0.000001)
                        assert.equal(minus.disabled, true)
                        for (const invalid of ['', '-', '-1', '0']) {
                            input.value = invalid
                            input.listeners.input()
                            assert.ok(Math.abs(item[key] - 0.1 * dotsPerMm) < 0.000001)
                        }
                        input.listeners.change()
                        assert.equal(input.value, '0.1')
                    }
                    if (shapeType === 'roundRect') {
                        const input = controls.children[6].children[1].children[1]
                        assert.equal(input.value, '0')
                        input.value = '1.5'
                        input.listeners.input()
                        assert.ok(Math.abs(item.cornerRadius - (1.5 * 180) / 25.4) < 0.000001)
                    }
                    assert.ok(changes >= 12)
                }
            }
        }
    } finally {
        globalThis.document = original
    }
})
