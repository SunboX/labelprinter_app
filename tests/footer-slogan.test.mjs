// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { readCssBundle } from './CssBundleUtils.mjs'

const html = readFileSync(path.join(process.cwd(), 'src/index.html'), 'utf8')

/**
 * Reads a locale fixture from the app i18n catalog.
 * @param {string} locale
 * @returns {Record<string, unknown>}
 */
function readLocale(locale) {
    const source = readFileSync(path.join(process.cwd(), `src/i18n/${locale}.json`), 'utf8')
    return JSON.parse(source)
}

describe('footer slogan', () => {
    it('renders the centered Germany hosting slogan', async () => {
        assert.match(html, /<div class="footer-slogan" data-i18n="footer\.slogan">Build and hostet in Germany<\/div>/)
        assert.equal(readLocale('en').footer.slogan, 'Build and hostet in Germany')
        assert.equal(readLocale('de').footer.slogan, 'Build and hostet in Germany')

        const css = await readCssBundle('src/style.css')
        assert.match(css, /\.footer-slogan\s*{[^}]*text-align:\s*center/i)
    })
})
