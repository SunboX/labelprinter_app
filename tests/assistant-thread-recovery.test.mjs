import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('assistant thread recovery', () => {
    it('clears previous response threading when model output contains function calls', async () => {
        const source = await readFile('src/ui/AiAssistantPanel.mjs', 'utf8')
        assert.match(source, /const functionCallCount = AiResponseUtils\.countFunctionCalls\(response\)/)
        assert.match(source, /if \(functionCallCount > 0\) \{[\s\S]*?this\.\#previousResponseId = null/s)
    })

    it('retries with a fresh session when previous tool output chaining is missing', async () => {
        const source = await readFile('src/ui/AiAssistantPanel.mjs', 'utf8')
        assert.match(source, /AssistantErrorUtils\.isMissingToolOutputErrorFromThrowable\(error\)/)
        assert.match(source, /response = await this\.\#requestAssistant\(rawText, outgoingAttachments, \{\s*startFresh: true/s)
    })
})
