import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/ui/ItemsEditorGeometrySupport.mjs'), 'utf8')

describe('qr square controls', () => {
    it('uses one qr size slider and keeps qr height synced to size', () => {
        const qrSectionMatch = source.match(/static appendQrControls\([\s\S]*?\n\s*}\n\n\s*\/\*\*/)
        assert.ok(qrSectionMatch, 'Expected appendQrControls section')
        const qrSection = qrSectionMatch[0]
        assert.match(qrSection, /item\.height = item\.size/)
        assert.match(qrSection, /createSlider\(translate\('itemsEditor\.sliderQrSize'\), item\.size/)
        assert.doesNotMatch(qrSection, /const heightCtrl = createSlider/)
        assert.doesNotMatch(qrSection, /controls\.append\(\s*heightCtrl,/)
    })
})
