/**
 * Shared constants and schema builders for WebMCP action tooling.
 */
export class WebMcpBridgeSchemaUtils {
    static #locales = Object.freeze(['en', 'de'])
    static #backends = Object.freeze(['usb', 'ble'])
    static #orientations = Object.freeze(['horizontal', 'vertical'])
    static #extendedActionNames = Object.freeze([
        'set_zoom',
        'set_locale',
        'set_ble',
        'set_parameters',
        'set_parameter_data_json',
        'clear_parameter_data',
        'set_google_font_links',
        'load_project_json',
        'load_project_url',
        'load_parameter_data_url',
        'export_project_json',
        'build_share_url',
        'get_ui_state',
        'get_action_capabilities',
        'get_parameter_state',
        'get_supported_values'
    ])

    /**
     * Returns supported locale identifiers for WebMCP calls.
     * @returns {string[]}
     */
    static getLocales() {
        return [...WebMcpBridgeSchemaUtils.#locales]
    }

    /**
     * Returns supported backend identifiers for WebMCP calls.
     * @returns {string[]}
     */
    static getBackends() {
        return [...WebMcpBridgeSchemaUtils.#backends]
    }

    /**
     * Returns supported label orientation identifiers for WebMCP calls.
     * @returns {string[]}
     */
    static getOrientations() {
        return [...WebMcpBridgeSchemaUtils.#orientations]
    }

    /**
     * Returns the WebMCP action list beyond editor-action runtime calls.
     * @returns {string[]}
     */
    static getExtendedActionNames() {
        return [...WebMcpBridgeSchemaUtils.#extendedActionNames]
    }

    /**
     * Builds the WebMCP action input schema.
     * @returns {Record<string, any>}
     */
    static buildInputSchema() {
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
                                            backend: { type: 'string', enum: WebMcpBridgeSchemaUtils.getBackends() },
                                            printer: { type: 'string' },
                                            media: { type: 'string' },
                                            resolution: { type: 'string' },
                                            orientation: {
                                                type: 'string',
                                                enum: WebMcpBridgeSchemaUtils.getOrientations()
                                            },
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
                                    locale: { type: 'string', enum: WebMcpBridgeSchemaUtils.getLocales() }
                                },
                                required: ['action', 'locale']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'set_ble' },
                                    ble: {
                                        type: 'object',
                                        properties: {
                                            serviceUuid: { type: 'string' },
                                            writeCharacteristicUuid: { type: 'string' },
                                            notifyCharacteristicUuid: { type: 'string' },
                                            namePrefix: { type: 'string' }
                                        },
                                        minProperties: 1
                                    },
                                    backend: { type: 'string', enum: WebMcpBridgeSchemaUtils.getBackends() },
                                    sourceLabel: { type: 'string' }
                                },
                                required: ['action', 'ble']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'set_parameters' },
                                    parameters: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                name: { type: 'string' },
                                                defaultValue: { type: 'string' }
                                            },
                                            required: ['name']
                                        }
                                    },
                                    clearParameterData: { type: 'boolean' },
                                    sourceLabel: { type: 'string' }
                                },
                                required: ['action', 'parameters']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'set_parameter_data_json' },
                                    parameterData: { type: ['string', 'array', 'object'] },
                                    sourceName: { type: 'string' },
                                    sourceLabel: { type: 'string' }
                                },
                                required: ['action', 'parameterData']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'clear_parameter_data' },
                                    sourceLabel: { type: 'string' }
                                },
                                required: ['action']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'set_google_font_links' },
                                    links: { type: 'array', items: { type: 'string' }, minItems: 1 },
                                    merge: { type: 'boolean' },
                                    sourceLabel: { type: 'string' }
                                },
                                required: ['action', 'links']
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
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'get_parameter_state' }
                                },
                                required: ['action']
                            },
                            {
                                type: 'object',
                                properties: {
                                    action: { const: 'get_supported_values' }
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
}
