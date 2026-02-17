import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AiActionBridge } from '../src/ui/AiActionBridge.mjs'
import { RotationUtils } from '../src/RotationUtils.mjs'

/**
 * Populates centered bounds while respecting item geometry.
 * @param {{ items: Array<Record<string, any>> }} state
 * @param {Map<string, { bounds: { x: number, y: number, width: number, height: number } }>} map
 * @param {{ width?: number, height?: number }} [previewSize]
 */
function populateInteractiveMapCentered(state, map, previewSize = {}) {
    map.clear()
    const previewWidth = Math.max(120, Number(previewSize.width || 480))
    const previewHeight = Math.max(48, Number(previewSize.height || 128))
    const feedPadStart = 2
    state.items.forEach((item) => {
        const lines = String(item.text || '')
            .replace(/\r/g, '')
            .split('\n')
        const nonEmptyLineCount = Math.max(1, lines.filter((line) => String(line || '').trim()).length)
        let width = 12
        let height = 12
        if (item.type === 'qr') {
            width = Math.max(1, Number(item.size || item.width || 16))
            height = width
        } else if (item.type === 'barcode') {
            width = Math.max(24, Number(item.width || 120))
            height = Math.max(12, Number(item.height || 24))
        } else if (item.type === 'shape') {
            width = Math.max(4, Number(item.width || 12))
            height = Math.max(4, Number(item.height || 12))
        } else {
            const textLength = Math.max(1, ...lines.map((line) => String(line || '').length))
            width = Math.min(
                previewWidth - 8,
                Math.max(10, Math.round(textLength * Math.max(8, Number(item.fontSize || 12)) * 0.58))
            )
            height = Math.max(10, Math.round(Math.max(8, Number(item.fontSize || 12)) * 1.08 * nonEmptyLineCount))
        }
        const unrotatedBounds = {
            x: feedPadStart + Number(item.xOffset || 0),
            y: Math.max(0, Math.round((previewHeight - height) / 2 + Number(item.yOffset || 0))),
            width,
            height
        }
        map.set(item.id, {
            bounds: RotationUtils.computeRotatedBounds(unrotatedBounds, item.rotation)
        })
    })
}

/**
 * Builds a runtime bridge harness for assistant action execution tests.
 * @param {{ previewWidth?: number, previewHeight?: number }} [options]
 * @returns {{
 *  bridge: AiActionBridge,
 *  state: Record<string, any>,
 *  previewRenderer: {
 *    _previewBusy: boolean,
 *    _previewQueued: boolean,
 *    _interactiveItemsById: Map<string, { bounds: { x: number, y: number, width: number, height: number } }>,
 *    els: { preview: { width: number, height: number } },
 *    setSelectedItemIds: (ids: string[]) => void,
 *    getSelectedItemIds: () => string[],
 *    alignSelectedItems: () => { changed: boolean, reason: string, count: number },
 *    render: () => void
 *  }
 * }}
 */
function createRuntimeHarness(options = {}) {
    const state = {
        backend: 'usb',
        printer: 'P700',
        media: 'W9',
        resolution: 'LOW',
        orientation: 'horizontal',
        mediaLengthMm: null,
        items: [],
        parameters: [],
        parameterDataRows: []
    }
    const selectedIds = []
    let nextId = 1
    const interactiveMap = new Map()
    const itemsEditor = {
        addTextItem() {
            state.items.push({
                id: `generated-${nextId++}`,
                type: 'text',
                text: 'New text',
                xOffset: 0,
                yOffset: 0,
                fontFamily: 'Barlow',
                fontSize: 16,
                textBold: false,
                textItalic: false,
                textUnderline: false,
                textStrikethrough: false,
                rotation: 0
            })
        },
        addQrItem() {
            state.items.push({
                id: `generated-${nextId++}`,
                type: 'qr',
                data: '',
                size: 16,
                width: 16,
                height: 16,
                xOffset: 0,
                yOffset: 0,
                rotation: 0,
                qrErrorCorrectionLevel: 'M',
                qrVersion: 0,
                qrEncodingMode: 'auto'
            })
        },
        addBarcodeItem() {
            state.items.push({
                id: `generated-${nextId++}`,
                type: 'barcode',
                data: '',
                width: 220,
                height: 64,
                xOffset: 0,
                yOffset: 0,
                rotation: 0,
                barcodeFormat: 'code128',
                barcodeShowText: false,
                barcodeModuleWidth: 2,
                barcodeMargin: 0
            })
        },
        addImageItem() {},
        addIconItem() {},
        addShapeItem(shapeType = 'rect') {
            state.items.push({
                id: `generated-${nextId++}`,
                type: 'shape',
                shapeType,
                width: 16,
                height: 16,
                xOffset: 0,
                yOffset: 0,
                rotation: 0,
                strokeWidth: 1,
                cornerRadius: 0,
                sides: 4
            })
        },
        setSelectedItemIds(ids) {
            selectedIds.splice(0, selectedIds.length, ...(Array.isArray(ids) ? ids : []))
        },
        render() {}
    }
    const mediaSelect = {
        value: state.media,
        options: [{ value: 'W9' }, { value: 'W24' }],
        dispatchEvent() {
            state.media = this.value
        }
    }
    const orientationSelect = {
        value: state.orientation,
        options: [{ value: 'horizontal' }, { value: 'vertical' }],
        dispatchEvent() {
            state.orientation = this.value
        }
    }
    const previewRenderer = {
        _previewBusy: false,
        _previewQueued: false,
        _interactiveItemsById: interactiveMap,
        els: {
            preview: {
                width: Math.max(120, Number(options.previewWidth || 480)),
                height: Math.max(48, Number(options.previewHeight || 128))
            }
        },
        setSelectedItemIds(ids) {
            selectedIds.splice(0, selectedIds.length, ...(Array.isArray(ids) ? ids : []))
        },
        getSelectedItemIds() {
            return [...selectedIds]
        },
        alignSelectedItems() {
            return { changed: false, reason: 'no-selection', count: 0 }
        },
        render() {
            populateInteractiveMapCentered(state, interactiveMap, this.els.preview)
        }
    }
    const bridge = new AiActionBridge({
        els: {
            mode: null,
            printer: null,
            media: mediaSelect,
            resolution: null,
            orientation: orientationSelect,
            mediaLength: { value: '', dispatchEvent() {} },
            saveProject: null,
            shareProject: null
        },
        state,
        itemsEditor,
        parameterPanel: {
            handleItemTemplatesChanged() {},
            hasBlockingErrors() {
                return false
            },
            buildPrintParameterValueMaps() {
                return [{}]
            }
        },
        previewRenderer,
        printController: { async print() {} },
        translate: (key) => key,
        shapeTypes: [{ id: 'rect' }, { id: 'line' }]
    })
    return { bridge, state, previewRenderer }
}

/**
 * Resolves text and QR bounds after rendering.
 * @param {Record<string, any>} state
 * @param {{ _interactiveItemsById: Map<string, { bounds: { x: number, y: number, width: number, height: number } }>, render: () => void }} previewRenderer
 * @returns {{
 *  textEntries: Array<{ item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } }>,
 *  qrBounds: { x: number, y: number, width: number, height: number } | null,
 *  textRight: number,
 *  textBottom: number
 * }}
 */
function resolveLayoutMetrics(state, previewRenderer) {
    previewRenderer.render()
    const textEntries = state.items
        .filter((item) => item.type === 'text')
        .map((item) => ({
            item,
            bounds: previewRenderer._interactiveItemsById.get(item.id)?.bounds || null
        }))
        .filter((entry) => entry.bounds)
        .sort((left, right) => Number(left.bounds.y || 0) - Number(right.bounds.y || 0))
    const qrItem = state.items.find((item) => item.type === 'qr')
    const qrBounds = qrItem ? previewRenderer._interactiveItemsById.get(qrItem.id)?.bounds || null : null
    const textRight = textEntries.reduce(
        (maximum, entry) => Math.max(maximum, Number(entry.bounds.x || 0) + Number(entry.bounds.width || 0)),
        0
    )
    const textBottom = textEntries.reduce(
        (maximum, entry) => Math.max(maximum, Number(entry.bounds.y || 0) + Number(entry.bounds.height || 0)),
        0
    )
    return { textEntries, qrBounds, textRight, textBottom }
}

describe('ai-action-bridge qr-form fidelity', () => {
    it('keeps qr-form geometry stable for the exact 16/24 + QR88 rebuild payload', async () => {
        const { bridge, state, previewRenderer } = createRuntimeHarness({ previewWidth: 480, previewHeight: 128 })
        const result = await bridge.runActions(
            [
                { action: 'set_label', settings: { media: 'W24', orientation: 'horizontal' } },
                { action: 'clear_items' },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { positionMode: 'absolute', xOffset: 10, yOffset: -34, text: 'Artikelname:', fontFamily: 'Barlow', fontSize: 16, textUnderline: true, textBold: false } },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { positionMode: 'absolute', xOffset: 12, yOffset: -14, text: 'Hammermutter Nut 10 M8', fontFamily: 'Barlow', fontSize: 24, textBold: true, textUnderline: true } },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { positionMode: 'absolute', xOffset: 10, yOffset: 6, text: 'Artikelnummer:', fontFamily: 'Barlow', fontSize: 16, textBold: false } },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { positionMode: 'absolute', xOffset: 12, yOffset: 22, text: '18123689', fontFamily: 'Barlow', fontSize: 24, textBold: true } },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { positionMode: 'absolute', xOffset: 10, yOffset: 40, text: 'Lagerplatz:', fontFamily: 'Barlow', fontSize: 16, textBold: false } },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { positionMode: 'absolute', xOffset: 12, yOffset: 56, text: 'R1-S5-F3', fontFamily: 'Barlow', fontSize: 24, textBold: true } },
                { action: 'add_item', itemType: 'qr' },
                { action: 'update_item', itemId: 'last', changes: { positionMode: 'absolute', xOffset: 250, yOffset: 18, size: 88, data: 'Artikelname=Hammermutter Nut 10 M8; Artikelnummer=18123689; Lagerplatz=R1-S5-F3', qrErrorCorrectionLevel: 'M' } }
            ],
            { forceRebuild: true, preferredMedia: 'W24' }
        )

        assert.deepEqual(result.errors, [])
        const headingItem = state.items.find((item) => String(item.text || '') === 'Artikelname:')
        const headingValueItem = state.items.find((item) => String(item.text || '') === 'Hammermutter Nut 10 M8')
        assert.equal(Boolean(headingItem?.textUnderline), true)
        assert.equal(Boolean(headingValueItem?.textUnderline), true)
        const { textEntries, qrBounds, textRight, textBottom } = resolveLayoutMetrics(state, previewRenderer)
        assert.ok(textEntries.length >= 6)
        assert.ok(qrBounds, 'qr should exist after rebuild')
        for (let index = 1; index < textEntries.length; index += 1) {
            const previous = textEntries[index - 1].bounds
            const current = textEntries[index].bounds
            assert.ok(
                Number(current.y || 0) >= Number(previous.y || 0) + Number(previous.height || 0) + 2,
                'rows should remain separated after rebuild normalization'
            )
        }
        assert.ok(
            textBottom <= Number(previewRenderer.els.preview.height || 128) + 1,
            'bottom text row should remain visible'
        )
        const semanticOrder = [
            'Artikelname:',
            'Hammermutter Nut 10 M8',
            'Artikelnummer:',
            '18123689',
            'Lagerplatz:',
            'R1-S5-F3'
        ]
        const yByText = new Map(
            textEntries.map((entry) => [String(entry.item?.text || '').trim(), Number(entry.bounds?.y || 0)])
        )
        for (let index = 1; index < semanticOrder.length; index += 1) {
            const previousY = Number(yByText.get(semanticOrder[index - 1]) || 0)
            const currentY = Number(yByText.get(semanticOrder[index]) || 0)
            assert.ok(currentY > previousY, 'semantic heading/value order should be preserved')
        }
        assert.ok(Number(qrBounds.x || 0) >= textRight + 2, 'qr should remain in right column')
    })

    it('reduces QR size before text size when constrained in runtime rebuild flow', async () => {
        const { bridge, state, previewRenderer } = createRuntimeHarness({ previewWidth: 280, previewHeight: 128 })
        const result = await bridge.runActions(
            [
                { action: 'set_label', settings: { media: 'W24', orientation: 'horizontal' } },
                { action: 'clear_items' },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { positionMode: 'absolute', xOffset: 8, yOffset: -42, fontFamily: 'Barlow', fontSize: 16, text: 'Artikelname:' } },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { positionMode: 'absolute', xOffset: 10, yOffset: -16, fontFamily: 'Barlow', fontSize: 22, text: 'Hammermutter Nut 10 M8', textBold: true } },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { positionMode: 'absolute', xOffset: 8, yOffset: 6, fontFamily: 'Barlow', fontSize: 16, text: 'Artikelnummer:' } },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { positionMode: 'absolute', xOffset: 8, yOffset: 28, fontFamily: 'Barlow', fontSize: 22, text: '18123689', textBold: true } },
                { action: 'add_item', itemType: 'qr' },
                { action: 'update_item', itemId: 'last', changes: { positionMode: 'absolute', xOffset: 150, yOffset: 4, size: 150, data: 'https://example.com/1' } }
            ],
            { forceRebuild: true, preferredMedia: 'W24' }
        )

        assert.deepEqual(result.errors, [])
        const qrItem = state.items.find((item) => item.type === 'qr')
        assert.ok(qrItem)
        assert.ok(Number(qrItem.size || 0) < 150, 'qr should be reduced in constrained width scenarios')
        assert.ok(Number(qrItem.size || 0) >= 40, 'qr should respect minimum size floor')
        const expectedTextSizes = new Map([
            ['Artikelname:', 16],
            ['Hammermutter Nut 10 M8', 22],
            ['Artikelnummer:', 16],
            ['18123689', 22]
        ])
        let observedAdaptiveDownscale = false
        state.items
            .filter((item) => item.type === 'text')
            .forEach((item) => {
                const baselineSize = Number(expectedTextSizes.get(String(item.text || '')) || 0)
                const currentSize = Math.round(Number(item.fontSize || 0))
                if (currentSize < Math.round(baselineSize * 0.85)) {
                    observedAdaptiveDownscale = true
                }
                assert.ok(
                    currentSize <= baselineSize && currentSize >= 10,
                    'adaptive downscaling should be monotonic and respect floor 10'
                )
            })
        assert.equal(observedAdaptiveDownscale, true, 'expected adaptive reduction beyond 15% in this constrained case')
        const { qrBounds, textEntries, textRight, textBottom } = resolveLayoutMetrics(state, previewRenderer)
        assert.ok(qrBounds)
        for (let index = 1; index < textEntries.length; index += 1) {
            const previous = textEntries[index - 1].bounds
            const current = textEntries[index].bounds
            assert.ok(
                Number(current.y || 0) >= Number(previous.y || 0) + Number(previous.height || 0) + 2,
                'adaptive scaling should still preserve visible row gaps'
            )
        }
        assert.ok(textBottom <= Number(previewRenderer.els.preview.height || 128) + 1)
        assert.ok(Number(qrBounds.x || 0) >= textRight + 2, 'qr should remain in right column after constrained solve')
    })
})
