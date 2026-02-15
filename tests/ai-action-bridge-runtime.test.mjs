import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AiActionBridge } from '../src/ui/AiActionBridge.mjs'

/**
 * Populates deterministic interactive bounds for flow-based items.
 * @param {{ items: Array<Record<string, any>> }} state
 * @param {Map<string, { bounds: { x: number, y: number, width: number, height: number } }>} map
 */
function populateInteractiveMap(state, map) {
    map.clear()
    let cursor = 0
    state.items.forEach((item) => {
        const width =
            item.type === 'qr'
                ? Math.max(1, Number(item.size || item.width || 16))
                : Math.max(12, Math.round(String(item.text || '').length * 1.8))
        const height = item.type === 'qr' ? width : Math.max(10, Number(item.fontSize || 12))
        const x = cursor + Number(item.xOffset || 0)
        const y = Number(item.yOffset || 0)
        map.set(item.id, {
            bounds: {
                x,
                y,
                width,
                height
            }
        })
        cursor += width
    })
}

function createRuntimeHarness() {
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
    const selectedIds = []
    let nextId = 1
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
                textUnderline: false
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
        setSelectedItemIds(ids) {
            selectedIds.splice(0, selectedIds.length, ...(Array.isArray(ids) ? ids : []))
        },
        render() {}
    }
    const previewRenderer = {
        setSelectedItemIds(ids) {
            selectedIds.splice(0, selectedIds.length, ...(Array.isArray(ids) ? ids : []))
        },
        getSelectedItemIds() {
            return [...selectedIds]
        },
        alignSelectedItems() {
            return { changed: false, reason: 'no-selection', count: 0 }
        },
        _interactiveItemsById: new Map(),
        els: {
            preview: {
                width: 220,
                height: 128
            }
        },
        render() {}
    }
    const bridge = new AiActionBridge({
        els: {},
        state,
        itemsEditor,
        parameterPanel: { handleItemTemplatesChanged() {}, hasBlockingErrors() { return false }, buildPrintParameterValueMaps() { return [{}] } },
        previewRenderer,
        printController: { async print() {} },
        translate: (key) => key,
        shapeTypes: [{ id: 'rect' }]
    })
    return { bridge, state }
}

describe('ai-action-bridge runtime', () => {
    it('maps virtual item ids from add_item to follow-up update_item calls', async () => {
        const { bridge, state } = createRuntimeHarness()
        const result = await bridge.runActions(
            [
                { action: 'clear_items' },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'item-1', changes: { text: 'Artikelname:', textUnderline: true } }
            ],
            { forceRebuild: true }
        )
        assert.equal(result.errors.length, 0)
        assert.equal(state.items.length, 1)
        assert.equal(state.items[0].text, 'Artikelname:')
        assert.equal(state.items[0].textUnderline, true)
    })

    it('creates a missing explicit target during rebuild mode instead of failing', async () => {
        const { bridge, state } = createRuntimeHarness()
        const result = await bridge.runActions(
            [{ action: 'update_item', itemId: 'custom-heading', changes: { text: 'Artikelnummer:', textBold: true } }],
            { forceRebuild: true }
        )
        assert.equal(result.errors.length, 0)
        assert.equal(state.items.length, 1)
        assert.equal(state.items[0].type, 'text')
        assert.equal(state.items[0].text, 'Artikelnummer:')
        assert.equal(state.items[0].textBold, true)
    })

    it('keeps semantic target aliases dynamic after new items are added', async () => {
        const { bridge, state } = createRuntimeHarness()
        const result = await bridge.runActions([
            { action: 'add_item', itemType: 'text' },
            { action: 'update_item', itemId: 'last', changes: { text: 'first-updated' } },
            { action: 'add_item', itemType: 'text' },
            { action: 'update_item', itemId: 'last', changes: { text: 'second-updated' } }
        ])
        assert.deepEqual(result.errors, [])
        assert.equal(state.items.length, 2)
        assert.equal(state.items[0].text, 'first-updated')
        assert.equal(state.items[1].text, 'second-updated')
    })

    it('resolves select_items aliases like first for follow-up selected updates', async () => {
        const { bridge, state } = createRuntimeHarness()
        const result = await bridge.runActions([
            { action: 'add_item', itemType: 'text' },
            { action: 'update_item', itemId: 'last', changes: { text: 'left' } },
            { action: 'add_item', itemType: 'text' },
            { action: 'update_item', itemId: 'last', changes: { text: 'right' } },
            { action: 'select_items', itemIds: ['first'] },
            { action: 'update_item', target: 'selected', changes: { text: 'selected-first' } }
        ])
        assert.deepEqual(result.errors, [])
        assert.equal(state.items.length, 2)
        assert.equal(state.items[0].text, 'selected-first')
        assert.equal(state.items[1].text, 'right')
    })

    it('normalizes one multiline inventory text + qr into deterministic template', async () => {
        const { bridge, state } = createRuntimeHarness()
        const result = await bridge.runActions(
            [
                { action: 'clear_items' },
                { action: 'add_item', itemType: 'text' },
                {
                    action: 'update_item',
                    itemId: 'last',
                    changes: {
                        text: 'Artikelname:\nHammermutter Nut 10 M8\n\nArtikelnummer:\n18123689\n\nLagerplatz:\nR1-S5-F3',
                        fontSize: 13,
                        textBold: false,
                        textUnderline: false
                    }
                },
                { action: 'add_item', itemType: 'qr' },
                { action: 'update_item', itemId: 'last', changes: { data: '18123689', size: 16, xOffset: 64, yOffset: 6 } }
            ],
            { forceRebuild: true }
        )
        assert.deepEqual(result.errors, [])
        assert.equal(state.items.filter((item) => item.type === 'text').length, 6)
        assert.equal(state.items.filter((item) => item.type === 'qr').length, 1)
        assert.equal(state.items[0].text, 'Artikelname:')
        assert.equal(state.items[0].textUnderline, true)
        assert.equal(state.items[1].textUnderline, true)
        assert.equal(state.items[2].textItalic, false)
        assert.equal(state.items[4].textItalic, false)
        assert.equal(state.items[6].data, '18123689')
    })

    it('maps explicit item refs in select_items for follow-up selected updates', async () => {
        const { bridge, state } = createRuntimeHarness()
        const result = await bridge.runActions(
            [
                { action: 'clear_items' },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'item-1', changes: { text: 'A' } },
                { action: 'add_item', itemType: 'qr' },
                { action: 'update_item', itemId: 'item-2', changes: { data: '18123689', size: 20 } },
                { action: 'select_items', itemIds: ['item-1'] },
                { action: 'update_item', target: 'selected', changes: { textUnderline: true } }
            ],
            { forceRebuild: false }
        )
        assert.deepEqual(result.errors, [])
        const text = state.items.find((item) => item.type === 'text')
        assert.ok(text)
        assert.equal(Boolean(text.textUnderline), true)
    })

    it('applies deterministic inventory rebuild template for fragmented German field labels', async () => {
        const { bridge, state } = createRuntimeHarness()
        const result = await bridge.runActions(
            [
                { action: 'clear_items' },
                { action: 'add_item', itemType: 'text' },
                {
                    action: 'update_item',
                    itemId: 'last',
                    changes: {
                        text: 'Artikelname:',
                        fontSize: 12
                    }
                },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { text: 'Hammermutter Nut 10 M8', fontSize: 20, textBold: true } },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { text: 'Artikelnummer:\n18123689\nLagerplatz:\nR1-S5-F3', fontSize: 11 } },
                { action: 'add_item', itemType: 'qr' },
                { action: 'update_item', itemId: 'last', changes: { data: '18123689', size: 16, xOffset: 64, yOffset: 6 } }
            ],
            { forceRebuild: true }
        )
        assert.deepEqual(result.errors, [])
        assert.equal(state.items.filter((item) => item.type === 'text').length, 6)
        assert.equal(state.items.filter((item) => item.type === 'qr').length, 1)
        assert.equal(state.items[0].text, 'Artikelname:')
        assert.equal(state.items[0].textUnderline, true)
        assert.equal(state.items[1].text, 'Hammermutter Nut 10 M8')
        assert.equal(state.items[1].textBold, true)
        assert.equal(state.items[1].textUnderline, true)
        assert.equal(state.items[6].data, '18123689')
    })

    it('waits for busy preview renders so rebuild template placement does not collapse into one row', async () => {
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
        const selectedIds = []
        let nextId = 1
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
                    textUnderline: false
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
            setSelectedItemIds(ids) {
                selectedIds.splice(0, selectedIds.length, ...(Array.isArray(ids) ? ids : []))
            },
            render() {}
        }
        const interactiveMap = new Map()
        const previewRenderer = {
            _previewBusy: false,
            _previewQueued: false,
            _interactiveItemsById: interactiveMap,
            els: {
                preview: {
                    width: 240,
                    height: 128
                }
            },
            setSelectedItemIds(ids) {
                selectedIds.splice(0, selectedIds.length, ...(Array.isArray(ids) ? ids : []))
            },
            getSelectedItemIds() {
                return [...selectedIds]
            },
            alignSelectedItems() {
                return { changed: true, reason: '', count: selectedIds.length || 1 }
            },
            render() {
                if (this._previewBusy) {
                    this._previewQueued = true
                    return
                }
                this._previewBusy = true
                this._previewQueued = false
                setTimeout(() => {
                    populateInteractiveMap(state, interactiveMap)
                    this._previewBusy = false
                    if (this._previewQueued) {
                        this.render()
                    }
                }, 0)
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
            shapeTypes: [{ id: 'rect' }]
        })
        const result = await bridge.runActions(
            [
                { action: 'clear_items' },
                { action: 'add_item', itemType: 'text' },
                {
                    action: 'update_item',
                    itemId: 'last',
                    changes: {
                        text: 'Artikelname:\nHammermutter Nut 10 M8\n\nArtikelnummer:\n18123689\n\nLagerplatz:\nR1-S5-F3',
                        fontSize: 18,
                        textBold: false,
                        textUnderline: false
                    }
                },
                { action: 'add_item', itemType: 'qr' },
                { action: 'update_item', itemId: 'last', changes: { data: '18123689', size: 40, xOffset: 140, yOffset: 8 } }
            ],
            { forceRebuild: true, preferredMedia: 'W24' }
        )

        assert.deepEqual(result.errors, [])
        const textItems = state.items.filter((item) => item.type === 'text')
        assert.equal(textItems.length, 6)
        assert.ok(textItems.some((item) => Number(item.xOffset || 0) < -10))
        assert.ok(textItems.some((item) => Number(item.yOffset || 0) > 10))
    })
})
