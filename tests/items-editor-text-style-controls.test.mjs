import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

const itemsEditorSource = fs.readFileSync(path.join(process.cwd(), 'src/ui/ItemsEditor.mjs'), 'utf8')
const en = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/i18n/en.json'), 'utf8'))
const de = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/i18n/de.json'), 'utf8'))

describe('items-editor text style controls', () => {
    it('adds text defaults for bold, italic, underline and strikethrough', () => {
        assert.match(itemsEditorSource, /textBold:\s*false/)
        assert.match(itemsEditorSource, /textItalic:\s*false/)
        assert.match(itemsEditorSource, /textUnderline:\s*false/)
        assert.match(itemsEditorSource, /textStrikethrough:\s*false/)
    })

    it('renders text style toggle buttons', () => {
        assert.match(itemsEditorSource, /createToggleButtonGroupField/)
        assert.match(itemsEditorSource, /itemsEditor\.textStyle/)
        assert.match(itemsEditorSource, /itemsEditor\.textBold/)
        assert.match(itemsEditorSource, /itemsEditor\.textItalic/)
        assert.match(itemsEditorSource, /itemsEditor\.textUnderline/)
        assert.match(itemsEditorSource, /itemsEditor\.textStrikethrough/)
    })

    it('includes i18n labels for text style controls', () => {
        assert.equal(typeof en.itemsEditor.textStyle, 'string')
        assert.equal(typeof en.itemsEditor.textBold, 'string')
        assert.equal(typeof en.itemsEditor.textItalic, 'string')
        assert.equal(typeof en.itemsEditor.textUnderline, 'string')
        assert.equal(typeof en.itemsEditor.textStrikethrough, 'string')
        assert.equal(typeof de.itemsEditor.textStyle, 'string')
        assert.equal(typeof de.itemsEditor.textBold, 'string')
        assert.equal(typeof de.itemsEditor.textItalic, 'string')
        assert.equal(typeof de.itemsEditor.textUnderline, 'string')
        assert.equal(typeof de.itemsEditor.textStrikethrough, 'string')
    })
})
