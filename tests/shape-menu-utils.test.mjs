import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ShapeMenuUtils } from '../src/ShapeMenuUtils.mjs'

describe('isOutsideShapeMenuInteraction', () => {
    it('returns false when composedPath includes the menu', () => {
        const menu = {}
        const trigger = {}
        const menuChild = {}
        const event = {
            target: menuChild,
            composedPath: () => [menuChild, menu]
        }

        assert.equal(ShapeMenuUtils.isOutsideShapeMenuInteraction(event, menu, trigger), false)
    })

    it('returns false when composedPath includes the trigger', () => {
        const menu = {}
        const trigger = {}
        const triggerChild = {}
        const event = {
            target: triggerChild,
            composedPath: () => [triggerChild, trigger]
        }

        assert.equal(ShapeMenuUtils.isOutsideShapeMenuInteraction(event, menu, trigger), false)
    })

    it('falls back to contains when composedPath is unavailable', () => {
        const menuChild = {}
        const menu = {
            contains: (node) => node === menuChild
        }
        const trigger = {
            contains: () => false
        }
        const event = {
            target: menuChild
        }

        assert.equal(ShapeMenuUtils.isOutsideShapeMenuInteraction(event, menu, trigger), false)
    })

    it('returns true for targets outside menu and trigger', () => {
        const menu = {
            contains: () => false
        }
        const trigger = {
            contains: () => false
        }
        const outside = {}
        const event = {
            target: outside
        }

        assert.equal(ShapeMenuUtils.isOutsideShapeMenuInteraction(event, menu, trigger), true)
    })
})
