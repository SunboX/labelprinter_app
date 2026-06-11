// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { WebMcpBridgeSchemaUtils } from './WebMcpBridgeSchemaUtils.mjs'

export const WEB_MCP_TOOL_NAMES = Object.freeze({
    action: 'labelprinter_action',
    labelContext: 'get_label_context',
    validateProject: 'validate_project',
    preparePrint: 'prepare_print',
    importLabelData: 'import_label_data'
})

/**
 * Builds WebMCP tool definitions for Labelprinter App.
 */
export class WebMcpToolDefinitions {
    /**
     * Builds all WebMCP tool definitions.
     * @param {{
     *   executeAction: Function,
     *   executeLabelContext: Function,
     *   executeValidateProject: Function,
     *   executePreparePrint: Function,
     *   executeImportLabelData: Function
     * }} callbacks
     * @returns {Array<Record<string, any>>}
     */
    static build(callbacks) {
        return [
            WebMcpToolDefinitions.#buildActionToolDefinition(callbacks.executeAction),
            WebMcpToolDefinitions.#buildLabelContextToolDefinition(callbacks.executeLabelContext),
            WebMcpToolDefinitions.#buildValidateProjectToolDefinition(callbacks.executeValidateProject),
            WebMcpToolDefinitions.#buildPreparePrintToolDefinition(callbacks.executePreparePrint),
            WebMcpToolDefinitions.#buildImportLabelDataToolDefinition(callbacks.executeImportLabelData)
        ]
    }

    /**
     * Builds the main ordered-action WebMCP tool definition.
     * @param {Function} execute
     * @returns {Record<string, any>}
     */
    static #buildActionToolDefinition(execute) {
        return {
            name: WEB_MCP_TOOL_NAMES.action,
            title: 'Labelprinter action',
            description:
                'Execute Labelprinter editor actions and extended app controls in one ordered action pipeline.',
            inputSchema: WebMcpBridgeSchemaUtils.buildInputSchema(),
            annotations: {
                readOnlyHint: false,
                untrustedContentHint: true
            },
            execute
        }
    }

    /**
     * Builds the focused label-context WebMCP tool definition.
     * @param {Function} execute
     * @returns {Record<string, any>}
     */
    static #buildLabelContextToolDefinition(execute) {
        return {
            name: WEB_MCP_TOOL_NAMES.labelContext,
            title: 'Get label context',
            description: 'Return compact current label state, selected items, parameters, and warnings.',
            inputSchema: WebMcpBridgeSchemaUtils.buildEmptyInputSchema(),
            annotations: {
                readOnlyHint: true,
                untrustedContentHint: true
            },
            execute
        }
    }

    /**
     * Builds the focused project-validation WebMCP tool definition.
     * @param {Function} execute
     * @returns {Record<string, any>}
     */
    static #buildValidateProjectToolDefinition(execute) {
        return {
            name: WEB_MCP_TOOL_NAMES.validateProject,
            title: 'Validate project',
            description: 'Check the current label for print readiness and return actionable warnings or errors.',
            inputSchema: WebMcpBridgeSchemaUtils.buildEmptyInputSchema(),
            annotations: {
                readOnlyHint: true,
                untrustedContentHint: true
            },
            execute
        }
    }

    /**
     * Builds the print-preparation WebMCP tool definition.
     * @param {Function} execute
     * @returns {Record<string, any>}
     */
    static #buildPreparePrintToolDefinition(execute) {
        return {
            name: WEB_MCP_TOOL_NAMES.preparePrint,
            title: 'Prepare print',
            description: 'Run print preflight checks and focus the visible print control for user confirmation.',
            inputSchema: WebMcpBridgeSchemaUtils.buildPreparePrintInputSchema(),
            annotations: {
                readOnlyHint: false,
                untrustedContentHint: true
            },
            execute
        }
    }

    /**
     * Builds the focused label-data import WebMCP tool definition.
     * @param {Function} execute
     * @returns {Record<string, any>}
     */
    static #buildImportLabelDataToolDefinition(execute) {
        return {
            name: WEB_MCP_TOOL_NAMES.importLabelData,
            title: 'Import label data',
            description: 'Import parameter row data for batch labels from JSON rows.',
            inputSchema: WebMcpBridgeSchemaUtils.buildImportLabelDataInputSchema(),
            annotations: {
                readOnlyHint: false,
                untrustedContentHint: true
            },
            execute
        }
    }
}
