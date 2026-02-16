import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('assistant rendered-label context', () => {
    it('captures and prepends rendered label attachment in chat payloads', async () => {
        const source = await readFile('src/ui/AiAssistantPanel.mjs', 'utf8')
        assert.match(source, /#getRenderedLabelAttachment = async \(\) => null/)
        assert.match(source, /set getRenderedLabelAttachment\(callback\)/)
        assert.match(source, /async #resolveRenderedLabelAttachment\(\)/)
        assert.match(source, /outgoingAttachments\.unshift\(renderedLabelAttachment\)/)
        assert.match(source, /#setBusyState\(true\)/)
        assert.match(source, /#setBusyState\(false\)/)
        assert.match(source, /AiResponseUtils\.extractIncompleteReason\(response\)/)
        assert.match(source, /AiResponseUtils\.countFunctionCalls\(response\)/)
        assert.match(source, /#buildActionRunContext\(/)
        assert.match(source, /#isRebuildIntent\(/)
        assert.match(source, /#pendingRebuildContext = null/)
        assert.match(source, /#isRebuildConfirmationReply\(/)
        assert.match(source, /const confirmationFollowUp =/)
        assert.match(source, /if \(actions\.length\) \{\s*[\s\S]*this\.\#pendingRebuildContext = null/s)
        assert.match(source, /forceRebuild,\s*allowCreateIfMissing:\s*forceRebuild/s)
        assert.match(source, /startFresh:\s*actionContext\.forceRebuild/)
        assert.match(source, /previous_response_id:\s*shouldStartFresh \? undefined : this\.\#previousResponseId \|\| undefined/)
        assert.match(source, /assistant-working-message/)
    })

    it('wires preview renderer attachment callback into assistant panel', async () => {
        const source = await readFile('src/main.mjs', 'utf8')
        assert.match(source, /aiAssistant\.getRenderedLabelAttachment = \(\) => previewRenderer\.getRenderedLabelAttachment\(\)/)
    })

    it('exposes rendered label capture helper on preview renderer base', async () => {
        const source = await readFile('src/ui/PreviewRendererBase.mjs', 'utf8')
        assert.match(source, /getRenderedLabelAttachment\(\)/)
        assert.match(source, /name:\s*'rendered-label\.png'/)
        assert.match(source, /toDataURL\('image\/png'\)/)
    })
})
