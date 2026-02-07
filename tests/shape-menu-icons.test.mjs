import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

const filePath = path.join(process.cwd(), 'src/index.html')
const html = fs.readFileSync(filePath, 'utf8')

const iconMatches = html.match(/class="menu-icon"/g) || []
const svgMatches = html.match(/<svg\s+viewBox="0 0 24 24"/g) || []
const labelMatches = html.match(/class="menu-label"/g) || []

/**
 * Validates the form menu includes SVG icons.
 */
describe('shape menu icons', () => {
    it('renders an SVG icon for each shape option', () => {
        assert.equal(iconMatches.length, 5)
        assert.equal(svgMatches.length, 5)
        assert.equal(labelMatches.length, 5)
    })
})
