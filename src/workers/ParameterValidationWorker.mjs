import { ParameterTemplateUtils } from '../ParameterTemplateUtils.mjs'

/**
 * Handles incoming parameter validation requests.
 * @param {MessageEvent<any>} event
 */
async function handleWorkerMessage(event) {
    const data = event?.data || {}
    if (String(data?.type || '') !== 'validateParameters') return
    const requestId = Number(data?.requestId)
    if (!Number.isInteger(requestId) || requestId < 1) return

    try {
        const payload = buildValidationPayload(data?.payload)
        const validation = ParameterTemplateUtils.validateParameterSetup(
            payload.definitions,
            payload.items,
            payload.rows,
            payload.rawJson
        )
        const preview = ParameterTemplateUtils.buildPrettyArrayPreview(payload.rows)
        postSuccess(requestId, {
            validation,
            previewText: preview.prettyText,
            rowLineRanges: preview.rowLineRanges
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Parameter validation failed.'
        postError(requestId, message)
    }
}

/**
 * Builds a normalized validation payload.
 * @param {any} payload
 * @returns {{ definitions: object[], items: object[], rows: Record<string, unknown>[], rawJson: string }}
 */
function buildValidationPayload(payload) {
    return {
        definitions: Array.isArray(payload?.definitions) ? payload.definitions : [],
        items: Array.isArray(payload?.items) ? payload.items : [],
        rows: Array.isArray(payload?.rows) ? payload.rows : [],
        rawJson: String(payload?.rawJson || '')
    }
}

/**
 * Posts one successful response.
 * @param {number} requestId
 * @param {{
 *  validation: { errors: object[], warnings: object[], placeholders: string[] },
 *  previewText: string,
 *  rowLineRanges: Array<{ start: number, end: number }>
 * }} payload
 */
function postSuccess(requestId, payload) {
    globalThis.postMessage({
        type: 'validateParameters:ok',
        requestId,
        payload
    })
}

/**
 * Posts one failed response.
 * @param {number} requestId
 * @param {string} message
 */
function postError(requestId, message) {
    globalThis.postMessage({
        type: 'validateParameters:error',
        requestId,
        error: { message: String(message || 'Parameter validation failed.') }
    })
}

globalThis.onmessage = (event) => {
    void handleWorkerMessage(event)
}
