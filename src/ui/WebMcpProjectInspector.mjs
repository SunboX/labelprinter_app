// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Builds compact WebMCP label context and validation payloads.
 */
export class WebMcpProjectInspector {
    /**
     * Builds current label context for read-only WebMCP calls.
     * @param {{ payload: Record<string, any>, uiState: Record<string, any>, parameterState: Record<string, any>, supportedValues: Record<string, any>, toolName: string }} options
     * @returns {Record<string, any>}
     */
    static buildLabelContext(options) {
        const payload = options.payload || {}
        const uiState = options.uiState || {}
        const parameterState = options.parameterState || {}
        return {
            toolName: options.toolName,
            label: WebMcpProjectInspector.#buildLabelSettings(payload),
            itemCount: WebMcpProjectInspector.#countItems(payload),
            itemTypes: WebMcpProjectInspector.#countItemTypes(payload),
            selectedItemIds: WebMcpProjectInspector.resolveSelectedItemIds(uiState),
            parameters: WebMcpProjectInspector.#summarizeParameters(payload),
            parameterState: WebMcpProjectInspector.#summarizeParameterState(parameterState),
            warnings: WebMcpProjectInspector.#collectWarnings(uiState, parameterState)
        }
    }

    /**
     * Builds current project validation for print preparation.
     * @param {{ payload: Record<string, any>, uiState: Record<string, any>, parameterState: Record<string, any>, parameterPanel: any, supportedValues: Record<string, any> }} options
     * @returns {Record<string, any>}
     */
    static buildProjectValidation(options) {
        const payload = options.payload || {}
        const parameterState = options.parameterState || {}
        const errors = []
        const warnings = []
        const checks = []
        const itemCount = WebMcpProjectInspector.#countItems(payload)

        WebMcpProjectInspector.#validateRequiredLabelSettings(payload, warnings, checks)
        WebMcpProjectInspector.#validateSupportedSettings(payload, errors, checks)
        WebMcpProjectInspector.#validateBleSettings(payload, errors, checks)
        WebMcpProjectInspector.#validateParameterState(parameterState, errors, warnings, checks)
        WebMcpProjectInspector.#validateParameterRows(payload, warnings)

        if (!itemCount) {
            warnings.push('No label items are present.')
        }

        return {
            valid: errors.length === 0,
            printReady: errors.length === 0 && itemCount > 0,
            errors,
            warnings,
            checks,
            itemCount,
            selectedItemIds: WebMcpProjectInspector.resolveSelectedItemIds(options.uiState || {}),
            parameterBatchCount: WebMcpProjectInspector.countPrintBatches(options.parameterPanel, payload),
            label: WebMcpProjectInspector.#buildLabelSettings(payload)
        }
    }

    /**
     * Counts print batches using the parameter panel when available.
     * @param {any} parameterPanel
     * @param {Record<string, any>} payload
     * @returns {number}
     */
    static countPrintBatches(parameterPanel, payload) {
        try {
            if (typeof parameterPanel?.buildPrintParameterValueMaps === 'function') {
                const maps = parameterPanel.buildPrintParameterValueMaps()
                if (Array.isArray(maps)) return Math.max(1, maps.length)
            }
        } catch (_error) {}
        const rows = Array.isArray(payload?.parameterDataRows) ? payload.parameterDataRows : []
        return Math.max(1, rows.length)
    }

    /**
     * Extracts selected item identifiers from known UI-state shapes.
     * @param {Record<string, any>} uiState
     * @returns {string[]}
     */
    static resolveSelectedItemIds(uiState) {
        const candidateLists = [uiState?.selectedItemIds, uiState?.selection, uiState?.selectedItems]
        for (const candidateList of candidateLists) {
            const ids = WebMcpProjectInspector.#coerceIdList(candidateList)
            if (ids.length) return ids
        }
        return []
    }

    /**
     * Builds compact label settings from a project payload.
     * @param {Record<string, any>} payload
     * @returns {Record<string, any>}
     */
    static #buildLabelSettings(payload) {
        return {
            backend: payload.backend || null,
            printer: payload.printer || null,
            media: payload.media || null,
            resolution: payload.resolution || null,
            orientation: payload.orientation || null,
            mediaLengthMm: Number.isFinite(Number(payload.mediaLengthMm)) ? Number(payload.mediaLengthMm) : null
        }
    }

    /**
     * Counts label items defensively.
     * @param {Record<string, any>} payload
     * @returns {number}
     */
    static #countItems(payload) {
        return Array.isArray(payload.items) ? payload.items.length : 0
    }

    /**
     * Counts item types in the current project.
     * @param {Record<string, any>} payload
     * @returns {Record<string, number>}
     */
    static #countItemTypes(payload) {
        const counts = {}
        if (!Array.isArray(payload.items)) return counts
        for (const item of payload.items) {
            const type = String(item?.type || item?.itemType || 'unknown').trim() || 'unknown'
            counts[type] = (counts[type] || 0) + 1
        }
        return counts
    }

    /**
     * Summarizes parameter definitions and data row counts.
     * @param {Record<string, any>} payload
     * @returns {Record<string, any>}
     */
    static #summarizeParameters(payload) {
        const definitions = Array.isArray(payload.parameters)
            ? payload.parameters.map((entry) => ({
                  name: String(entry?.name || ''),
                  hasDefaultValue: String(entry?.defaultValue ?? '') !== ''
              }))
            : []
        return {
            definitions,
            definitionCount: definitions.length,
            rowCount: Array.isArray(payload.parameterDataRows) ? payload.parameterDataRows.length : 0,
            sourceName: typeof payload.parameterDataSourceName === 'string' ? payload.parameterDataSourceName : ''
        }
    }

    /**
     * Summarizes parameter state for compact context output.
     * @param {Record<string, any>} parameterState
     * @returns {Record<string, any>}
     */
    static #summarizeParameterState(parameterState) {
        return {
            rowCount: Number.isFinite(Number(parameterState?.rowCount)) ? Number(parameterState.rowCount) : 0,
            sourceName: typeof parameterState?.sourceName === 'string' ? parameterState.sourceName : '',
            hasBlockingErrors: Boolean(parameterState?.hasBlockingErrors),
            parseError: parameterState?.parseError || null,
            validationErrorCount: Array.isArray(parameterState?.validationErrors)
                ? parameterState.validationErrors.length
                : 0,
            validationWarningCount: Array.isArray(parameterState?.validationWarnings)
                ? parameterState.validationWarnings.length
                : 0
        }
    }

    /**
     * Collects warning strings from UI and parameter validation state.
     * @param {Record<string, any>} uiState
     * @param {Record<string, any>} parameterState
     * @returns {string[]}
     */
    static #collectWarnings(uiState, parameterState) {
        return WebMcpProjectInspector.#normalizeIssueList(uiState?.warnings).concat(
            WebMcpProjectInspector.#normalizeIssueList(parameterState?.validationWarnings)
        )
    }

    /**
     * Validates required label setting presence.
     * @param {Record<string, any>} payload
     * @param {string[]} warnings
     * @param {string[]} checks
     */
    static #validateRequiredLabelSettings(payload, warnings, checks) {
        for (const key of ['backend', 'printer', 'media', 'resolution', 'orientation']) {
            if (!String(payload[key] || '').trim()) {
                warnings.push(`Missing label setting: ${key}.`)
            } else {
                checks.push(`${key}:ok`)
            }
        }
    }

    /**
     * Validates enum-like settings owned by this app.
     * @param {Record<string, any>} payload
     * @param {string[]} errors
     * @param {string[]} checks
     */
    static #validateSupportedSettings(payload, errors, checks) {
        const backend = String(payload.backend || '').trim()
        const orientation = String(payload.orientation || '').trim()
        if (backend && !['usb', 'ble'].includes(backend)) {
            errors.push(`Unsupported backend: ${backend}.`)
        } else if (backend) {
            checks.push('backend-supported:ok')
        }
        if (orientation && !['horizontal', 'vertical'].includes(orientation)) {
            errors.push(`Unsupported orientation: ${orientation}.`)
        } else if (orientation) {
            checks.push('orientation-supported:ok')
        }
    }

    /**
     * Validates BLE settings when BLE printing is selected.
     * @param {Record<string, any>} payload
     * @param {string[]} errors
     * @param {string[]} checks
     */
    static #validateBleSettings(payload, errors, checks) {
        if (String(payload.backend || '').trim() !== 'ble') return
        const ble = payload.ble && typeof payload.ble === 'object' && !Array.isArray(payload.ble) ? payload.ble : {}
        for (const key of ['serviceUuid', 'writeCharacteristicUuid']) {
            if (!String(ble[key] || '').trim()) {
                errors.push(`BLE ${key} is required before printing over BLE.`)
            }
        }
        if (!errors.some((message) => message.startsWith('BLE '))) {
            checks.push('ble-required-settings:ok')
        }
    }

    /**
     * Validates current parameter parser and setup state.
     * @param {Record<string, any>} parameterState
     * @param {string[]} errors
     * @param {string[]} warnings
     * @param {string[]} checks
     */
    static #validateParameterState(parameterState, errors, warnings, checks) {
        if (parameterState?.parseError) {
            errors.push(`Parameter data parse error: ${parameterState.parseError}`)
        }
        if (Array.isArray(parameterState?.validationErrors)) {
            errors.push(...WebMcpProjectInspector.#normalizeIssueList(parameterState.validationErrors))
        }
        if (Array.isArray(parameterState?.validationWarnings)) {
            warnings.push(...WebMcpProjectInspector.#normalizeIssueList(parameterState.validationWarnings))
        }
        if (!parameterState?.hasBlockingErrors) {
            checks.push('parameter-validation:ok')
        }
    }

    /**
     * Adds warnings for empty parameter values in row data.
     * @param {Record<string, any>} payload
     * @param {string[]} warnings
     */
    static #validateParameterRows(payload, warnings) {
        const parameters = Array.isArray(payload.parameters) ? payload.parameters : []
        const rows = Array.isArray(payload.parameterDataRows) ? payload.parameterDataRows : []
        parameters.forEach((parameter) => {
            const name = String(parameter?.name || '').trim()
            if (!name) return
            rows.forEach((row, rowIndex) => {
                if (!row || typeof row !== 'object' || Array.isArray(row)) return
                const value = row[name]
                if (value === undefined || value === null || String(value).trim() === '') {
                    warnings.push(`Parameter data row ${rowIndex + 1} has no value for ${name}.`)
                }
            })
        })
    }

    /**
     * Coerces mixed selected-item representations into ids.
     * @param {unknown} candidateList
     * @returns {string[]}
     */
    static #coerceIdList(candidateList) {
        if (!Array.isArray(candidateList)) return []
        return candidateList
            .map((entry) => (entry && typeof entry === 'object' ? entry.id : entry))
            .map((entry) => String(entry || '').trim())
            .filter(Boolean)
    }

    /**
     * Normalizes mixed warning/error entries to short strings.
     * @param {unknown} rawIssues
     * @returns {string[]}
     */
    static #normalizeIssueList(rawIssues) {
        if (!Array.isArray(rawIssues)) return []
        return rawIssues.map((issue) => WebMcpProjectInspector.#normalizeIssue(issue)).filter(Boolean)
    }

    /**
     * Normalizes one validation issue entry.
     * @param {unknown} issue
     * @returns {string}
     */
    static #normalizeIssue(issue) {
        if (typeof issue === 'string') return issue.trim()
        if (!issue || typeof issue !== 'object') return ''
        const record = /** @type {Record<string, any>} */ (issue)
        if (record.message) return String(record.message).trim()
        if (record.code && record.parameterName) return `${record.code}: ${record.parameterName}`
        if (record.code) return String(record.code).trim()
        return JSON.stringify(record)
    }
}
