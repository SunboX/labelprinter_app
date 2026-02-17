import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RotationUtils } from '../src/RotationUtils.mjs'
import { AiBoxedBarcodeFormFidelityUtils } from '../src/ui/AiBoxedBarcodeFormFidelityUtils.mjs'

/**
 * Populates deterministic bounds for centered horizontal absolute-positioned tests.
 * @param {{ items: Array<Record<string, any>> }} state
 * @param {Map<string, { bounds: { x: number, y: number, width: number, height: number } }>} map
 * @param {{ width?: number, height?: number }} [previewSize]
 */
function populateAbsoluteMap(state, map, previewSize = {}) {
    map.clear()
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
            height = Math.max(2, Number(item.height || 2))
        } else {
            const textLength = Math.max(1, ...lines.map((line) => String(line || '').length))
            width = Math.max(10, Math.round(textLength * Math.max(8, Number(item.fontSize || 12)) * 0.58))
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
 * Builds a test harness for boxed barcode fidelity utility execution.
 * @param {{ media?: string, items: Array<Record<string, any>> }} state
 * @returns {{
 *  state: { media?: string, items: Array<Record<string, any>> },
 *  previewRenderer: {
 *    _interactiveItemsById: Map<string, { bounds: { x: number, y: number, width: number, height: number } }>,
 *    els: { preview: { width: number, height: number } }
 *  },
 *  renderAfterMutation: () => Promise<void>
 * }}
 */
function createHarness(state) {
    const map = new Map()
    const previewRenderer = {
        _interactiveItemsById: map,
        els: {
            preview: {
                width: 360,
                height: 128
            }
        }
    }
    const renderAfterMutation = async () => {
        populateAbsoluteMap(state, map, previewRenderer.els.preview)
    }
    return {
        state,
        previewRenderer,
        renderAfterMutation
    }
}

describe('ai-boxed-barcode-form-fidelity', () => {
    it('adds missing frame/dividers for boxed barcode candidates and clears structural underlines', async () => {
        const state = {
            media: 'W24',
            items: [
                {
                    id: 'text-1',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'RW 60 592 002 4DE',
                    xOffset: 10,
                    yOffset: -50,
                    fontSize: 18,
                    textUnderline: true
                },
                {
                    id: 'shape-1',
                    type: 'shape',
                    shapeType: 'line',
                    positionMode: 'absolute',
                    xOffset: 6,
                    yOffset: -30,
                    width: 300,
                    height: 2,
                    strokeWidth: 2,
                    rotation: 0
                },
                {
                    id: 'text-2',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'RW 60 592 002 4DE',
                    xOffset: 188,
                    yOffset: -50,
                    fontSize: 18,
                    textUnderline: true
                },
                {
                    id: 'text-3',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'RW 60 592 002 4DE',
                    xOffset: 84,
                    yOffset: -8,
                    fontSize: 20,
                    textUnderline: true
                },
                {
                    id: 'shape-2',
                    type: 'shape',
                    shapeType: 'line',
                    positionMode: 'absolute',
                    xOffset: 6,
                    yOffset: 8,
                    width: 220,
                    height: 2,
                    strokeWidth: 2,
                    rotation: 0
                },
                {
                    id: 'barcode-1',
                    type: 'barcode',
                    positionMode: 'absolute',
                    data: 'RW605920024DE',
                    width: 260,
                    height: 44,
                    xOffset: 50,
                    yOffset: 30
                }
            ]
        }
        const { previewRenderer, renderAfterMutation } = createHarness(state)
        await renderAfterMutation()

        const result = await AiBoxedBarcodeFormFidelityUtils.apply({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(result.applied, true)
        assert.equal(result.didMutate, true)
        assert.equal(result.reason, 'applied-boxed-barcode-form-fidelity')
        const rectShapes = state.items.filter(
            (item) =>
                item.type === 'shape' &&
                String(item.shapeType || '')
                    .trim()
                    .toLowerCase() === 'rect'
        )
        const lineShapes = state.items.filter(
            (item) =>
                item.type === 'shape' &&
                String(item.shapeType || '')
                    .trim()
                    .toLowerCase() === 'line'
        )
        assert.ok(rectShapes.length >= 1)
        assert.ok(lineShapes.length >= 3)
        assert.ok(
            lineShapes.some((item) => Math.abs((Math.abs(Number(item.rotation || 0)) % 180) - 90) <= 20),
            'boxed guard should ensure one vertical divider line'
        )
        assert.equal(
            state.items.filter((item) => item.type === 'text').every((item) => !Boolean(item.textUnderline)),
            true,
            'structural rows should not rely on text underline flags'
        )
        assert.equal(state.items.filter((item) => item.type === 'barcode').length, 1)
    })

    it('converts structural shape yOffset from draw-space targets in centered horizontal previews', async () => {
        const state = {
            media: 'W24',
            items: [
                {
                    id: 'text-1',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'RW 60 592 002 4DE',
                    xOffset: 10,
                    yOffset: -52,
                    fontSize: 18,
                    textUnderline: true
                },
                {
                    id: 'text-2',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'RW 60 592 002 4DE',
                    xOffset: 190,
                    yOffset: -52,
                    fontSize: 18,
                    textUnderline: true
                },
                {
                    id: 'text-3',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'RW 60 592 002 4DE',
                    xOffset: 98,
                    yOffset: -4,
                    fontSize: 20,
                    textUnderline: true
                },
                {
                    id: 'barcode-1',
                    type: 'barcode',
                    positionMode: 'absolute',
                    data: 'RW605920024DE',
                    width: 260,
                    height: 44,
                    xOffset: 64,
                    yOffset: 38
                }
            ]
        }
        const { previewRenderer, renderAfterMutation } = createHarness(state)
        await renderAfterMutation()

        const result = await AiBoxedBarcodeFormFidelityUtils.apply({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(result.applied, true)
        assert.equal(result.didMutate, true)
        const previewHeight = Number(previewRenderer.els.preview.height || 128)
        const horizontalLines = state.items
            .filter(
                (item) =>
                    item.type === 'shape' &&
                    String(item.shapeType || '').toLowerCase() === 'line' &&
                    Math.abs((Math.abs(Number(item.rotation || 0)) % 180) - 90) > 20
            )
            .sort(
                (left, right) =>
                    (previewHeight - Number(left.height || 2)) / 2 +
                    Number(left.yOffset || 0) -
                    ((previewHeight - Number(right.height || 2)) / 2 + Number(right.yOffset || 0))
            )
        const barcode = state.items.find((item) => item.type === 'barcode')
        assert.ok(barcode)
        assert.ok(horizontalLines.length >= 2)
        const headerLine = horizontalLines[0]
        const middleLine = horizontalLines[horizontalLines.length - 1]
        const headerLineDrawY = (previewHeight - Number(headerLine.height || 2)) / 2 + Number(headerLine.yOffset || 0)
        const middleLineDrawY = (previewHeight - Number(middleLine.height || 2)) / 2 + Number(middleLine.yOffset || 0)
        const barcodeTop = (previewHeight - Number(barcode.height || 1)) / 2 + Number(barcode.yOffset || 0)
        assert.ok(headerLineDrawY < previewHeight * 0.5, 'header separator should stay in upper half')
        assert.ok(middleLineDrawY + 4 <= barcodeTop, 'middle separator should stay above barcode row')

        await renderAfterMutation()
        const codeRows = state.items
            .filter((item) => item.type === 'text' && String(item.text || '').includes('RW 60 592 002 4DE'))
            .map((item) => ({
                item,
                bounds: previewRenderer._interactiveItemsById.get(item.id)?.bounds || null
            }))
            .filter((entry) => entry.bounds)
            .sort((left, right) => Number(left.bounds.y || 0) - Number(right.bounds.y || 0))
        assert.ok(codeRows.length >= 3)
        const topRows = [codeRows[0], codeRows[1]].sort(
            (left, right) => Number(left.bounds.x || 0) - Number(right.bounds.x || 0)
        )
        const topGap =
            Number(topRows[1].bounds.x || 0) -
            (Number(topRows[0].bounds.x || 0) + Number(topRows[0].bounds.width || 0))
        assert.ok(topGap >= 4, 'top header text should not overlap across divider')

        const verticalDivider = state.items.find(
            (item) =>
                item.type === 'shape' &&
                String(item.shapeType || '').toLowerCase() === 'line' &&
                Math.abs((Math.abs(Number(item.rotation || 0)) % 180) - 90) <= 20
        )
        assert.ok(verticalDivider)
        assert.ok(Number(verticalDivider.width || 0) >= 20, 'vertical divider should retain visible length')
    })

    it('skips rotated side-text barcode-photo patterns', async () => {
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
                    fontSize: 12
                },
                {
                    id: 'text-token',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'R',
                    xOffset: 22,
                    yOffset: 0,
                    fontSize: 58
                },
                {
                    id: 'text-code',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'RW 60 592 002 4DE',
                    xOffset: 86,
                    yOffset: -18,
                    fontSize: 14
                },
                {
                    id: 'barcode-1',
                    type: 'barcode',
                    positionMode: 'absolute',
                    data: 'RW605920024DE',
                    width: 240,
                    height: 40,
                    xOffset: 92,
                    yOffset: 14
                }
            ]
        }
        const { previewRenderer, renderAfterMutation } = createHarness(state)
        await renderAfterMutation()

        const result = await AiBoxedBarcodeFormFidelityUtils.apply({
            state,
            previewRenderer,
            renderAfterMutation
        })

        assert.equal(result.applied, false)
        assert.equal(result.didMutate, false)
        assert.equal(state.items.filter((item) => item.type === 'shape').length, 0)
    })

    it('does not create duplicate structure shapes when boxed geometry is already complete', async () => {
        const state = {
            media: 'W24',
            items: [
                {
                    id: 'text-1',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'RW 60 592 002 4DE',
                    xOffset: 14,
                    yOffset: -48,
                    fontSize: 14
                },
                {
                    id: 'text-2',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'RW 60 592 002 4DE',
                    xOffset: 170,
                    yOffset: -48,
                    fontSize: 14
                },
                {
                    id: 'text-3',
                    type: 'text',
                    positionMode: 'absolute',
                    text: 'RW 60 592 002 4DE',
                    xOffset: 90,
                    yOffset: -26,
                    fontSize: 14
                },
                {
                    id: 'barcode-1',
                    type: 'barcode',
                    positionMode: 'absolute',
                    data: 'RW605920024DE',
                    width: 250,
                    height: 44,
                    xOffset: 50,
                    yOffset: 12
                },
                {
                    id: 'shape-frame',
                    type: 'shape',
                    shapeType: 'rect',
                    positionMode: 'absolute',
                    xOffset: 8,
                    yOffset: -12,
                    width: 306,
                    height: 92,
                    strokeWidth: 2,
                    rotation: 0
                },
                {
                    id: 'shape-h1',
                    type: 'shape',
                    shapeType: 'line',
                    positionMode: 'absolute',
                    xOffset: 9,
                    yOffset: -36,
                    width: 304,
                    height: 2,
                    strokeWidth: 2,
                    rotation: 0
                },
                {
                    id: 'shape-h2',
                    type: 'shape',
                    shapeType: 'line',
                    positionMode: 'absolute',
                    xOffset: 9,
                    yOffset: -14,
                    width: 304,
                    height: 2,
                    strokeWidth: 2,
                    rotation: 0
                },
                {
                    id: 'shape-v',
                    type: 'shape',
                    shapeType: 'line',
                    positionMode: 'absolute',
                    xOffset: 161,
                    yOffset: -56,
                    width: 18,
                    height: 2,
                    strokeWidth: 2,
                    rotation: 90
                }
            ]
        }
        const { previewRenderer, renderAfterMutation } = createHarness(state)
        await renderAfterMutation()

        const shapeCountBefore = state.items.filter((item) => item.type === 'shape').length
        const result = await AiBoxedBarcodeFormFidelityUtils.apply({
            state,
            previewRenderer,
            renderAfterMutation
        })
        const shapeCountAfter = state.items.filter((item) => item.type === 'shape').length

        assert.equal(result.applied, true)
        assert.equal(shapeCountAfter, shapeCountBefore)
        assert.ok(
            state.items.some(
                (item) =>
                    item.type === 'shape' &&
                    String(item.shapeType || '').toLowerCase() === 'line' &&
                    Math.abs((Math.abs(Number(item.rotation || 0)) % 180) - 90) <= 20
            ),
            'existing vertical divider should be preserved without duplicate additions'
        )
    })
})
