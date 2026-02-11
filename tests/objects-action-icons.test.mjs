import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

const filePath = path.join(process.cwd(), 'src/index.html')
const html = fs.readFileSync(filePath, 'utf8')

const addButtonSpecs = [
    { attr: 'data-add-text', key: 'objects.addText' },
    { attr: 'data-add-qr', key: 'objects.addQr' },
    { attr: 'data-add-barcode', key: 'objects.addBarcode' },
    { attr: 'data-add-image', key: 'objects.addImage' },
    { attr: 'data-add-icon', key: 'objects.addIcon' },
    { attr: 'data-add-shape', key: 'objects.addShape' }
]

/**
 * Extracts the full button markup for a specific data attribute.
 *
 * @param {string} attribute Data attribute used to find the object add button.
 * @returns {string} Full `<button>...</button>` markup.
 */
function getButtonMarkup(attribute) {
    const pattern = new RegExp(`<button[^>]*${attribute}[^>]*>[\\s\\S]*?<\\/button>`, 'm')
    const match = html.match(pattern)
    assert.ok(match, `Missing objects action button: ${attribute}`)
    return match[0]
}

/**
 * Extracts just the opening tag from a button markup fragment.
 *
 * @param {string} buttonMarkup Full `<button>...</button>` fragment.
 * @returns {string} Opening `<button ...>` tag.
 */
function getOpeningTag(buttonMarkup) {
    const tag = buttonMarkup.match(/<button[^>]*>/)
    assert.ok(tag, 'Button opening tag not found')
    return tag[0]
}

describe('objects action icon buttons', () => {
    it('render SVG-only add buttons with i18n tooltip and aria labels', () => {
        for (const spec of addButtonSpecs) {
            const buttonMarkup = getButtonMarkup(spec.attr)
            const openingTag = getOpeningTag(buttonMarkup)
            assert.match(buttonMarkup, /<svg[\s>]/)
            assert.match(openingTag, new RegExp(`data-i18n-title="${spec.key}"`))
            assert.match(openingTag, new RegExp(`data-i18n-aria-label="${spec.key}"`))
            assert.doesNotMatch(openingTag, /\sdata-i18n="/)
        }
    })
})
