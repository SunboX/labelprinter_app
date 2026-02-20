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
    it('is a no-op when navigator.modelContext is unavailable', async () => {
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
            runtime: { navigator: {} }
        })

        assert.equal(await bridge.init(), false)
    })

    it('registers the tool using registerTool when available', async () => {
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
                            registeredTool = tool
                        }
                    }
                }
            }
        })

        assert.equal(await bridge.init(), true)
        assert.ok(registeredTool)
        assert.equal(registeredTool.name, 'labelprinter_action')
        assert.equal(typeof registeredTool.execute, 'function')
        assert.equal(registeredTool.inputSchema.type, 'object')
    })

    it('falls back to provideContext when registerTool is unavailable', async () => {
        let providedTools = []
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
                        provideContext: ({ tools }) => {
                            providedTools = Array.isArray(tools) ? tools : []
                        }
                    }
                }
            }
        })

        assert.equal(await bridge.init(), true)
        assert.equal(providedTools.length, 1)
        assert.equal(providedTools[0].name, 'labelprinter_action')
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
                            registeredTool = tool
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
                buildProjectPayload: () => ({ media: 'W24', version: '1.1.7' }),
                buildProjectShareUrl: () => 'https://example.com/?project=xyz'
            },
            runtime: {
                navigator: {
                    modelContext: {
                        registerTool: (tool) => {
                            registeredTool = tool
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
                { action: 'get_action_capabilities' }
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
                            registeredTool = tool
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
