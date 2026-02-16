import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/ui/PreviewRendererCanvasBuild.mjs'), 'utf8')

describe('preview qr rendering', () => {
    it('keeps qr draw width and height equal to preserve square geometry', () => {
        const qrSectionMatch = source.match(/\n\s*_renderQrFlowBlock\(\{[\s\S]*?\n\s*}\n\n\s*\/\*\*/)
        assert.ok(qrSectionMatch, 'Expected _renderQrFlowBlock section')
        const qrSection = qrSectionMatch[0]
        assert.match(qrSection, /const drawSize = Math\.max\(1, block\.qrSize \|\| item\.size \|\| 1\)/)
        assert.match(qrSection, /const qrBounds = \{ x: drawX, y: drawY, width: drawSize, height: drawSize \}/)
        assert.match(qrSection, /ctx\.drawImage\(block\.qrCanvas, drawX, drawY, drawSize, drawSize\)/)
    })
})
