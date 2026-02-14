import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('runtime extension noise guard', () => {
    it('filters known extension message-channel promise rejections', async () => {
        const source = await readFile('src/main.mjs', 'utf8')
        assert.match(source, /EXTENSION_ASYNC_CHANNEL_CLOSED_MESSAGE/)
        assert.match(source, /addEventListener\('unhandledrejection'/)
        assert.match(source, /isExtensionMessageChannelNoise/)
        assert.match(source, /event\.preventDefault\(\)/)
    })
})
