/**
 * Normalizes assistant backend/upstream errors into user-facing messages.
 */
export class AssistantErrorUtils {
    /**
     * Extracts a machine-friendly error code from heterogeneous payloads.
     * @param {unknown} payload
     * @returns {string}
     */
    static extractErrorCode(payload) {
        if (!payload || typeof payload !== 'object') return ''
        const objectPayload = /** @type {Record<string, any>} */ (payload)
        if (typeof objectPayload.error === 'object' && objectPayload.error) {
            if (typeof objectPayload.error.code === 'string') {
                return objectPayload.error.code.trim()
            }
            if (typeof objectPayload.error.type === 'string') {
                return objectPayload.error.type.trim()
            }
        }
        if (typeof objectPayload.code === 'string') {
            return objectPayload.code.trim()
        }
        return ''
    }

    /**
     * Extracts a human-readable message from heterogeneous payloads.
     * @param {unknown} payload
     * @returns {string}
     */
    static extractErrorMessage(payload) {
        if (typeof payload === 'string') {
            return payload.trim()
        }
        if (!payload || typeof payload !== 'object') return ''
        const objectPayload = /** @type {Record<string, any>} */ (payload)
        if (typeof objectPayload.error === 'string') {
            return objectPayload.error.trim()
        }
        if (typeof objectPayload.error === 'object' && objectPayload.error) {
            if (typeof objectPayload.error.message === 'string') {
                return objectPayload.error.message.trim()
            }
        }
        if (typeof objectPayload.message === 'string') {
            return objectPayload.message.trim()
        }
        if (typeof objectPayload.detail === 'string') {
            return objectPayload.detail.trim()
        }
        return ''
    }

    /**
     * Builds a translated, user-facing error message for failed assistant requests.
     * @param {object} input
     * @param {number} input.status
     * @param {unknown} input.payload
     * @param {string} [input.fallbackText]
     * @param {(key: string, params?: Record<string, string | number>) => string} input.translate
     * @returns {string}
     */
    static buildRequestErrorMessage({ status, payload, fallbackText = '', translate }) {
        const translateFn = typeof translate === 'function' ? translate : (key) => key
        const normalizedStatus = Number(status || 0)
        const code = AssistantErrorUtils.extractErrorCode(payload).toLowerCase()
        const payloadMessage = AssistantErrorUtils.extractErrorMessage(payload)
        const detail = payloadMessage || String(fallbackText || '').trim()

        if (normalizedStatus === 429) {
            if (code === 'insufficient_quota') {
                return translateFn('assistant.errorQuota')
            }
            return translateFn('assistant.errorRateLimit')
        }

        if (normalizedStatus === 401 || normalizedStatus === 403) {
            return translateFn('assistant.errorAuth')
        }

        if (
            code === 'model_not_found' ||
            code === 'invalid_model' ||
            code === 'unsupported_model' ||
            detail.toLowerCase().includes('model_not_found')
        ) {
            return translateFn('assistant.errorModel')
        }

        if (normalizedStatus >= 500) {
            return translateFn('assistant.errorServer')
        }

        if (detail) {
            return translateFn('assistant.errorWithDetails', { message: detail })
        }

        return translateFn('assistant.errorHttp', { status: normalizedStatus || '?' })
    }

    /**
     * Builds a readable message for thrown network/runtime exceptions.
     * @param {unknown} error
     * @param {(key: string, params?: Record<string, string | number>) => string} translate
     * @returns {string}
     */
    static buildRuntimeErrorMessage(error, translate) {
        const translateFn = typeof translate === 'function' ? translate : (key) => key
        const message = String(
            error && typeof error === 'object' && 'message' in error ? /** @type {{ message?: unknown }} */ (error).message : ''
        ).trim()
        const normalized = message.toLowerCase()
        if (
            normalized === 'failed to fetch' ||
            normalized.includes('networkerror') ||
            normalized.includes('network request failed') ||
            normalized.includes('load failed')
        ) {
            return translateFn('assistant.errorNetwork')
        }
        return message || translateFn('messages.unknownError')
    }
}
