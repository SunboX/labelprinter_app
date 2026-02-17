import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AssistantErrorUtils } from '../src/AssistantErrorUtils.mjs'

/**
 * Creates a deterministic translation stub for error utility tests.
 * @returns {(key: string, params?: Record<string, string | number>) => string}
 */
function createTranslate() {
    return (key, params = {}) => {
        if (key === 'assistant.errorHttp') return `HTTP ${params.status}`
        if (key === 'assistant.errorWithDetails') return String(params.message || '')
        return key
    }
}

describe('assistant-error-utils', () => {
    it('maps quota failures to a dedicated human-readable key', () => {
        const message = AssistantErrorUtils.buildRequestErrorMessage({
            status: 429,
            payload: { error: { code: 'insufficient_quota', message: 'quota hit' } },
            translate: createTranslate()
        })
        assert.equal(message, 'assistant.errorQuota')
    })

    it('maps generic 429 failures to rate-limit messaging', () => {
        const message = AssistantErrorUtils.buildRequestErrorMessage({
            status: 429,
            payload: { error: { message: 'too many requests' } },
            translate: createTranslate()
        })
        assert.equal(message, 'assistant.errorRateLimit')
    })

    it('maps auth failures to authentication messaging', () => {
        const message = AssistantErrorUtils.buildRequestErrorMessage({
            status: 401,
            payload: { error: { message: 'invalid key' } },
            translate: createTranslate()
        })
        assert.equal(message, 'assistant.errorAuth')
    })

    it('maps model availability failures to model messaging', () => {
        const message = AssistantErrorUtils.buildRequestErrorMessage({
            status: 400,
            payload: { error: { code: 'model_not_found', message: 'model unavailable' } },
            translate: createTranslate()
        })
        assert.equal(message, 'assistant.errorModel')
    })

    it('returns explicit server messaging for 5xx responses', () => {
        const message = AssistantErrorUtils.buildRequestErrorMessage({
            status: 502,
            payload: null,
            translate: createTranslate()
        })
        assert.equal(message, 'assistant.errorServer')
    })

    it('falls back to backend-provided details when available', () => {
        const message = AssistantErrorUtils.buildRequestErrorMessage({
            status: 400,
            payload: { error: { message: 'Invalid request payload' } },
            translate: createTranslate()
        })
        assert.equal(message, 'Invalid request payload')
    })

    it('maps missing tool output chaining errors to a dedicated recovery message', () => {
        const message = AssistantErrorUtils.buildRequestErrorMessage({
            status: 400,
            payload: {
                error: {
                    message: 'No tool output found for function call call_abc123.'
                }
            },
            translate: createTranslate()
        })
        assert.equal(message, 'assistant.errorMissingToolOutput')
    })

    it('falls back to generic HTTP status when no details are available', () => {
        const message = AssistantErrorUtils.buildRequestErrorMessage({
            status: 418,
            payload: null,
            fallbackText: '',
            translate: createTranslate()
        })
        assert.equal(message, 'HTTP 418')
    })

    it('maps network runtime exceptions to network messaging', () => {
        const message = AssistantErrorUtils.buildRuntimeErrorMessage(new Error('Failed to fetch'), createTranslate())
        assert.equal(message, 'assistant.errorNetwork')
    })

    it('keeps explicit runtime error messages when present', () => {
        const message = AssistantErrorUtils.buildRuntimeErrorMessage(new Error('Custom failure'), createTranslate())
        assert.equal(message, 'Custom failure')
    })
})
