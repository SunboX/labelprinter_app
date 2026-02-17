import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AiActionBridge } from '../src/ui/AiActionBridge.mjs'
import { RotationUtils } from '../src/RotationUtils.mjs'

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
 * Populates centered bounds while respecting quarter-turn rotation extents.
 * @param {{ items: Array<Record<string, any>> }} state
 * @param {Map<string, { bounds: { x: number, y: number, width: number, height: number } }>} map
 * @param {{ width?: number, height?: number }} [previewSize]
 */
function populateInteractiveMapCenteredRotated(state, map, previewSize = {}) {
    map.clear()
    const previewWidth = Math.max(120, Number(previewSize.width || 220))
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

function createRuntimeHarness({ asyncRender = false, mapPopulator = populateInteractiveMap } = {}) {
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
        _previewBusy: false,
        _previewQueued: false,
        _interactiveItemsById: interactiveMap,
        els: {
            preview: {
                width: 220,
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
            return { changed: false, reason: 'no-selection', count: 0 }
        },
        render() {
            if (!asyncRender) {
                mapPopulator(state, interactiveMap, this.els.preview)
                return
            }
            if (this._previewBusy) {
                this._previewQueued = true
                return
            }
            this._previewBusy = true
            this._previewQueued = false
            setTimeout(() => {
                mapPopulator(state, interactiveMap, this.els.preview)
                this._previewBusy = false
                if (this._previewQueued) this.render()
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
        shapeTypes: [{ id: 'rect' }, { id: 'roundRect' }, { id: 'line' }]
    })

    return { bridge, state, previewRenderer }
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

    it('normalizes the 6-action monolith+rect rebuild into a stable marker layout', async () => {
        const { bridge, state, previewRenderer } = createRuntimeHarness()
        const result = await bridge.runActions(
            [
                { action: 'clear_items' },
                { action: 'add_item', itemType: 'text' },
                {
                    action: 'update_item',
                    itemId: 'last',
                    changes: {
                        text: 'EINSCHREIBEN INTERNATIONAL\n(Recommande)\n\n☐ RUCKSCHEIN\n(Avis de reception)',
                        fontSize: 16,
                        textItalic: true,
                        xOffset: 4,
                        yOffset: 2
                    }
                },
                { action: 'add_item', itemType: 'shape', shapeType: 'rect' },
                {
                    action: 'update_item',
                    itemId: 'last',
                    changes: {
                        width: 14,
                        height: 14,
                        strokeWidth: 2,
                        xOffset: 4,
                        yOffset: 24
                    }
                }
            ],
            { forceRebuild: true, preferredMedia: 'W24' }
        )

        assert.deepEqual(result.errors, [])
        assert.deepEqual(result.warnings, [])
        assert.equal(state.items.filter((item) => item.type === 'text').length, 2)
        assert.equal(state.items.filter((item) => item.type === 'shape').length, 1)
        assert.equal(state.items.length, 3)

        const headingItem = state.items.find((item) => item.type === 'text' && String(item.text || '').includes('EINSCHREIBEN'))
        const optionItem = state.items.find((item) => item.type === 'text' && String(item.text || '').includes('RUCKSCHEIN'))
        const checkboxItem = state.items.find((item) => item.type === 'shape')
        assert.ok(headingItem)
        assert.ok(optionItem)
        assert.ok(checkboxItem)
        assert.ok(String(optionItem?.text || '').includes('(Avis de reception)'))
        assert.equal(String(headingItem?.positionMode || 'flow'), 'absolute')
        assert.equal(String(optionItem?.positionMode || 'flow'), 'absolute')
        assert.equal(String(checkboxItem?.positionMode || 'flow'), 'absolute')
        assert.equal(String(optionItem?.text || '').includes('☐'), false)
        assert.equal(String(optionItem?.text || '').includes('□'), false)

        populateInteractiveMap(state, previewRenderer._interactiveItemsById)
        const headingBounds = previewRenderer._interactiveItemsById.get(headingItem.id)?.bounds
        const optionBounds = previewRenderer._interactiveItemsById.get(optionItem.id)?.bounds
        const checkboxBounds = previewRenderer._interactiveItemsById.get(checkboxItem.id)?.bounds
        assert.ok(headingBounds)
        assert.ok(optionBounds)
        assert.ok(checkboxBounds)
        assert.ok(
            Number(optionBounds.y || 0) >= Number(headingBounds.y || 0) + 2,
            'option text should remain below heading text in runtime harness bounds'
        )
        assert.ok(
            Number(checkboxBounds.x || 0) + Number(checkboxBounds.width || 0) <= Number(optionBounds.x || 0),
            'marker shape should stay left of option text'
        )
    })

    it('normalizes separate square shape + two text items into marker pairing layout', async () => {
        const { bridge, state, previewRenderer } = createRuntimeHarness()
        const result = await bridge.runActions(
            [
                { action: 'clear_items' },
                { action: 'add_item', itemType: 'shape', shapeType: 'rect' },
                { action: 'update_item', itemId: 'last', changes: { width: 8, height: 8, strokeWidth: 1, xOffset: 2, yOffset: 20 } },
                { action: 'add_item', itemType: 'text' },
                {
                    action: 'update_item',
                    itemId: 'last',
                    changes: {
                        text: 'EINSCHREIBEN INTERNATIONAL\n(Recommande)',
                        fontFamily: 'Sans',
                        fontSize: 12,
                        textItalic: true,
                        xOffset: 15,
                        yOffset: 4
                    }
                },
                { action: 'add_item', itemType: 'text' },
                {
                    action: 'update_item',
                    itemId: 'last',
                    changes: {
                        text: 'RUCKSCHEIN\n(Avis de reception)',
                        fontFamily: 'Sans',
                        fontSize: 11,
                        xOffset: 15,
                        yOffset: 24
                    }
                }
            ],
            { forceRebuild: true, preferredMedia: 'W24' }
        )

        assert.deepEqual(result.errors, [])
        assert.equal(state.items.filter((item) => item.type === 'text').length, 2)
        assert.equal(state.items.filter((item) => item.type === 'shape').length, 1)

        const headingItem = state.items.find((item) => item.type === 'text' && String(item.text || '').includes('EINSCHREIBEN'))
        const optionItem = state.items.find((item) => item.type === 'text' && String(item.text || '').includes('RUCKSCHEIN'))
        const checkboxItem = state.items.find((item) => item.type === 'shape')
        assert.ok(headingItem)
        assert.ok(optionItem)
        assert.ok(checkboxItem)
        assert.equal(String(headingItem?.positionMode || 'flow'), 'absolute')
        assert.equal(String(optionItem?.positionMode || 'flow'), 'absolute')
        assert.equal(String(checkboxItem?.positionMode || 'flow'), 'absolute')

        populateInteractiveMap(state, previewRenderer._interactiveItemsById)
        const headingBounds = previewRenderer._interactiveItemsById.get(headingItem.id)?.bounds
        const optionBounds = previewRenderer._interactiveItemsById.get(optionItem.id)?.bounds
        const checkboxBounds = previewRenderer._interactiveItemsById.get(checkboxItem.id)?.bounds
        assert.ok(headingBounds)
        assert.ok(optionBounds)
        assert.ok(checkboxBounds)
        assert.ok(
            Number(optionBounds.y || 0) >= Number(headingBounds.y || 0) + 2,
            'option text should remain below heading text in runtime harness bounds'
        )
        assert.ok(
            Number(checkboxBounds.x || 0) + Number(checkboxBounds.width || 0) <= Number(optionBounds.x || 0),
            'marker shape should stay left of option text'
        )
    })

    it('compacts oversized marker typography during rebuild to avoid approximate placement warnings', async () => {
        const { bridge, state, previewRenderer } = createRuntimeHarness()
        const result = await bridge.runActions(
            [
                { action: 'clear_items' },
                { action: 'add_item', itemType: 'text' },
                {
                    action: 'update_item',
                    itemId: 'last',
                    changes: {
                        text: 'EINSCHREIBEN INTERNATIONAL\n(Recommandé)',
                        fontFamily: 'Barlow',
                        fontSize: 18,
                        textItalic: true,
                        xOffset: 8,
                        yOffset: 2
                    }
                },
                { action: 'add_item', itemType: 'shape', shapeType: 'rect' },
                {
                    action: 'update_item',
                    itemId: 'last',
                    changes: {
                        width: 14,
                        height: 14,
                        strokeWidth: 2,
                        xOffset: 8,
                        yOffset: 26
                    }
                },
                { action: 'add_item', itemType: 'text' },
                {
                    action: 'update_item',
                    itemId: 'last',
                    changes: {
                        text: 'RÜCKSCHEIN\n(Avis de réception)',
                        fontFamily: 'Barlow',
                        fontSize: 16,
                        xOffset: 28,
                        yOffset: 24
                    }
                }
            ],
            { forceRebuild: true, preferredMedia: 'W24' }
        )

        assert.deepEqual(result.errors, [])
        assert.equal(result.warnings.includes('assistant.warningNormalizationPlacementApproximate'), false)

        const headingItem = state.items.find((item) => item.type === 'text' && String(item.text || '').includes('EINSCHREIBEN'))
        const optionItem = state.items.find((item) => item.type === 'text' && String(item.text || '').includes('RÜCKSCHEIN'))
        const markerItem = state.items.find((item) => item.type === 'shape')
        assert.ok(headingItem)
        assert.ok(optionItem)
        assert.ok(markerItem)
        assert.ok(Number(headingItem.fontSize || 0) <= 17)
        assert.ok(Number(optionItem.fontSize || 0) <= 15)
        assert.ok(Number(markerItem.width || 0) >= 18)

        populateInteractiveMap(state, previewRenderer._interactiveItemsById)
        const headingBounds = previewRenderer._interactiveItemsById.get(headingItem.id)?.bounds
        const optionBounds = previewRenderer._interactiveItemsById.get(optionItem.id)?.bounds
        const markerBounds = previewRenderer._interactiveItemsById.get(markerItem.id)?.bounds
        assert.ok(headingBounds)
        assert.ok(optionBounds)
        assert.ok(markerBounds)
        assert.ok(
            Number(optionBounds.y || 0) >= Number(headingBounds.y || 0) + Number(headingBounds.height || 0) + 4,
            'option text should remain below heading after compaction'
        )
        assert.ok(
            Number(markerBounds.x || 0) + Number(markerBounds.width || 0) <= Number(optionBounds.x || 0),
            'marker shape should remain left of option text'
        )
        assert.ok(Number(markerBounds.x || 0) >= 11, 'marker should keep a visible left margin from the tape edge')
        assert.ok(
            Number(optionBounds.x || 0) - (Number(markerBounds.x || 0) + Number(markerBounds.width || 0)) >= 8,
            'marker and option text should keep a visible horizontal gap'
        )
    })

    it('keeps barcode + text compositions intact without specialized template branching', async () => {
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
        assert.ok(state.items.some((item) => item.type === 'barcode'))
        assert.ok(state.items.some((item) => item.type === 'text'))
        assert.ok(state.items.length >= 2)
    })

    it('stabilizes absolute barcode-photo rebuild layouts from sketch actions', async () => {
        const { bridge, state, previewRenderer } = createRuntimeHarness({
            mapPopulator: populateInteractiveMapCenteredRotated
        })
        previewRenderer.els.preview.width = 320
        const result = await bridge.runActions(
            [
                { action: 'clear_items' },
                { action: 'add_item', itemType: 'text' },
                {
                    action: 'update_item',
                    itemId: 'last',
                    changes: {
                        positionMode: 'absolute',
                        xOffset: 6,
                        yOffset: 0,
                        rotation: 90,
                        text: 'ET 912-657-800',
                        fontFamily: 'Barlow',
                        fontSize: 12,
                        textBold: false
                    }
                },
                { action: 'add_item', itemType: 'text' },
                {
                    action: 'update_item',
                    itemId: 'last',
                    changes: {
                        positionMode: 'absolute',
                        xOffset: 22,
                        yOffset: 0,
                        rotation: 0,
                        text: 'R',
                        fontFamily: 'Barlow',
                        fontSize: 54,
                        textBold: true
                    }
                },
                { action: 'add_item', itemType: 'text' },
                {
                    action: 'update_item',
                    itemId: 'last',
                    changes: {
                        positionMode: 'absolute',
                        xOffset: 86,
                        yOffset: -18,
                        rotation: 0,
                        text: 'RW 60 592 002 4DE',
                        fontFamily: 'Barlow',
                        fontSize: 14,
                        textBold: true
                    }
                },
                { action: 'add_item', itemType: 'barcode' },
                {
                    action: 'update_item',
                    itemId: 'last',
                    changes: {
                        positionMode: 'absolute',
                        xOffset: 92,
                        yOffset: 14,
                        rotation: 0,
                        data: 'RW605920024DE',
                        barcodeFormat: 'CODE128',
                        barcodeShowText: false,
                        width: 190,
                        height: 32,
                        barcodeModuleWidth: 1,
                        barcodeMargin: 0
                    }
                }
            ],
            { forceRebuild: true, preferredMedia: 'W24' }
        )

        assert.deepEqual(result.errors, [])
        assert.equal(result.warnings.includes('assistant.warningNormalizationLowConfidence'), false)
        const sideText = state.items.find((item) => item.type === 'text' && Number(item.rotation || 0) === 90)
        const bigLetter = state.items.find(
            (item) => item.type === 'text' && Number(item.rotation || 0) === 0 && String(item.text || '').trim() === 'R'
        )
        const codeText = state.items.find(
            (item) => item.type === 'text' && String(item.text || '').includes('RW 60 592 002 4DE')
        )
        const barcode = state.items.find((item) => item.type === 'barcode')
        assert.ok(sideText)
        assert.ok(bigLetter)
        assert.ok(codeText)
        assert.ok(barcode)
        assert.ok(Number(bigLetter.fontSize || 0) >= 58, 'single-letter token should be upsized to prominence floor on W24')
        assert.ok(Number(barcode.width || 0) >= 240, 'barcode width should be upsized to prominence floor on W24')
        assert.ok(Number(barcode.height || 0) >= 40, 'barcode height should be upsized to prominence floor on W24')
        populateInteractiveMapCenteredRotated(state, previewRenderer._interactiveItemsById, previewRenderer.els.preview)
        const sideBounds = previewRenderer._interactiveItemsById.get(sideText.id)?.bounds
        const bigLetterBounds = previewRenderer._interactiveItemsById.get(bigLetter.id)?.bounds
        const codeBounds = previewRenderer._interactiveItemsById.get(codeText.id)?.bounds
        const barcodeBounds = previewRenderer._interactiveItemsById.get(barcode.id)?.bounds
        assert.ok(sideBounds)
        assert.ok(bigLetterBounds)
        assert.ok(codeBounds)
        assert.ok(barcodeBounds)
        const sideRight = Number(sideBounds.x || 0) + Number(sideBounds.width || 0)
        const gutterRightLimit = Math.round(Number(previewRenderer.els.preview.width || 220) * 0.22)
        assert.ok(Number(sideBounds.x || 0) >= -0.5, 'rotated side text should stay inside the left edge')
        assert.ok(sideRight <= Number(bigLetterBounds.x || 0) - 5.5, 'rotated side text should remain left of the token column')
        assert.ok(sideRight <= gutterRightLimit + 1.5, 'rotated side text should remain inside left gutter band')
        assert.ok(Number(codeBounds.y || 0) <= Math.round(Number(previewRenderer.els.preview.height || 128) * 0.55), 'code text should stay near upper rows')
        assert.ok(
            Number(barcodeBounds.y || 0) <= Math.round(Number(previewRenderer.els.preview.height || 128) * 0.68) + 1,
            'barcode should not be pushed into lower rows'
        )
        const codeToBarcodeGap = Number(barcodeBounds.y || 0) - (Number(codeBounds.y || 0) + Number(codeBounds.height || 0))
        assert.ok(codeToBarcodeGap >= 8 && codeToBarcodeGap <= 22, 'barcode should remain below code text with fidelity gap')
        assert.ok(
            Math.abs(Number(barcodeBounds.x || 0) - Number(codeBounds.x || 0)) <= 24,
            'barcode should remain in the same visual column as the code text'
        )
    })

    it('emits low-confidence warning when normalization can only apply coarse cleanup', async () => {
        const { bridge } = createRuntimeHarness()
        const result = await bridge.runActions(
            [
                { action: 'clear_items' },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { text: 'Header\nBody line one\nBody line two\nFooter line' } },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { text: 'Header' } },
                { action: 'add_item', itemType: 'text' },
                { action: 'update_item', itemId: 'last', changes: { text: 'Body line one' } }
            ],
            { forceRebuild: true }
        )

        assert.deepEqual(result.errors, [])
        assert.ok(Array.isArray(result.warnings))
        assert.ok(result.warnings.includes('assistant.warningNormalizationLowConfidence'))
    })

    it('waits for async preview snapshots while running normalization', async () => {
        const { bridge, state } = createRuntimeHarness({ asyncRender: true })
        const result = await bridge.runActions(
            [
                { action: 'clear_items' },
                { action: 'add_item', itemType: 'text' },
                {
                    action: 'update_item',
                    itemId: 'last',
                    changes: {
                        text: 'EINSCHREIBEN INTERNATIONAL\n(Recommande)\n\n☐ RUCKSCHEIN\n(Avis de reception)',
                        fontSize: 16,
                        textItalic: true,
                        xOffset: 4,
                        yOffset: 2
                    }
                }
            ],
            { forceRebuild: true, preferredMedia: 'W24' }
        )

        assert.deepEqual(result.errors, [])
        assert.equal(state.items.filter((item) => item.type === 'text').length, 2)
        assert.equal(state.items.filter((item) => item.type === 'shape').length, 1)
    })
})
