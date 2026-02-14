import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AiResponseUtils } from '../src/AiResponseUtils.mjs'

describe('ai-response-utils', () => {
    it('extracts output text from output_text shortcut', () => {
        const response = { output_text: 'hello world' }
        assert.equal(AiResponseUtils.extractOutputText(response), 'hello world')
    })

    it('extracts output text from message blocks', () => {
        const response = {
            output: [
                {
                    type: 'message',
                    content: [
                        { type: 'output_text', text: 'Hello ' },
                        { type: 'output_text', text: 'Labelprinter' }
                    ]
                }
            ]
        }
        assert.equal(AiResponseUtils.extractOutputText(response), 'Hello Labelprinter')
    })

    it('extracts single and batched function call actions', () => {
        const response = {
            output: [
                {
                    type: 'function_call',
                    name: 'editor_action',
                    arguments: JSON.stringify({ action: 'add_item', itemType: 'text' })
                },
                {
                    type: 'function_call',
                    name: 'ui_action',
                    arguments: JSON.stringify({
                        actions: [
                            { action: 'set_label', settings: { media: 'W9' } },
                            { action: 'align_selected', mode: 'left' }
                        ]
                    })
                }
            ]
        }
        const actions = AiResponseUtils.extractActions(response)
        assert.equal(actions.length, 3)
        assert.equal(actions[0].action, 'add_item')
        assert.equal(actions[1].action, 'set_label')
        assert.equal(actions[2].action, 'align_selected')
    })

    it('extracts actions from nested argument wrappers and non-standard function names', () => {
        const response = {
            output: [
                {
                    type: 'function_call',
                    name: 'assistant_action',
                    arguments: JSON.stringify({
                        payload: {
                            actions: [{ action: 'add_item', itemType: 'text' }]
                        }
                    })
                },
                {
                    type: 'function_call',
                    name: 'another_tool_name',
                    arguments: JSON.stringify({
                        request: {
                            action: 'set_label',
                            settings: { media: 'W24' }
                        }
                    })
                }
            ]
        }
        const actions = AiResponseUtils.extractActions(response)
        assert.equal(actions.length, 2)
        assert.equal(actions[0].action, 'add_item')
        assert.equal(actions[1].action, 'set_label')
    })

    it('extracts incomplete reason from incomplete responses', () => {
        const response = {
            status: 'incomplete',
            incomplete_details: {
                reason: 'max_output_tokens'
            }
        }
        assert.equal(AiResponseUtils.extractIncompleteReason(response), 'max_output_tokens')
        assert.equal(AiResponseUtils.extractIncompleteReason({ status: 'completed' }), '')
    })

    it('counts function_call outputs', () => {
        const response = {
            output: [
                { type: 'function_call', name: 'editor_action', arguments: '{}' },
                { type: 'message', content: [{ type: 'output_text', text: 'ok' }] },
                { type: 'function_call', name: 'ui_action', arguments: '{}' }
            ]
        }
        assert.equal(AiResponseUtils.countFunctionCalls(response), 2)
    })
})
