import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

const buildSource = fs.readFileSync(path.join(process.cwd(), 'src/ui/PreviewRendererCanvasBuild.mjs'), 'utf8')

describe('preview text underline rendering', () => {
    it('clamps scaled underline thickness and keeps underline draw calls enabled', () => {
        assert.match(
            buildSource,
            /const underlineThicknessRaw = Number\(block\.textUnderlineThickness \|\| underlineMetrics\.thickness\) \* verticalScale/
        )
        assert.match(buildSource, /const underlineThickness = Math\.max\(1, underlineThicknessRaw\)/)
        assert.match(buildSource, /if \(item\.textUnderline\) \{/)
        assert.match(buildSource, /ctx\.lineWidth = underlineThickness/)
    })
})
