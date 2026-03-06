import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AssistantBackendConfig } from '../src/AssistantBackendConfig.mjs'

describe('assistant backend config', () => {
    it('defaults the backend model to gpt-5.4', () => {
        assert.equal(AssistantBackendConfig.defaultModel, 'gpt-5.4')
        assert.equal(AssistantBackendConfig.resolveModel(''), 'gpt-5.4')
        assert.equal(AssistantBackendConfig.resolveModel(' gpt-5.4 '), 'gpt-5.4')
    })

    it('accepts GPT-5.4 reasoning effort values', () => {
        assert.equal(AssistantBackendConfig.parseReasoningEffort('none'), 'none')
        assert.equal(AssistantBackendConfig.parseReasoningEffort('xhigh'), 'xhigh')
    })

    it('keeps legacy reasoning effort values valid', () => {
        assert.equal(AssistantBackendConfig.parseReasoningEffort('minimal'), 'minimal')
        assert.equal(AssistantBackendConfig.parseReasoningEffort('medium'), 'medium')
    })

    it('falls back when reasoning effort is invalid', () => {
        assert.equal(AssistantBackendConfig.parseReasoningEffort('unexpected', 'high'), 'high')
    })
})
