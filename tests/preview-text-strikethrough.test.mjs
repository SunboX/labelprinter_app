import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

const buildSource = fs.readFileSync(path.join(process.cwd(), 'src/ui/PreviewRendererCanvasBuild.mjs'), 'utf8')
const supportSource = fs.readFileSync(path.join(process.cwd(), 'src/ui/PreviewRendererCanvasSupport.mjs'), 'utf8')

describe('preview text strikethrough rendering', () => {
    it('computes strikethrough metrics and draws strike lines when enabled', () => {
        assert.match(supportSource, /computeStrikethroughMetrics\(size, verticalScale = 1\)/)
        assert.match(buildSource, /strikethrough:\s*Boolean\(item\.textStrikethrough\)/)
        assert.match(buildSource, /if \(item\.textStrikethrough\) \{/)
        assert.match(buildSource, /const strikethroughY = baselineY - strikethroughOffset/)
        assert.match(buildSource, /ctx\.lineWidth = strikethroughThickness/)
    })
})
