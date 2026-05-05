// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const SUPPORTED_REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']

describe('assistant backend config parity', () => {
    it('keeps PHP backend defaults aligned with the Node backend config', async () => {
        const phpSource = await readFile('api/chat.php', 'utf8')

        assert.match(phpSource, /\$model = trim\(\(string\)\(getEnvValue\('OPENAI_MODEL'\) \?\? 'gpt-5\.4'\)\);/)
        assert.match(phpSource, /parseReasoningEffortEnv\(getEnvValue\('OPENAI_REASONING_EFFORT'\), 'none'\)/)

        SUPPORTED_REASONING_EFFORTS.forEach((value) => {
            assert.equal(
                phpSource.includes(`'${value}'`),
                true,
                `expected PHP backend reasoning parser to include ${value}`
            )
        })
    })

    it('documents GPT-5.4 defaults in example config and assistant docs', async () => {
        const [envSource, docsSource] = await Promise.all([readFile('.env.example', 'utf8'), readFile('docs/ai-assistant.md', 'utf8')])

        assert.match(envSource, /OPENAI_MODEL=gpt-5\.4/)
        assert.match(envSource, /OPENAI_REASONING_EFFORT=none/)
        assert.match(
            docsSource,
            /OPENAI_REASONING_EFFORT.*`none`, `minimal`, `low`, `medium`, `high`, `xhigh`; recommended: `none`/
        )
        assert.match(docsSource, /optional `OPENAI_MODEL` \(default `gpt-5\.4`\)/)
    })
})
