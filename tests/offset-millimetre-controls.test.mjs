// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { it } from 'node:test'
import { Resolution } from 'labelprinterkit-web/src/index.mjs'
import { ItemsEditorControlSupport } from '../src/ui/ItemsEditorControlSupport.mjs'
import { AppRuntimeConfig } from '../src/AppRuntimeConfig.mjs'
import { ProjectIoUtils } from '../src/ProjectIoUtils.mjs'

/** Minimal DOM for exercising the offset controls through their public events. */
class Element {
    children = []
    listeners = {}
    attributes = {}
    value = ''
    /** Records accessibility attributes. */
    setAttribute(key, value) {
        this.attributes[key] = value
    }
    /** Records the public event handlers. */
    addEventListener(type, callback) {
        this.listeners[type] = callback
    }
    /** Appends child elements in order. */
    append(...children) {
        this.children.push(...children)
    }
}

it('edits signed X/Y millimetres in 0.1 mm steps at both resolutions for every object type', () => {
    const original = globalThis.document
    globalThis.document = { createElement: () => new Element(), createElementNS: () => new Element() }
    try {
        for (const resolution of ['LOW', 'HIGH']) {
            for (const orientation of ['horizontal', 'vertical']) {
                for (const type of ['text', 'qr', 'barcode', 'image', 'icon', 'shape']) {
                    const state = { resolution, orientation }
                    const item = { type, xOffset: 4, yOffset: -3, rotation: 90 }
                    let changes = 0
                    const options = {
                        item,
                        state,
                        translate: (key) => key,
                        onChange: () => changes++,
                        createSlider: ItemsEditorControlSupport.createSlider
                    }
                    const { offsetCtrl, yOffsetCtrl, rotationCtrl } = ItemsEditorControlSupport.createOffsetAndRotationControls(options)
                    assert.equal(item.xOffset, 4, 'opening settings preserves existing dot offsets')
                    assert.equal(item.yOffset, -3)
                    assert.equal(changes, 0)
                    assert.equal(rotationCtrl.children[1].value, 90)
                    for (const [axis, field, key, label] of [
                        [0, offsetCtrl, 'xOffset', 'sliderXOffset'],
                        [1, yOffsetCtrl, 'yOffset', 'sliderYOffset']
                    ]) {
                        const dotsPerMm = Resolution[resolution].dots[axis] / 25.4
                        const [minus, input, plus] = field.children[1].children
                        const range = field.children[2]
                        assert.equal(field.children[0].textContent, `itemsEditor.${label} (mm)`)
                        assert.equal(input.attributes['aria-label'], `itemsEditor.${label} (mm)`)
                        assert.equal(input.step, '0.1')
                        assert.equal(range.step, '0.1')
                        assert.ok(Number(range.min) < 0)
                        for (const mm of [0, -0.1, 0.1, -2.3, 2.3, 125.6, -125.6]) {
                            input.value = String(mm)
                            input.listeners.input()
                            assert.ok(Math.abs(item[key] - mm * dotsPerMm) < 0.000001)
                            plus.listeners.click()
                            assert.equal(Number(input.value), Math.round((mm + 0.1) * 10) / 10)
                            assert.ok(Math.abs(item[key] - (mm + 0.1) * dotsPerMm) < 0.000001)
                            minus.listeners.click()
                            assert.equal(Number(input.value), mm)
                            range.value = String(mm)
                            range.listeners.input()
                            assert.ok(Math.abs(item[key] - mm * dotsPerMm) < 0.000001)
                            for (const invalid of ['', '-', 'NaN', 'Infinity']) {
                                input.value = invalid
                                input.listeners.input()
                                assert.ok(Math.abs(item[key] - mm * dotsPerMm) < 0.000001)
                            }
                            input.listeners.change()
                            assert.equal(Number(input.value), mm)
                        }
                    }
                    const saved = { ...item }
                    ItemsEditorControlSupport.createOffsetAndRotationControls(options)
                    assert.deepEqual(item, saved, 'reopening settings does not round persisted offsets')
                    const defaults = AppRuntimeConfig.createDefaultState(() => 'default')
                    const payload = ProjectIoUtils.buildProjectPayload({ ...defaults, ...state, items: [item] })
                    const restored = ProjectIoUtils.normalizeProjectState(payload, defaults).state.items[0]
                    assert.equal(restored.xOffset, saved.xOffset, 'save/load preserves decimal dot offsets')
                    assert.equal(restored.yOffset, saved.yOffset)
                    assert.ok(changes > 0)
                }
            }
        }
    } finally {
        globalThis.document = original
    }
})

it('starts missing offsets at zero and allows stepping through zero in both directions', () => {
    const original = globalThis.document
    globalThis.document = { createElement: () => new Element(), createElementNS: () => new Element() }
    try {
        const item = {}
        const { offsetCtrl, yOffsetCtrl, rotationCtrl } = ItemsEditorControlSupport.createOffsetAndRotationControls({
            item,
            state: {},
            translate: (key) => key,
            onChange: () => {},
            includeRotation: false
        })
        assert.equal(rotationCtrl, null)
        for (const field of [offsetCtrl, yOffsetCtrl]) {
            const [minus, input, plus] = field.children[1].children
            assert.equal(input.value, '0')
            assert.equal(minus.disabled, false)
            minus.listeners.click()
            assert.equal(input.value, '-0.1')
            plus.listeners.click()
            assert.equal(input.value, '0')
            plus.listeners.click()
            assert.equal(input.value, '0.1')
        }
    } finally {
        globalThis.document = original
    }
})
