import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('runtime extension noise guard', () => {
    it('filters known extension message-channel promise rejections', async () => {
        const mainSource = await readFile('src/main.mjs', 'utf8')
        const guardSource = await readFile('src/AppRuntimeNoiseGuards.mjs', 'utf8')
        assert.match(mainSource, /import\s+\{\s*AppRuntimeNoiseGuards\s*\}\s+from\s+'\.\/AppRuntimeNoiseGuards\.mjs'/)
        assert.match(mainSource, /AppRuntimeNoiseGuards\.install\(\)/)
        assert.match(guardSource, /EXTENSION_ASYNC_CHANNEL_CLOSED_MESSAGE/)
        assert.match(guardSource, /window\.addEventListener\('unhandledrejection'/)
        assert.match(guardSource, /#isExtensionMessageChannelNoise/)
        assert.match(guardSource, /event\.preventDefault\(\)/)
    })
})
