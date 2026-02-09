import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { readCssBundle } from './CssBundleUtils.mjs'

describe('items editor collapsible cards', () => {
    it('defines collapsed card styles for item settings body', async () => {
        const css = await readCssBundle('src/style.css')
        assert.match(css, /\.item-card\.collapsed\s+\.item-body\s*{[^}]*display:\s*none/i)
    })

    it('includes a toggle control and collapse logic in ItemsEditor', async () => {
        const source = await readFile('src/ui/ItemsEditor.mjs', 'utf8')
        assert.match(source, /item-toggle/)
        assert.match(source, /#toggleItemCollapsed/)
        assert.match(source, /aria-expanded/)
    })
})
