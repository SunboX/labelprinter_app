import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('assistant debug logging instrumentation', () => {
    it('supports ui debug flag resolution and emits key diagnostics', async () => {
        const source = await readFile('src/ui/AiAssistantPanel.mjs', 'utf8')
        assert.match(source, /#resolveDebugEnabled\(\)/)
        assert.match(source, /new URLSearchParams\(window\.location\.search\)\.get\('aiDebug'\)/)
        assert.match(source, /window\.localStorage\.getItem\('AI_DEBUG_LOGS'\)/)
        assert.match(source, /#debugLog\('request-start'/)
        assert.match(source, /#debugLog\('response-received'/)
        assert.match(source, /#debugLog\('response-actions'/)
        assert.match(source, /#debugLog\('action-run-complete'/)
        assert.match(source, /response\.headers\.get\('X-AI-Request-Id'\)/)
        assert.match(source, /parsedResponse\._requestId = requestId/)
    })
})
