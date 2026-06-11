// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { WebMcpBridgeSchemaUtils } from './WebMcpBridgeSchemaUtils.mjs'
import { WebMcpProjectInspector } from './WebMcpProjectInspector.mjs'
import { WebMcpResponseBudgetUtils } from './WebMcpResponseBudgetUtils.mjs'
import { WEB_MCP_TOOL_NAMES, WebMcpToolDefinitions } from './WebMcpToolDefinitions.mjs'

const WEB_MCP_SOURCE_LABEL = 'WebMCP'
const EDITOR_ACTION_NAMES = new Set([
    'add_item',
    'update_item',
    'remove_item',
    'clear_items',
    'set_label',
    'select_items',
    'align_selected',
    'print',
    'save_project',
    'share_project'
])

/**
 * Registers and serves the browser-side WebMCP tool for Labelprinter App.
 */
export class WebMcpBridge {
    #aiActionBridge = null
    #appController = null
    #translate = (key) => key
    #runtime = globalThis

    /**
     * @param {{
     *   aiActionBridge: { runActions: Function, getUiStateSnapshot: Function, getActionCapabilities: Function },
     *   appController: {
     *     setZoom: Function,
     *     setLocale: Function,
     *     applyProjectPayload: Function,
     *     loadProjectFromUrl: Function,
     *     loadParameterDataFromUrl: Function,
     *     buildProjectPayload: Function,
     *     buildProjectShareUrl: Function
     *   },
     *   translate?: (key: string, params?: Record<string, string | number>) => string,
     *   runtime?: any
     * }} options
     */
    constructor(options) {
        this.#aiActionBridge = options?.aiActionBridge || null
        this.#appController = options?.appController || null
        this.#translate = typeof options?.translate === 'function' ? options.translate : (key) => key
        this.#runtime = options?.runtime || globalThis
    }

    /**
     * Registers the WebMCP tool when document.modelContext is available.
     * @returns {Promise<boolean>}
     */
    async init() {
        const modelContext = this.#resolveModelContext()
        if (!modelContext) return false
        const toolDefinitions = this.#buildToolDefinitions()
        try {
            for (const toolDefinition of toolDefinitions) {
                await Promise.resolve(modelContext.registerTool(toolDefinition))
            }
            return true
        } catch (error) {
            console.info('WebMCP registration failed:', this.#normalizeErrorMessage(error))
        }
        return false
    }

    /**
     * Resolves the current WebMCP modelContext from the active runtime.
     * @returns {{ registerTool: Function } | null}
     */
    #resolveModelContext() {
        const documentRef = this.#runtime?.document
        const navigatorRef = this.#runtime?.navigator
        const candidates = [documentRef?.modelContext, navigatorRef?.modelContext]
        for (const modelContext of candidates) {
            if (!modelContext || typeof modelContext !== 'object') continue
            if (typeof modelContext.registerTool === 'function') {
                return modelContext
            }
        }
        return null
    }

    /**
     * Builds all WebMCP tool definitions.
     * @returns {Array<Record<string, any>>}
     */
    #buildToolDefinitions() {
        return WebMcpToolDefinitions.build({
            executeAction: async (input) => this.#executeTool(input),
            executeLabelContext: async () => this.#executeLabelContextTool(),
            executeValidateProject: async () => this.#executeValidateProjectTool(),
            executePreparePrint: async (input) => this.#executePreparePrintTool(input),
            executeImportLabelData: async (input) => this.#executeImportLabelDataTool(input)
        })
    }

    /**
     * Executes one tool invocation and returns the MCP content payload.
     * @param {Record<string, any>} input
     * @returns {Promise<{ content: Array<{ type: 'text', text: string }> }>}
     */
    async #executeTool(input) {
        const envelope = {
            ok: true,
            executed: [],
            errors: [],
            warnings: [],
            results: [],
            uiState: null
        }

        try {
            const actions = this.#extractActions(input)
            if (!actions.length) {
                throw new Error(this.#translate('assistant.actionMissing'))
            }
            await this.#runActionsInOrder(actions, envelope)
        } catch (error) {
            envelope.errors.push(this.#normalizeErrorMessage(error))
        }

        envelope.ok = envelope.errors.length === 0
        envelope.uiState = this.#safeGetUiStateSnapshot()
        return {
            content: [
                {
                    type: 'text',
                    text: WebMcpResponseBudgetUtils.serializeEnvelope(envelope, {
                        toolName: WEB_MCP_TOOL_NAMES.action
                    })
                }
            ]
        }
    }

    /**
     * Executes the focused label-context tool.
     * @returns {Promise<{ content: Array<{ type: 'text', text: string }> }>}
     */
    async #executeLabelContextTool() {
        const context = this.#buildLabelContext()
        return this.#buildToolResponse({ ok: true, context }, WEB_MCP_TOOL_NAMES.labelContext)
    }

    /**
     * Executes the focused project-validation tool.
     * @returns {Promise<{ content: Array<{ type: 'text', text: string }> }>}
     */
    async #executeValidateProjectTool() {
        await this.#waitForParameterValidation()
        const validation = this.#buildProjectValidation()
        return this.#buildToolResponse({ ok: true, validation }, WEB_MCP_TOOL_NAMES.validateProject)
    }

    /**
     * Executes print preparation without starting printer output.
     * @param {Record<string, any>} _input
     * @returns {Promise<{ content: Array<{ type: 'text', text: string }> }>}
     */
    async #executePreparePrintTool(_input) {
        await this.#waitForParameterValidation()
        const validation = this.#buildProjectValidation()
        const focusedPrintButton = validation.printReady ? this.#focusPrintButton() : false
        return this.#buildToolResponse(
            {
                ok: true,
                ready: validation.printReady,
                userActionRequired: true,
                focusedPrintButton,
                validation
            },
            WEB_MCP_TOOL_NAMES.preparePrint
        )
    }

    /**
     * Executes focused parameter data import.
     * @param {Record<string, any>} input
     * @returns {Promise<{ content: Array<{ type: 'text', text: string }> }>}
     */
    async #executeImportLabelDataTool(input) {
        try {
            const rows = this.#normalizeParameterDataRows(this.#extractImportLabelData(input))
            const sourceName = String(input?.sourceName || WEB_MCP_SOURCE_LABEL).trim() || WEB_MCP_SOURCE_LABEL
            const sourceLabel = this.#resolveSourceLabel(input?.sourceLabel)
            await this.#applyParameterDataRows(rows, sourceName, sourceLabel)
            return this.#buildToolResponse(
                {
                    ok: true,
                    imported: {
                        rowCount: rows.length,
                        sourceName
                    },
                    parameterState: this.#buildParameterStateSnapshot()
                },
                WEB_MCP_TOOL_NAMES.importLabelData
            )
        } catch (error) {
            return this.#buildToolResponse(
                {
                    ok: false,
                    errors: [this.#normalizeErrorMessage(error)]
                },
                WEB_MCP_TOOL_NAMES.importLabelData
            )
        }
    }

    /**
     * Builds a serialized WebMCP content response.
     * @param {Record<string, any>} payload
     * @param {string} toolName
     * @returns {{ content: Array<{ type: 'text', text: string }> }}
     */
    #buildToolResponse(payload, toolName) {
        return {
            content: [
                {
                    type: 'text',
                    text: WebMcpResponseBudgetUtils.serializeEnvelope(payload, { toolName })
                }
            ]
        }
    }

    /**
     * Builds compact current label context.
     * @returns {Record<string, any>}
     */
    #buildLabelContext() {
        const payload = this.#safeBuildProjectPayload()
        const uiState = this.#safeGetUiStateSnapshot()
        const parameterState = this.#buildParameterStateSnapshot()
        return WebMcpProjectInspector.buildLabelContext({
            payload,
            uiState,
            parameterState,
            supportedValues: this.#buildSupportedValuesSnapshot(),
            toolName: WEB_MCP_TOOL_NAMES.labelContext
        })
    }

    /**
     * Builds print-readiness validation for the current project.
     * @returns {Record<string, any>}
     */
    #buildProjectValidation() {
        const payload = this.#safeBuildProjectPayload()
        const uiState = this.#safeGetUiStateSnapshot()
        const parameterState = this.#buildParameterStateSnapshot()
        return WebMcpProjectInspector.buildProjectValidation({
            payload,
            uiState,
            parameterState,
            parameterPanel: this.#safeGetParameterPanel(),
            supportedValues: this.#buildSupportedValuesSnapshot()
        })
    }

    /**
     * Waits for parameter validation if the panel exposes that hook.
     * @returns {Promise<void>}
     */
    async #waitForParameterValidation() {
        const parameterPanel = this.#safeGetParameterPanel()
        if (typeof parameterPanel?.waitForValidation === 'function') {
            await parameterPanel.waitForValidation()
        }
    }

    /**
     * Focuses the visible print button when the app exposes it.
     * @returns {boolean}
     */
    #focusPrintButton() {
        try {
            const printButton = this.#appController?.els?.print
            if (typeof printButton?.focus === 'function') {
                printButton.focus()
                return true
            }
        } catch (_error) {}
        return false
    }

    /**
     * Extracts focused label-data import input.
     * @param {Record<string, any>} input
     * @returns {unknown}
     */
    #extractImportLabelData(input) {
        if (input && typeof input === 'object') {
            if (Object.hasOwn(input, 'rows')) return input.rows
            if (Object.hasOwn(input, 'json')) return input.json
            if (Object.hasOwn(input, 'parameterData')) return input.parameterData
        }
        throw new Error('Missing rows or json value')
    }

    /**
     * Extracts a normalized action array from tool input.
     * @param {Record<string, any>} input
     * @returns {Array<Record<string, any>>}
     */
    #extractActions(input) {
        if (!input || typeof input !== 'object') return []
        if (!Array.isArray(input.actions)) return []
        return input.actions.filter((entry) => entry && typeof entry === 'object')
    }

    /**
     * Runs mixed action lists while preserving order.
     * @param {Array<Record<string, any>>} actions
     * @param {{ ok: boolean, executed: string[], errors: string[], warnings: string[], results: any[], uiState: any }} envelope
     */
    async #runActionsInOrder(actions, envelope) {
        const editorActionBatch = []
        const flushEditorActionBatch = async () => {
            if (!editorActionBatch.length) return
            try {
                const result = await this.#aiActionBridge.runActions(editorActionBatch)
                const executed = Array.isArray(result?.executed) ? result.executed : []
                const errors = Array.isArray(result?.errors) ? result.errors : []
                const warnings = Array.isArray(result?.warnings) ? result.warnings : []
                envelope.executed.push(...executed.map((entry) => String(entry || '').trim()).filter(Boolean))
                envelope.errors.push(...errors.map((entry) => String(entry || '').trim()).filter(Boolean))
                envelope.warnings.push(...warnings.map((entry) => String(entry || '').trim()).filter(Boolean))
                envelope.results.push({
                    action: 'editor_actions',
                    count: editorActionBatch.length,
                    executed,
                    errors,
                    warnings
                })
            } catch (error) {
                envelope.errors.push(this.#normalizeErrorMessage(error))
            } finally {
                editorActionBatch.splice(0, editorActionBatch.length)
            }
        }

        for (const action of actions) {
            const actionName = this.#extractActionName(action)
            if (!actionName) {
                envelope.errors.push(this.#translate('assistant.actionMissing'))
                continue
            }
            if (EDITOR_ACTION_NAMES.has(actionName)) {
                editorActionBatch.push(action)
                continue
            }
            await flushEditorActionBatch()
            await this.#runExtendedAction(action, envelope)
        }

        await flushEditorActionBatch()
    }

    /**
     * Executes one non-editor action and appends envelope results.
     * @param {Record<string, any>} action
     * @param {{ executed: string[], errors: string[], warnings: string[], results: any[] }} envelope
     */
    async #runExtendedAction(action, envelope) {
        const actionName = this.#extractActionName(action)
        try {
            switch (actionName) {
                case 'set_zoom': {
                    const zoom = Number(action.zoom)
                    if (!Number.isFinite(zoom)) {
                        throw new Error('Invalid zoom value')
                    }
                    this.#appController.setZoom(zoom)
                    envelope.executed.push('set_zoom')
                    envelope.results.push({ action: 'set_zoom', zoom })
                    return
                }
                case 'set_locale': {
                    const locale = String(action.locale || '').trim()
                    if (!locale) {
                        throw new Error('Missing locale value')
                    }
                    this.#appController.setLocale(locale)
                    envelope.executed.push('set_locale')
                    envelope.results.push({ action: 'set_locale', locale })
                    return
                }
                case 'set_ble': {
                    const normalizedBleSettings = this.#normalizeBleSettings(action.ble)
                    const sourceLabel = this.#resolveSourceLabel(action.sourceLabel)
                    const requestedBackend = String(action.backend || '')
                        .trim()
                        .toLowerCase()
                    if (requestedBackend && !WebMcpBridgeSchemaUtils.getBackends().includes(requestedBackend)) {
                        throw new Error(`Unsupported backend value: ${requestedBackend}`)
                    }
                    await this.#applyPatchedProjectPayload(
                        (payload) => {
                            const currentBle =
                                payload.ble && typeof payload.ble === 'object' && !Array.isArray(payload.ble)
                                    ? payload.ble
                                    : {}
                            payload.ble = { ...currentBle, ...normalizedBleSettings }
                            if (requestedBackend) {
                                payload.backend = requestedBackend
                            }
                        },
                        sourceLabel
                    )
                    envelope.executed.push('set_ble')
                    envelope.results.push({
                        action: 'set_ble',
                        ble: normalizedBleSettings,
                        backend: requestedBackend || null,
                        sourceLabel
                    })
                    return
                }
                case 'set_parameters': {
                    const parameters = this.#normalizeParameterDefinitions(action.parameters)
                    const clearParameterData = Boolean(action.clearParameterData)
                    const sourceLabel = this.#resolveSourceLabel(action.sourceLabel)
                    await this.#applyPatchedProjectPayload(
                        (payload) => {
                            payload.parameters = parameters
                            if (clearParameterData) {
                                payload.parameterDataRows = []
                                payload.parameterDataRaw = '[]'
                                payload.parameterDataSourceName = ''
                            }
                        },
                        sourceLabel
                    )
                    envelope.executed.push('set_parameters')
                    envelope.results.push({
                        action: 'set_parameters',
                        count: parameters.length,
                        clearParameterData,
                        sourceLabel
                    })
                    return
                }
                case 'set_parameter_data_json': {
                    const rows = this.#normalizeParameterDataRows(action.parameterData)
                    const sourceName = String(action.sourceName || WEB_MCP_SOURCE_LABEL).trim() || WEB_MCP_SOURCE_LABEL
                    const sourceLabel = this.#resolveSourceLabel(action.sourceLabel)
                    await this.#applyParameterDataRows(rows, sourceName, sourceLabel)
                    envelope.executed.push('set_parameter_data_json')
                    envelope.results.push({
                        action: 'set_parameter_data_json',
                        rowCount: rows.length,
                        sourceName
                    })
                    return
                }
                case 'clear_parameter_data': {
                    const parameterPanel = this.#safeGetParameterPanel()
                    if (typeof parameterPanel?.applyParameterDataRawText === 'function') {
                        parameterPanel.applyParameterDataRawText('[]', '')
                    } else {
                        const sourceLabel = this.#resolveSourceLabel(action.sourceLabel)
                        await this.#applyPatchedProjectPayload(
                            (payload) => {
                                payload.parameterDataRows = []
                                payload.parameterDataRaw = '[]'
                                payload.parameterDataSourceName = ''
                            },
                            sourceLabel
                        )
                    }
                    envelope.executed.push('clear_parameter_data')
                    envelope.results.push({ action: 'clear_parameter_data' })
                    return
                }
                case 'set_google_font_links': {
                    const links = this.#normalizeGoogleFontLinks(action.links)
                    const merge = Boolean(action.merge)
                    const sourceLabel = this.#resolveSourceLabel(action.sourceLabel)
                    await this.#applyPatchedProjectPayload(
                        (payload) => {
                            const currentLinks = Array.isArray(payload.customFontLinks)
                                ? payload.customFontLinks.map((entry) => String(entry || '').trim()).filter(Boolean)
                                : []
                            const nextLinks = merge ? currentLinks.concat(links) : links
                            payload.customFontLinks = Array.from(new Set(nextLinks))
                        },
                        sourceLabel
                    )
                    envelope.executed.push('set_google_font_links')
                    envelope.results.push({
                        action: 'set_google_font_links',
                        count: links.length,
                        merge,
                        sourceLabel
                    })
                    return
                }
                case 'load_project_json': {
                    const sourceLabel = this.#resolveSourceLabel(action.sourceLabel)
                    const parsedProject = this.#parseProjectPayload(action.project)
                    await this.#appController.applyProjectPayload(parsedProject, sourceLabel)
                    envelope.executed.push('load_project_json')
                    envelope.results.push({ action: 'load_project_json', sourceLabel })
                    return
                }
                case 'load_project_url': {
                    const projectUrl = String(action.projectUrl || '').trim()
                    if (!projectUrl) {
                        throw new Error('Missing projectUrl value')
                    }
                    await this.#appController.loadProjectFromUrl(projectUrl)
                    envelope.executed.push('load_project_url')
                    envelope.results.push({ action: 'load_project_url', projectUrl })
                    return
                }
                case 'load_parameter_data_url': {
                    const parameterDataUrl = String(action.parameterDataUrl || '').trim()
                    if (!parameterDataUrl) {
                        throw new Error('Missing parameterDataUrl value')
                    }
                    await this.#appController.loadParameterDataFromUrl(parameterDataUrl)
                    envelope.executed.push('load_parameter_data_url')
                    envelope.results.push({ action: 'load_parameter_data_url', parameterDataUrl })
                    return
                }
                case 'export_project_json': {
                    const payload = this.#appController.buildProjectPayload()
                    envelope.executed.push('export_project_json')
                    envelope.results.push({ action: 'export_project_json', payload })
                    return
                }
                case 'build_share_url': {
                    const shareUrl = this.#appController.buildProjectShareUrl()
                    envelope.executed.push('build_share_url')
                    envelope.results.push({ action: 'build_share_url', shareUrl })
                    return
                }
                case 'get_ui_state': {
                    const uiState = this.#safeGetUiStateSnapshot()
                    envelope.executed.push('get_ui_state')
                    envelope.results.push({ action: 'get_ui_state', uiState })
                    return
                }
                case 'get_action_capabilities': {
                    const capabilities = this.#buildWebMcpCapabilities()
                    envelope.executed.push('get_action_capabilities')
                    envelope.results.push({ action: 'get_action_capabilities', capabilities })
                    return
                }
                case 'get_parameter_state': {
                    const parameterState = this.#buildParameterStateSnapshot()
                    envelope.executed.push('get_parameter_state')
                    envelope.results.push({ action: 'get_parameter_state', parameterState })
                    return
                }
                case 'get_supported_values': {
                    const supportedValues = this.#buildSupportedValuesSnapshot()
                    envelope.executed.push('get_supported_values')
                    envelope.results.push({ action: 'get_supported_values', supportedValues })
                    return
                }
                default:
                    throw new Error(`Unsupported action: ${actionName}`)
            }
        } catch (error) {
            const normalizedName = actionName || 'unknown'
            envelope.errors.push(`[${normalizedName}] ${this.#normalizeErrorMessage(error)}`)
        }
    }

    /**
     * Resolves a normalized source label for external payload application.
     * @param {unknown} rawSourceLabel
     * @returns {string}
     */
    #resolveSourceLabel(rawSourceLabel) {
        return String(rawSourceLabel || WEB_MCP_SOURCE_LABEL).trim() || WEB_MCP_SOURCE_LABEL
    }

    /**
     * Applies a mutation to the current project payload and re-applies it through app-controller flow.
     * @param {(payload: Record<string, any>) => void} patcher
     * @param {string} sourceLabel
     * @returns {Promise<void>}
     */
    async #applyPatchedProjectPayload(patcher, sourceLabel) {
        if (typeof this.#appController?.buildProjectPayload !== 'function') {
            throw new Error('Project payload export is unavailable')
        }
        if (typeof this.#appController?.applyProjectPayload !== 'function') {
            throw new Error('Project payload import is unavailable')
        }
        const payload = this.#appController.buildProjectPayload()
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new Error('Unable to read current project payload')
        }
        patcher(payload)
        await this.#appController.applyProjectPayload(payload, sourceLabel)
    }

    /**
     * Applies normalized parameter rows through the best available app path.
     * @param {Array<Record<string, unknown>>} rows
     * @param {string} sourceName
     * @param {string} sourceLabel
     * @returns {Promise<void>}
     */
    async #applyParameterDataRows(rows, sourceName, sourceLabel) {
        const rawJson = JSON.stringify(rows, null, 2)
        const parameterPanel = this.#safeGetParameterPanel()
        if (typeof parameterPanel?.applyParameterDataRawText === 'function') {
            parameterPanel.applyParameterDataRawText(rawJson, sourceName)
            return
        }
        await this.#applyPatchedProjectPayload(
            (payload) => {
                payload.parameterDataRows = rows
                payload.parameterDataRaw = rawJson
                payload.parameterDataSourceName = sourceName
            },
            sourceLabel
        )
    }

    /**
     * Normalizes parameter definitions for payload updates.
     * @param {unknown} rawParameters
     * @returns {Array<{ name: string, defaultValue: string }>}
     */
    #normalizeParameterDefinitions(rawParameters) {
        if (!Array.isArray(rawParameters)) {
            throw new Error('Missing parameters array')
        }
        return rawParameters.map((entry, index) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                throw new Error(`Invalid parameter at index ${index}`)
            }
            const name = String(entry.name || '').trim()
            if (!name) {
                throw new Error(`Parameter at index ${index} is missing a name`)
            }
            return {
                name,
                defaultValue: String(entry.defaultValue ?? '')
            }
        })
    }

    /**
     * Normalizes BLE settings for payload updates.
     * @param {unknown} rawBle
     * @returns {{ serviceUuid?: string, writeCharacteristicUuid?: string, notifyCharacteristicUuid?: string, namePrefix?: string }}
     */
    #normalizeBleSettings(rawBle) {
        if (!rawBle || typeof rawBle !== 'object' || Array.isArray(rawBle)) {
            throw new Error('Missing ble settings object')
        }
        const ble = /** @type {Record<string, any>} */ (rawBle)
        const normalized = {}
        if (Object.hasOwn(ble, 'serviceUuid')) {
            const serviceUuid = String(ble.serviceUuid || '').trim()
            if (!serviceUuid) {
                throw new Error('BLE serviceUuid must not be empty')
            }
            normalized.serviceUuid = serviceUuid
        }
        if (Object.hasOwn(ble, 'writeCharacteristicUuid')) {
            const writeCharacteristicUuid = String(ble.writeCharacteristicUuid || '').trim()
            if (!writeCharacteristicUuid) {
                throw new Error('BLE writeCharacteristicUuid must not be empty')
            }
            normalized.writeCharacteristicUuid = writeCharacteristicUuid
        }
        if (Object.hasOwn(ble, 'notifyCharacteristicUuid')) {
            const notifyCharacteristicUuid = String(ble.notifyCharacteristicUuid || '').trim()
            if (!notifyCharacteristicUuid) {
                throw new Error('BLE notifyCharacteristicUuid must not be empty')
            }
            normalized.notifyCharacteristicUuid = notifyCharacteristicUuid
        }
        if (Object.hasOwn(ble, 'namePrefix')) {
            normalized.namePrefix = String(ble.namePrefix ?? '')
        }
        if (!Object.keys(normalized).length) {
            throw new Error('BLE settings object does not include supported keys')
        }
        return normalized
    }

    /**
     * Normalizes user-supplied parameter data to row objects.
     * @param {unknown} rawParameterData
     * @returns {Array<Record<string, unknown>>}
     */
    #normalizeParameterDataRows(rawParameterData) {
        if (typeof rawParameterData === 'string') {
            const trimmed = rawParameterData.trim()
            if (!trimmed) return []
            const parsed = JSON.parse(trimmed)
            return this.#coerceParameterRows(parsed)
        }
        return this.#coerceParameterRows(rawParameterData)
    }

    /**
     * Coerces mixed parameter-data payload shapes into row arrays.
     * @param {unknown} payload
     * @returns {Array<Record<string, unknown>>}
     */
    #coerceParameterRows(payload) {
        if (Array.isArray(payload)) {
            return this.#normalizeParameterRowArray(payload)
        }
        if (payload && typeof payload === 'object') {
            const maybeRows = /** @type {Record<string, any>} */ (payload).rows
            if (Array.isArray(maybeRows)) {
                return this.#normalizeParameterRowArray(maybeRows)
            }
            return this.#normalizeParameterRowArray([payload])
        }
        throw new Error('parameterData must be a JSON array or object payload')
    }

    /**
     * Normalizes one parameter row array and verifies entry types.
     * @param {Array<unknown>} rows
     * @returns {Array<Record<string, unknown>>}
     */
    #normalizeParameterRowArray(rows) {
        return rows.map((entry, index) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                throw new Error(`parameterData row ${index + 1} must be an object`)
            }
            return { ...entry }
        })
    }

    /**
     * Normalizes Google-font link payloads.
     * @param {unknown} rawLinks
     * @returns {string[]}
     */
    #normalizeGoogleFontLinks(rawLinks) {
        if (!Array.isArray(rawLinks)) {
            throw new Error('Missing links array')
        }
        const unique = []
        const seen = new Set()
        rawLinks.forEach((entry) => {
            const link = String(entry || '').trim()
            if (!link || seen.has(link)) return
            seen.add(link)
            unique.push(link)
        })
        if (!unique.length) {
            throw new Error('At least one non-empty Google font link is required')
        }
        return unique
    }

    /**
     * Extracts a normalized action name.
     * @param {Record<string, any>} action
     * @returns {string}
     */
    #extractActionName(action) {
        return String(action?.action || '')
            .trim()
            .toLowerCase()
    }

    /**
     * Parses project payloads from string or object inputs.
     * @param {unknown} rawProject
     * @returns {Record<string, any>}
     */
    #parseProjectPayload(rawProject) {
        if (rawProject && typeof rawProject === 'object') {
            return /** @type {Record<string, any>} */ ({ ...rawProject })
        }
        const rawText = String(rawProject || '').trim()
        if (!rawText) {
            throw new Error('Missing project payload')
        }
        const parsed = JSON.parse(rawText)
        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Invalid project payload')
        }
        return { ...parsed }
    }

    /**
     * Builds a parameter-state snapshot for tooling/debug output.
     * @returns {{
     *   parameters: Array<Record<string, any>>,
     *   rowCount: number,
     *   sourceName: string,
     *   hasBlockingErrors: boolean,
     *   parseError: string | null,
     *   parseErrorLine: number | null,
     *   parseErrorColumn: number | null,
     *   validationErrors: Array<Record<string, any>>,
     *   validationWarnings: Array<Record<string, any>>
     * }}
     */
    #buildParameterStateSnapshot() {
        const payload = this.#safeBuildProjectPayload()
        const parameterPanel = this.#safeGetParameterPanel()
        const validationErrors = Array.isArray(parameterPanel?.validation?.errors)
            ? parameterPanel.validation.errors
            : []
        const validationWarnings = Array.isArray(parameterPanel?.validation?.warnings)
            ? parameterPanel.validation.warnings
            : []
        const hasBlockingErrors =
            typeof parameterPanel?.hasBlockingErrors === 'function'
                ? Boolean(parameterPanel.hasBlockingErrors())
                : Boolean(parameterPanel?.parseError) || validationErrors.length > 0
        return {
            parameters: Array.isArray(payload.parameters) ? payload.parameters : [],
            rowCount: Array.isArray(payload.parameterDataRows) ? payload.parameterDataRows.length : 0,
            sourceName: typeof payload.parameterDataSourceName === 'string' ? payload.parameterDataSourceName : '',
            hasBlockingErrors,
            parseError: parameterPanel?.parseError ? String(parameterPanel.parseError) : null,
            parseErrorLine: Number.isFinite(parameterPanel?.parseErrorLine) ? Number(parameterPanel.parseErrorLine) : null,
            parseErrorColumn: Number.isFinite(parameterPanel?.parseErrorColumn)
                ? Number(parameterPanel.parseErrorColumn)
                : null,
            validationErrors,
            validationWarnings
        }
    }

    /**
     * Builds one snapshot of supported selection values and current label settings.
     * @returns {Record<string, any>}
     */
    #buildSupportedValuesSnapshot() {
        const payload = this.#safeBuildProjectPayload()
        const elements = this.#appController?.els || {}
        const printers = this.#appendCurrentOption(this.#readSelectOptions(elements?.printer), payload.printer)
        const media = this.#appendCurrentOption(this.#readSelectOptions(elements?.media), payload.media)
        const resolutions = this.#appendCurrentOption(this.#readSelectOptions(elements?.resolution), payload.resolution)
        return {
            toolName: WEB_MCP_TOOL_NAMES.action,
            locales: WebMcpBridgeSchemaUtils.getLocales(),
            backends: WebMcpBridgeSchemaUtils.getBackends(),
            orientations: WebMcpBridgeSchemaUtils.getOrientations(),
            printers,
            media,
            resolutions,
            current: {
                locale: this.#runtime?.document?.documentElement?.lang || null,
                backend: payload.backend || null,
                printer: payload.printer || null,
                media: payload.media || null,
                resolution: payload.resolution || null,
                orientation: payload.orientation || null,
                mediaLengthMm: Number.isFinite(Number(payload.mediaLengthMm)) ? Number(payload.mediaLengthMm) : null
            }
        }
    }

    /**
     * Builds action capabilities with WebMCP extensions merged into action metadata.
     * @returns {Record<string, any>}
     */
    #buildWebMcpCapabilities() {
        const baseCapabilities = this.#safeGetActionCapabilities()
        const baseActions = Array.isArray(baseCapabilities.actions)
            ? baseCapabilities.actions.map((entry) => String(entry || '').trim()).filter(Boolean)
            : []
        const extendedActions = WebMcpBridgeSchemaUtils.getExtendedActionNames()
        const mergedActions = Array.from(new Set(baseActions.concat(extendedActions)))
        return {
            ...baseCapabilities,
            actions: mergedActions,
            webMcp: {
                toolName: WEB_MCP_TOOL_NAMES.action,
                tools: Object.values(WEB_MCP_TOOL_NAMES),
                extendedActions,
                supportedValues: this.#buildSupportedValuesSnapshot()
            }
        }
    }

    /**
     * Reads the current serializable project payload.
     * @returns {Record<string, any>}
     */
    #safeBuildProjectPayload() {
        try {
            if (typeof this.#appController?.buildProjectPayload === 'function') {
                const payload = this.#appController.buildProjectPayload()
                if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
                    return payload
                }
            }
        } catch (_error) {}
        return {}
    }

    /**
     * Resolves the parameter panel if available in runtime wiring.
     * @returns {{ applyParameterDataRawText?: Function, hasBlockingErrors?: Function, validation?: any, parseError?: any, parseErrorLine?: any, parseErrorColumn?: any } | null}
     */
    #safeGetParameterPanel() {
        const parameterPanel = this.#aiActionBridge?.parameterPanel || this.#appController?.parameterPanel
        if (!parameterPanel || typeof parameterPanel !== 'object') {
            return null
        }
        return parameterPanel
    }

    /**
     * Reads option values from a select-like element.
     * @param {any} selectElement
     * @returns {string[]}
     */
    #readSelectOptions(selectElement) {
        if (!selectElement || !selectElement.options) {
            return []
        }
        return Array.from(selectElement.options)
            .map((option) => String(option?.value || '').trim())
            .filter(Boolean)
    }

    /**
     * Appends the current value to select options when it is not already present.
     * @param {string[]} options
     * @param {unknown} currentValue
     * @returns {string[]}
     */
    #appendCurrentOption(options, currentValue) {
        const normalizedOptions = Array.isArray(options) ? options.slice() : []
        const current = String(currentValue || '').trim()
        if (!current) return normalizedOptions
        if (!normalizedOptions.includes(current)) {
            normalizedOptions.push(current)
        }
        return normalizedOptions
    }

    /**
     * Safely retrieves a compact UI-state snapshot.
     * @returns {Record<string, any>}
     */
    #safeGetUiStateSnapshot() {
        try {
            if (typeof this.#aiActionBridge?.getUiStateSnapshot === 'function') {
                return this.#aiActionBridge.getUiStateSnapshot()
            }
        } catch (_error) {}
        return {}
    }

    /**
     * Safely retrieves action capability metadata.
     * @returns {Record<string, any>}
     */
    #safeGetActionCapabilities() {
        try {
            if (typeof this.#aiActionBridge?.getActionCapabilities === 'function') {
                return this.#aiActionBridge.getActionCapabilities()
            }
        } catch (_error) {}
        return {}
    }

    /**
     * Normalizes unknown throwable values into readable error text.
     * @param {unknown} error
     * @returns {string}
     */
    #normalizeErrorMessage(error) {
        if (!error || typeof error !== 'object') {
            return String(error || this.#translate('messages.unknownError'))
        }
        return String(/** @type {{ message?: unknown }} */ (error).message || this.#translate('messages.unknownError'))
    }
}
