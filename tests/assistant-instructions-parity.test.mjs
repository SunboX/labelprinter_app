import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const REQUIRED_SHARED_INSTRUCTION_LINES = [
    'When the user requests a label/editor change, call the tool editor_action with allowlisted actions only.',
    'When using add_item + update_item in the same action plan, prefer update_item itemId "last" (or explicit item refs) instead of "selected/current".',
    'Coordinate hint: in horizontal labels yOffset is center-relative (0 is centered, negative moves up, positive moves down). Use negative yOffset for top-aligned rows.',
    'For barcode-photo reconstructions with explicit absolute coordinates, preserve the provided layout as closely as possible and avoid large automatic repositioning.',
    'For this style pattern (rotated side text + single-letter token + code + barcode), keep the single-letter token visibly dominant and the barcode slightly larger to match reference prominence.',
    'W24 prominence hint for this style: target single-letter fontSize about 58-64 and barcode about 240-280 width with 40-46 height, unless the image clearly indicates smaller.',
    'Keep rotated side text inside a left gutter and left of the large-letter/token column with a visible gap (target at least 6).',
    'When overlap adjustments are needed in barcode-photo layouts, move compact left-side tokens (for example single-letter markers) before shifting the code text/barcode rows downward.',
    'Keep barcode-photo code text and barcode in the same visual column with a small vertical gap (target about 8-22 dots, ideal near 12).',
    'For heading/value inventory labels with a right-side QR (for example Artikelname/Artikelnummer/Lagerplatz), build a two-column layout: left stacked text rows and a right QR block.',
    'Keep left text rows in strict top-to-bottom order with visible gaps; avoid row overlap and avoid clipping the last row.',
    'If space is tight in this style, reduce QR size first before shrinking text, while keeping all text content unchanged.',
    'For heading/value inventory labels with a right-side QR, if the top heading row is underlined, keep its immediate value row underlined as well (for example Artikelname: and its value).'
]
const REMOVED_LEGACY_QR_LINE =
    'For visual reconstruction, prefer one multiline text item for the left stacked content plus one QR item on the right, unless the user explicitly requests separate text objects.'

/**
 * Wraps a plain instruction line with source-level quote delimiters.
 * This avoids accidental substring matches from comments or docs.
 * @param {string} line
 * @returns {string}
 */
function asQuotedInstruction(line) {
    return `'${String(line || '')}'`
}

describe('assistant instructions parity', () => {
    it('keeps critical reconstruction guidance aligned across Node and PHP backends', async () => {
        const [nodeSource, phpSource] = await Promise.all([
            readFile('src/server.mjs', 'utf8'),
            readFile('api/chat.php', 'utf8')
        ])

        REQUIRED_SHARED_INSTRUCTION_LINES.forEach((line) => {
            const quotedLine = asQuotedInstruction(line)
            assert.equal(
                nodeSource.includes(quotedLine),
                true,
                `expected Node assistant instructions to include: ${line}`
            )
            assert.equal(
                phpSource.includes(quotedLine),
                true,
                `expected PHP assistant instructions to include: ${line}`
            )
        })
    })

    it('removes obsolete PHP-only QR reconstruction instruction', async () => {
        const phpSource = await readFile('api/chat.php', 'utf8')
        assert.equal(
            phpSource.includes(asQuotedInstruction(REMOVED_LEGACY_QR_LINE)),
            false,
            'legacy QR-specific reconstruction instruction should be removed from PHP backend'
        )
    })
})
