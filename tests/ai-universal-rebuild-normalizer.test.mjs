import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AiUniversalRebuildNormalizer } from '../src/ui/AiUniversalRebuildNormalizer.mjs'
import { RotationUtils } from '../src/RotationUtils.mjs'

/**
 * Populates deterministic interactive bounds for flow-based items.
 * @param {{ items: Array<Record<string, any>> }} state
 * @param {Map<string, { bounds: { x: number, y: number, width: number, height: number } }>} map
 */
function populateInteractiveMap(state, map) {
    map.clear()
    const feedPadStart = 2
    let flowCursor = feedPadStart
    state.items.forEach((item) => {
        let width = 12
        let height = 12
        if (item.type === 'shape') {
            width = Math.max(4, Number(item.width || 12))
            height = Math.max(4, Number(item.height || 12))
        } else {
            width = Math.max(10, Math.round(String(item.text || '').length * Math.max(8, Number(item.fontSize || 12)) * 0.55))
            height = Math.max(10, Math.round(Math.max(8, Number(item.fontSize || 12)) * 1.1))
        }
        const isFlow = String(item.positionMode || 'flow').toLowerCase() !== 'absolute'
        const xBase = isFlow ? flowCursor : feedPadStart
        map.set(item.id, {
            bounds: {
                x: xBase + Number(item.xOffset || 0),
                y: Number(item.yOffset || 0),
                width,
                height
            }
        })
        if (isFlow) {
            flowCursor += width
        }
    })
}

/**
 * Populates deterministic interactive bounds anchored directly from item offsets.
 * @param {{ items: Array<Record<string, any>> }} state
 * @param {Map<string, { bounds: { x: number, y: number, width: number, height: number } }>} map
 */
function populateInteractiveMapAbsolute(state, map) {
    map.clear()
    const feedPadStart = 2
    state.items.forEach((item) => {
        const lines = String(item.text || '')
            .replace(/\r/g, '')
            .split('\n')
        const nonEmptyLineCount = Math.max(1, lines.filter((line) => String(line || '').trim()).length)
        let width = 12
        let height = 12
        if (item.type === 'shape') {
            width = Math.max(4, Number(item.width || 12))
            height = Math.max(4, Number(item.height || 12))
        } else {
            const textLength = Math.max(1, ...lines.map((line) => String(line || '').length))
            width = Math.max(10, Math.round(textLength * Math.max(8, Number(item.fontSize || 12)) * 0.58))
            height = Math.max(10, Math.round(Math.max(8, Number(item.fontSize || 12)) * 1.08 * nonEmptyLineCount))
        }
        map.set(item.id, {
            bounds: {
                x: feedPadStart + Number(item.xOffset || 0),
                y: Number(item.yOffset || 0),
                width,
                height
            }
        })
    })
}

/**
 * Populates bounds using centered cross-axis placement similar to preview rendering.
 * @param {{ items: Array<Record<string, any>> }} state
 * @param {Map<string, { bounds: { x: number, y: number, width: number, height: number } }>} map
 * @param {{ width?: number, height?: number }} [previewSize]
 */
function populateInteractiveMapCentered(state, map, previewSize = {}) {
    map.clear()
    const previewWidth = Math.max(120, Number(previewSize.width || 460))
    const previewHeight = Math.max(48, Number(previewSize.height || 128))
    const feedPadStart = 2
    state.items.forEach((item) => {
        const lines = String(item.text || '')
            .replace(/\r/g, '')
            .split('\n')
        const nonEmptyLineCount = Math.max(1, lines.filter((line) => String(line || '').trim()).length)
        let width = 12
        let height = 12
        if (item.type === 'shape') {
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
        map.set(item.id, {
            bounds: {
                x: feedPadStart + Number(item.xOffset || 0),
                y: Math.max(0, Math.round((previewHeight - height) / 2 + Number(item.yOffset || 0))),
                width,
                height
            }
        })
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
    const previewWidth = Math.max(120, Number(previewSize.width || 460))
    const previewHeight = Math.max(48, Number(previewSize.height || 128))
    const feedPadStart = 2
    state.items.forEach((item) => {
        const lines = String(item.text || '')
            .replace(/\r/g, '')
            .split('\n')
        const nonEmptyLineCount = Math.max(1, lines.filter((line) => String(line || '').trim()).length)
        let width = 12
        let height = 12
        if (item.type === 'barcode') {
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
 * Populates bounds with intentionally tall multiline text to emulate dense renderer metrics.
 * @param {{ items: Array<Record<string, any>> }} state
 * @param {Map<string, { bounds: { x: number, y: number, width: number, height: number } }>} map
 */
function populateInteractiveMapTallText(state, map) {
    map.clear()
    const feedPadStart = 2
    let flowCursor = feedPadStart
    state.items.forEach((item) => {
        const lines = String(item.text || '')
            .replace(/\r/g, '')
            .split('\n')
        const nonEmptyLineCount = Math.max(1, lines.filter((line) => String(line || '').trim()).length)
        const longestLineLength = Math.max(1, ...lines.map((line) => String(line || '').length))
        let width = 12
        let height = 12
        if (item.type === 'shape') {
            width = Math.max(4, Number(item.width || 12))
            height = Math.max(4, Number(item.height || 12))
        } else {
            width = Math.max(10, Math.round(longestLineLength * Math.max(8, Number(item.fontSize || 12)) * 0.56))
            height = Math.max(10, Math.round(Math.max(8, Number(item.fontSize || 12)) * 1.7 * nonEmptyLineCount))
        }
        const isFlow = String(item.positionMode || 'flow').toLowerCase() !== 'absolute'
        const xBase = isFlow ? flowCursor : feedPadStart
        map.set(item.id, {
            bounds: {
                x: xBase + Number(item.xOffset || 0),
                y: Number(item.yOffset || 0),
                width,
                height
            }
        })
        if (isFlow) {
            flowCursor += width
        }
    })
}

describe('ai-universal-rebuild-normalizer', () => {
    it('rewrites marker monolith text into heading + option + marker shape', async () => {
        const state = {
            items: [
                {
                    id: 'text-1',
                    type: 'text',
                    text: 'EINSCHREIBEN INTERNATIONAL\n(Recommande)\n\n☐ RUCKSCHEIN\n(Avis de reception)',
                    xOffset: 4,
                    yOffset: 2,
                    rotation: 0,
                    fontFamily: 'Barlow',
                    fontSize: 16,
                    textItalic: true,
                    textBold: false,
                    textUnderline: false,
                    textStrikethrough: false
                }
            ]
        }
        const map = new Map()
        const previewRenderer = {
            _interactiveItemsById: map,
            els: {
                preview: {
                    width: 220,
                    height: 128
                }
            }
        }
        const renderAfterMutation = async () => {
            populateInteractiveMap(state, map)
        }

        const warnings = []
        const result = await AiUniversalRebuildNormalizer.normalize({
            state,
            previewRenderer,
            renderAfterMutation,
            onWarning: (warning) => warnings.push(warning.key)
        })

        assert.equal(result.applied, true)
        assert.equal(state.items.filter((item) => item.type === 'text').length, 2)
        assert.equal(state.items.filter((item) => item.type === 'shape').length, 1)
        assert.ok(
            state.items.every((item) => String(item.positionMode || 'flow') === 'absolute'),
            'rewritten marker groups should use absolute positioning'
        )
        const headingItem = state.items.find((item) => item.type === 'text' && String(item.text || '').includes('EINSCHREIBEN'))
        const optionItem = state.items.find((item) => item.type === 'text' && String(item.text || '').includes('RUCKSCHEIN'))
        assert.ok(headingItem)
        assert.ok(optionItem)
        assert.equal(Boolean(headingItem?.textItalic), true)
        assert.equal(Boolean(optionItem?.textItalic), false)
        assert.ok(
            Number(optionItem?.fontSize || 0) < Number(headingItem?.fontSize || 0),
            'option text should be slightly smaller than heading text after split'
        )
        assert.equal(String(optionItem?.text || '').includes('☐'), false)
        assert.equal(String(optionItem?.text || '').includes('□'), false)
        populateInteractiveMap(state, map)
        const headingBounds = map.get(headingItem.id)?.bounds
        const optionBounds = map.get(optionItem.id)?.bounds
        assert.ok(headingBounds)
        assert.ok(optionBounds)
        assert.ok(
            Number(optionBounds.y || 0) >= Number(headingBounds.y || 0) + Number(headingBounds.height || 0) + 6,
            'option block should keep visible gap below heading block'
        )
        assert.ok(Array.isArray(warnings))
    })

    it('pairs existing square shape markers with option text in two-text layouts', async () => {
        const state = {
            items: [
                {
                    id: 'shape-1',
                    type: 'shape',
                    shapeType: 'rect',
                    width: 10,
                    height: 10,
                    strokeWidth: 1,
                    xOffset: 3,
                    yOffset: 22,
                    rotation: 0
                },
                {
                    id: 'text-1',
                    type: 'text',
                    text: 'EINSCHREIBEN INTERNATIONAL\n(Recommande)',
                    xOffset: 15,
                    yOffset: 4,
                    rotation: 0,
                    fontFamily: 'Sans',
                    fontSize: 12,
                    textItalic: true,
                    textBold: false,
                    textUnderline: false,
                    textStrikethrough: false
                },
                {
                    id: 'text-2',
                    type: 'text',
                    text: 'RUCKSCHEIN\n(Avis de reception)',
                    xOffset: 15,
                    yOffset: 24,
                    rotation: 0,
                    fontFamily: 'Sans',
                    fontSize: 11,
                    textItalic: false,
                    textBold: false,
                    textUnderline: false,
                    textStrikethrough: false
                }
            ]
        }
        const map = new Map()
        const previewRenderer = {
            _interactiveItemsById: map,
            els: {
                preview: {
                    width: 240,
                    height: 128
                }
            }
        }
        const renderAfterMutation = async () => {
            populateInteractiveMap(state, map)
        }

        const result = await AiUniversalRebuildNormalizer.normalize({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(result.applied, true)
        assert.equal(state.items.filter((item) => item.type === 'text').length, 2)
        assert.equal(state.items.filter((item) => item.type === 'shape').length, 1)
        assert.ok(
            state.items.every((item) => String(item.positionMode || 'flow') === 'absolute'),
            'marker-paired rewrites should use absolute positioning'
        )

        populateInteractiveMap(state, map)
        const optionItem = state.items.find((item) => item.type === 'text' && String(item.text || '').includes('RUCKSCHEIN'))
        const marker = state.items.find((item) => item.type === 'shape')
        assert.ok(optionItem)
        assert.ok(marker)
        assert.ok(String(optionItem?.text || '').includes('(Avis de reception)'))
        const optionBounds = map.get(optionItem.id)?.bounds
        const markerBounds = map.get(marker.id)?.bounds
        assert.ok(optionBounds)
        assert.ok(markerBounds)
        assert.ok(Number(markerBounds.x || 0) + Number(markerBounds.width || 0) <= Number(optionBounds.x || 0))
    })

    it('keeps full option text when marker sits near heading continuation lines', async () => {
        const state = {
            items: [
                {
                    id: 'shape-1',
                    type: 'shape',
                    shapeType: 'rect',
                    width: 12,
                    height: 12,
                    strokeWidth: 2,
                    xOffset: 4,
                    yOffset: 26,
                    rotation: 0
                },
                {
                    id: 'text-1',
                    type: 'text',
                    text: 'EINSCHREIBEN INTERNATIONAL\n(Recommandé)',
                    xOffset: 4,
                    yOffset: 2,
                    rotation: 0,
                    fontFamily: 'Barlow',
                    fontSize: 12,
                    textItalic: true,
                    textBold: false,
                    textUnderline: false,
                    textStrikethrough: false
                },
                {
                    id: 'text-2',
                    type: 'text',
                    text: 'RÜCKSCHEIN\n(Avis de réception)',
                    xOffset: 20,
                    yOffset: 22,
                    rotation: 0,
                    fontFamily: 'Barlow',
                    fontSize: 12,
                    textItalic: false,
                    textBold: false,
                    textUnderline: false,
                    textStrikethrough: false
                }
            ]
        }
        const map = new Map()
        const previewRenderer = {
            _interactiveItemsById: map,
            els: {
                preview: {
                    width: 460,
                    height: 128
                }
            }
        }
        const renderAfterMutation = async () => {
            populateInteractiveMapAbsolute(state, map)
        }

        const result = await AiUniversalRebuildNormalizer.normalize({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(result.applied, true)
        const headingItem = state.items.find((item) => item.type === 'text' && String(item.text || '').includes('EINSCHREIBEN'))
        const optionItem = state.items.find((item) => item.type === 'text' && String(item.text || '').includes('RÜCKSCHEIN'))
        const markerItem = state.items.find((item) => item.type === 'shape')
        assert.ok(headingItem)
        assert.ok(optionItem)
        assert.ok(markerItem)
        assert.ok(String(headingItem?.text || '').includes('(Recommandé)'))
        assert.ok(String(optionItem?.text || '').includes('(Avis de réception)'))
        assert.equal(String(optionItem?.text || '').includes('(Recommandé)'), false)
        assert.equal(String(headingItem?.text || '').includes('RÜCKSCHEIN'), false)

        populateInteractiveMapAbsolute(state, map)
        const optionBounds = map.get(optionItem.id)?.bounds
        const markerBounds = map.get(markerItem.id)?.bounds
        assert.ok(optionBounds)
        assert.ok(markerBounds)
        assert.ok(
            Number(markerBounds.x || 0) + Number(markerBounds.width || 0) <= Number(optionBounds.x || 0),
            'marker shape should remain left of preserved option text'
        )
    })

    it('compacts oversized checkbox typography to preserve readable stacked layout', async () => {
        const state = {
            media: 'W24',
            items: [
                {
                    id: 'text-1',
                    type: 'text',
                    text: 'EINSCHREIBEN INTERNATIONAL\n(Recommandé)',
                    xOffset: 8,
                    yOffset: 2,
                    rotation: 0,
                    fontFamily: 'Barlow',
                    fontSize: 18,
                    textItalic: true,
                    textBold: false,
                    textUnderline: false,
                    textStrikethrough: false
                },
                {
                    id: 'shape-1',
                    type: 'shape',
                    shapeType: 'rect',
                    width: 14,
                    height: 14,
                    strokeWidth: 2,
                    xOffset: 8,
                    yOffset: 26,
                    rotation: 0
                },
                {
                    id: 'text-2',
                    type: 'text',
                    text: 'RÜCKSCHEIN\n(Avis de réception)',
                    xOffset: 28,
                    yOffset: 24,
                    rotation: 0,
                    fontFamily: 'Barlow',
                    fontSize: 16,
                    textItalic: false,
                    textBold: false,
                    textUnderline: false,
                    textStrikethrough: false
                }
            ]
        }
        const map = new Map()
        const previewRenderer = {
            _interactiveItemsById: map,
            els: {
                preview: {
                    width: 460,
                    height: 128
                }
            }
        }
        const renderAfterMutation = async () => {
            populateInteractiveMapAbsolute(state, map)
        }

        const result = await AiUniversalRebuildNormalizer.normalize({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(result.applied, true)
        const headingItem = state.items.find((item) => item.type === 'text' && String(item.text || '').includes('EINSCHREIBEN'))
        const optionItem = state.items.find((item) => item.type === 'text' && String(item.text || '').includes('RÜCKSCHEIN'))
        const markerItem = state.items.find((item) => item.type === 'shape')
        assert.ok(headingItem)
        assert.ok(optionItem)
        assert.ok(markerItem)
        assert.ok(Number(headingItem.fontSize || 0) <= 17, 'oversized heading should be compacted on W24')
        assert.ok(Number(optionItem.fontSize || 0) <= 15, 'oversized option text should be compacted on W24')
        assert.ok(Number(markerItem.width || 0) >= 18, 'checkbox marker should stay clearly visible after compaction')

        populateInteractiveMapAbsolute(state, map)
        const headingBounds = map.get(headingItem.id)?.bounds
        const optionBounds = map.get(optionItem.id)?.bounds
        assert.ok(headingBounds)
        assert.ok(optionBounds)
        assert.ok(
            Number(optionBounds.y || 0) >= Number(headingBounds.y || 0) + Number(headingBounds.height || 0) + 4,
            'option block should remain visibly below heading after compaction'
        )
    })

    it('anchors checkbox groups near the top under centered preview geometry', async () => {
        const state = {
            media: 'W24',
            orientation: 'horizontal',
            items: [
                {
                    id: 'text-1',
                    type: 'text',
                    text: 'EINSCHREIBEN INTERNATIONAL\n(Recommandé)',
                    xOffset: 8,
                    yOffset: 2,
                    rotation: 0,
                    fontFamily: 'Barlow',
                    fontSize: 18,
                    textItalic: true
                },
                {
                    id: 'shape-1',
                    type: 'shape',
                    shapeType: 'rect',
                    width: 14,
                    height: 14,
                    strokeWidth: 2,
                    xOffset: 8,
                    yOffset: 26,
                    rotation: 0
                },
                {
                    id: 'text-2',
                    type: 'text',
                    text: 'RÜCKSCHEIN\n(Avis de réception)',
                    xOffset: 28,
                    yOffset: 24,
                    rotation: 0,
                    fontFamily: 'Barlow',
                    fontSize: 16
                }
            ]
        }
        const map = new Map()
        const previewRenderer = {
            _interactiveItemsById: map,
            els: { preview: { width: 460, height: 128 } }
        }
        const renderAfterMutation = async () => {
            populateInteractiveMapCentered(state, map, previewRenderer.els.preview)
        }

        const result = await AiUniversalRebuildNormalizer.normalize({
            state,
            previewRenderer,
            renderAfterMutation
        })
        assert.equal(result.applied, true)

        const headingItem = state.items.find((item) => item.type === 'text' && String(item.text || '').includes('EINSCHREIBEN'))
        const optionItem = state.items.find((item) => item.type === 'text' && String(item.text || '').includes('RÜCKSCHEIN'))
        const markerItem = state.items.find((item) => item.type === 'shape')
        assert.ok(headingItem)
        assert.ok(optionItem)
        assert.ok(markerItem)
        assert.ok(Number(headingItem.yOffset || 0) <= -10, 'heading should be nudged upward to avoid large top gap')
        assert.ok(Number(markerItem.width || 0) >= 18, 'marker shape should use a clearly visible square size')

        populateInteractiveMapCentered(state, map, previewRenderer.els.preview)
        const headingBounds = map.get(headingItem.id)?.bounds
        const optionBounds = map.get(optionItem.id)?.bounds
        const markerBounds = map.get(markerItem.id)?.bounds
        assert.ok(headingBounds)
        assert.ok(optionBounds)
        assert.ok(markerBounds)
        assert.ok(Number(headingBounds.y || 0) <= 12, 'heading should sit close to the top margin in preview space')
        assert.ok(Number(headingBounds.y || 0) >= 3, 'top margin should remain visible')
        assert.ok(Number(headingBounds.x || 0) >= 9, 'left margin for heading should remain visible')
        const optionBottom = Number(optionBounds.y || 0) + Number(optionBounds.height || 0)
        assert.ok(optionBottom <= Number(previewRenderer.els.preview.height || 128) - 3, 'bottom margin should remain visible')
        const stackGap = Number(optionBounds.y || 0) - (Number(headingBounds.y || 0) + Number(headingBounds.height || 0))
        assert.ok(stackGap >= 5, 'stack gap should remain readable')
        assert.ok(stackGap <= 28, 'stack gap should not become excessively large')
        const markerGap = Number(optionBounds.x || 0) - (Number(markerBounds.x || 0) + Number(markerBounds.width || 0))
        assert.ok(markerGap >= 8, 'marker should keep visible gap before option text')
        assert.ok(Number(markerBounds.x || 0) >= 11, 'left margin for marker should remain visible')
        assert.ok(Number(markerBounds.x || 0) + Number(markerBounds.width || 0) <= Number(optionBounds.x || 0))
    })

    it('stacks heading above option when marker monolith and separate option text are both present', async () => {
        const state = {
            items: [
                {
                    id: 'text-1',
                    type: 'text',
                    text: 'EINSCHREIBEN INTERNATIONAL\n(Recommande)\n\n☐ RUCKSCHEIN\n(Avis de reception)',
                    xOffset: 4,
                    yOffset: 2,
                    rotation: 0,
                    fontFamily: 'Sans',
                    fontSize: 16,
                    textItalic: true,
                    textBold: false,
                    textUnderline: false,
                    textStrikethrough: false
                },
                {
                    id: 'shape-1',
                    type: 'shape',
                    shapeType: 'rect',
                    width: 14,
                    height: 14,
                    strokeWidth: 2,
                    xOffset: 4,
                    yOffset: 44,
                    rotation: 0
                },
                {
                    id: 'text-2',
                    type: 'text',
                    text: 'RUCKSCHEIN\n(Avis de reception)',
                    xOffset: 24,
                    yOffset: 40,
                    rotation: 0,
                    fontFamily: 'Sans',
                    fontSize: 16,
                    textItalic: false,
                    textBold: false,
                    textUnderline: false,
                    textStrikethrough: false
                }
            ]
        }
        const map = new Map()
        const previewRenderer = {
            _interactiveItemsById: map,
            els: {
                preview: {
                    width: 460,
                    height: 128
                }
            }
        }
        const renderAfterMutation = async () => {
            populateInteractiveMapAbsolute(state, map)
        }

        const result = await AiUniversalRebuildNormalizer.normalize({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(result.applied, true)
        const textItems = state.items.filter((item) => item.type === 'text')
        assert.equal(textItems.length, 2)
        const headingItem = textItems.find((item) => String(item.text || '').includes('EINSCHREIBEN'))
        const optionItem = textItems.find((item) => String(item.text || '').includes('RUCKSCHEIN'))
        const markerItem = state.items.find((item) => item.type === 'shape')
        assert.ok(headingItem)
        assert.ok(optionItem)
        assert.ok(markerItem)
        assert.equal(String(headingItem?.positionMode || 'flow'), 'absolute')
        assert.equal(String(optionItem?.positionMode || 'flow'), 'absolute')
        assert.equal(String(markerItem?.positionMode || 'flow'), 'absolute')

        populateInteractiveMapAbsolute(state, map)
        const headingBounds = map.get(headingItem.id)?.bounds
        const optionBounds = map.get(optionItem.id)?.bounds
        const markerBounds = map.get(markerItem.id)?.bounds
        assert.ok(headingBounds)
        assert.ok(optionBounds)
        assert.ok(markerBounds)
        assert.ok(
            Number(optionBounds.y || 0) >= Number(headingBounds.y || 0) + Number(headingBounds.height || 0),
            'option text should be stacked below heading text'
        )
        assert.ok(
            Number(markerBounds.x || 0) + Number(markerBounds.width || 0) <= Number(optionBounds.x || 0),
            'marker shape should stay left of option text'
        )
    })

    it('keeps option block near the heading column under tall-text overlap pressure', async () => {
        const state = {
            items: [
                {
                    id: 'text-1',
                    type: 'text',
                    text: 'EINSCHREIBEN INTERNATIONAL\n(Recommandé)\n\n☐ RÜCKSCHEIN\n(Avis de réception)',
                    xOffset: 4,
                    yOffset: 2,
                    rotation: 0,
                    fontFamily: 'Sans',
                    fontSize: 18,
                    textItalic: true,
                    textBold: false,
                    textUnderline: false,
                    textStrikethrough: false
                },
                {
                    id: 'shape-1',
                    type: 'shape',
                    shapeType: 'rect',
                    width: 16,
                    height: 16,
                    strokeWidth: 2,
                    xOffset: 4,
                    yOffset: 38,
                    rotation: 0
                }
            ]
        }
        const map = new Map()
        const previewRenderer = {
            _interactiveItemsById: map,
            els: {
                preview: {
                    width: 460,
                    height: 128
                }
            }
        }
        const renderAfterMutation = async () => {
            populateInteractiveMapTallText(state, map)
        }

        const result = await AiUniversalRebuildNormalizer.normalize({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(result.applied, true)
        const headingItem = state.items.find((item) => item.type === 'text' && String(item.text || '').includes('EINSCHREIBEN'))
        const optionItem = state.items.find((item) => item.type === 'text' && String(item.text || '').includes('RÜCKSCHEIN'))
        const markerItem = state.items.find((item) => item.type === 'shape')
        assert.ok(headingItem)
        assert.ok(optionItem)
        assert.ok(markerItem)
        assert.equal(String(headingItem?.positionMode || 'flow'), 'absolute')
        assert.equal(String(optionItem?.positionMode || 'flow'), 'absolute')
        assert.equal(String(markerItem?.positionMode || 'flow'), 'absolute')

        populateInteractiveMapTallText(state, map)
        const headingBounds = map.get(headingItem.id)?.bounds
        const optionBounds = map.get(optionItem.id)?.bounds
        const markerBounds = map.get(markerItem.id)?.bounds
        assert.ok(headingBounds)
        assert.ok(optionBounds)
        assert.ok(markerBounds)
        assert.ok(
            Number(optionBounds.y || 0) >= Number(headingBounds.y || 0) + Number(headingBounds.height || 0),
            'option text should remain below heading when tall text bounds overlap'
        )
        assert.ok(
            Number(optionBounds.x || 0) <= Number(headingBounds.x || 0) + 40,
            'option text should not drift to far-right fallback placement'
        )
        assert.ok(
            Number(markerBounds.x || 0) + Number(markerBounds.width || 0) <= Number(optionBounds.x || 0),
            'marker shape should remain left of option text'
        )
    })

    it('keeps barcode blocks near their code text instead of drifting far-right during overlap solving', async () => {
        const state = {
            items: [
                {
                    id: 'text-rotated',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'ET 912-657-800',
                    xOffset: 2,
                    yOffset: 0,
                    rotation: 90,
                    fontFamily: 'Barlow',
                    fontSize: 12
                },
                {
                    id: 'text-code',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'RW 60 592 002 4DE',
                    xOffset: 36,
                    yOffset: 2,
                    rotation: 0,
                    fontFamily: 'Barlow',
                    fontSize: 14,
                    textBold: true
                },
                {
                    id: 'barcode-1',
                    type: 'barcode',
                    positionMode: 'absolute',
                    data: 'RW605920024DE',
                    width: 140,
                    height: 18,
                    xOffset: 36,
                    yOffset: 8,
                    rotation: 0
                }
            ]
        }
        const map = new Map()
        const previewRenderer = {
            _interactiveItemsById: map,
            els: {
                preview: {
                    width: 460,
                    height: 128
                }
            }
        }
        const feedPadStart = 2
        const renderAfterMutation = async () => {
            map.clear()
            state.items.forEach((item) => {
                const lines = String(item.text || '')
                    .replace(/\r/g, '')
                    .split('\n')
                const lineCount = Math.max(1, lines.filter((line) => String(line || '').trim()).length)
                const textLength = Math.max(1, ...lines.map((line) => String(line || '').length))
                const rotation = Math.abs(Number(item.rotation || 0)) % 180
                const isQuarterTurn = Math.abs(rotation - 90) <= 12
                let width = 12
                let height = 12
                if (item.type === 'barcode') {
                    width = Math.max(24, Number(item.width || 120))
                    height = Math.max(12, Number(item.height || 24))
                } else {
                    const baseWidth = Math.max(12, Math.round(textLength * Math.max(8, Number(item.fontSize || 12)) * 0.58))
                    const baseHeight = Math.max(10, Math.round(Math.max(8, Number(item.fontSize || 12)) * 1.08 * lineCount))
                    width = isQuarterTurn ? baseHeight : baseWidth
                    height = isQuarterTurn ? baseWidth : baseHeight
                }
                map.set(item.id, {
                    bounds: {
                        x: feedPadStart + Number(item.xOffset || 0),
                        y: Number(item.yOffset || 0),
                        width,
                        height
                    }
                })
            })
        }

        const result = await AiUniversalRebuildNormalizer.normalize({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(result.applied, true)
        await renderAfterMutation()
        const codeBounds = map.get('text-code')?.bounds
        const barcodeBounds = map.get('barcode-1')?.bounds
        assert.ok(codeBounds)
        assert.ok(barcodeBounds)
        assert.ok(
            Number(barcodeBounds.x || 0) <= Number(codeBounds.x || 0) + 24,
            'barcode should stay near the code text column instead of jumping far right'
        )
        assert.ok(
            Number(barcodeBounds.y || 0) >= Number(codeBounds.y || 0),
            'barcode should remain below or aligned with code text after overlap resolution'
        )
    })

    it('uses barcode-photo fidelity pass to prevent downward cascade under centered preview geometry', async () => {
        const state = {
            media: 'W24',
            items: [
                {
                    id: 'text-side',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'ET 912-657-800',
                    xOffset: 6,
                    yOffset: 0,
                    rotation: 90,
                    fontFamily: 'Barlow',
                    fontSize: 12,
                    textBold: false
                },
                {
                    id: 'text-token',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'R',
                    xOffset: 22,
                    yOffset: 0,
                    rotation: 0,
                    fontFamily: 'Barlow',
                    fontSize: 54,
                    textBold: true
                },
                {
                    id: 'text-code',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'RW 60 592 002 4DE',
                    xOffset: 86,
                    yOffset: -18,
                    rotation: 0,
                    fontFamily: 'Barlow',
                    fontSize: 14,
                    textBold: true
                },
                {
                    id: 'barcode-1',
                    type: 'barcode',
                    positionMode: 'absolute',
                    data: 'RW605920024DE',
                    width: 190,
                    height: 32,
                    xOffset: 92,
                    yOffset: 14,
                    rotation: 0
                }
            ]
        }
        const map = new Map()
        const previewRenderer = {
            _interactiveItemsById: map,
            els: {
                preview: {
                    width: 320,
                    height: 128
                }
            }
        }
        const renderAfterMutation = async () => {
            populateInteractiveMapCenteredRotated(state, map, previewRenderer.els.preview)
        }

        await renderAfterMutation()
        const baselineSideBounds = map.get('text-side')?.bounds

        const result = await AiUniversalRebuildNormalizer.normalize({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(
            ['applied-barcode-photo-fidelity', 'barcode-photo-fidelity-no-change'].includes(String(result.reason || '')),
            true,
            'centered barcode-photo rebuild should use fidelity-first normalization'
        )
        assert.equal(result.placementResolved, true)
        await renderAfterMutation()

        const sideBounds = map.get('text-side')?.bounds
        const tokenBounds = map.get('text-token')?.bounds
        const codeBounds = map.get('text-code')?.bounds
        const barcodeBounds = map.get('barcode-1')?.bounds
        assert.ok(sideBounds)
        assert.ok(tokenBounds)
        assert.ok(codeBounds)
        assert.ok(barcodeBounds)
        const tokenItem = state.items.find((item) => item.id === 'text-token')
        const barcodeItem = state.items.find((item) => item.id === 'barcode-1')
        assert.ok(Number(tokenItem?.fontSize || 0) >= 58, 'single-letter token should be upsized to W24 prominence floor')
        assert.ok(Number(barcodeItem?.width || 0) >= 240, 'barcode width should be upsized to W24 prominence floor')
        assert.ok(Number(barcodeItem?.height || 0) >= 40, 'barcode height should be upsized to W24 prominence floor')
        assert.ok(Number(sideBounds.x || 0) >= -0.5, 'side text should remain inside the left boundary')
        const sideRight = Number(sideBounds.x || 0) + Number(sideBounds.width || 0)
        const tokenLeft = Number(tokenBounds.x || 0)
        const codeLeft = Number(codeBounds.x || 0)
        const leftGutterRightLimit = Math.round(Number(previewRenderer.els.preview.width || 220) * 0.22)
        assert.ok(sideRight <= tokenLeft - 5.5, 'rotated side text should stay left of short-token text with visible gap')
        assert.ok(sideRight <= codeLeft - 11.5, 'rotated side text should stay left of the code-text column')
        assert.ok(sideRight <= leftGutterRightLimit + 1.5, 'rotated side text should remain inside the left gutter band')
        if (baselineSideBounds) {
            assert.ok(
                Math.abs(Number(sideBounds.y || 0) - Number(baselineSideBounds.y || 0)) <= 1,
                'side text vertical position should remain stable when not clamped by bounds safety'
            )
        }
        assert.ok(
            Number(tokenBounds.x || 0) + Number(tokenBounds.width || 0) <= Number(codeBounds.x || 0) - 6,
            'short token should stay left of code text with visible gap'
        )
        const verticalGap = Number(barcodeBounds.y || 0) - (Number(codeBounds.y || 0) + Number(codeBounds.height || 0))
        assert.ok(verticalGap >= 8 && verticalGap <= 22, 'barcode gap below code text should stay within fidelity band')
        assert.ok(
            Math.abs(Number(barcodeBounds.x || 0) - Number(codeBounds.x || 0)) <= 24,
            'barcode should remain in the same column as the code text'
        )
        assert.ok(
            Number(barcodeBounds.y || 0) <= Math.round(Number(previewRenderer.els.preview.height || 128) * 0.68) + 1,
            'barcode should avoid downward drift into lower rows'
        )
    })

    it('surfaces barcode-photo no-change reason when fidelity pattern is already stable', async () => {
        const state = {
            media: 'W24',
            items: [
                {
                    id: 'text-side',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'ET 912-657-800',
                    xOffset: -39,
                    yOffset: 0,
                    rotation: 90,
                    fontFamily: 'Barlow',
                    fontSize: 12,
                    textBold: false
                },
                {
                    id: 'text-token',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'R',
                    xOffset: 22,
                    yOffset: 0,
                    rotation: 0,
                    fontFamily: 'Barlow',
                    fontSize: 60,
                    textBold: true
                },
                {
                    id: 'text-code',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'RW 60 592 002 4DE',
                    xOffset: 86,
                    yOffset: -18,
                    rotation: 0,
                    fontFamily: 'Barlow',
                    fontSize: 14,
                    textBold: true
                },
                {
                    id: 'barcode-1',
                    type: 'barcode',
                    positionMode: 'absolute',
                    data: 'RW605920024DE',
                    width: 250,
                    height: 42,
                    xOffset: 68,
                    yOffset: 23,
                    rotation: 0
                }
            ]
        }
        const map = new Map()
        const previewRenderer = {
            _interactiveItemsById: map,
            els: {
                preview: {
                    width: 320,
                    height: 128
                }
            }
        }
        const renderAfterMutation = async () => {
            populateInteractiveMapCenteredRotated(state, map, previewRenderer.els.preview)
        }
        await renderAfterMutation()
        const baselineOffsets = state.items.map((item) => ({
            id: item.id,
            xOffset: Number(item.xOffset || 0),
            yOffset: Number(item.yOffset || 0)
        }))

        const result = await AiUniversalRebuildNormalizer.normalize({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(result.applied, false)
        assert.equal(result.didMutate, false)
        assert.equal(result.reason, 'barcode-photo-fidelity-no-change')
        assert.equal(result.placementResolved, true)
        assert.ok(Number(result.confidence || 0) >= 0.72)
        const currentOffsets = state.items.map((item) => ({
            id: item.id,
            xOffset: Number(item.xOffset || 0),
            yOffset: Number(item.yOffset || 0)
        }))
        assert.deepEqual(currentOffsets, baselineOffsets, 'stable fidelity layouts should keep explicit coordinates unchanged')
    })

    it('emits low-confidence warning when only coarse duplicate cleanup is possible', async () => {
        const state = {
            items: [
                { id: 't1', type: 'text', text: 'Header\nBody line one\nBody line two\nFooter line', xOffset: 0, yOffset: 0, fontSize: 14 },
                { id: 't2', type: 'text', text: 'Header', xOffset: 2, yOffset: 2, fontSize: 14 },
                { id: 't3', type: 'text', text: 'Body line one', xOffset: 4, yOffset: 4, fontSize: 14 }
            ]
        }
        const map = new Map()
        const previewRenderer = {
            _interactiveItemsById: map,
            els: {
                preview: {
                    width: 220,
                    height: 128
                }
            }
        }
        const renderAfterMutation = async () => {
            populateInteractiveMap(state, map)
        }
        const warnings = []

        const result = await AiUniversalRebuildNormalizer.normalize({
            state,
            previewRenderer,
            renderAfterMutation,
            onWarning: ({ key }) => warnings.push(key)
        })

        assert.equal(result.applied, true)
        assert.ok(warnings.includes('assistant.warningNormalizationLowConfidence'))
        assert.equal(state.items.filter((item) => item.type === 'text').length, 2)
    })

    it('fails safely when interactive bounds are unavailable', async () => {
        const state = {
            items: [{ id: 't1', type: 'text', text: 'hello', xOffset: 0, yOffset: 0, fontSize: 12 }]
        }
        const previewRenderer = {
            _interactiveItemsById: null,
            els: {
                preview: {
                    width: 220,
                    height: 128
                }
            }
        }
        const renderAfterMutation = async () => {}

        const result = await AiUniversalRebuildNormalizer.normalize({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(typeof result.applied, 'boolean')
        assert.equal(typeof result.didMutate, 'boolean')
    })
})
