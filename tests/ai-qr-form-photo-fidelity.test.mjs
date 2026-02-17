import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AiUniversalRebuildNormalizer } from '../src/ui/AiUniversalRebuildNormalizer.mjs'
import { RotationUtils } from '../src/RotationUtils.mjs'

/**
 * Populates centered bounds similar to the preview renderer.
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
 * Builds a deterministic preview harness for normalizer tests.
 * @param {{ items: Array<Record<string, any>>, media?: string, orientation?: string }} state
 * @param {{ width?: number, height?: number }} [previewSize]
 * @returns {{
 *  map: Map<string, { bounds: { x: number, y: number, width: number, height: number } }>,
 *  previewRenderer: { _interactiveItemsById: Map<string, { bounds: { x: number, y: number, width: number, height: number } }>, els: { preview: { width: number, height: number } } },
 *  renderAfterMutation: () => Promise<void>
 * }}
 */
function createPreviewHarness(state, previewSize = {}) {
    const map = new Map()
    const previewRenderer = {
        _interactiveItemsById: map,
        els: {
            preview: {
                width: Math.max(120, Number(previewSize.width || 480)),
                height: Math.max(48, Number(previewSize.height || 128))
            }
        }
    }
    return {
        map,
        previewRenderer,
        renderAfterMutation: async () => {
            populateInteractiveMapCentered(state, map, previewRenderer.els.preview)
        }
    }
}

/**
 * Returns sorted text bounds and the right-most text edge.
 * @param {{ items: Array<Record<string, any>> }} state
 * @param {Map<string, { bounds: { x: number, y: number, width: number, height: number } }>} map
 * @returns {{ entries: Array<{ item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } }>, right: number, bottom: number }}
 */
function collectTextLayout(state, map) {
    const entries = state.items
        .filter((item) => item.type === 'text')
        .map((item) => ({
            item,
            bounds: map.get(item.id)?.bounds || null
        }))
        .filter((entry) => entry.bounds)
        .sort((left, right) => Number(left.bounds.y || 0) - Number(right.bounds.y || 0))
    const right = entries.reduce(
        (maximum, entry) => Math.max(maximum, Number(entry.bounds.x || 0) + Number(entry.bounds.width || 0)),
        0
    )
    const bottom = entries.reduce(
        (maximum, entry) => Math.max(maximum, Number(entry.bounds.y || 0) + Number(entry.bounds.height || 0)),
        0
    )
    return { entries, right, bottom }
}

describe('ai-qr-form-photo-fidelity', () => {
    it('stabilizes heading/value + QR layout without bottom-row collisions', async () => {
        const state = {
            media: 'W24',
            orientation: 'horizontal',
            items: [
                {
                    id: 'text-1',
                    type: 'text',
                    positionMode: 'absolute',
                    xOffset: 8,
                    yOffset: -42,
                    rotation: 0,
                    fontFamily: 'Barlow',
                    fontSize: 16,
                    text: 'Artikelname:',
                    textUnderline: true
                },
                {
                    id: 'text-2',
                    type: 'text',
                    positionMode: 'absolute',
                    xOffset: 10,
                    yOffset: -16,
                    rotation: 0,
                    fontFamily: 'Barlow',
                    fontSize: 22,
                    text: 'Hammermutter Nut 10 M8',
                    textBold: true
                },
                {
                    id: 'text-3',
                    type: 'text',
                    positionMode: 'absolute',
                    xOffset: 8,
                    yOffset: 6,
                    rotation: 0,
                    fontFamily: 'Barlow',
                    fontSize: 16,
                    text: 'Artikelnummer:'
                },
                {
                    id: 'text-4',
                    type: 'text',
                    positionMode: 'absolute',
                    xOffset: 8,
                    yOffset: 24,
                    rotation: 0,
                    fontFamily: 'Barlow',
                    fontSize: 22,
                    text: '18123689',
                    textBold: true
                },
                {
                    id: 'text-5',
                    type: 'text',
                    positionMode: 'absolute',
                    xOffset: 8,
                    yOffset: 44,
                    rotation: 0,
                    fontFamily: 'Barlow',
                    fontSize: 16,
                    text: 'Lagerplatz:',
                    textItalic: true
                },
                {
                    id: 'text-6',
                    type: 'text',
                    positionMode: 'absolute',
                    xOffset: 8,
                    yOffset: 64,
                    rotation: 0,
                    fontFamily: 'Barlow',
                    fontSize: 22,
                    text: 'R1-S5-F3',
                    textBold: true
                },
                {
                    id: 'qr-1',
                    type: 'qr',
                    positionMode: 'absolute',
                    xOffset: 250,
                    yOffset: 18,
                    size: 92,
                    data: 'https://example.com/item/18123689'
                }
            ]
        }
        const { map, previewRenderer, renderAfterMutation } = createPreviewHarness(state, { width: 480, height: 128 })
        const result = await AiUniversalRebuildNormalizer.normalize({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(
            ['applied-qr-form-photo-fidelity', 'qr-form-photo-fidelity-no-change'].includes(
                String(result.reason || '')
            ),
            true
        )
        await renderAfterMutation()
        const { entries, right: textRight, bottom: textBottom } = collectTextLayout(state, map)
        const qrItem = state.items.find((item) => item.type === 'qr')
        const headingItem = state.items.find((item) => String(item.text || '') === 'Artikelname:')
        const headingValueItem = state.items.find((item) => String(item.text || '') === 'Hammermutter Nut 10 M8')
        const qrBounds = qrItem ? map.get(qrItem.id)?.bounds : null
        assert.equal(Boolean(headingItem?.textUnderline), true, 'first heading row should remain underlined')
        assert.equal(Boolean(headingValueItem?.textUnderline), true, 'first value row should inherit underline')
        assert.ok(qrBounds, 'qr bounds should be present')
        assert.ok(entries.length >= 6, 'expected full text stack')
        for (let index = 1; index < entries.length; index += 1) {
            const previous = entries[index - 1].bounds
            const current = entries[index].bounds
            assert.ok(
                Number(current.y || 0) >= Number(previous.y || 0) + Number(previous.height || 0) + 2,
                'text rows should remain strictly top-to-bottom with visible gap'
            )
        }
        assert.ok(textBottom <= Number(previewRenderer.els.preview.height || 128) + 1, 'last text row should remain visible')
        assert.ok(Number(qrBounds.x || 0) >= textRight + 2, 'qr should stay in the right column without intersecting text')
    })

    it('uses adaptive text scaling (beyond 15% when needed) after QR-first reduction', async () => {
        const state = {
            media: 'W24',
            orientation: 'horizontal',
            items: [
                { id: 'text-1', type: 'text', positionMode: 'absolute', text: 'Artikelname:', xOffset: 8, yOffset: -52, fontSize: 12 },
                { id: 'text-2', type: 'text', positionMode: 'absolute', text: 'Hammermutter Nut 10 M8', xOffset: 10, yOffset: -16, fontSize: 22, textBold: true },
                { id: 'text-3', type: 'text', positionMode: 'absolute', text: 'Artikelnummer:', xOffset: 8, yOffset: 6, fontSize: 16 },
                { id: 'text-4', type: 'text', positionMode: 'absolute', text: '18123689', xOffset: 8, yOffset: 28, fontSize: 22, textBold: true },
                { id: 'qr-1', type: 'qr', positionMode: 'absolute', xOffset: 150, yOffset: 4, size: 150, data: 'https://example.com/1' }
            ]
        }
        const baselineFontSizes = state.items
            .filter((item) => item.type === 'text')
            .map((item) => ({ id: item.id, fontSize: Number(item.fontSize || 0) }))
        const { map, previewRenderer, renderAfterMutation } = createPreviewHarness(state, { width: 280, height: 128 })
        const result = await AiUniversalRebuildNormalizer.normalize({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(
            ['applied-qr-form-photo-fidelity', 'qr-form-photo-fidelity-no-change'].includes(
                String(result.reason || '')
            ),
            true
        )
        assert.equal(result.placementResolved, true, 'constrained but feasible layout should resolve')
        const qrItem = state.items.find((item) => item.type === 'qr')
        assert.ok(qrItem, 'qr item should exist')
        assert.ok(Number(qrItem.size || 0) < 150, 'qr should be reduced first when constrained')
        assert.ok(Number(qrItem.size || 0) >= 40, 'qr size should respect minimum floor')
        let observedAdaptiveDownscale = false
        baselineFontSizes.forEach((baseline) => {
            const nextItem = state.items.find((item) => item.id === baseline.id)
            const nextFontSize = Math.round(Number(nextItem?.fontSize || 0))
            if (nextFontSize < Math.round(baseline.fontSize * 0.85)) {
                observedAdaptiveDownscale = true
            }
            assert.ok(
                nextFontSize <= baseline.fontSize && nextFontSize >= 10,
                'adaptive text downscaling should stay monotonic and never go below floor 10'
            )
        })
        assert.equal(observedAdaptiveDownscale, true, 'expected adaptive scaling beyond 15% for this constrained case')
        await renderAfterMutation()
        const { entries, right: textRight } = collectTextLayout(state, map)
        const qrBounds = qrItem ? map.get(qrItem.id)?.bounds : null
        for (let index = 1; index < entries.length; index += 1) {
            const previous = entries[index - 1].bounds
            const current = entries[index].bounds
            assert.ok(
                Number(current.y || 0) >= Number(previous.y || 0) + Number(previous.height || 0) + 2,
                'resolved constrained layout should keep visible row gaps'
            )
        }
        assert.ok(qrBounds)
        assert.ok(Number(qrBounds.x || 0) >= textRight + 2, 'qr should remain to the right of the text column')
    })

    it('does not force underline when first heading/value pair has no underline intent', async () => {
        const state = {
            media: 'W24',
            orientation: 'horizontal',
            items: [
                { id: 'text-1', type: 'text', positionMode: 'absolute', text: 'Artikelname:', xOffset: 8, yOffset: -52, fontSize: 12, textUnderline: false },
                { id: 'text-2', type: 'text', positionMode: 'absolute', text: 'Hammermutter Nut 10 M8', xOffset: 10, yOffset: -33, fontSize: 16, textBold: true, textUnderline: false },
                { id: 'text-3', type: 'text', positionMode: 'absolute', text: 'Artikelnummer:', xOffset: 8, yOffset: -15, fontSize: 12 },
                { id: 'text-4', type: 'text', positionMode: 'absolute', text: '18123689', xOffset: 8, yOffset: 4, fontSize: 16, textBold: true },
                { id: 'text-5', type: 'text', positionMode: 'absolute', text: 'Lagerplatz:', xOffset: 8, yOffset: 22, fontSize: 12 },
                { id: 'text-6', type: 'text', positionMode: 'absolute', text: 'R1-S5-F3', xOffset: 8, yOffset: 41, fontSize: 16, textBold: true },
                { id: 'qr-1', type: 'qr', positionMode: 'absolute', xOffset: 320, yOffset: 8, size: 64, data: 'https://example.com/1' }
            ]
        }
        const { previewRenderer, renderAfterMutation } = createPreviewHarness(state, { width: 500, height: 128 })
        const result = await AiUniversalRebuildNormalizer.normalize({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(
            ['applied-qr-form-photo-fidelity', 'qr-form-photo-fidelity-no-change'].includes(
                String(result.reason || '')
            ),
            true
        )
        const headingItem = state.items.find((item) => String(item.text || '') === 'Artikelname:')
        const headingValueItem = state.items.find((item) => String(item.text || '') === 'Hammermutter Nut 10 M8')
        assert.equal(Boolean(headingItem?.textUnderline), false)
        assert.equal(Boolean(headingValueItem?.textUnderline), false)
    })

    it('returns qr-form no-change reason for already-stable two-column QR layouts', async () => {
        const state = {
            media: 'W24',
            orientation: 'horizontal',
            items: [
                { id: 'text-1', type: 'text', positionMode: 'absolute', text: 'Artikelname:', xOffset: 8, yOffset: -52, fontSize: 12 },
                { id: 'text-2', type: 'text', positionMode: 'absolute', text: 'Hammermutter Nut 10 M8', xOffset: 10, yOffset: -33, fontSize: 16, textBold: true },
                { id: 'text-3', type: 'text', positionMode: 'absolute', text: 'Artikelnummer:', xOffset: 8, yOffset: -15, fontSize: 12 },
                { id: 'text-4', type: 'text', positionMode: 'absolute', text: '18123689', xOffset: 8, yOffset: 4, fontSize: 16, textBold: true },
                { id: 'text-5', type: 'text', positionMode: 'absolute', text: 'Lagerplatz:', xOffset: 8, yOffset: 22, fontSize: 12 },
                { id: 'text-6', type: 'text', positionMode: 'absolute', text: 'R1-S5-F3', xOffset: 8, yOffset: 41, fontSize: 16, textBold: true },
                { id: 'qr-1', type: 'qr', positionMode: 'absolute', xOffset: 320, yOffset: 8, size: 64, data: 'https://example.com/1' }
            ]
        }
        const baselineOffsets = state.items.map((item) => ({
            id: item.id,
            xOffset: Number(item.xOffset || 0),
            yOffset: Number(item.yOffset || 0),
            size: Number(item.size || 0)
        }))
        const { previewRenderer, renderAfterMutation } = createPreviewHarness(state, { width: 500, height: 128 })
        const result = await AiUniversalRebuildNormalizer.normalize({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(String(result.reason || ''), 'qr-form-photo-fidelity-no-change')
        assert.equal(result.applied, false)
        baselineOffsets.forEach((baseline) => {
            const nextItem = state.items.find((item) => item.id === baseline.id)
            assert.equal(Number(nextItem?.xOffset || 0), baseline.xOffset)
            assert.equal(Number(nextItem?.yOffset || 0), baseline.yOffset)
            if (baseline.size > 0) assert.equal(Number(nextItem?.size || 0), baseline.size)
        })
    })

    it('keeps unresolved qr-form layouts stable without falling back to generic overlap pushes', async () => {
        const state = {
            media: 'W24',
            orientation: 'horizontal',
            items: [
                { id: 'text-1', type: 'text', positionMode: 'absolute', text: 'Artikelname:', xOffset: 8, yOffset: -28, fontSize: 10 },
                { id: 'text-2', type: 'text', positionMode: 'absolute', text: 'Hammermutter Nut 10 M8', xOffset: 10, yOffset: -18, fontSize: 10, textBold: true },
                { id: 'text-3', type: 'text', positionMode: 'absolute', text: 'Artikelnummer:', xOffset: 8, yOffset: -8, fontSize: 10 },
                { id: 'text-4', type: 'text', positionMode: 'absolute', text: '18123689', xOffset: 10, yOffset: 2, fontSize: 10, textBold: true },
                { id: 'text-5', type: 'text', positionMode: 'absolute', text: 'Lagerplatz:', xOffset: 8, yOffset: 12, fontSize: 10 },
                { id: 'text-6', type: 'text', positionMode: 'absolute', text: 'R1-S5-F3', xOffset: 10, yOffset: 22, fontSize: 10, textBold: true },
                { id: 'qr-1', type: 'qr', positionMode: 'absolute', xOffset: 220, yOffset: 4, size: 64, data: 'https://example.com/1' }
            ]
        }
        const baselineGeometry = state.items.map((item) => ({
            id: item.id,
            xOffset: Number(item.xOffset || 0),
            yOffset: Number(item.yOffset || 0),
            fontSize: Number(item.fontSize || 0),
            size: Number(item.size || 0)
        }))
        const { previewRenderer, renderAfterMutation } = createPreviewHarness(state, { width: 300, height: 64 })
        const result = await AiUniversalRebuildNormalizer.normalize({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(String(result.reason || ''), 'qr-form-photo-fidelity-no-change')
        assert.equal(result.applied, false)
        assert.equal(result.placementResolved, false)
        baselineGeometry.forEach((baseline) => {
            const nextItem = state.items.find((item) => item.id === baseline.id)
            assert.equal(Number(nextItem?.xOffset || 0), baseline.xOffset)
            assert.equal(Number(nextItem?.yOffset || 0), baseline.yOffset)
            if (baseline.fontSize > 0) assert.equal(Number(nextItem?.fontSize || 0), baseline.fontSize)
            if (baseline.size > 0) assert.equal(Number(nextItem?.size || 0), baseline.size)
        })
    })

    it('keeps non-qr-form patterns on existing normalization paths', async () => {
        const state = {
            media: 'W24',
            orientation: 'horizontal',
            items: [
                {
                    id: 'text-side',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'ET 912-657-800',
                    xOffset: 6,
                    yOffset: 0,
                    rotation: 90,
                    fontSize: 12
                },
                {
                    id: 'text-token',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'R',
                    xOffset: 22,
                    yOffset: 0,
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
                    yOffset: 14
                }
            ]
        }
        const { previewRenderer, renderAfterMutation } = createPreviewHarness(state, { width: 320, height: 128 })
        const result = await AiUniversalRebuildNormalizer.normalize({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(
            ['applied-qr-form-photo-fidelity', 'qr-form-photo-fidelity-no-change'].includes(
                String(result.reason || '')
            ),
            false
        )
    })
})
