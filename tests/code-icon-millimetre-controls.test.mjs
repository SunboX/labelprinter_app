// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { it } from 'node:test'
import { runInNewContext } from 'node:vm'
import { Media, Resolution } from 'labelprinterkit-web/src/index.mjs'
import { ItemsEditorBarcodeSupport } from '../src/ui/ItemsEditorBarcodeSupport.mjs'
import { ItemsEditorIconSupport } from '../src/ui/ItemsEditorIconSupport.mjs'
import { ItemsEditorGeometrySupport } from '../src/ui/ItemsEditorGeometrySupport.mjs'
import { ItemsEditorControlSupport } from '../src/ui/ItemsEditorControlSupport.mjs'
import { QrSizeUtils } from '../src/QrSizeUtils.mjs'

/** Minimal DOM for exercising public sizing inputs and buttons. */
class Element {
    children = []
    listeners = {}
    attributes = {}
    value = ''
    /** Records accessible labels. */
    setAttribute(key, value) {
        this.attributes[key] = value
    }
    /** Records control events. */
    addEventListener(type, callback) {
        this.listeners[type] = callback
    }
    /** Appends child controls. */
    append(...children) {
        this.children.push(...children)
    }
    /** Appends a select option. */
    appendChild(child) {
        this.append(child)
    }
}

it('edits barcode and icon lengths/heights in mm with 0.1 mm steps and synchronized limits', () => {
    const original = globalThis.document
    globalThis.document = { createElement: () => new Element(), createElementNS: () => new Element() }
    try {
        for (const resolution of ['LOW', 'HIGH']) {
            for (const orientation of ['horizontal', 'vertical']) {
                for (const type of ['barcode', 'icon']) {
                    const item = { type, width: 40, height: 40 }
                    const state = { resolution, orientation, media: 'W24' }
                    const controls = new Element()
                    let changes = 0
                    const options = {
                        item,
                        state,
                        controls,
                        translate: (key) => key,
                        onChange: () => changes++,
                        createSlider: ItemsEditorControlSupport.createSlider
                    }
                    const append =
                        type === 'barcode' ? ItemsEditorBarcodeSupport.appendBarcodeControls : ItemsEditorIconSupport.appendIconControls
                    append(options)
                    assert.equal(item.width, 40)
                    assert.equal(item.height, 40)
                    for (const [axis, key, label] of [
                        [0, 'width', 'sizeLength'],
                        [1, 'height', 'sizeHeight']
                    ]) {
                        const field = controls.children[axis]
                        const [minus, input, plus] = field.children[1].children
                        const range = field.children[2]
                        assert.equal(field.children[0].textContent, `itemsEditor.${label} (mm)`)
                        assert.equal(input.step, '0.1')
                        assert.equal(range.step, '0.1')
                        const dotsPerMm = Resolution[resolution].dots[axis] / 25.4
                        input.value = '3.5'
                        input.listeners.input()
                        assert.ok(Math.abs(item[key] - 3.5 * dotsPerMm) < 0.000001)
                        plus.listeners.click()
                        assert.equal(input.value, '3.6')
                        assert.ok(Math.abs(item[key] - 3.6 * dotsPerMm) < 0.000001)
                        minus.listeners.click()
                        assert.equal(input.value, '3.5')
                        range.value = '4.1'
                        range.listeners.input()
                        assert.equal(input.value, '4.1')
                        const saved = item[key]
                        input.value = ''
                        input.listeners.input()
                        assert.equal(item[key], saved)
                        input.listeners.change()
                        assert.equal(input.value, '4.1')
                        input.value = '4.'
                        input.listeners.input()
                        assert.equal(input.value, '4.', 'typing retains a pending decimal separator')
                        input.value = '4.1'
                        input.listeners.input()
                    }
                    const saved = { width: item.width, height: item.height }
                    append({ ...options, controls: new Element() })
                    assert.equal(item.width, saved.width, 'reopening keeps fractional dots')
                    assert.equal(item.height, saved.height)
                    const crossAxis = orientation === 'horizontal' ? 1 : 0
                    const key = crossAxis === 0 ? 'width' : 'height'
                    const otherKey = crossAxis === 0 ? 'height' : 'width'
                    const beforeOther = item[otherKey]
                    const field = controls.children[crossAxis]
                    const [, input, plus] = field.children[1].children
                    input.value = '10000'
                    input.listeners.input()
                    input.listeners.change()
                    assert.ok(item[key] <= Media.W24.printArea - 4 + 0.000001)
                    assert.ok(Math.abs(item[otherKey] - beforeOther) < 0.000001, 'the other dimension stays unchanged at the tape limit')
                    assert.equal(plus.disabled, true)
                    assert.equal(Number(input.value), Math.round((item[key] / (Resolution[resolution].dots[crossAxis] / 25.4)) * 100) / 100)
                    assert.ok(changes >= 9)
                }
            }
        }
    } finally {
        globalThis.document = original
    }
})

it('keeps one QR size in mm, preserves 0.1 mm edits, and clamps to tape and fixed-length limits', () => {
    const original = globalThis.document
    globalThis.document = { createElement: () => new Element(), createElementNS: () => new Element() }
    try {
        for (const resolution of ['LOW', 'HIGH']) {
            for (const orientation of ['horizontal', 'vertical']) {
                for (const mediaLengthMm of [null, 5]) {
                    const state = { resolution, orientation, media: 'W24', mediaLengthMm }
                    const item = { type: 'qr', size: 20, height: 20, _qrCache: {} }
                    const controls = new Element()
                    const options = {
                        state,
                        item,
                        controls,
                        translate: (key) => key,
                        onChange: () => {},
                        createSlider: ItemsEditorControlSupport.createSlider
                    }
                    ItemsEditorGeometrySupport.appendQrControls(options)
                    const field = controls.children[3]
                    const [minus, input, plus] = field.children[1].children
                    assert.equal(field.children[0].textContent, 'itemsEditor.sliderQrSize (mm)')
                    assert.equal(input.step, '0.1')
                    input.value = '2.5'
                    input.listeners.input()
                    plus.listeners.click()
                    assert.equal(input.value, '2.6')
                    assert.ok(Math.abs(item.size - (2.6 * 180) / 25.4) < 0.000001)
                    assert.equal(item.height, item.size)
                    assert.equal(item._qrCache, null)
                    minus.listeners.click()
                    const saved = item.size
                    ItemsEditorGeometrySupport.appendQrControls({ ...options, controls: new Element() })
                    assert.equal(item.size, saved, 'opening settings preserves fractional QR geometry')
                    input.value = '999'
                    input.listeners.input()
                    input.listeners.change()
                    assert.equal(item.size, QrSizeUtils.computeMaxQrSizeDots(state))
                    assert.equal(item.height, item.size)
                    assert.equal(plus.disabled, true)
                }
            }
        }
    } finally {
        globalThis.document = original
    }
})

it('keeps fractional QR geometry consistent between preview and batch-print worker', () => {
    const source = readFileSync('src/workers/PrintPageWorker.mjs', 'utf8')
    const workerClamp = runInNewContext(`${source}\nclampQrSizeToLabel`, {})
    for (const resolution of ['LOW', 'HIGH']) {
        for (const mediaLengthMm of [null, 5]) {
            const state = { resolution, media: 'W24', mediaLengthMm }
            for (const size of [(2.5 * 180) / 25.4, (2.6 * 180) / 25.4, 999]) {
                assert.equal(
                    workerClamp({ ...state, resolution: Resolution[resolution], media: Media.W24 }, size),
                    QrSizeUtils.clampQrSizeToLabel(state, size)
                )
            }
        }
    }
})
