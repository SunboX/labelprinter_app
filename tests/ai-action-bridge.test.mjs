import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/ui/AiActionBridge.mjs'), 'utf8')

describe('ai-action-bridge', () => {
    it('supports add/update payload aliases for item changes', () => {
        assert.match(source, /#addItem\(action, runContext\)/)
        assert.match(source, /#updateItem\(action, runContext\)/)
        assert.match(source, /const changes = this\.\#extractItemChangesPayload\(action\)/)
        assert.match(source, /const directCandidates = \[action\.changes, action\.properties, action\.item, action\.values\]/)
        assert.match(source, /'clear_items'/)
        assert.match(source, /case 'clear_items':/)
        assert.match(source, /if \(forceRebuild && !normalizedActions\.some\(\(action\) => action\.action === 'clear_items'\)\)/)
        assert.match(source, /allowCreateIfMissing:\s*forceRebuild \|\| Boolean\(options\.allowCreateIfMissing\)/)
        assert.match(source, /if \(forceRebuild\) \{\s*this\.\#postProcessRebuildArtifacts\(\)/s)
    })

    it('normalizes common AI key aliases to canonical item keys', () => {
        assert.match(source, /content:\s*'text'/)
        assert.match(source, /value:\s*'data'/)
        assert.match(source, /x_offset:\s*'xOffset'/)
        assert.match(source, /font_size:\s*'fontSize'/)
        assert.match(source, /qr_error_correction_level:\s*'qrErrorCorrectionLevel'/)
        assert.match(source, /bold:\s*'textBold'/)
        assert.match(source, /italic:\s*'textItalic'/)
        assert.match(source, /underline:\s*'textUnderline'/)
        assert.match(source, /fontWeight:\s*'textBold'/)
        assert.match(source, /fontStyle:\s*'textItalic'/)
        assert.match(source, /textDecoration:\s*'textUnderline'/)
    })

    it('uses explicit or touched ids for align actions when selection is empty', () => {
        assert.match(source, /const explicitIds = Array\.isArray\(action\.itemIds\)/)
        assert.match(source, /const touchedIds = Array\.from\(runContext\.touchedItemIds\)/)
        assert.match(source, /if \(touchedIds\.length >= 2\)/)
    })

    it('maps qr width\/height updates to square size', () => {
        assert.match(source, /const qrSizeCandidates = \[normalizedChanges\.size, normalizedChanges\.width, normalizedChanges\.height\]/)
        assert.match(source, /normalizedChanges\.size = Math\.max\(\.\.\.qrSizeCandidates\)/)
        assert.match(source, /item\.size = QrSizeUtils\.clampQrSizeToLabel/)
        assert.doesNotMatch(source, /QrSizeUtils\.clampQrSizeDots/)
        assert.match(source, /item\.height = item\.size/)
    })

    it('falls back to add_item when rebuild mode receives update for a missing item', () => {
        assert.match(source, /const hasExplicitPointer = this\.\#hasExplicitItemPointer\(action\)/)
        assert.match(source, /runContext\?\.allowCreateIfMissing && !hasExplicitPointer/)
        assert.match(source, /if \(runContext\?\.allowCreateIfMissing && !hasExplicitPointer\)/)
        assert.match(source, /#inferItemTypeForMissingUpdate\(action, changes\)/)
        assert.match(source, /action:\s*'add_item'/)
    })

    it('sanitizes rebuild output by de-duplicating aggregate text and enforcing qr size floor', () => {
        assert.match(source, /#postProcessRebuildArtifacts\(\)/)
        assert.match(source, /#findDuplicatedAggregateTextItem\(\)/)
        assert.match(source, /QrSizeUtils\.computeMaxQrSizeDots\(this\.state\) \* 0\.6/)
        assert.match(source, /item\.width = nextSize/)
    })

    it('expands structured style objects into text style flags', () => {
        assert.match(source, /if \(expanded\.style && typeof expanded\.style === 'object'\)/)
        assert.match(source, /expanded\.textBold = expanded\.style\.textBold \?\? expanded\.style\.bold \?\? expanded\.style\.fontWeight/)
        assert.match(source, /expanded\.textUnderline =\s*expanded\.style\.textUnderline \?\? expanded\.style\.underline \?\? expanded\.style\.textDecoration/)
    })

    it('supports semantic item target aliases like last and selected', () => {
        assert.match(source, /#resolveTargetAlias\(rawToken\)/)
        assert.match(source, /token === 'last' \|\| token === 'latest' \|\| token === 'newest' \|\| token === 'recent'/)
        assert.match(source, /token === 'selected' \|\| token === 'current'/)
        assert.match(source, /const aliasedItem = this\.\#resolveTargetAlias\(byId\)/)
    })
})
