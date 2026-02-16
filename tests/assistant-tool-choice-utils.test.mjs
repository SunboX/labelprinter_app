import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AssistantToolChoiceUtils } from '../src/AssistantToolChoiceUtils.mjs'

describe('assistant-tool-choice-utils', () => {
    it('forces editor_action for image-based recreate intents', () => {
        const result = AssistantToolChoiceUtils.shouldForceEditorToolChoice({
            message: 'please create such kind of label using a 24mm tape',
            attachments: [{ data_url: 'data:image/png;base64,abc' }],
            previousResponseId: ''
        })
        assert.equal(result, true)
    })

    it('forces editor_action for short follow-up confirmations', () => {
        const result = AssistantToolChoiceUtils.shouldForceEditorToolChoice({
            message: 'yes',
            attachments: [],
            previousResponseId: 'resp_123'
        })
        assert.equal(result, true)
    })

    it('does not force editor_action for plain non-image questions', () => {
        const result = AssistantToolChoiceUtils.shouldForceEditorToolChoice({
            message: 'How do I use alignment?',
            attachments: [],
            previousResponseId: ''
        })
        assert.equal(result, false)
    })

    it('forces editor_action for image-only rebuild requests without explicit text', () => {
        const result = AssistantToolChoiceUtils.shouldForceEditorToolChoice({
            message: '',
            attachments: [{ dataUrl: 'data:image/jpeg;base64,abc' }],
            previousResponseId: ''
        })
        assert.equal(result, true)
    })

    it('does not force editor_action for image prompts that are explicit questions', () => {
        const result = AssistantToolChoiceUtils.shouldForceEditorToolChoice({
            message: 'Can you explain what this label means?',
            attachments: [{ data_url: 'data:image/png;base64,abc' }],
            previousResponseId: ''
        })
        assert.equal(result, false)
    })
})
