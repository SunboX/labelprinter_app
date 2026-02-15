import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('preview multiline text rendering', () => {
    it('renders text lines separately and keeps multiline metrics in flow blocks', async () => {
        const buildSource = await readFile('src/ui/PreviewRendererCanvasBuild.mjs', 'utf8')
        const supportSource = await readFile('src/ui/PreviewRendererCanvasSupport.mjs', 'utf8')

        assert.match(buildSource, /textLines,\s*textLineGap:\s*lineGap,\s*textLineMetrics:\s*lineMetrics/)
        assert.match(buildSource, /textLines\.forEach\(\(line, index\)/)
        assert.match(buildSource, /ctx\.fillText\(String\(line \|\| ''\), 0, 0\)/)
        assert.match(buildSource, /block\.textTotalHeight/)

        assert.match(supportSource, /#normalizeTextLines\(text\)/)
        assert.match(supportSource, /#measureTextLines\(ctx, lines, size, family, bold, italic, underline\)/)
    })
})
