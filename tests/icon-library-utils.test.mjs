import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { IconLibraryUtils } from '../src/IconLibraryUtils.mjs'

describe('icon-library-utils', () => {
    it('returns a stable icon catalog and default id', () => {
        const definitions = IconLibraryUtils.getIconDefinitions()
        assert.equal(Array.isArray(definitions), true)
        assert.equal(definitions.length > 100, true)
        assert.equal(IconLibraryUtils.getDefaultIconId(), definitions[0].id)
    })

    it('normalizes unknown ids to a known icon', () => {
        const fallback = IconLibraryUtils.getDefaultIconId()
        assert.equal(IconLibraryUtils.normalizeIconId('not-a-real-icon'), fallback)
        assert.equal(IconLibraryUtils.normalizeIconId('icon-printer'), 'icon-printer')
    })

    it('builds SVG data URLs for icon rendering', () => {
        const url = IconLibraryUtils.getIconSvgDataUrl('icon-printer')
        assert.equal(url.startsWith('assets/icons/'), true)
        assert.equal(url.endsWith('.svg'), true)
    })

    it('includes electronics and 3d-print icon catalogs', () => {
        const definitions = IconLibraryUtils.getIconDefinitions()
        const iconIds = new Set(definitions.map((entry) => entry.id))
        const categories = new Set(definitions.map((entry) => entry.category))
        assert.equal(categories.has('Electronics'), true)
        assert.equal(categories.has('3D Print'), true)
        assert.equal(categories.has('Tools'), true)
        assert.equal(categories.has('Transport'), true)
        assert.equal(categories.has('Office'), true)
        assert.equal(categories.has('Media'), true)
        assert.equal(categories.has('IT'), true)
        assert.equal(categories.has('Nature'), true)
        assert.equal(iconIds.has('icon-resistor'), true)
        assert.equal(iconIds.has('icon-capacitor'), true)
        assert.equal(iconIds.has('icon-capacitor-polarized'), true)
        assert.equal(iconIds.has('icon-3d-cube'), true)
        assert.equal(iconIds.has('icon-3d-nozzle'), true)
        assert.equal(iconIds.has('icon-tool-gear'), true)
        assert.equal(iconIds.has('icon-transport-car'), true)
        assert.equal(iconIds.has('icon-office-folder'), true)
        assert.equal(iconIds.has('icon-media-play'), true)
        assert.equal(iconIds.has('icon-it-chip'), true)
        assert.equal(iconIds.has('icon-nature-sun'), true)
    })
})
