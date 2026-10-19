// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { readCssBundle } from './CssBundleUtils.mjs'

describe('items editor collapsible cards', () => {
    it('defines collapsed card styles for item settings body', async () => {
        const css = await readCssBundle('src/style.css')
        assert.match(css, /\.item-card\.collapsed\s+\.item-body\s*{[^}]*display:\s*none/i)
    })

    it('keeps the drag handle on one line alongside the header buttons', async () => {
        const css = await readCssBundle('src/style.css')
        assert.match(css, /\.handle\s*{[^}]*white-space:\s*nowrap/i)
        assert.match(css, /\.handle\s*{[^}]*flex-shrink:\s*0/i)
        assert.match(css, /\.item-header-actions\s*{[^}]*flex-shrink:\s*0/i)
    })

    it('gives both header buttons the same fixed square dimensions', async () => {
        const css = await readCssBundle('src/style.css')
        const buttons = css.match(/\.item-card \.item-toggle,\s*\.item-card \.item-delete\s*{([^}]*)}/)?.[1]
        assert.ok(buttons)
        assert.match(buttons, /width:\s*30px/)
        assert.match(buttons, /height:\s*30px/)
        assert.match(buttons, /flex:\s*0 0 30px/)
        assert.match(buttons, /margin:\s*0/)
    })

    it('uses one shared size for square dimension buttons and the input height', async () => {
        const css = await readCssBundle('src/style.css')
        assert.match(css, /\.item-card \.controls\.image-controls\s*{[^}]*minmax\(180px, 1fr\)/)
        assert.match(css, /\.image-dimension-inputs\s*{[^}]*--image-dimension-control-size:\s*40px/)
        assert.match(css, /\.image-dimension-inputs input\s*{[^}]*height:\s*var\(--image-dimension-control-size\)/)
        assert.match(
            css,
            /\.item-card \.image-dimension-inputs button\s*{[^}]*width:\s*var\(--image-dimension-control-size\)[^}]*height:\s*var\(--image-dimension-control-size\)[^}]*margin:\s*0/
        )
    })

    it('puts the accessible delete action between the drag handle and collapse toggle', async () => {
        const source = await readFile('src/ui/ItemsEditor.mjs', 'utf8')
        assert.match(source, /headerActions\.append\(handle, toggleSettings\)/)
        assert.match(source, /headerActions\.insertBefore\(remove, toggleSettings\)/)
        assert.match(source, /remove\.setAttribute\('aria-label', remove\.title\)/)
        assert.doesNotMatch(source, /body\.append\(contentWrap, controls, remove\)/)
    })

    it('includes a toggle control and collapse logic in ItemsEditor', async () => {
        const source = await readFile('src/ui/ItemsEditor.mjs', 'utf8')
        assert.match(source, /item-toggle/)
        assert.match(source, /#toggleItemCollapsed/)
        assert.match(source, /aria-expanded/)
    })
})
