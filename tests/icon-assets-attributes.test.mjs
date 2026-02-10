import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { ICON_MANIFEST } from '../src/assets/icons/icon-manifest.mjs'

const iconsDir = path.join(process.cwd(), 'src/assets/icons')

/**
 * Reads an attribute from a root SVG tag.
 * @param {string} rootAttributes
 * @param {string} name
 * @returns {string}
 */
function readAttribute(rootAttributes, name) {
    const match = rootAttributes.match(new RegExp(`\\b${name}=\"([^\"]*)\"`, 'i'))
    return match ? match[1].trim() : ''
}

describe('icon assets metadata', () => {
    it('stores icon metadata in svg root attributes', () => {
        const iconFiles = fs.readdirSync(iconsDir).filter((file) => file.endsWith('.svg'))
        assert.equal(iconFiles.length > 100, true)

        iconFiles.forEach((fileName) => {
            const filePath = path.join(iconsDir, fileName)
            const content = fs.readFileSync(filePath, 'utf8')
            const rootMatch = content.match(/<svg\b([^>]*)>/i)
            assert.ok(rootMatch, `Missing root <svg> in ${fileName}`)
            const attributes = rootMatch ? rootMatch[1] : ''
            const id = readAttribute(attributes, 'id')
            const category = readAttribute(attributes, 'category')
            const label = readAttribute(attributes, 'label')
            assert.ok(id, `Missing "id" attribute in ${fileName}`)
            assert.ok(category, `Missing "category" attribute in ${fileName}`)
            assert.ok(label, `Missing "label" attribute in ${fileName}`)
            assert.equal(id, fileName.replace(/\.svg$/i, ''), `SVG id must match file name for ${fileName}`)
        })
    })

    it('keeps manifest entries aligned with svg metadata', () => {
        ICON_MANIFEST.forEach((entry) => {
            const filePath = path.join(iconsDir, entry.file)
            assert.equal(fs.existsSync(filePath), true, `Missing file for ${entry.id}: ${entry.file}`)
            const content = fs.readFileSync(filePath, 'utf8')
            const rootMatch = content.match(/<svg\b([^>]*)>/i)
            assert.ok(rootMatch, `Missing root <svg> in ${entry.file}`)
            const attributes = rootMatch ? rootMatch[1] : ''
            assert.equal(readAttribute(attributes, 'id'), entry.id, `Mismatched id in ${entry.file}`)
            assert.equal(readAttribute(attributes, 'category'), entry.category, `Mismatched category in ${entry.file}`)
            assert.equal(readAttribute(attributes, 'label'), entry.label, `Mismatched label in ${entry.file}`)
        })
    })
})
