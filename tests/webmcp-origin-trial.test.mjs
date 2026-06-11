// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

/**
 * Extracts the Chrome origin-trial token from the app shell.
 * @param {string} html
 * @returns {string}
 */
function extractOriginTrialToken(html) {
    const match = String(html).match(/<meta\s+http-equiv="origin-trial"\s+content="([^"]+)"\s*\/>/)
    assert.ok(match, 'expected origin-trial meta tag')
    return match[1]
}

/**
 * Decodes the JSON payload from a Chrome origin-trial token.
 * @param {string} token
 * @returns {{ origin?: string, feature?: string, expiry?: number }}
 */
function decodeOriginTrialPayload(token) {
    const decoded = Buffer.from(token, 'base64').toString('utf8')
    const jsonStart = decoded.lastIndexOf('{')
    assert.ok(jsonStart >= 0, 'expected origin-trial token JSON payload')
    return JSON.parse(decoded.slice(jsonStart))
}

describe('webmcp origin trial configuration', () => {
    it('embeds a WebMCP origin-trial token for the production origin', async () => {
        const html = await readFile('src/index.html', 'utf8')
        const token = extractOriginTrialToken(html)
        const payload = decodeOriginTrialPayload(token)

        assert.equal(payload.origin, 'https://labelprinter.app:443')
        assert.equal(payload.feature, 'WebMCP')
        assert.equal(payload.expiry, 1794873600)
    })

    it('ships Apache header rules for live WebMCP hosting', async () => {
        const htaccess = await readFile('src/.htaccess', 'utf8')

        assert.match(htaccess, /Header\s+always\s+set\s+Origin-Agent-Cluster\s+"\?1"/)
        assert.match(htaccess, /Header\s+always\s+set\s+Permissions-Policy\s+"tools=\(self\)"/)
        assert.match(htaccess, /Header\s+always\s+set\s+Origin-Trial\s+"/)
    })
})
