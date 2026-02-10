import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/ui/ItemsEditorIconSupport.mjs'), 'utf8')

describe('items editor icon picker popup', () => {
    it('renders an overlay popup grid instead of a text-only select input', () => {
        assert.match(source, /className = 'icon-picker-backdrop'/)
        assert.match(source, /className = 'icon-picker-popup'/)
        assert.match(source, /document\.body\.append\(backdrop, popup\)/)
        assert.match(source, /className = 'icon-picker-grid'/)
        assert.match(source, /className = 'icon-picker-option'/)
        assert.match(source, /querySelectorAll\('\.icon-picker-option\.selected'\)/)
        assert.doesNotMatch(source, /icon-picker-option-label/)
        assert.doesNotMatch(source, /document\.createElement\('select'\)/)
    })
})

describe('items editor icon picker integration', () => {
    it('supports opening the icon picker from preview-selected item cards', async () => {
        const itemsEditorSource = await fs.promises.readFile(
            path.join(process.cwd(), 'src/ui/ItemsEditor.mjs'),
            'utf8'
        )
        assert.match(itemsEditorSource, /openIconPickerForItem\(itemId\)/)
        assert.match(itemsEditorSource, /this\.setSelectedItemIds\(\[normalizedItemId\]\)/)
        assert.match(itemsEditorSource, /trigger\.click\(\)/)
    })
})
