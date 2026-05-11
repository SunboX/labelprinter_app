// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('index html embeds centralized analytics tracker', async () => {
    const html = await readFile('src/index.html', 'utf8')

    assert.match(html, /src="https:\/\/analytics\.andrefiedler\.de\/tracker\.js"/)
    assert.match(html, /data-site="labelprinter_app"/)
    assert.match(html, /defer/)
    assert.doesNotMatch(html, /data-auto="false"/)
})

test('getting started docs include analytics site registration values', async () => {
    const docs = await readFile('docs/getting-started.md', 'utf8')

    assert.match(docs, /https:\/\/analytics\.andrefiedler\.de\/tracker\.js/)
    assert.match(docs, /labelprinter_app/)
    assert.match(docs, /analytics_sites/)
})
