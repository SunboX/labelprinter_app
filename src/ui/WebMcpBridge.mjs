const WEB_MCP_TOOL_NAME = 'labelprinter_action'
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
     * Registers the WebMCP tool when navigator.modelContext is available.
     * @returns {Promise<boolean>}
     */
    async init() {
        const modelContext = this.#resolveModelContext()
        if (!modelContext) return false
        const toolDefinition = this.#buildToolDefinition()
        try {
            if (typeof modelContext.registerTool === 'function') {
                await Promise.resolve(modelContext.registerTool(toolDefinition))
                return true
            }
            if (typeof modelContext.provideContext === 'function') {
                await Promise.resolve(
                    modelContext.provideContext({
                        tools: [toolDefinition]
                    })
                )
                return true
            }
        } catch (error) {
            console.info('WebMCP registration failed:', this.#normalizeErrorMessage(error))
        }
        return false
    }

    /**
     * Resolves navigator.modelContext from the active runtime.
     * @returns {Record<string, any> | null}
     */
    #resolveModelContext() {
        const navigatorRef = this.#runtime?.navigator
        const modelContext = navigatorRef?.modelContext
        if (!modelContext || typeof modelContext !== 'object') return null
        const canRegister = typeof modelContext.registerTool === 'function'
        const canProvideContext = typeof modelContext.provideContext === 'function'
        if (!canRegister && !canProvideContext) return null
        return modelContext
    }

    /**
     * Builds the single WebMCP tool definition.
     * @returns {Record<string, any>}
     */
    #buildToolDefinition() {
        return {
            name: WEB_MCP_TOOL_NAME,
            description:
                'Execute Labelprinter editor actions and extended app controls in one ordered action pipeline.',
            inputSchema: this.#buildInputSchema(),
            execute: async (input) => this.#executeTool(input)
        }
    }

    /**
     * Builds the WebMCP input schema.
     * @returns {Record<string, any>}
     */
    #buildInputSchema() {
        return {
            type: 'object',
            properties: {
                actions: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        oneOf: [
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'add_item' },
                                    itemType: {
                                        type: 'string',
                                        enum: ['text', 'qr', 'barcode', 'image', 'icon', 'shape']
                                    },
                                    shapeType: { type: 'string' },
                                    properties: { type: 'object' }
                                },
                                required: ['action', 'itemType']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'update_item' },
                                    itemId: { type: 'string' },
                                    itemIndex: { type: 'integer', minimum: 0 },
                                    target: { type: 'string', enum: ['selected', 'first', 'last'] },
                                    changes: { type: 'object', minProperties: 1 }
                                },
                                required: ['action', 'changes']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'remove_item' },
                                    itemId: { type: 'string' },
                                    itemIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
                                    itemIndex: { type: 'integer', minimum: 0 },
                                    target: { type: 'string', enum: ['selected', 'first', 'last'] }
                                },
                                required: ['action']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'clear_items' }
                                },
                                required: ['action']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'set_label' },
                                    settings: {
                                        type: 'object',
                                        properties: {
                                            backend: { type: 'string', enum: ['usb', 'ble'] },
                                            printer: { type: 'string' },
                                            media: { type: 'string' },
                                            resolution: { type: 'string' },
                                            orientation: { type: 'string', enum: ['horizontal', 'vertical'] },
                                            mediaLengthMm: { type: ['number', 'null'] }
                                        },
                                        minProperties: 1
                                    }
                                },
                                required: ['action', 'settings']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'select_items' },
                                    itemIds: { type: 'array', items: { type: 'string' }, minItems: 1 }
                                },
                                required: ['action', 'itemIds']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'align_selected' },
                                    itemIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
                                    mode: {
                                        type: 'string',
                                        enum: ['left', 'center', 'right', 'top', 'middle', 'bottom']
                                    },
                                    reference: {
                                        type: 'string',
                                        enum: ['selection', 'largest', 'smallest', 'label']
                                    }
                                },
                                required: ['action', 'mode']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'print' },
                                    skipBatchConfirm: { type: 'boolean' }
                                },
                                required: ['action']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'save_project' }
                                },
                                required: ['action']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'share_project' }
                                },
                                required: ['action']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'set_zoom' },
                                    zoom: { type: 'number' }
                                },
                                required: ['action', 'zoom']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'set_locale' },
                                    locale: { type: 'string', enum: ['en', 'de'] }
                                },
                                required: ['action', 'locale']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'load_project_json' },
                                    project: { type: ['object', 'string'] },
                                    sourceLabel: { type: 'string' }
                                },
                                required: ['action', 'project']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'load_project_url' },
                                    projectUrl: { type: 'string' }
                                },
                                required: ['action', 'projectUrl']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'load_parameter_data_url' },
                                    parameterDataUrl: { type: 'string' }
                                },
                                required: ['action', 'parameterDataUrl']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'export_project_json' }
                                },
                                required: ['action']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'build_share_url' }
                                },
                                required: ['action']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'get_ui_state' }
                                },
                                required: ['action']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'get_action_capabilities' }
                                },
                                required: ['action']
                            }
                        ]
                    }
                }
            },
            required: ['actions']
        }
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
                    text: JSON.stringify(envelope, null, 2)
                }
            ]
        }
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
                case 'load_project_json': {
                    const sourceLabel = String(action.sourceLabel || 'WebMCP').trim() || 'WebMCP'
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
                    const capabilities = this.#safeGetActionCapabilities()
                    envelope.executed.push('get_action_capabilities')
                    envelope.results.push({ action: 'get_action_capabilities', capabilities })
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
