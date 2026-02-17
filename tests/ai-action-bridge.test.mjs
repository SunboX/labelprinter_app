import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AiActionBridge } from '../src/ui/AiActionBridge.mjs'
import { QrSizeUtils } from '../src/QrSizeUtils.mjs'

/**
 * Populates deterministic interactive bounds for flow-based items.
 * @param {{ items: Array<Record<string, any>> }} state
 * @param {Map<string, { bounds: { x: number, y: number, width: number, height: number } }>} map
 */
function populateInteractiveMap(state, map) {
    map.clear()
    const isHorizontal = String(state?.orientation || 'horizontal') !== 'vertical'
    const feedPadStart = 2
    let flowCursor = feedPadStart
    state.items.forEach((item) => {
        const rotation = Math.abs(Number(item.rotation || 0)) % 180
        const isQuarterTurn = Math.abs(rotation - 90) <= 12
        const lines = String(item.text || '')
            .replace(/\r/g, '')
            .split('\n')
        const textLength = Math.max(1, ...lines.map((line) => String(line || '').length))
        const lineCount = Math.max(1, lines.filter((line) => String(line || '').trim()).length)
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
            const baseWidth = Math.max(12, Math.round(textLength * Math.max(8, Number(item.fontSize || 12)) * 0.58))
            const baseHeight = Math.max(
                10,
                Math.round(Math.max(8, Number(item.fontSize || 12)) * 1.08 * Math.max(1, lineCount))
            )
            width = isQuarterTurn ? baseHeight : baseWidth
            height = isQuarterTurn ? baseWidth : baseHeight
        }
        const isFlow = String(item.positionMode || 'flow').toLowerCase() !== 'absolute'
        const feedAxisBase = isFlow ? flowCursor : feedPadStart
        const x = isHorizontal ? feedAxisBase + Number(item.xOffset || 0) : Number(item.xOffset || 0)
        const y = isHorizontal ? Number(item.yOffset || 0) : feedAxisBase + Number(item.yOffset || 0)
        map.set(item.id, {
            bounds: {
                x,
                y,
                width,
                height
            }
        })
        if (isFlow) {
            flowCursor += isHorizontal ? width : height
        }
    })
}

/**
 * Creates a minimal runtime harness for behavior-focused bridge tests.
 * @returns {{ bridge: AiActionBridge, state: Record<string, any>, interactiveMap: Map<string, any> }}
 */
function createBridgeHarness() {
    const state = {
        backend: 'usb',
        printer: 'P700',
        media: 'W24',
        resolution: 'LOW',
        orientation: 'horizontal',
        mediaLengthMm: null,
        items: [],
        parameters: [],
        parameterDataRows: []
    }
    let nextId = 1
    const selectedIds = []
    const itemsEditor = {
        addTextItem() {
            state.items.push({
                id: `generated-${nextId++}`,
                type: 'text',
                text: 'New text',
                xOffset: 0,
                yOffset: 0,
                rotation: 0,
                fontFamily: 'Barlow',
                fontSize: 16,
                textBold: false,
                textItalic: false,
                textUnderline: false,
                textStrikethrough: false
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
                width: 120,
                height: 24,
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
                width: 10,
                height: 10,
                strokeWidth: 2,
                cornerRadius: 0,
                sides: 4,
                xOffset: 0,
                yOffset: 0,
                rotation: 0
            })
        },
        setSelectedItemIds(ids) {
            selectedIds.splice(0, selectedIds.length, ...(Array.isArray(ids) ? ids : []))
        },
        render() {}
    }
    const interactiveMap = new Map()
    const previewRenderer = {
        setSelectedItemIds(ids) {
            selectedIds.splice(0, selectedIds.length, ...(Array.isArray(ids) ? ids : []))
        },
        getSelectedItemIds() {
            return [...selectedIds]
        },
        alignSelectedItems() {
            return { changed: false, reason: 'no-selection', count: selectedIds.length }
        },
        _interactiveItemsById: interactiveMap,
        els: {
            preview: {
                width: 220,
                height: 128
            }
        },
        render() {
            populateInteractiveMap(state, interactiveMap)
        }
    }
    const bridge = new AiActionBridge({
        els: {},
        state,
        itemsEditor,
        parameterPanel: { handleItemTemplatesChanged() {}, hasBlockingErrors() { return false }, buildPrintParameterValueMaps() { return [{}] } },
        previewRenderer,
        printController: { async print() {} },
        translate: (key) => key,
        shapeTypes: [{ id: 'rect' }, { id: 'roundRect' }]
    })
    return { bridge, state, interactiveMap }
}

describe('ai-action-bridge', () => {
    it('exposes positionMode controls in assistant action capabilities', () => {
        const { bridge } = createBridgeHarness()
        const capabilities = bridge.getActionCapabilities()
        assert.ok(capabilities.itemProperties.text.includes('positionMode'))
        assert.ok(capabilities.itemProperties.barcode.includes('positionMode'))
        assert.ok(
            capabilities.notes.some((entry) => String(entry || '').toLowerCase().includes('positionmode')),
            'capability notes should document positionMode usage for rebuild prompts'
        )
    })

    it('supports add/update payload aliases for item changes', async () => {
        const { bridge, state } = createBridgeHarness()
        const result = await bridge.runActions([
            {
                action: 'add_item',
                itemType: 'text',
                item: {
                    content: 'Alias Draft',
                    font_size: 14,
                    x_offset: 2,
                    y_offset: 1
                }
            },
            {
                action: 'update_item',
                itemId: 'last',
                values: {
                    content: 'Alias Final',
                    font_size: 18,
                    italic: true,
                    underline: true,
                    strikethrough: true,
                    x_offset: 9,
                    y_offset: 4
                }
            }
        ])
        assert.deepEqual(result.errors, [])
        assert.equal(state.items.length, 1)
        assert.equal(state.items[0].text, 'Alias Final')
        assert.equal(state.items[0].fontSize, 18)
        assert.equal(state.items[0].textItalic, true)
        assert.equal(state.items[0].textUnderline, true)
        assert.equal(state.items[0].textStrikethrough, true)
        assert.equal(state.items[0].xOffset, 9)
        assert.equal(state.items[0].yOffset, 4)
    })

    it('maps qr width/height updates to square size', async () => {
        const { bridge, state } = createBridgeHarness()
        const result = await bridge.runActions([
            { action: 'add_item', itemType: 'qr' },
            { action: 'update_item', itemId: 'last', changes: { width: 28, height: 24 } }
        ])
        assert.deepEqual(result.errors, [])
        assert.equal(state.items.length, 1)
        assert.equal(state.items[0].type, 'qr')
        assert.equal(Number(state.items[0].size || 0), 28)
        assert.equal(Number(state.items[0].height || 0), 28)
    })

    it('falls back to add_item when rebuild mode receives update for a missing item', async () => {
        const { bridge, state } = createBridgeHarness()
        const result = await bridge.runActions(
            [
                { action: 'clear_items' },
                { action: 'update_item', itemId: 'item-42', changes: { text: 'Created via fallback', fontSize: 15 } }
            ],
            { forceRebuild: true }
        )
        assert.deepEqual(result.errors, [])
        assert.equal(state.items.length, 1)
        assert.equal(state.items[0].type, 'text')
        assert.equal(state.items[0].text, 'Created via fallback')
        assert.equal(state.items[0].fontSize, 15)
    })

    it('removes duplicated aggregate text and enforces qr floor after rebuild normalization', async () => {
        const { bridge, state } = createBridgeHarness()
        const result = await bridge.runActions(
            [
                { action: 'clear_items' },
                { action: 'add_item', itemType: 'text' },
                {
                    action: 'update_item',
                    itemId: 'last',
                    changes: {
                        text: 'Header\nBody line one\nBody line two\nFooter line',
                        fontSize: 16
                    }
                },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { text: 'Header', fontSize: 16 } },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { text: 'Body line one', fontSize: 16 } },
                { action: 'add_item', itemType: 'qr' },
                { action: 'update_item', itemId: 'last', changes: { data: '18123689', size: 8 } }
            ],
            { forceRebuild: true }
        )
        assert.deepEqual(result.errors, [])
        assert.equal(state.items.filter((item) => item.type === 'text').length, 2)
        const qrItem = state.items.find((item) => item.type === 'qr')
        assert.ok(qrItem)
        const expectedFloor = Math.max(
            QrSizeUtils.MIN_QR_SIZE_DOTS,
            Math.round(QrSizeUtils.computeMaxQrSizeDots(state) * 0.6)
        )
        const expectedSize = QrSizeUtils.clampQrSizeToLabel(state, expectedFloor)
        assert.equal(Number(qrItem?.size || 0), expectedSize)
        assert.equal(Number(qrItem?.width || 0), Number(qrItem?.size || 0))
        assert.equal(Number(qrItem?.height || 0), Number(qrItem?.size || 0))
    })

    it('emits a generic low-confidence warning for ambiguous normalization-only cleanup', async () => {
        const { bridge } = createBridgeHarness()
        const result = await bridge.runActions(
            [
                { action: 'clear_items' },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { text: 'Title\nLine A\nLine B\nTail' } },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { text: 'Title' } },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { text: 'Line A' } }
            ],
            { forceRebuild: true }
        )
        assert.deepEqual(result.errors, [])
        assert.ok(Array.isArray(result.warnings))
        assert.ok(result.warnings.includes('assistant.warningNormalizationLowConfidence'))
    })

    it('supports semantic item target aliases like last and selected', async () => {
        const { bridge, state } = createBridgeHarness()
        const result = await bridge.runActions([
            { action: 'add_item', itemType: 'text' },
            { action: 'update_item', itemId: 'last', changes: { text: 'first' } },
            { action: 'add_item', itemType: 'text' },
            { action: 'update_item', itemId: 'last', changes: { text: 'second' } },
            { action: 'select_items', itemIds: ['first'] },
            { action: 'update_item', target: 'selected', changes: { text: 'selected-first' } }
        ])
        assert.deepEqual(result.errors, [])
        assert.equal(state.items.length, 2)
        assert.equal(state.items[0].text, 'selected-first')
        assert.equal(state.items[1].text, 'second')
    })

    it('keeps selected-target updates stable when preview selection reads are temporarily empty', async () => {
        const { bridge, state } = createBridgeHarness()
        bridge.previewRenderer.getSelectedItemIds = () => []
        const result = await bridge.runActions([
            { action: 'add_item', itemType: 'text' },
            { action: 'update_item', itemId: 'selected', changes: { text: 'selected-via-run-context' } }
        ])
        assert.deepEqual(result.errors, [])
        assert.equal(state.items.length, 1)
        assert.equal(state.items[0].text, 'selected-via-run-context')
    })
})
