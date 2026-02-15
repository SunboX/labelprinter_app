import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AiInventoryRebuildUtils } from '../src/ui/AiInventoryRebuildUtils.mjs'

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

describe('ai-inventory-rebuild-utils', () => {
    it('waits for async render snapshots before repositioning template items', async () => {
        const state = {
            media: 'W24',
            resolution: 'LOW',
            orientation: 'horizontal',
            mediaLengthMm: null,
            items: [
                { id: 't-1', type: 'text', text: 'Artikelname:' },
                { id: 't-2', type: 'text', text: 'Hammermutter Nut 10 M8' },
                { id: 't-3', type: 'text', text: 'Artikelnummer:\n18123689\nLagerplatz:\nR1-S5-F3' },
                { id: 'q-1', type: 'qr', data: '18123689', size: 16, width: 16, height: 16 }
            ]
        }
        const interactiveMap = new Map()
        const previewRenderer = {
            _interactiveItemsById: interactiveMap,
            els: {
                preview: {
                    width: 240,
                    height: 128
                }
            }
        }
        const renderAfterMutation = async () => {
            await new Promise((resolve) => setTimeout(resolve, 0))
            populateInteractiveMap(state, interactiveMap)
        }

        const applied = await AiInventoryRebuildUtils.tryApplyInventoryTemplate({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(applied, true)
        const textItems = state.items.filter((item) => item.type === 'text')
        const qrItems = state.items.filter((item) => item.type === 'qr')
        assert.equal(textItems.length, 6)
        assert.equal(qrItems.length, 1)
        assert.ok(textItems.some((item) => Number(item.xOffset || 0) < 0))
        assert.ok(textItems.some((item) => Number(item.yOffset || 0) > 0))
    })

    it('retries template positioning when interactive bounds are delayed by one render cycle', async () => {
        const state = {
            media: 'W24',
            resolution: 'LOW',
            orientation: 'horizontal',
            mediaLengthMm: null,
            items: [
                { id: 't-1', type: 'text', text: 'Artikelname:' },
                { id: 't-2', type: 'text', text: 'Hammermutter Nut 10 M8' },
                { id: 't-3', type: 'text', text: 'Artikelnummer:\n18123689\nLagerplatz:\nR1-S5-F3' },
                { id: 'q-1', type: 'qr', data: '18123689', size: 16, width: 16, height: 16 }
            ]
        }
        const interactiveMap = new Map()
        const previewRenderer = {
            _interactiveItemsById: interactiveMap,
            els: {
                preview: {
                    width: 240,
                    height: 128
                }
            }
        }
        let renderCount = 0
        const renderAfterMutation = async () => {
            renderCount += 1
            await new Promise((resolve) => setTimeout(resolve, 0))
            if (renderCount === 1) {
                interactiveMap.clear()
                return
            }
            populateInteractiveMap(state, interactiveMap)
        }

        const applied = await AiInventoryRebuildUtils.tryApplyInventoryTemplate({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(applied, true)
        const textItems = state.items.filter((item) => item.type === 'text')
        assert.equal(textItems.length, 6)
        assert.ok(renderCount >= 3)
        assert.ok(textItems.some((item) => Number(item.xOffset || 0) < 0))
        assert.ok(textItems.some((item) => Number(item.yOffset || 0) > 0))
    })
})
