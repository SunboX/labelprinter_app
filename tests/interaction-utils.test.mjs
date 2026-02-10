import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { InteractionUtils } from '../src/InteractionUtils.mjs'

describe('computeHandlePositions', () => {
    it('returns eight handles with expected positions', () => {
        const bounds = { x: 10, y: 20, width: 100, height: 50 }
        const handles = InteractionUtils.computeHandlePositions(bounds)
        const map = Object.fromEntries(handles.map((handle) => [handle.name, handle]))

        assert.equal(handles.length, 8)
        assert.deepEqual(map.nw, { name: 'nw', x: 10, y: 20 })
        assert.deepEqual(map.n, { name: 'n', x: 60, y: 20 })
        assert.deepEqual(map.ne, { name: 'ne', x: 110, y: 20 })
        assert.deepEqual(map.e, { name: 'e', x: 110, y: 45 })
        assert.deepEqual(map.se, { name: 'se', x: 110, y: 70 })
        assert.deepEqual(map.s, { name: 's', x: 60, y: 70 })
        assert.deepEqual(map.sw, { name: 'sw', x: 10, y: 70 })
        assert.deepEqual(map.w, { name: 'w', x: 10, y: 45 })
    })

    it('supports restricting handles for line-like resize controls', () => {
        const bounds = { x: 10, y: 20, width: 100, height: 50 }
        const handles = InteractionUtils.computeHandlePositions(bounds, ['w', 'e'])
        const map = Object.fromEntries(handles.map((handle) => [handle.name, handle]))

        assert.deepEqual(
            handles.map((handle) => handle.name),
            ['e', 'w']
        )
        assert.deepEqual(map.w, { name: 'w', x: 10, y: 45 })
        assert.deepEqual(map.e, { name: 'e', x: 110, y: 45 })
    })
})

describe('getAllowedResizeHandleNames', () => {
    it('returns horizontal endpoint handles for line shapes', () => {
        assert.deepEqual(InteractionUtils.getAllowedResizeHandleNames({ type: 'shape', shapeType: 'line' }), ['w', 'e'])
    })

    it('returns full handle set for non-line items', () => {
        assert.deepEqual(InteractionUtils.getAllowedResizeHandleNames({ type: 'shape', shapeType: 'rect' }), [
            'nw',
            'n',
            'ne',
            'e',
            'se',
            's',
            'sw',
            'w'
        ])
    })
})

describe('getHandleAtPoint', () => {
    it('prefers handles over move detection', () => {
        const bounds = { x: 10, y: 20, width: 100, height: 50 }
        const handle = InteractionUtils.getHandleAtPoint({ x: 10, y: 20 }, bounds, 6)
        assert.equal(handle, 'nw')
    })

    it('returns move when the point is inside the bounds', () => {
        const bounds = { x: 10, y: 20, width: 100, height: 50 }
        const handle = InteractionUtils.getHandleAtPoint({ x: 60, y: 45 }, bounds, 6)
        assert.equal(handle, 'move')
    })

    it('returns null when the point is outside the bounds', () => {
        const bounds = { x: 10, y: 20, width: 100, height: 50 }
        const handle = InteractionUtils.getHandleAtPoint({ x: 2, y: 8 }, bounds, 6)
        assert.equal(handle, null)
    })

    it('keeps center dragging active when handle set is restricted', () => {
        const bounds = { x: 10, y: 20, width: 100, height: 50 }
        assert.equal(InteractionUtils.getHandleAtPoint({ x: 60, y: 45 }, bounds, 6, ['w', 'e']), 'move')
        assert.equal(InteractionUtils.getHandleAtPoint({ x: 10, y: 45 }, bounds, 6, ['w', 'e']), 'w')
        assert.equal(InteractionUtils.getHandleAtPoint({ x: 110, y: 45 }, bounds, 6, ['w', 'e']), 'e')
    })
})

describe('getCursorForHandle', () => {
    it('maps handles to resize cursors', () => {
        assert.equal(InteractionUtils.getCursorForHandle('n'), 'ns-resize')
        assert.equal(InteractionUtils.getCursorForHandle('e'), 'ew-resize')
        assert.equal(InteractionUtils.getCursorForHandle('nw'), 'nwse-resize')
        assert.equal(InteractionUtils.getCursorForHandle('ne'), 'nesw-resize')
    })

    it('uses crosshair for move and default otherwise', () => {
        assert.equal(InteractionUtils.getCursorForHandle('move'), 'crosshair')
        assert.equal(InteractionUtils.getCursorForHandle('unknown'), 'default')
    })
})

describe('getHandleFromEdges', () => {
    it('maps edge flags to the expected handle name', () => {
        assert.equal(InteractionUtils.getHandleFromEdges({ top: true, left: true }), 'nw')
        assert.equal(InteractionUtils.getHandleFromEdges({ top: true, right: true }), 'ne')
        assert.equal(InteractionUtils.getHandleFromEdges({ bottom: true, left: true }), 'sw')
        assert.equal(InteractionUtils.getHandleFromEdges({ bottom: true, right: true }), 'se')
        assert.equal(InteractionUtils.getHandleFromEdges({ left: true }), 'w')
        assert.equal(InteractionUtils.getHandleFromEdges({ right: true }), 'e')
        assert.equal(InteractionUtils.getHandleFromEdges({ top: true }), 'n')
        assert.equal(InteractionUtils.getHandleFromEdges({ bottom: true }), 's')
    })

    it('returns move when edges are missing', () => {
        assert.equal(InteractionUtils.getHandleFromEdges(null), 'move')
        assert.equal(InteractionUtils.getHandleFromEdges({}), 'move')
    })
})

describe('getEdgesFromHandle', () => {
    it('maps handle names to expected edge flags', () => {
        assert.deepEqual(InteractionUtils.getEdgesFromHandle('n'), { top: true })
        assert.deepEqual(InteractionUtils.getEdgesFromHandle('s'), { bottom: true })
        assert.deepEqual(InteractionUtils.getEdgesFromHandle('e'), { right: true })
        assert.deepEqual(InteractionUtils.getEdgesFromHandle('w'), { left: true })
        assert.deepEqual(InteractionUtils.getEdgesFromHandle('ne'), { top: true, right: true })
        assert.deepEqual(InteractionUtils.getEdgesFromHandle('nw'), { top: true, left: true })
        assert.deepEqual(InteractionUtils.getEdgesFromHandle('se'), { bottom: true, right: true })
        assert.deepEqual(InteractionUtils.getEdgesFromHandle('sw'), { bottom: true, left: true })
    })

    it('returns null for non-resize handles', () => {
        assert.equal(InteractionUtils.getEdgesFromHandle('move'), null)
        assert.equal(InteractionUtils.getEdgesFromHandle('x'), null)
    })
})

describe('isInteractiveItemType', () => {
    it('returns true for preview-supported item types', () => {
        assert.equal(InteractionUtils.isInteractiveItemType('text'), true)
        assert.equal(InteractionUtils.isInteractiveItemType('shape'), true)
        assert.equal(InteractionUtils.isInteractiveItemType('qr'), true)
        assert.equal(InteractionUtils.isInteractiveItemType('image'), true)
        assert.equal(InteractionUtils.isInteractiveItemType('icon'), true)
    })

    it('returns false for unknown types', () => {
        assert.equal(InteractionUtils.isInteractiveItemType('unknown'), false)
    })
})

describe('isAdditiveSelectionModifier', () => {
    it('returns true when ctrl or meta is pressed', () => {
        assert.equal(InteractionUtils.isAdditiveSelectionModifier({ ctrlKey: true }), true)
        assert.equal(InteractionUtils.isAdditiveSelectionModifier({ metaKey: true }), true)
    })

    it('returns false when no additive modifier is pressed', () => {
        assert.equal(InteractionUtils.isAdditiveSelectionModifier({ ctrlKey: false, metaKey: false }), false)
        assert.equal(InteractionUtils.isAdditiveSelectionModifier(null), false)
    })
})

describe('shouldRenderResizeHandles', () => {
    it('returns true for no selection and single selection', () => {
        assert.equal(InteractionUtils.shouldRenderResizeHandles(0), true)
        assert.equal(InteractionUtils.shouldRenderResizeHandles(1), true)
    })

    it('returns false for multi-selection', () => {
        assert.equal(InteractionUtils.shouldRenderResizeHandles(2), false)
        assert.equal(InteractionUtils.shouldRenderResizeHandles(5), false)
    })
})

describe('resolveDragItemIds', () => {
    it('returns full selection when origin is selected', () => {
        const ids = InteractionUtils.resolveDragItemIds('item-2', new Set(['item-1', 'item-2', 'item-3']))
        assert.deepEqual(ids, ['item-2', 'item-1', 'item-3'])
    })

    it('returns only origin when origin is not selected', () => {
        const ids = InteractionUtils.resolveDragItemIds('item-9', new Set(['item-1', 'item-2']))
        assert.deepEqual(ids, ['item-9'])
    })
})

describe('resolveSelectionIds', () => {
    it('keeps multi-selection on plain click when origin is already selected', () => {
        const ids = InteractionUtils.resolveSelectionIds('item-2', ['item-1', 'item-2'], false)
        assert.deepEqual(ids, ['item-1', 'item-2'])
    })

    it('collapses to one item on plain click when origin is not selected', () => {
        const ids = InteractionUtils.resolveSelectionIds('item-9', ['item-1', 'item-2'], false)
        assert.deepEqual(ids, ['item-9'])
    })

    it('toggles selected items in additive mode', () => {
        assert.deepEqual(InteractionUtils.resolveSelectionIds('item-3', ['item-1', 'item-2'], true), ['item-1', 'item-2', 'item-3'])
        assert.deepEqual(InteractionUtils.resolveSelectionIds('item-2', ['item-1', 'item-2'], true), ['item-1'])
    })
})

describe('clampTranslationDelta', () => {
    it('keeps movement within the container bounds', () => {
        const bounds = { x: 10, y: 12, width: 40, height: 20 }
        const container = { width: 100, height: 80 }
        const { dx, dy } = InteractionUtils.clampTranslationDelta(bounds, container, 200, -50)
        assert.equal(dx, 50)
        assert.equal(dy, -12)
    })

    it('returns zero deltas when bounds exceed the container', () => {
        const bounds = { x: 0, y: 0, width: 120, height: 90 }
        const container = { width: 100, height: 80 }
        const { dx, dy } = InteractionUtils.clampTranslationDelta(bounds, container, 10, 10)
        assert.equal(dx, 0)
        assert.equal(dy, 0)
    })
})
