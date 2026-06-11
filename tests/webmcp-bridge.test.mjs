// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { WebMcpBridge } from '../src/ui/WebMcpBridge.mjs'

/**
 * Parses one WebMCP tool response payload.
 * @param {{ content?: Array<{ type?: string, text?: string }> }} response
 * @returns {Record<string, any>}
 */
function parseToolResponse(response) {
    assert.ok(Array.isArray(response?.content))
    assert.ok(response.content.length > 0)
    assert.equal(response.content[0].type, 'text')
    return JSON.parse(String(response.content[0].text || '{}'))
}

describe('webmcp-bridge', () => {
    it('is a no-op when modelContext is unavailable', async () => {
        const bridge = new WebMcpBridge({
            aiActionBridge: {
                runActions: async () => ({ executed: [], errors: [], warnings: [] }),
                getUiStateSnapshot: () => ({}),
                getActionCapabilities: () => ({})
            },
            appController: {
                setZoom: () => {},
                setLocale: () => {},
                applyProjectPayload: async () => {},
                loadProjectFromUrl: async () => {},
                loadParameterDataFromUrl: async () => {},
                buildProjectPayload: () => ({}),
                buildProjectShareUrl: () => ''
            },
            runtime: { document: {}, navigator: {} }
        })

        assert.equal(await bridge.init(), false)
    })

    it('registers the tool set using document.modelContext.registerTool when available', async () => {
        const registeredTools = []
        const bridge = new WebMcpBridge({
            aiActionBridge: {
                runActions: async () => ({ executed: [], errors: [], warnings: [] }),
                getUiStateSnapshot: () => ({}),
                getActionCapabilities: () => ({})
            },
            appController: {
                setZoom: () => {},
                setLocale: () => {},
                applyProjectPayload: async () => {},
                loadProjectFromUrl: async () => {},
                loadParameterDataFromUrl: async () => {},
                buildProjectPayload: () => ({}),
                buildProjectShareUrl: () => ''
            },
            runtime: {
                document: {
                    modelContext: {
                        registerTool: (tool) => {
                            registeredTools.push(tool)
                        }
                    }
                }
            }
        })

        assert.equal(await bridge.init(), true)
        const toolMap = new Map(registeredTools.map((tool) => [tool.name, tool]))
        assert.deepEqual(
            registeredTools.map((tool) => tool.name),
            ['labelprinter_action', 'get_label_context', 'validate_project', 'prepare_print', 'import_label_data']
        )

        const actionTool = toolMap.get('labelprinter_action')
        assert.ok(actionTool)
        assert.equal(actionTool.title, 'Labelprinter action')
        assert.equal(typeof actionTool.execute, 'function')
        assert.equal(actionTool.inputSchema.type, 'object')
        assert.deepEqual(actionTool.annotations, {
            readOnlyHint: false,
            untrustedContentHint: true
        })
        assert.deepEqual(toolMap.get('get_label_context')?.annotations, {
            readOnlyHint: true,
            untrustedContentHint: true
        })
        assert.deepEqual(toolMap.get('validate_project')?.annotations, {
            readOnlyHint: true,
            untrustedContentHint: true
        })
        assert.deepEqual(toolMap.get('prepare_print')?.annotations, {
            readOnlyHint: false,
            untrustedContentHint: true
        })
        assert.deepEqual(toolMap.get('import_label_data')?.annotations, {
            readOnlyHint: false,
            untrustedContentHint: true
        })
    })

    it('prefers document.modelContext over deprecated navigator.modelContext', async () => {
        const registeredTargets = []
        const bridge = new WebMcpBridge({
            aiActionBridge: {
                runActions: async () => ({ executed: [], errors: [], warnings: [] }),
                getUiStateSnapshot: () => ({}),
                getActionCapabilities: () => ({})
            },
            appController: {
                setZoom: () => {},
                setLocale: () => {},
                applyProjectPayload: async () => {},
                loadProjectFromUrl: async () => {},
                loadParameterDataFromUrl: async () => {},
                buildProjectPayload: () => ({}),
                buildProjectShareUrl: () => ''
            },
            runtime: {
                document: {
                    modelContext: {
                        registerTool: (tool) => {
                            registeredTargets.push(`document:${tool.name}`)
                        }
                    }
                },
                navigator: {
                    modelContext: {
                        registerTool: (tool) => {
                            registeredTargets.push(`navigator:${tool.name}`)
                        }
                    }
                }
            }
        })

        assert.equal(await bridge.init(), true)
        assert.deepEqual(registeredTargets, [
            'document:labelprinter_action',
            'document:get_label_context',
            'document:validate_project',
            'document:prepare_print',
            'document:import_label_data'
        ])
    })

    it('ignores legacy provideContext-only runtimes', async () => {
        let provided = false
        const bridge = new WebMcpBridge({
            aiActionBridge: {
                runActions: async () => ({ executed: [], errors: [], warnings: [] }),
                getUiStateSnapshot: () => ({}),
                getActionCapabilities: () => ({})
            },
            appController: {
                setZoom: () => {},
                setLocale: () => {},
                applyProjectPayload: async () => {},
                loadProjectFromUrl: async () => {},
                loadParameterDataFromUrl: async () => {},
                buildProjectPayload: () => ({}),
                buildProjectShareUrl: () => ''
            },
            runtime: {
                navigator: {
                    modelContext: {
                        provideContext: () => {
                            provided = true
                        }
                    }
                }
            }
        })

        assert.equal(await bridge.init(), false)
        assert.equal(provided, false)
    })

    it('keeps mixed editor and extended actions in deterministic order', async () => {
        const runCalls = []
        const callLog = []
        let registeredTool = null
        const bridge = new WebMcpBridge({
            aiActionBridge: {
                runActions: async (actions) => {
                    runCalls.push(actions.map((action) => action.action))
                    return {
                        executed: actions.map((action) => `ok:${action.action}`),
                        errors: [],
                        warnings: []
                    }
                },
                getUiStateSnapshot: () => ({ items: [{ id: 'item-1' }] }),
                getActionCapabilities: () => ({ actions: ['add_item'] })
            },
            appController: {
                setZoom: (zoom) => {
                    callLog.push(`setZoom:${zoom}`)
                },
                setLocale: () => {},
                applyProjectPayload: async () => {},
                loadProjectFromUrl: async () => {},
                loadParameterDataFromUrl: async () => {},
                buildProjectPayload: () => ({ ok: true }),
                buildProjectShareUrl: () => {
                    callLog.push('buildProjectShareUrl')
                    return 'https://example.com/?project=abc'
                }
            },
            runtime: {
                navigator: {
                    modelContext: {
                        registerTool: (tool) => {
                            if (tool.name === 'labelprinter_action') {
                                registeredTool = tool
                            }
                        }
                    }
                }
            }
        })

        await bridge.init()
        const response = await registeredTool.execute({
            actions: [
                { action: 'add_item', itemType: 'text' },
                { action: 'set_zoom', zoom: 1.3 },
                { action: 'update_item', target: 'last', changes: { text: 'abc' } },
                { action: 'build_share_url' }
            ]
        })
        const payload = parseToolResponse(response)

        assert.deepEqual(runCalls, [['add_item'], ['update_item']])
        assert.deepEqual(callLog, ['setZoom:1.3', 'buildProjectShareUrl'])
        assert.equal(payload.ok, true)
        assert.deepEqual(payload.uiState, { items: [{ id: 'item-1' }] })
        assert.equal(Array.isArray(payload.results), true)
    })

    it('returns export/state/capabilities outputs in the tool response envelope', async () => {
        let registeredTool = null
        const bridge = new WebMcpBridge({
            aiActionBridge: {
                runActions: async () => ({ executed: [], errors: [], warnings: [] }),
                getUiStateSnapshot: () => ({ media: 'W24', itemCount: 2 }),
                getActionCapabilities: () => ({ actions: ['set_label', 'print'] })
            },
            appController: {
                setZoom: () => {},
                setLocale: () => {},
                applyProjectPayload: async () => {},
                loadProjectFromUrl: async () => {},
                loadParameterDataFromUrl: async () => {},
                els: {
                    printer: { options: [{ value: 'P700' }, { value: 'P750W' }] },
                    media: { options: [{ value: 'W9' }, { value: 'W24' }] },
                    resolution: { options: [{ value: 'LOW' }, { value: 'HIGH' }] }
                },
                buildProjectPayload: () => ({ media: 'W24', version: '1.1.7' }),
                buildProjectShareUrl: () => 'https://example.com/?project=xyz'
            },
            runtime: {
                navigator: {
                    modelContext: {
                        registerTool: (tool) => {
                            if (tool.name === 'labelprinter_action') {
                                registeredTool = tool
                            }
                        }
                    }
                }
            }
        })

        await bridge.init()
        const response = await registeredTool.execute({
            actions: [
                { action: 'export_project_json' },
                { action: 'get_ui_state' },
                { action: 'get_action_capabilities' },
                { action: 'get_supported_values' }
            ]
        })
        const payload = parseToolResponse(response)

        assert.equal(payload.ok, true)
        assert.equal(payload.errors.length, 0)
        assert.equal(payload.executed.includes('export_project_json'), true)
        assert.equal(payload.executed.includes('get_ui_state'), true)
        assert.equal(payload.executed.includes('get_action_capabilities'), true)
        assert.equal(payload.results.some((entry) => entry.action === 'export_project_json'), true)
        assert.equal(payload.results.some((entry) => entry.action === 'get_ui_state'), true)
        assert.equal(payload.results.some((entry) => entry.action === 'get_action_capabilities'), true)
        assert.equal(payload.results.some((entry) => entry.action === 'get_supported_values'), true)

        const capabilityResult = payload.results.find((entry) => entry.action === 'get_action_capabilities')
        assert.ok(capabilityResult?.capabilities?.webMcp)
        assert.equal(
            capabilityResult.capabilities.webMcp.extendedActions.includes('set_parameter_data_json'),
            true
        )

        const supportedValuesResult = payload.results.find((entry) => entry.action === 'get_supported_values')
        assert.deepEqual(supportedValuesResult?.supportedValues?.printers, ['P700', 'P750W'])
        assert.deepEqual(supportedValuesResult?.supportedValues?.media, ['W9', 'W24'])
        assert.deepEqual(supportedValuesResult?.supportedValues?.resolutions, ['LOW', 'HIGH'])
    })

    it('keeps oversized tool outputs parseable and within the WebMCP response budget', async () => {
        let registeredTool = null
        const largeProject = {
            version: '1.1.20',
            items: Array.from({ length: 12 }, (_entry, index) => ({
                id: `item-${index + 1}`,
                type: 'text',
                text: `Long exported label text ${index + 1}: ${'x'.repeat(600)}`
            }))
        }
        const bridge = new WebMcpBridge({
            aiActionBridge: {
                runActions: async () => ({ executed: [], errors: [], warnings: [] }),
                getUiStateSnapshot: () => ({
                    selection: largeProject.items.map((item) => item.id),
                    diagnostics: 'u'.repeat(900)
                }),
                getActionCapabilities: () => ({ actions: [] })
            },
            appController: {
                setZoom: () => {},
                setLocale: () => {},
                applyProjectPayload: async () => {},
                loadProjectFromUrl: async () => {},
                loadParameterDataFromUrl: async () => {},
                buildProjectPayload: () => largeProject,
                buildProjectShareUrl: () => ''
            },
            runtime: {
                document: {
                    modelContext: {
                        registerTool: (tool) => {
                            if (tool.name === 'labelprinter_action') {
                                registeredTool = tool
                            }
                        }
                    }
                }
            }
        })

        await bridge.init()
        const response = await registeredTool.execute({
            actions: [{ action: 'export_project_json' }, { action: 'get_ui_state' }]
        })
        const outputText = String(response?.content?.[0]?.text || '')
        const payload = parseToolResponse(response)

        assert.equal(payload.ok, true)
        assert.equal(outputText.length <= 1500, true)
        assert.equal(payload.warnings.some((warning) => warning.includes('shortened')), true)
        assert.equal(payload.results.some((entry) => entry.action === 'export_project_json'), true)
        assert.equal(payload.results.some((entry) => entry.action === 'get_ui_state'), true)
    })

    it('serves focused label context and project validation tools', async () => {
        const registeredTools = new Map()
        const projectState = {
            backend: 'ble',
            printer: 'P700',
            media: 'W24',
            resolution: 'HIGH',
            orientation: 'horizontal',
            mediaLengthMm: 80,
            ble: {
                serviceUuid: '0000aaaa-0000-1000-8000-00805f9b34fb'
            },
            parameters: [{ name: 'sku', defaultValue: '' }],
            parameterDataRows: [{ sku: '' }],
            parameterDataSourceName: 'rows.json',
            items: [
                { id: 'item-1', type: 'text', text: 'A' },
                { id: 'item-2', type: 'qr', payload: 'B' }
            ]
        }
        const parameterPanel = {
            validation: {
                errors: [],
                warnings: [{ code: 'fallbackDefaultParameter', parameterName: 'sku' }]
            },
            parseError: null,
            hasBlockingErrors: () => false
        }
        const bridge = new WebMcpBridge({
            aiActionBridge: {
                runActions: async () => ({ executed: [], errors: [], warnings: [] }),
                getUiStateSnapshot: () => ({
                    selectedItemIds: ['item-2'],
                    warnings: ['Preview uses fallback parameter value.']
                }),
                getActionCapabilities: () => ({ actions: [] }),
                parameterPanel
            },
            appController: {
                setZoom: () => {},
                setLocale: () => {},
                applyProjectPayload: async () => {},
                loadProjectFromUrl: async () => {},
                loadParameterDataFromUrl: async () => {},
                buildProjectPayload: () => ({
                    ...projectState,
                    parameters: projectState.parameters.map((entry) => ({ ...entry })),
                    parameterDataRows: projectState.parameterDataRows.map((row) => ({ ...row })),
                    items: projectState.items.map((item) => ({ ...item }))
                }),
                buildProjectShareUrl: () => ''
            },
            runtime: {
                document: {
                    modelContext: {
                        registerTool: (tool) => {
                            registeredTools.set(tool.name, tool)
                        }
                    }
                }
            }
        })

        await bridge.init()
        const contextPayload = parseToolResponse(await registeredTools.get('get_label_context').execute({}))
        const validationPayload = parseToolResponse(await registeredTools.get('validate_project').execute({}))

        assert.equal(contextPayload.ok, true)
        assert.equal(contextPayload.context.label.media, 'W24')
        assert.equal(contextPayload.context.itemCount, 2)
        assert.deepEqual(contextPayload.context.selectedItemIds, ['item-2'])
        assert.equal(contextPayload.context.parameterState.rowCount, 1)
        assert.equal(contextPayload.context.warnings.includes('Preview uses fallback parameter value.'), true)

        assert.equal(validationPayload.ok, true)
        assert.equal(validationPayload.validation.valid, false)
        assert.equal(
            validationPayload.validation.errors.some((message) => message.includes('writeCharacteristicUuid')),
            true
        )
        assert.equal(validationPayload.validation.warnings.length >= 1, true)
    })

    it('serves prepare_print and import_label_data without silently printing', async () => {
        const registeredTools = new Map()
        const runCalls = []
        const focusCalls = []
        const applyRawCalls = []
        const projectState = {
            backend: 'usb',
            printer: 'P700',
            media: 'W24',
            resolution: 'HIGH',
            orientation: 'horizontal',
            parameters: [{ name: 'name', defaultValue: '' }],
            parameterDataRows: [],
            parameterDataRaw: '[]',
            parameterDataSourceName: '',
            items: [{ id: 'item-1', type: 'text', text: '{{name}}' }]
        }
        const parameterPanel = {
            validation: { errors: [], warnings: [] },
            parseError: null,
            hasBlockingErrors: () => false,
            buildPrintParameterValueMaps: () => projectState.parameterDataRows,
            applyParameterDataRawText: (rawText, sourceName) => {
                applyRawCalls.push({ rawText, sourceName })
                projectState.parameterDataRaw = rawText
                projectState.parameterDataRows = JSON.parse(rawText)
                projectState.parameterDataSourceName = sourceName
            }
        }
        const bridge = new WebMcpBridge({
            aiActionBridge: {
                runActions: async (actions) => {
                    runCalls.push(actions)
                    return { executed: [], errors: [], warnings: [] }
                },
                getUiStateSnapshot: () => ({ selectedItemIds: ['item-1'] }),
                getActionCapabilities: () => ({ actions: [] }),
                parameterPanel
            },
            appController: {
                setZoom: () => {},
                setLocale: () => {},
                applyProjectPayload: async () => {},
                loadProjectFromUrl: async () => {},
                loadParameterDataFromUrl: async () => {},
                els: {
                    print: {
                        focus: () => focusCalls.push('print')
                    }
                },
                buildProjectPayload: () => ({
                    ...projectState,
                    parameters: projectState.parameters.map((entry) => ({ ...entry })),
                    parameterDataRows: projectState.parameterDataRows.map((row) => ({ ...row })),
                    items: projectState.items.map((item) => ({ ...item }))
                }),
                buildProjectShareUrl: () => ''
            },
            runtime: {
                document: {
                    modelContext: {
                        registerTool: (tool) => {
                            registeredTools.set(tool.name, tool)
                        }
                    }
                }
            }
        })

        await bridge.init()
        const importPayload = parseToolResponse(
            await registeredTools.get('import_label_data').execute({
                rows: [{ name: 'Andres' }, { name: 'Maria' }],
                sourceName: 'rows.json'
            })
        )
        const preparePayload = parseToolResponse(await registeredTools.get('prepare_print').execute({}))

        assert.equal(importPayload.ok, true)
        assert.equal(importPayload.imported.rowCount, 2)
        assert.equal(importPayload.imported.sourceName, 'rows.json')
        assert.equal(importPayload.parameterState.rowCount, 2)
        assert.equal(applyRawCalls.length, 1)

        assert.equal(preparePayload.ok, true)
        assert.equal(preparePayload.ready, true)
        assert.equal(preparePayload.userActionRequired, true)
        assert.equal(preparePayload.focusedPrintButton, true)
        assert.equal(preparePayload.validation.parameterBatchCount, 2)
        assert.deepEqual(focusCalls, ['print'])
        assert.deepEqual(runCalls, [])
    })

    it('applies project-patched WebMCP actions for BLE, parameters, and Google font links', async () => {
        let registeredTool = null
        const applyCalls = []
        const projectState = {
            backend: 'usb',
            ble: {
                serviceUuid: '0000aaaa-0000-1000-8000-00805f9b34fb',
                writeCharacteristicUuid: '0000bbbb-0000-1000-8000-00805f9b34fb',
                notifyCharacteristicUuid: '0000cccc-0000-1000-8000-00805f9b34fb',
                namePrefix: 'PT-'
            },
            parameters: [],
            parameterDataRows: [],
            parameterDataRaw: '[]',
            parameterDataSourceName: '',
            customFontLinks: ['https://fonts.googleapis.com/css2?family=Barlow&display=swap']
        }
        const bridge = new WebMcpBridge({
            aiActionBridge: {
                runActions: async () => ({ executed: [], errors: [], warnings: [] }),
                getUiStateSnapshot: () => ({}),
                getActionCapabilities: () => ({ actions: ['add_item'] })
            },
            appController: {
                setZoom: () => {},
                setLocale: () => {},
                applyProjectPayload: async (payload, sourceLabel) => {
                    applyCalls.push({ payload, sourceLabel })
                    Object.assign(projectState, {
                        ...payload,
                        ble: { ...payload.ble },
                        parameters: Array.isArray(payload.parameters) ? payload.parameters.map((entry) => ({ ...entry })) : [],
                        parameterDataRows: Array.isArray(payload.parameterDataRows)
                            ? payload.parameterDataRows.map((row) => ({ ...row }))
                            : [],
                        customFontLinks: Array.isArray(payload.customFontLinks) ? payload.customFontLinks.slice() : []
                    })
                },
                loadProjectFromUrl: async () => {},
                loadParameterDataFromUrl: async () => {},
                buildProjectPayload: () => ({
                    ...projectState,
                    ble: { ...projectState.ble },
                    parameters: projectState.parameters.map((entry) => ({ ...entry })),
                    parameterDataRows: projectState.parameterDataRows.map((row) => ({ ...row })),
                    customFontLinks: projectState.customFontLinks.slice()
                }),
                buildProjectShareUrl: () => ''
            },
            runtime: {
                navigator: {
                    modelContext: {
                        registerTool: (tool) => {
                            if (tool.name === 'labelprinter_action') {
                                registeredTool = tool
                            }
                        }
                    }
                }
            }
        })

        await bridge.init()
        const response = await registeredTool.execute({
            actions: [
                {
                    action: 'set_ble',
                    backend: 'ble',
                    ble: {
                        serviceUuid: '1111aaaa-0000-1000-8000-00805f9b34fb',
                        writeCharacteristicUuid: '1111bbbb-0000-1000-8000-00805f9b34fb'
                    }
                },
                {
                    action: 'set_parameters',
                    parameters: [{ name: 'sku', defaultValue: 'A-1' }]
                },
                {
                    action: 'set_google_font_links',
                    links: ['https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap'],
                    merge: true
                }
            ]
        })
        const payload = parseToolResponse(response)

        assert.equal(payload.ok, true)
        assert.equal(payload.executed.includes('set_ble'), true)
        assert.equal(payload.executed.includes('set_parameters'), true)
        assert.equal(payload.executed.includes('set_google_font_links'), true)
        assert.equal(applyCalls.length, 3)
        assert.equal(projectState.backend, 'ble')
        assert.equal(projectState.parameters.length, 1)
        assert.equal(projectState.parameters[0].name, 'sku')
        assert.deepEqual(projectState.customFontLinks, [
            'https://fonts.googleapis.com/css2?family=Barlow&display=swap',
            'https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap'
        ])
    })

    it('routes parameter data actions through parameter panel helpers and returns parameter-state snapshots', async () => {
        let registeredTool = null
        let applyRawDataCalls = 0
        const projectState = {
            parameters: [{ name: 'name', defaultValue: '' }],
            parameterDataRows: [],
            parameterDataRaw: '[]',
            parameterDataSourceName: ''
        }
        const parameterPanel = {
            validation: {
                errors: [],
                warnings: []
            },
            parseError: null,
            parseErrorLine: null,
            parseErrorColumn: null,
            hasBlockingErrors: () => false,
            applyParameterDataRawText: (rawText, sourceName) => {
                applyRawDataCalls += 1
                projectState.parameterDataRaw = String(rawText || '[]')
                projectState.parameterDataRows = JSON.parse(projectState.parameterDataRaw)
                projectState.parameterDataSourceName = String(sourceName || '')
            }
        }
        const bridge = new WebMcpBridge({
            aiActionBridge: {
                runActions: async () => ({ executed: [], errors: [], warnings: [] }),
                getUiStateSnapshot: () => ({}),
                getActionCapabilities: () => ({ actions: [] }),
                parameterPanel
            },
            appController: {
                setZoom: () => {},
                setLocale: () => {},
                applyProjectPayload: async () => {},
                loadProjectFromUrl: async () => {},
                loadParameterDataFromUrl: async () => {},
                buildProjectPayload: () => ({
                    ...projectState,
                    parameters: projectState.parameters.map((entry) => ({ ...entry })),
                    parameterDataRows: projectState.parameterDataRows.map((row) => ({ ...row }))
                }),
                buildProjectShareUrl: () => ''
            },
            runtime: {
                navigator: {
                    modelContext: {
                        registerTool: (tool) => {
                            if (tool.name === 'labelprinter_action') {
                                registeredTool = tool
                            }
                        }
                    }
                }
            }
        })

        await bridge.init()
        const response = await registeredTool.execute({
            actions: [
                {
                    action: 'set_parameter_data_json',
                    parameterData: [{ name: 'Andres' }, { name: 'Maria' }],
                    sourceName: 'rows.json'
                },
                { action: 'get_parameter_state' },
                { action: 'clear_parameter_data' },
                { action: 'get_parameter_state' }
            ]
        })
        const payload = parseToolResponse(response)

        assert.equal(payload.ok, true)
        assert.equal(applyRawDataCalls, 2)
        const stateResults = payload.results.filter((entry) => entry.action === 'get_parameter_state')
        assert.equal(stateResults.length, 2)
        assert.equal(stateResults[0].parameterState.rowCount, 2)
        assert.equal(stateResults[0].parameterState.sourceName, 'rows.json')
        assert.equal(stateResults[1].parameterState.rowCount, 0)
        assert.equal(stateResults[1].parameterState.sourceName, '')
    })

    it('reports invalid action names as structured errors without throwing', async () => {
        let registeredTool = null
        const bridge = new WebMcpBridge({
            aiActionBridge: {
                runActions: async () => ({ executed: [], errors: [], warnings: [] }),
                getUiStateSnapshot: () => ({}),
                getActionCapabilities: () => ({})
            },
            appController: {
                setZoom: () => {},
                setLocale: () => {},
                applyProjectPayload: async () => {},
                loadProjectFromUrl: async () => {},
                loadParameterDataFromUrl: async () => {},
                buildProjectPayload: () => ({}),
                buildProjectShareUrl: () => ''
            },
            runtime: {
                navigator: {
                    modelContext: {
                        registerTool: (tool) => {
                            if (tool.name === 'labelprinter_action') {
                                registeredTool = tool
                            }
                        }
                    }
                }
            }
        })

        await bridge.init()
        const response = await registeredTool.execute({
            actions: [{ action: 'do_the_thing' }]
        })
        const payload = parseToolResponse(response)

        assert.equal(payload.ok, false)
        assert.equal(payload.errors.length >= 1, true)
    })
})
