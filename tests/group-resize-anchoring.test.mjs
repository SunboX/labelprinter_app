// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { it } from 'node:test'
import { createCanvas } from 'canvas'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { SelectionTransformUtils } from '../src/ui/SelectionTransformUtils.mjs'
import { ManualLayoutUtils } from '../src/ui/ManualLayoutUtils.mjs'
import { PreviewRenderer } from '../src/ui/PreviewRenderer.mjs'
import { IconRasterUtils } from '../src/IconRasterUtils.mjs'
import { ProjectIoUtils } from '../src/ProjectIoUtils.mjs'
import { AppRuntimeConfig } from '../src/AppRuntimeConfig.mjs'
import { PrintPageWorkerPoolClient } from '../src/ui/PrintPageWorkerPoolClient.mjs'
import { ItemsEditorControlSupport } from '../src/ui/ItemsEditorControlSupport.mjs'

/** Creates an interactive entry with explicit visible bounds. @param {object} item @param {object} bounds @returns {object} */
function entry(item, bounds) {
    return { id: item.id, item, bounds }
}

it('applies a common cross-axis limit in vertical orientation', () => {
    const entries = [10, 60].map((y, index) =>
        entry({ id: String(index), type: 'shape', width: 20, height: 20 }, { x: 10, y, width: 20, height: 20 })
    )
    const snapshot = SelectionTransformUtils.snapshot(entries)
    const scale = SelectionTransformUtils.apply(
        snapshot,
        10,
        { right: true, bottom: true },
        { media: 'W24', resolution: 'HIGH', orientation: 'vertical' }
    )
    assert.equal(scale, 5.9)
    assert.equal(entries[0].item.width, 118)
    assert.equal(entries[1].item.yOffset - entries[0].item.yOffset, 50 * scale)
})

it('edits absolute X/Y from current visible bounds without jumping back to flow offsets', () => {
    const original = globalThis.document
    /** Minimal DOM for the existing millimetre controls. */
    class Element {
        children = []
        listeners = {}
        value = ''
        /** Records SVG/accessibility attributes. */
        setAttribute() {}
        /** Records events. */
        addEventListener(type, callback) {
            this.listeners[type] = callback
        }
        /** Appends children. */
        append(...children) {
            this.children.push(...children)
        }
    }
    globalThis.document = { createElement: () => new Element(), createElementNS: () => new Element() }
    try {
        const item = { xOffset: 4, yOffset: 0, _layoutBounds: { x: 100, y: 30, width: 80, height: 40 } }
        const following = { type: 'shape', xOffset: -20, _layoutBounds: { x: 160, y: 10, width: 40, height: 40 } }
        const controls = ItemsEditorControlSupport.createOffsetAndRotationControls({
            item,
            state: { resolution: 'LOW', items: [item, following] },
            translate: (key) => key,
            onChange: () => {},
            includeRotation: false
        })
        const input = controls.offsetCtrl.children[1].children[1]
        assert.equal(Number(input.value), Math.round((100 / (180 / 25.4)) * 100) / 100)
        input.value = '15.2'
        input.listeners.input()
        assert.ok(Math.abs(item.xOffset - (15.2 * 180) / 25.4) < 0.000001)
        assert.equal(item.yOffset, 30)
        assert.equal(item.positionAnchor, 'top-left')
        assert.equal(following.positionAnchor, 'top-left', 'numeric placement preserves downstream flow objects')
        assert.equal(following.xOffset, 160)
        assert.equal(following.yOffset, 10)
        const yInput = controls.yOffsetCtrl.children[1].children[1]
        assert.equal(Number(yInput.value), Math.round((30 / (180 / 25.4)) * 100) / 100)
    } finally {
        globalThis.document = original
    }
})

it('uniformly scales a mixed selection and its spacing from the original snapshot', () => {
    const a = { id: 'frame', type: 'shape', width: 80, height: 40, strokeWidth: 2, cornerRadius: 4, rotation: 30 }
    const b = { id: 'text', type: 'text', fontSize: 12 }
    const entries = [entry(a, { x: 10, y: 20, width: 80, height: 40 }), entry(b, { x: 110, y: 30, width: 60, height: 14 })]
    const snapshot = SelectionTransformUtils.snapshot(entries)
    const state = { media: 'W24', resolution: 'LOW', orientation: 'horizontal' }
    assert.equal(SelectionTransformUtils.apply(snapshot, 1.5, { right: true, bottom: true }, state), 1.5)
    assert.equal(a.width, 120)
    assert.equal(a.height, 60)
    assert.equal(a.strokeWidth, 3)
    assert.equal(a.cornerRadius, 6)
    assert.equal(a.rotation, 30)
    assert.equal(b.fontSize, 18)
    assert.equal(b.xOffset - a.xOffset, 150)
    assert.equal(b.yOffset - a.yOffset, 15)
    assert.equal(a.positionAnchor, 'top-left')
    assert.equal(a.positionMode, 'absolute')
    SelectionTransformUtils.apply(snapshot, 1.1, { right: true, bottom: true }, state)
    assert.equal(a.width, 88, 'repeated moves do not compound scale')
    assert.ok(Math.abs(b.fontSize - 13.2) < 0.000001)
    SelectionTransformUtils.apply(snapshot, 1.5, { left: true, top: true }, state)
    assert.equal(a.xOffset, -70)
    assert.equal(a.yOffset, 0)
    assert.equal(a.xOffset + snapshot.bounds.width * 1.5, 170, 'opposite corner stays fixed')
})

it('scales from the visible fitted font size instead of an oversized requested font', () => {
    const text = { id: 'text', type: 'text', fontSize: 64, _renderedFontSize: 16, _textScaleLimit: 1.5 }
    const frame = { id: 'frame', type: 'shape', width: 40, height: 40 }
    const snapshot = SelectionTransformUtils.snapshot([
        entry(text, { x: 10, y: 10, width: 30, height: 20 }),
        entry(frame, { x: 10, y: 40, width: 40, height: 40 })
    ])
    const state = { media: 'W24', resolution: 'LOW', orientation: 'horizontal' }
    assert.equal(SelectionTransformUtils.apply(snapshot, 0.8, { right: true, bottom: true }, state), 0.8)
    assert.equal(text.fontSize, 12.8)
    assert.equal(frame.width, 32)
    assert.equal(SelectionTransformUtils.apply(snapshot, 2, { right: true, bottom: true }, state), 1.5)
    assert.equal(text.fontSize, 24)
    assert.equal(frame.width, 60)
})

it('uses one common limit for every member and preserves QR, image, icon, and barcode proportions', () => {
    const types = ['shape', 'text', 'qr', 'image', 'icon', 'barcode']
    const entries = types.map((type, index) =>
        entry(
            {
                id: type,
                type,
                width: 40,
                height: 20,
                size: 20,
                fontSize: 12,
                strokeWidth: 2,
                barcodeModuleWidth: type === 'barcode' ? 5.5 : undefined,
                barcodeMargin: 0
            },
            { x: 10 + index * 50, y: 20, width: 40, height: 20 }
        )
    )
    const snapshot = SelectionTransformUtils.snapshot(entries)
    const scale = SelectionTransformUtils.apply(
        snapshot,
        10,
        { right: true, bottom: true },
        { media: 'W24', resolution: 'LOW', orientation: 'horizontal' }
    )
    assert.ok(Math.abs(scale - 6 / 5.5) < 0.000001)
    for (const { item, original, bounds } of snapshot.members) {
        assert.ok(Math.abs(item.width / original.width - scale) < 0.000001)
        assert.ok(Math.abs(item.height / original.height - scale) < 0.000001)
        assert.ok(Math.abs(item.xOffset - 10 - (bounds.x - 10) * scale) < 0.000001)
        assert.equal(item.positionAnchor, 'top-left')
    }
    assert.equal(entries[2].item.size, 20 * scale)
    assert.equal(entries[5].item.barcodeMargin, 0)
})

it('keeps manually placed objects at their visible top-left when preceding text grows, in both orientations', async () => {
    const originalDocument = globalThis.document
    const originalIconRaster = IconRasterUtils.getCachedIconCanvas
    globalThis.document = { createElement: () => createCanvas(1, 1) }
    IconRasterUtils.getCachedIconCanvas = async ({ width, height }) => createCanvas(Math.ceil(width), Math.ceil(height))
    try {
        for (const orientation of ['horizontal', 'vertical']) {
            for (const type of ['text', 'shape', 'image', 'icon', 'barcode', 'qr']) {
                for (const rotation of [0, 90]) {
                    const prefix = {
                        id: 'prefix',
                        type: 'text',
                        text: 'Short',
                        fontSize: 12,
                        fontFamily: 'sans-serif',
                        xOffset: 4,
                        yOffset: 0
                    }
                    const item = {
                        id: 'placed',
                        type,
                        shapeType: 'rect',
                        text: 'Box',
                        data: '1234567890',
                        fontSize: 12,
                        fontFamily: 'sans-serif',
                        width: 40,
                        height: 24,
                        size: 24,
                        xOffset: 4,
                        yOffset: 0,
                        rotation
                    }
                    const state = { media: 'W24', resolution: 'LOW', orientation, items: [prefix, item] }
                    const renderer = new PreviewRenderer(
                        {},
                        state,
                        () => {},
                        (key) => key
                    )
                    renderer._requireQrCode = () => QRCode
                    renderer._requireBarcode = () => JsBarcode
                    const before = await renderer.buildCanvasFromState()
                    const first = before.layoutItems.find((entry) => entry.id === 'placed').bounds
                    ManualLayoutUtils.pin(item, first)
                    prefix.text = 'A much longer server name\nwith another line'
                    const after = await renderer.buildCanvasFromState()
                    const placed = after.layoutItems.find((entry) => entry.id === 'placed').bounds
                    assert.ok(Math.abs(placed.x - first.x) < 0.000001, `${type} ${orientation} ${rotation}: X moved`)
                    assert.ok(Math.abs(placed.y - first.y) < 0.000001, `${type} ${orientation} ${rotation}: Y moved`)
                    const defaults = AppRuntimeConfig.createDefaultState(() => 'default')
                    const payload = ProjectIoUtils.buildProjectPayload({ ...defaults, ...state })
                    const restored = ProjectIoUtils.normalizeProjectState(payload, defaults).state.items[1]
                    assert.equal(restored.positionAnchor, 'top-left')
                    assert.equal(restored.xOffset, item.xOffset)
                    const pool = Object.create(PrintPageWorkerPoolClient.prototype)
                    assert.equal(
                        pool.canRenderStateSnapshot({ items: [restored] }),
                        false,
                        'anchored printing uses the shared preview/print renderer'
                    )
                }
            }
        }
    } finally {
        globalThis.document = originalDocument
        IconRasterUtils.getCachedIconCanvas = originalIconRaster
    }
})

it('does not paint the transparent measurement pass at the old centered position', async () => {
    const original = globalThis.document
    globalThis.document = { createElement: () => createCanvas(1, 1) }
    try {
        const renderer = new PreviewRenderer(
            {},
            {
                media: 'W24',
                resolution: 'LOW',
                orientation: 'horizontal',
                items: [
                    {
                        id: 'box',
                        type: 'shape',
                        shapeType: 'rect',
                        width: 30,
                        height: 20,
                        strokeWidth: 2,
                        xOffset: 60,
                        yOffset: 20,
                        positionMode: 'absolute',
                        positionAnchor: 'top-left'
                    }
                ]
            },
            () => {},
            (key) => key
        )
        const result = await renderer.buildCanvasFromState()
        const context = result.preview.getContext('2d')
        assert.equal(context.getImageData(2, 54, 1, 1).data[0], 255)
        assert.ok(context.getImageData(60, 20, 1, 1).data[0] < 100)
        const bounds = result.layoutItems[0].bounds
        assert.equal(bounds.x, 60)
        assert.equal(bounds.y, 20)
    } finally {
        globalThis.document = original
    }
})
