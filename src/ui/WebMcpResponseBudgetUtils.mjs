// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const DEFAULT_OUTPUT_CHAR_BUDGET = 1500
const DEFAULT_TOOL_NAME = 'labelprinter_action'

/**
 * Keeps WebMCP tool responses inside the current output-budget guidance.
 */
export class WebMcpResponseBudgetUtils {
    /**
     * Serializes the WebMCP response while keeping oversized outputs concise.
     * @param {{ ok: boolean, executed: string[], errors: string[], warnings: string[], results: any[], uiState: any }} envelope
     * @param {{ outputCharBudget?: number, toolName?: string }} [options]
     * @returns {string}
     */
    static serializeEnvelope(envelope, options = {}) {
        const budget = Number.isFinite(Number(options.outputCharBudget))
            ? Number(options.outputCharBudget)
            : DEFAULT_OUTPUT_CHAR_BUDGET
        const toolName = String(options.toolName || DEFAULT_TOOL_NAME)
        const fullText = JSON.stringify(envelope, null, 2)
        if (fullText.length <= budget) {
            return fullText
        }

        const shortenedEnvelope = WebMcpResponseBudgetUtils.#buildShortenedOutputEnvelope(
            envelope,
            fullText.length,
            budget,
            toolName
        )
        const shortenedText = JSON.stringify(shortenedEnvelope)
        if (shortenedText.length <= budget) {
            return shortenedText
        }

        const minimalEnvelope = WebMcpResponseBudgetUtils.#buildMinimalOutputEnvelope(
            envelope,
            fullText.length,
            budget,
            toolName
        )
        const minimalText = JSON.stringify(minimalEnvelope)
        if (minimalText.length <= budget) {
            return minimalText
        }

        return JSON.stringify(
            {
                ok: Boolean(envelope.ok),
                warnings: [WebMcpResponseBudgetUtils.#buildOutputShortenedWarning(fullText.length, budget)]
            },
            null,
            2
        )
    }

    /**
     * Builds a compact response envelope for outputs that exceed WebMCP guidance.
     * @param {{ ok: boolean, executed: string[], errors: string[], warnings: string[], results: any[], uiState: any }} envelope
     * @param {number} originalLength
     * @param {number} budget
     * @param {string} toolName
     * @returns {Record<string, any>}
     */
    static #buildShortenedOutputEnvelope(envelope, originalLength, budget, toolName) {
        return {
            ok: Boolean(envelope.ok),
            executed: WebMcpResponseBudgetUtils.#summarizeStringList(envelope.executed, 8, 80),
            errors: WebMcpResponseBudgetUtils.#summarizeStringList(envelope.errors, 5, 160),
            warnings: WebMcpResponseBudgetUtils.#summarizeStringList(envelope.warnings, 4, 120).concat(
                WebMcpResponseBudgetUtils.#buildOutputShortenedWarning(originalLength, budget)
            ),
            results: WebMcpResponseBudgetUtils.#summarizeResultList(envelope.results, 8, toolName),
            uiState: WebMcpResponseBudgetUtils.#summarizeStructuredValue(envelope.uiState, 0)
        }
    }

    /**
     * Builds a minimal response envelope if the compact summary still exceeds budget.
     * @param {{ ok: boolean, executed: string[], errors: string[], warnings: string[], results: any[], uiState: any }} envelope
     * @param {number} originalLength
     * @param {number} budget
     * @param {string} toolName
     * @returns {Record<string, any>}
     */
    static #buildMinimalOutputEnvelope(envelope, originalLength, budget, toolName) {
        return {
            ok: Boolean(envelope.ok),
            executed: WebMcpResponseBudgetUtils.#summarizeStringList(envelope.executed, 12, 80),
            errorCount: WebMcpResponseBudgetUtils.#countArrayItems(envelope.errors),
            warningCount: WebMcpResponseBudgetUtils.#countArrayItems(envelope.warnings),
            resultCount: WebMcpResponseBudgetUtils.#countArrayItems(envelope.results),
            errors: WebMcpResponseBudgetUtils.#summarizeStringList(envelope.errors, 2, 140),
            warnings: [WebMcpResponseBudgetUtils.#buildOutputShortenedWarning(originalLength, budget)],
            results: WebMcpResponseBudgetUtils.#summarizeMinimalResultList(envelope.results, 4, toolName)
        }
    }

    /**
     * Builds the warning added when output has been shortened.
     * @param {number} originalLength
     * @param {number} budget
     * @returns {string}
     */
    static #buildOutputShortenedWarning(originalLength, budget) {
        return `WebMCP output shortened from ${originalLength} characters to stay under ${budget}.`
    }

    /**
     * Summarizes a list of strings for compact tool output.
     * @param {unknown} rawList
     * @param {number} maxItems
     * @param {number} maxChars
     * @returns {string[]}
     */
    static #summarizeStringList(rawList, maxItems, maxChars) {
        if (!Array.isArray(rawList)) return []
        const values = rawList
            .slice(0, maxItems)
            .map((entry) => WebMcpResponseBudgetUtils.#truncateText(String(entry || '').trim(), maxChars))
            .filter(Boolean)
        if (rawList.length > maxItems) {
            values.push(`${rawList.length - maxItems} more omitted`)
        }
        return values
    }

    /**
     * Summarizes result entries without dumping full project or UI payloads.
     * @param {unknown} rawResults
     * @param {number} maxItems
     * @param {string} toolName
     * @returns {Array<Record<string, any>>}
     */
    static #summarizeResultList(rawResults, maxItems, toolName) {
        if (!Array.isArray(rawResults)) return []
        const results = rawResults
            .slice(0, maxItems)
            .map((result) => WebMcpResponseBudgetUtils.#summarizeResult(result, toolName))
        if (rawResults.length > maxItems) {
            results.push({
                action: 'more_results',
                omittedCount: rawResults.length - maxItems
            })
        }
        return results
    }

    /**
     * Summarizes result entries for the smallest fallback response.
     * @param {unknown} rawResults
     * @param {number} maxItems
     * @param {string} toolName
     * @returns {Array<Record<string, any>>}
     */
    static #summarizeMinimalResultList(rawResults, maxItems, toolName) {
        if (!Array.isArray(rawResults)) return []
        const results = rawResults
            .slice(0, maxItems)
            .map((result) => WebMcpResponseBudgetUtils.#summarizeMinimalResult(result, toolName))
        if (rawResults.length > maxItems) {
            results.push({
                action: 'more_results',
                omittedCount: rawResults.length - maxItems
            })
        }
        return results
    }

    /**
     * Preserves only high-value fields for one minimal fallback result.
     * @param {unknown} rawResult
     * @param {string} toolName
     * @returns {Record<string, any>}
     */
    static #summarizeMinimalResult(rawResult, toolName) {
        if (!rawResult || typeof rawResult !== 'object' || Array.isArray(rawResult)) {
            return { action: 'result' }
        }
        const resultRecord = /** @type {Record<string, any>} */ (rawResult)
        const actionName = String(resultRecord.action || 'result')
        if (actionName === 'get_action_capabilities') {
            const capabilities = WebMcpResponseBudgetUtils.#summarizeCapabilities(resultRecord.capabilities, toolName)
            return {
                action: actionName,
                capabilities: {
                    webMcp: {
                        extendedActions: capabilities.webMcp.extendedActions
                    }
                }
            }
        }
        if (actionName === 'get_supported_values') {
            const supportedValues = WebMcpResponseBudgetUtils.#summarizeSupportedValues(
                resultRecord.supportedValues,
                toolName
            )
            return {
                action: actionName,
                supportedValues: {
                    printers: supportedValues.printers,
                    media: supportedValues.media,
                    resolutions: supportedValues.resolutions
                }
            }
        }
        if (actionName === 'get_parameter_state') {
            return {
                action: actionName,
                parameterState: WebMcpResponseBudgetUtils.#summarizeParameterState(resultRecord.parameterState)
            }
        }
        return { action: actionName }
    }

    /**
     * Summarizes one result value for budgeted WebMCP output.
     * @param {unknown} rawResult
     * @param {string} toolName
     * @returns {Record<string, any>}
     */
    static #summarizeResult(rawResult, toolName) {
        if (!rawResult || typeof rawResult !== 'object' || Array.isArray(rawResult)) {
            return {
                action: 'result',
                value: WebMcpResponseBudgetUtils.#summarizeStructuredValue(rawResult, 0)
            }
        }

        const resultRecord = /** @type {Record<string, any>} */ (rawResult)
        const actionName = String(resultRecord.action || 'result')
        if (actionName === 'export_project_json') {
            return {
                action: actionName,
                payload: WebMcpResponseBudgetUtils.#summarizeProjectPayload(resultRecord.payload)
            }
        }
        if (actionName === 'get_ui_state') {
            return {
                action: actionName,
                uiState: WebMcpResponseBudgetUtils.#summarizeStructuredValue(resultRecord.uiState, 0)
            }
        }
        if (actionName === 'get_action_capabilities') {
            return {
                action: actionName,
                capabilities: WebMcpResponseBudgetUtils.#summarizeCapabilities(resultRecord.capabilities, toolName)
            }
        }
        if (actionName === 'get_supported_values') {
            return {
                action: actionName,
                supportedValues: WebMcpResponseBudgetUtils.#summarizeSupportedValues(
                    resultRecord.supportedValues,
                    toolName
                )
            }
        }
        if (actionName === 'get_parameter_state') {
            return {
                action: actionName,
                parameterState: WebMcpResponseBudgetUtils.#summarizeParameterState(resultRecord.parameterState)
            }
        }

        const summary = {}
        for (const [key, value] of Object.entries(resultRecord)) {
            if (key === 'action') {
                summary.action = WebMcpResponseBudgetUtils.#truncateText(String(value || 'result'), 60)
                continue
            }
            if (['executed', 'errors', 'warnings'].includes(key) && Array.isArray(value)) {
                summary[`${key}Count`] = value.length
                continue
            }
            summary[key] = WebMcpResponseBudgetUtils.#summarizeStructuredValue(value, 0)
        }
        if (!Object.hasOwn(summary, 'action')) {
            summary.action = 'result'
        }
        return summary
    }

    /**
     * Summarizes exported project data without returning full item contents.
     * @param {unknown} rawPayload
     * @returns {Record<string, any>}
     */
    static #summarizeProjectPayload(rawPayload) {
        if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
            return { type: typeof rawPayload }
        }
        const payload = /** @type {Record<string, any>} */ (rawPayload)
        return {
            type: 'object',
            version:
                typeof payload.version === 'string'
                    ? WebMcpResponseBudgetUtils.#truncateText(payload.version, 40)
                    : null,
            itemCount: Array.isArray(payload.items) ? payload.items.length : 0,
            parameterCount: Array.isArray(payload.parameters) ? payload.parameters.length : 0,
            parameterRowCount: Array.isArray(payload.parameterDataRows) ? payload.parameterDataRows.length : 0,
            keys: Object.keys(payload).slice(0, 8)
        }
    }

    /**
     * Preserves concise capability fields that help agents choose actions.
     * @param {unknown} rawCapabilities
     * @param {string} toolName
     * @returns {Record<string, any>}
     */
    static #summarizeCapabilities(rawCapabilities, toolName) {
        const capabilities =
            rawCapabilities && typeof rawCapabilities === 'object' && !Array.isArray(rawCapabilities)
                ? /** @type {Record<string, any>} */ (rawCapabilities)
                : {}
        const webMcp =
            capabilities.webMcp && typeof capabilities.webMcp === 'object' && !Array.isArray(capabilities.webMcp)
                ? /** @type {Record<string, any>} */ (capabilities.webMcp)
                : {}
        return {
            actions: WebMcpResponseBudgetUtils.#summarizeStringList(capabilities.actions, 12, 40),
            webMcp: {
                toolName: WebMcpResponseBudgetUtils.#truncateText(String(webMcp.toolName || toolName), 40),
                extendedActions: WebMcpResponseBudgetUtils.#summarizeStringList(webMcp.extendedActions, 30, 40)
            }
        }
    }

    /**
     * Preserves compact supported-value lists for agent parameter selection.
     * @param {unknown} rawSupportedValues
     * @param {string} toolName
     * @returns {Record<string, any>}
     */
    static #summarizeSupportedValues(rawSupportedValues, toolName) {
        const supportedValues =
            rawSupportedValues && typeof rawSupportedValues === 'object' && !Array.isArray(rawSupportedValues)
                ? /** @type {Record<string, any>} */ (rawSupportedValues)
                : {}
        return {
            toolName: WebMcpResponseBudgetUtils.#truncateText(String(supportedValues.toolName || toolName), 40),
            locales: WebMcpResponseBudgetUtils.#summarizeStringList(supportedValues.locales, 8, 20),
            backends: WebMcpResponseBudgetUtils.#summarizeStringList(supportedValues.backends, 8, 20),
            orientations: WebMcpResponseBudgetUtils.#summarizeStringList(supportedValues.orientations, 8, 20),
            printers: WebMcpResponseBudgetUtils.#summarizeStringList(supportedValues.printers, 16, 30),
            media: WebMcpResponseBudgetUtils.#summarizeStringList(supportedValues.media, 20, 30),
            resolutions: WebMcpResponseBudgetUtils.#summarizeStringList(supportedValues.resolutions, 12, 30),
            current: WebMcpResponseBudgetUtils.#summarizeStructuredValue(supportedValues.current, 0)
        }
    }

    /**
     * Preserves parameter-state counts and validation status.
     * @param {unknown} rawParameterState
     * @returns {Record<string, any>}
     */
    static #summarizeParameterState(rawParameterState) {
        const parameterState =
            rawParameterState && typeof rawParameterState === 'object' && !Array.isArray(rawParameterState)
                ? /** @type {Record<string, any>} */ (rawParameterState)
                : {}
        return {
            parameterCount: Array.isArray(parameterState.parameters) ? parameterState.parameters.length : 0,
            rowCount: Number.isFinite(Number(parameterState.rowCount)) ? Number(parameterState.rowCount) : 0,
            sourceName: WebMcpResponseBudgetUtils.#truncateText(String(parameterState.sourceName || ''), 80),
            hasBlockingErrors: Boolean(parameterState.hasBlockingErrors),
            parseError: parameterState.parseError
                ? WebMcpResponseBudgetUtils.#truncateText(String(parameterState.parseError), 120)
                : null,
            validationErrorCount: Array.isArray(parameterState.validationErrors)
                ? parameterState.validationErrors.length
                : 0,
            validationWarningCount: Array.isArray(parameterState.validationWarnings)
                ? parameterState.validationWarnings.length
                : 0
        }
    }

    /**
     * Builds a compact structural summary for nested payloads.
     * @param {unknown} value
     * @param {number} depth
     * @returns {any}
     */
    static #summarizeStructuredValue(value, depth) {
        if (value === null || typeof value === 'boolean') return value
        if (typeof value === 'number') return Number.isFinite(value) ? value : null
        if (typeof value === 'string') {
            return WebMcpResponseBudgetUtils.#truncateText(value, depth > 0 ? 80 : 120)
        }
        if (Array.isArray(value)) {
            const summary = {
                type: 'array',
                length: value.length
            }
            if (depth < 1 && value.length) {
                summary.sample = value
                    .slice(0, 3)
                    .map((entry) => WebMcpResponseBudgetUtils.#summarizeStructuredValue(entry, depth + 1))
            }
            return summary
        }
        if (value && typeof value === 'object') {
            const record = /** @type {Record<string, any>} */ (value)
            const entries = Object.entries(record)
            const summary = {
                type: 'object',
                keys: entries.slice(0, 8).map(([key]) => key)
            }
            if (entries.length > 8) {
                summary.omittedKeys = entries.length - 8
            }
            WebMcpResponseBudgetUtils.#appendKnownArrayCounts(summary, record)
            if (depth < 1) {
                const scalarEntries = entries
                    .filter(([_key, entryValue]) => WebMcpResponseBudgetUtils.#isScalarValue(entryValue))
                    .slice(0, 4)
                if (scalarEntries.length) {
                    summary.values = Object.fromEntries(
                        scalarEntries.map(([key, entryValue]) => [
                            key,
                            WebMcpResponseBudgetUtils.#summarizeStructuredValue(entryValue, depth + 1)
                        ])
                    )
                }
            }
            return summary
        }
        return WebMcpResponseBudgetUtils.#truncateText(String(value || ''), 80)
    }

    /**
     * Adds counts for known array fields that are useful to agents.
     * @param {Record<string, any>} summary
     * @param {Record<string, any>} record
     */
    static #appendKnownArrayCounts(summary, record) {
        for (const key of [
            'items',
            'parameters',
            'parameterDataRows',
            'validationErrors',
            'validationWarnings',
            'actions',
            'extendedActions'
        ]) {
            if (Array.isArray(record[key])) {
                summary[`${key}Count`] = record[key].length
            }
        }
    }

    /**
     * Returns true when a value can be represented directly in a compact summary.
     * @param {unknown} value
     * @returns {boolean}
     */
    static #isScalarValue(value) {
        return value === null || ['string', 'number', 'boolean'].includes(typeof value)
    }

    /**
     * Counts array items defensively.
     * @param {unknown} value
     * @returns {number}
     */
    static #countArrayItems(value) {
        return Array.isArray(value) ? value.length : 0
    }

    /**
     * Truncates a string to a maximum character count.
     * @param {string} value
     * @param {number} maxChars
     * @returns {string}
     */
    static #truncateText(value, maxChars) {
        const text = String(value || '')
        if (text.length <= maxChars) return text
        return `${text.slice(0, Math.max(0, maxChars - 3))}...`
    }
}
