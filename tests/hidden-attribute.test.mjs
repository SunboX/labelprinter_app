// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readCssBundle } from './CssBundleUtils.mjs'

describe('shape menu hidden styling', () => {
    it('keeps [hidden] elements from rendering', async () => {
        const css = await readCssBundle('src/style.css')
        assert.match(css, /\[hidden\]\s*{[^}]*display:\s*none/i)
    })
})
