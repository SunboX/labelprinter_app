import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readCssBundle } from './CssBundleUtils.mjs'

describe('assistant overlay cutout styling', () => {
    it('defines scrim panes and assistant panel layering', async () => {
        const css = await readCssBundle('src/style.css')
        assert.match(css, /\.assistant-overlay-scrim\s*{/)
        assert.match(css, /\.assistant-overlay-pane\s*{[^}]*backdrop-filter:\s*blur\(3px\)/is)
        assert.match(css, /\.assistant-overlay\.assistant-overlay-cutout\s*{[^}]*backdrop-filter:\s*none/is)
        assert.match(css, /\.assistant-panel\s*{[^}]*z-index:\s*1/is)
    })
})
