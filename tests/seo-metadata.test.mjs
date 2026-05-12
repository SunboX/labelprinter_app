// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('SEO metadata and crawl files', () => {
    it('exposes indexable page metadata with a canonical URL', async () => {
        const html = await readFile('src/index.html', 'utf8')

        assert.match(html, /<title[^>]*>\s*Labelprinter App\s*<\/title>/)
        assert.match(
            html,
            /<meta\s+name="description"\s+content="Design and print labels in the browser with QR codes, barcodes, icons, shapes, and parameter-driven batch data\."\s*\/>/
        )
        assert.match(html, /<link\s+rel="canonical"\s+href="https:\/\/labelprinter\.app\/"\s*\/>/)
        assert.doesNotMatch(html.toLowerCase(), /noindex/)
    })

    it('allows crawling and points crawlers at the sitemap', async () => {
        const robots = await readFile('src/robots.txt', 'utf8')

        assert.match(robots, /^User-agent: \*$/m)
        assert.match(robots, /^Allow: \/$/m)
        assert.match(robots, /^Sitemap: https:\/\/labelprinter\.app\/sitemap\.xml$/m)
        assert.doesNotMatch(robots, /^Disallow:\s*\//m)
    })

    it('publishes the primary application URL in the sitemap', async () => {
        const sitemap = await readFile('src/sitemap.xml', 'utf8')

        assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/)
        assert.match(sitemap, /<loc>https:\/\/labelprinter\.app\/<\/loc>/)
    })
})
