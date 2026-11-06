// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { it } from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCanvas } from 'canvas'
import JsBarcode from 'jsbarcode'
import { BarcodeUtils } from '../src/BarcodeUtils.mjs'
import { AppRuntimeConfig } from '../src/AppRuntimeConfig.mjs'
import { ProjectIoUtils } from '../src/ProjectIoUtils.mjs'
import { ItemsEditorBarcodeSupport } from '../src/ui/ItemsEditorBarcodeSupport.mjs'
import { ItemsEditorControlSupport } from '../src/ui/ItemsEditorControlSupport.mjs'
import { PreviewRendererCanvasSupport } from '../src/ui/PreviewRendererCanvasSupport.mjs'
import { AiItemChangeUtils } from '../src/ui/AiItemChangeUtils.mjs'

/** Minimal DOM exposing public numeric input, range, and button events. */
class Element {
    children = []
    listeners = {}
    attributes = {}
    value = ''
    /** Records accessible labels. */
    setAttribute(key, value) {
        this.attributes[key] = value
    }
    /** Records UI event callbacks. */
    addEventListener(type, callback) {
        this.listeners[type] = callback
    }
    /** Appends child elements. */
    append(...children) {
        this.children.push(...children)
    }
}

it('edits module width and margin in 0.1 mm steps and preserves them through reopen and save/load', () => {
    const original = globalThis.document
    globalThis.document = { createElement: () => new Element(), createElementNS: () => new Element() }
    try {
        for (const resolution of ['LOW', 'HIGH']) {
            for (const orientation of ['horizontal', 'vertical']) {
                const item = { id: 'barcode', type: 'barcode', width: 40, height: 40, barcodeModuleWidth: 2, barcodeMargin: 0 }
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
                ItemsEditorBarcodeSupport.appendBarcodeControls(options)
                assert.equal(item.barcodeModuleWidth, 2)
                assert.equal(item.barcodeMargin, 0)
                const dotsPerMm = 180 / 25.4
                for (const [index, key, label, min, maxDots] of [
                    [5, 'barcodeModuleWidth', 'barcodeModuleWidth', 0.1, 6],
                    [6, 'barcodeMargin', 'barcodeMargin', 0, 30]
                ]) {
                    const field = controls.children[index]
                    const [minus, input, plus] = field.children[1].children
                    const range = field.children[2]
                    assert.equal(field.children[0].textContent, `itemsEditor.${label} (mm)`)
                    assert.equal(input.step, '0.1')
                    assert.equal(range.step, '0.1')
                    input.value = '0.3'
                    input.listeners.input()
                    assert.ok(Math.abs(item[key] - 0.3 * dotsPerMm) < 0.000001)
                    plus.listeners.click()
                    assert.equal(input.value, '0.4')
                    assert.ok(Math.abs(item[key] - 0.4 * dotsPerMm) < 0.000001)
                    minus.listeners.click()
                    assert.equal(input.value, '0.3')
                    range.value = String(min)
                    range.listeners.input()
                    assert.ok(Math.abs(item[key] - min * dotsPerMm) < 0.000001)
                    assert.equal(minus.disabled, true)
                    input.value = '-1'
                    input.listeners.input()
                    input.listeners.change()
                    assert.equal(Number(input.value), min)
                    input.value = '999'
                    input.listeners.input()
                    input.listeners.change()
                    assert.ok(Math.abs(item[key] - maxDots) < 0.000001)
                    assert.equal(plus.disabled, true)
                    input.value = '0.'
                    input.listeners.input()
                    assert.equal(input.value, '0.', 'typing retains a pending decimal separator')
                    input.value = '0.3'
                    input.listeners.input()
                }
                const saved = { ...item }
                ItemsEditorBarcodeSupport.appendBarcodeControls({ ...options, controls: new Element() })
                assert.equal(item.barcodeModuleWidth, saved.barcodeModuleWidth)
                assert.equal(item.barcodeMargin, saved.barcodeMargin)
                const defaults = AppRuntimeConfig.createDefaultState(() => 'default')
                const payload = ProjectIoUtils.buildProjectPayload({ ...defaults, ...state, items: [item] })
                const restored = ProjectIoUtils.normalizeProjectState(payload, defaults).state.items[0]
                assert.equal(restored.barcodeModuleWidth, saved.barcodeModuleWidth)
                assert.equal(restored.barcodeMargin, saved.barcodeMargin)
                assert.ok(changes > 0)
            }
        }
    } finally {
        globalThis.document = original
    }
})

it('preserves fractional barcode options in editor, assistant changes, and both worker paths', () => {
    const workers = ['CodeRasterWorker', 'PrintPageWorker'].map((name) =>
        runInNewContext(`${readFileSync(`src/workers/${name}.mjs`, 'utf8')}\nnormalizeBarcodeOptions`, {})
    )
    for (const barcodeModuleWidth of [(0.1 * 180) / 25.4, (0.3 * 180) / 25.4, 2, 999]) {
        for (const barcodeMargin of [0, (0.1 * 180) / 25.4, (0.3 * 180) / 25.4, 999]) {
            const item = { type: 'barcode', barcodeModuleWidth, barcodeMargin }
            const expected = BarcodeUtils.normalizeItemOptions(item)
            for (const normalize of workers) {
                assert.deepEqual(JSON.parse(JSON.stringify(normalize(item))), expected)
                assert.deepEqual(
                    JSON.parse(JSON.stringify(normalize({ moduleWidth: barcodeModuleWidth, margin: barcodeMargin }))),
                    expected
                )
            }
            AiItemChangeUtils.applyItemChanges({ item, rawChanges: { barcodeModuleWidth, barcodeMargin }, state: {}, shapeTypeIds: [] })
            assert.equal(item.barcodeModuleWidth, expected.barcodeModuleWidth)
            assert.equal(item.barcodeMargin, expected.barcodeMargin)
        }
    }
})

it('renders sub-dot modules and decimal margins identically in preview, raster worker, and print worker', () => {
    const original = globalThis.document
    globalThis.document = { createElement: () => createCanvas(8, 8) }
    try {
        const options = BarcodeUtils.normalizeItemOptions({ barcodeModuleWidth: (0.1 * 180) / 25.4, barcodeMargin: (0.3 * 180) / 25.4 })
        const received = []
        /** Records the actual values delivered to JsBarcode. */
        const runtime = (canvas, value, renderOptions) => {
            received.push({ width: renderOptions.width, margin: renderOptions.margin })
            return JsBarcode(canvas, value, renderOptions)
        }
        const width = 240
        const height = 80
        const source = PreviewRendererCanvasSupport.buildBarcodeCanvas(
            { _requireBarcode: () => runtime },
            '1234567890',
            width,
            height,
            options
        )
        const preview = createCanvas(width, height)
        const context = preview.getContext('2d')
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, width, height)
        context.imageSmoothingEnabled = false
        context.drawImage(source, 0, 0, width, height)
        for (const name of ['CodeRasterWorker', 'PrintPageWorker']) {
            const build = runInNewContext(`${readFileSync(`src/workers/${name}.mjs`, 'utf8')}\nbuildBarcodeCanvas`, {
                JsBarcode: runtime,
                OffscreenCanvas: class {
                    /** Creates a worker-compatible canvas. */ constructor(w, h) {
                        return createCanvas(w, h)
                    }
                }
            })
            const output = build('1234567890', width, height, options)
            assert.deepEqual(output.getContext('2d').getImageData(0, 0, width, height).data, context.getImageData(0, 0, width, height).data)
        }
        assert.equal(received.length, 3)
        for (const actual of received) {
            assert.equal(actual.width, options.barcodeModuleWidth)
            assert.equal(actual.margin, options.barcodeMargin)
        }
    } finally {
        globalThis.document = original
    }
})
