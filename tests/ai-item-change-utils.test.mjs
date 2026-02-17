import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AiItemChangeUtils } from '../src/ui/AiItemChangeUtils.mjs'

describe('ai-item-change-utils', () => {
    it('normalizes Sans font-family alias to sans-serif', () => {
        const item = {
            id: 'text-1',
            type: 'text',
            fontFamily: 'Barlow',
            text: 'Example'
        }
        const changedKeys = AiItemChangeUtils.applyItemChanges({
            item,
            rawChanges: { fontFamily: 'Sans' },
            state: {},
            shapeTypeIds: []
        })

        assert.ok(changedKeys.includes('fontFamily'))
        assert.equal(item.fontFamily, 'sans-serif')
    })

    it('keeps known font family names unchanged', () => {
        const item = {
            id: 'text-2',
            type: 'text',
            fontFamily: 'Arial',
            text: 'Example'
        }
        const changedKeys = AiItemChangeUtils.applyItemChanges({
            item,
            rawChanges: { fontFamily: 'Barlow' },
            state: {},
            shapeTypeIds: []
        })

        assert.ok(changedKeys.includes('fontFamily'))
        assert.equal(item.fontFamily, 'Barlow')
    })

    it('applies absolute position mode from model aliases', () => {
        const item = {
            id: 'text-3',
            type: 'text',
            text: 'Example',
            positionMode: 'flow'
        }
        const changedKeys = AiItemChangeUtils.applyItemChanges({
            item,
            rawChanges: { position_mode: 'absolute' },
            state: {},
            shapeTypeIds: []
        })

        assert.ok(changedKeys.includes('positionMode'))
        assert.equal(item.positionMode, 'absolute')
    })

    it('treats absolute position mode as explicit placement intent', () => {
        assert.equal(AiItemChangeUtils.changesContainExplicitPlacement({ positionMode: 'absolute' }), true)
        assert.equal(AiItemChangeUtils.changesContainExplicitPlacement({ positionMode: 'flow' }), false)
    })
})
