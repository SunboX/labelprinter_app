/**
 * Utilities for extracting assistant text and function-call actions from OpenAI Responses payloads.
 */
export class AiResponseUtils {
    /**
     * Extracts assistant plain text from a Responses API payload.
     * @param {any} response
     * @returns {string}
     */
    static extractOutputText(response) {
        if (response && typeof response.output_text === 'string') {
            return response.output_text.trim()
        }
        const outputItems = Array.isArray(response?.output) ? response.output : []
        let text = ''
        outputItems.forEach((item) => {
            if (item?.type !== 'message' || !Array.isArray(item.content)) return
            item.content.forEach((contentItem) => {
                if (contentItem?.type !== 'output_text') return
                if (typeof contentItem.text !== 'string') return
                text += contentItem.text
            })
        })
        return text.trim()
    }

    /**
     * Extracts action requests from function calls returned by the model.
     * Supports single-action and multi-action argument formats.
     * @param {any} response
     * @returns {Array<Record<string, any>>}
     */
    static extractActions(response) {
        const outputItems = Array.isArray(response?.output) ? response.output : []
        const actions = []
        outputItems.forEach((item) => {
            if (item?.type !== 'function_call') return
            const args = this.#parseArguments(item.arguments)
            this.#extractActionsFromArguments(args).forEach((action) => actions.push(action))
        })
        return actions
    }

    /**
     * Extracts incomplete reason when the response could not finish.
     * @param {any} response
     * @returns {string}
     */
    static extractIncompleteReason(response) {
        const status = typeof response?.status === 'string' ? response.status.trim().toLowerCase() : ''
        if (status !== 'incomplete') return ''
        const reason = response?.incomplete_details?.reason
        return typeof reason === 'string' ? reason.trim().toLowerCase() : ''
    }

    /**
     * Counts function_call output entries.
     * @param {any} response
     * @returns {number}
     */
    static countFunctionCalls(response) {
        const outputItems = Array.isArray(response?.output) ? response.output : []
        return outputItems.filter((item) => item?.type === 'function_call').length
    }

    /**
     * Parses a function-call arguments payload that may be a JSON string or plain object.
     * @param {unknown} rawArguments
     * @returns {Record<string, any> | null}
     */
    static #parseArguments(rawArguments) {
        if (rawArguments && typeof rawArguments === 'object') {
            return { ...rawArguments }
        }
        if (typeof rawArguments !== 'string' || !rawArguments.trim()) {
            return null
        }
        try {
            const parsed = JSON.parse(rawArguments)
            if (!parsed || typeof parsed !== 'object') return null
            return { ...parsed }
        } catch (_error) {
            return null
        }
    }

    /**
     * Extracts action objects from supported argument shapes.
     * Accepts legacy and nested wrappers to stay resilient to model/schema drift.
     * @param {Record<string, any> | null} args
     * @returns {Array<Record<string, any>>}
     */
    static #extractActionsFromArguments(args) {
        if (!args || typeof args !== 'object') return []
        const candidates = [args, args.payload, args.request, args.input].filter(
            (candidate) => candidate && typeof candidate === 'object'
        )
        for (const candidate of candidates) {
            if (Array.isArray(candidate)) {
                const asArrayActions = candidate.filter(
                    (entry) => entry && typeof entry === 'object' && typeof entry.action === 'string'
                )
                if (asArrayActions.length) {
                    return asArrayActions.map((entry) => ({ ...entry }))
                }
                continue
            }
            if (Array.isArray(candidate.actions)) {
                const batched = candidate.actions.filter(
                    (entry) => entry && typeof entry === 'object' && typeof entry.action === 'string'
                )
                if (batched.length) {
                    return batched.map((entry) => ({ ...entry }))
                }
            }
            if (typeof candidate.action === 'string') {
                return [{ ...candidate }]
            }
        }
        return []
    }
}
