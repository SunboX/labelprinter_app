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
        const rotation = Math.abs(Number(item.rotation || 0)) % 180
        const isQuarterTurn = Math.abs(rotation - 90) <= 12
        const textLength = Math.max(1, String(item.text || '').length)
        let width = 12
        let height = 12
        if (item.type === 'qr') {
            width = Math.max(1, Number(item.size || item.width || 16))
            height = width
        } else if (item.type === 'barcode') {
            width = Math.max(24, Number(item.width || 120))
            height = Math.max(12, Number(item.height || 24))
        } else {
            const baseWidth = Math.max(12, Math.round(textLength * Math.max(8, Number(item.fontSize || 12)) * 0.58))
            const baseHeight = Math.max(10, Math.round(Math.max(8, Number(item.fontSize || 12)) * 1.08))
            width = isQuarterTurn ? baseHeight : baseWidth
            height = isQuarterTurn ? baseWidth : baseHeight
        }
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
                barcodeShowText: true,
                barcodeModuleWidth: 2,
                barcodeMargin: 8
            })
        },
        addShapeItem(shapeType = 'line') {
            state.items.push({
                id: `generated-${nextId++}`,
                type: 'shape',
                shapeType,
                width: 80,
                height: 1,
                xOffset: 0,
                yOffset: 0,
                rotation: 0,
                strokeWidth: 1
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

    it('ignores broad align actions in rebuild mode when item positions are already explicit', async () => {
        const { bridge, state } = createRuntimeHarness()
        const result = await bridge.runActions(
            [
                { action: 'clear_items' },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { text: 'R', xOffset: 2, yOffset: 2 } },
                { action: 'add_item', itemType: 'barcode' },
                { action: 'update_item', itemId: 'last', changes: { data: 'RW605920024DE', xOffset: 64, yOffset: 18, width: 120, height: 22 } },
                { action: 'select_items', itemIds: ['item-1', 'item-2'] },
                { action: 'align_selected', mode: 'middle', reference: 'label' }
            ],
            { forceRebuild: true }
        )
        assert.deepEqual(result.errors, [])
        assert.equal(state.items.length, 2)
        const textItem = state.items.find((item) => item.type === 'text')
        const barcodeItem = state.items.find((item) => item.type === 'barcode')
        assert.equal(Number(textItem?.xOffset || 0), 2)
        assert.equal(Number(textItem?.yOffset || 0), 2)
        assert.equal(Number(barcodeItem?.xOffset || 0), 64)
        assert.equal(Number(barcodeItem?.yOffset || 0), 18)
    })

    it('infers rebuild mode from clear+add plans and still ignores broad align drift', async () => {
        const { bridge, state } = createRuntimeHarness()
        const result = await bridge.runActions([
            { action: 'clear_items' },
            { action: 'add_item', itemType: 'text' },
            { action: 'update_item', itemId: 'last', changes: { text: 'R', xOffset: 2, yOffset: 2 } },
            { action: 'add_item', itemType: 'barcode' },
            { action: 'update_item', itemId: 'last', changes: { data: 'RW605920024DE', xOffset: 64, yOffset: 18, width: 120, height: 22 } },
            { action: 'select_items', itemIds: ['item-1', 'item-2'] },
            { action: 'align_selected', mode: 'middle', reference: 'label' }
        ])
        assert.deepEqual(result.errors, [])
        assert.equal(state.items.length, 2)
        const textItem = state.items.find((item) => item.type === 'text')
        const barcodeItem = state.items.find((item) => item.type === 'barcode')
        assert.equal(Number(textItem?.xOffset || 0), 2)
        assert.equal(Number(textItem?.yOffset || 0), 2)
        assert.equal(Number(barcodeItem?.xOffset || 0), 64)
        assert.equal(Number(barcodeItem?.yOffset || 0), 18)
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
            mediaLengthMm: 130,
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

    it('applies deterministic barcode template for side-text + big-letter barcode labels', async () => {
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
                    rotation: 0
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
            addQrItem() {},
            addImageItem() {},
            addIconItem() {},
            addShapeItem() {},
            setSelectedItemIds(ids) {
                selectedIds.splice(0, selectedIds.length, ...(Array.isArray(ids) ? ids : []))
            },
            render() {}
        }
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
            shapeTypes: [{ id: 'rect' }]
        })
        const result = await bridge.runActions(
            [
                { action: 'clear_items' },
                { action: 'add_item', itemType: 'text' },
                {
                    action: 'update_item',
                    itemId: 'item-1',
                    changes: {
                        text: 'RW 60 592 002 4DE',
                        fontSize: 18,
                        textBold: true,
                        xOffset: 60,
                        yOffset: 2
                    }
                },
                { action: 'add_item', itemType: 'barcode' },
                {
                    action: 'update_item',
                    itemId: 'last',
                    changes: {
                        data: 'RW605920024DE',
                        barcodeFormat: 'CODE128',
                        width: 200,
                        height: 28,
                        xOffset: 60,
                        yOffset: 22,
                        barcodeShowText: false
                    }
                },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { text: 'R', fontSize: 36, textBold: true, xOffset: 8, yOffset: 0 } },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { text: 'ET 912-657-800', fontSize: 10, rotation: -90, xOffset: 0, yOffset: 2 } }
            ],
            { forceRebuild: true, preferredMedia: 'W24' }
        )

        assert.deepEqual(result.errors, [])
        assert.equal(state.items.length, 4)

        const textItems = state.items.filter((item) => item.type === 'text')
        const barcodeItem = state.items.find((item) => item.type === 'barcode')
        const bigLetterItem = textItems.find((item) => String(item.text || '').trim() === 'R')
        const sideTextItem = textItems.find((item) => String(item.text || '').includes('ET'))
        const codeTextItem = textItems.find((item) => String(item.text || '').includes('RW 60 592 002 4DE'))

        assert.ok(bigLetterItem)
        assert.ok(sideTextItem)
        assert.ok(codeTextItem)
        assert.ok(barcodeItem)
        assert.equal(Boolean(codeTextItem?.textUnderline), true)
        assert.equal(Boolean(bigLetterItem?.textBold), true)
        assert.equal(Math.abs(Number(sideTextItem?.rotation || 0)), 90)
        assert.ok(Number(barcodeItem?.width || 0) > Number(barcodeItem?.height || 0))
        assert.equal(state.mediaLengthMm, null)

        populateInteractiveMap(state, interactiveMap)
        const sideBounds = interactiveMap.get(sideTextItem.id)?.bounds
        const bigBounds = interactiveMap.get(bigLetterItem.id)?.bounds
        const codeBounds = interactiveMap.get(codeTextItem.id)?.bounds
        const barcodeBounds = interactiveMap.get(barcodeItem.id)?.bounds
        assert.ok(sideBounds && bigBounds && codeBounds && barcodeBounds)
        assert.ok(sideBounds.y >= 0)
        assert.ok(sideBounds.y + sideBounds.height <= 128)
        assert.ok(sideBounds.x <= bigBounds.x)
        assert.ok(bigBounds.x < codeBounds.x)
        assert.ok(codeBounds.x - (bigBounds.x + bigBounds.width) >= 24)
        assert.ok(codeBounds.y < barcodeBounds.y)
        assert.ok(bigBounds.y + bigBounds.height >= 96)
        assert.ok(barcodeBounds.y + barcodeBounds.height <= 124)
        assert.ok(barcodeBounds.width >= codeBounds.width * 0.85)
    })

    it('applies barcode template when AI returns one multiline text item plus barcode and helper line shape', async () => {
        const { bridge, state } = createRuntimeHarness()
        const result = await bridge.runActions(
            [
                { action: 'clear_items' },
                { action: 'add_item', itemType: 'text' },
                {
                    action: 'update_item',
                    itemId: 'item-1',
                    changes: {
                        text: 'ET 912-657-800\n\nR\n\nRW 60 592 002 4DE',
                        xOffset: 2,
                        yOffset: 2,
                        fontSize: 24,
                        textBold: true
                    }
                },
                { action: 'add_item', itemType: 'barcode' },
                {
                    action: 'update_item',
                    target: 'last',
                    changes: {
                        data: 'RW605920024DE',
                        barcodeFormat: 'CODE128',
                        barcodeShowText: false,
                        width: 90,
                        height: 22,
                        xOffset: 34,
                        yOffset: 20
                    }
                },
                { action: 'add_item', itemType: 'shape', shapeType: 'line' },
                { action: 'update_item', target: 'last', changes: { width: 110, height: 1, xOffset: 0, yOffset: 46 } }
            ],
            { forceRebuild: true, preferredMedia: 'W24' }
        )

        assert.deepEqual(result.errors, [])
        assert.equal(state.items.filter((item) => item.type === 'shape').length, 0)
        assert.equal(state.items.filter((item) => item.type === 'barcode').length, 1)
        assert.equal(state.items.filter((item) => item.type === 'text').length, 3)

        const sideText = state.items.find((item) => item.type === 'text' && String(item.text || '').includes('ET 912-657-800'))
        const bigLetter = state.items.find((item) => item.type === 'text' && String(item.text || '').trim() === 'R')
        const codeText = state.items.find((item) => item.type === 'text' && String(item.text || '').includes('RW 60 592 002 4DE'))
        const barcode = state.items.find((item) => item.type === 'barcode')

        assert.ok(sideText)
        assert.ok(bigLetter)
        assert.ok(codeText)
        assert.ok(barcode)
        assert.equal(Math.abs(Number(sideText?.rotation || 0)), 90)
        assert.equal(Boolean(codeText?.textUnderline), true)
        assert.equal(Boolean(bigLetter?.textBold), true)
    })

    it('applies barcode template without side text and keeps big-letter block on the left', async () => {
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
                    rotation: 0
                })
            },
            addBarcodeItem() {
                state.items.push({
                    id: `generated-${nextId++}`,
                    type: 'barcode',
                    data: '',
                    width: 200,
                    height: 28,
                    xOffset: 0,
                    yOffset: 0,
                    rotation: 0,
                    barcodeFormat: 'code128',
                    barcodeShowText: false,
                    barcodeModuleWidth: 1,
                    barcodeMargin: 0
                })
            },
            addQrItem() {},
            addImageItem() {},
            addIconItem() {},
            addShapeItem() {},
            setSelectedItemIds(ids) {
                selectedIds.splice(0, selectedIds.length, ...(Array.isArray(ids) ? ids : []))
            },
            render() {}
        }
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
            shapeTypes: [{ id: 'rect' }]
        })
        const result = await bridge.runActions(
            [
                { action: 'clear_items' },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { text: 'RW 60 592 002 4DE', fontSize: 18, textBold: true } },
                { action: 'add_item', itemType: 'barcode' },
                {
                    action: 'update_item',
                    itemId: 'last',
                    changes: {
                        data: 'RW605920024DE',
                        barcodeFormat: 'CODE128',
                        width: 200,
                        height: 28,
                        barcodeShowText: false
                    }
                },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { text: 'R', fontSize: 40, textBold: true } }
            ],
            { forceRebuild: true, preferredMedia: 'W24' }
        )

        assert.deepEqual(result.errors, [])
        assert.equal(state.items.length, 3)
        const textItems = state.items.filter((item) => item.type === 'text')
        const bigLetterItem = textItems.find((item) => String(item.text || '').trim() === 'R')
        const codeTextItem = textItems.find((item) => String(item.text || '').includes('RW 60 592 002 4DE'))
        const barcodeItem = state.items.find((item) => item.type === 'barcode')
        assert.ok(bigLetterItem)
        assert.ok(codeTextItem)
        assert.ok(barcodeItem)

        populateInteractiveMap(state, interactiveMap)
        const bigBounds = interactiveMap.get(bigLetterItem.id)?.bounds
        const codeBounds = interactiveMap.get(codeTextItem.id)?.bounds
        const barcodeBounds = interactiveMap.get(barcodeItem.id)?.bounds
        assert.ok(bigBounds && codeBounds && barcodeBounds)
        assert.ok(bigBounds.x <= 8)
        assert.ok(codeBounds.x - (bigBounds.x + bigBounds.width) >= 24)
        assert.ok(barcodeBounds.x >= bigBounds.x + bigBounds.width)
        assert.ok(codeBounds.y < barcodeBounds.y)
        assert.ok(bigBounds.y + bigBounds.height >= 96)
        assert.ok(barcodeBounds.y + barcodeBounds.height <= 124)
    })
})
