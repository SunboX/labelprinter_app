import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ParameterValidationWorkerClient } from '../src/ui/ParameterValidationWorkerClient.mjs'

/**
 * Creates a minimal RPC client double.
 * @param {(type: string, payload: object, options: object) => Promise<any>} requestImpl
 * @returns {{ request: Function, isAvailable: () => boolean, terminate: () => void }}
 */
function createRpcDouble(requestImpl) {
    let terminated = false
    return {
        async request(type, payload, options) {
            return requestImpl(type, payload, options)
        },
        isAvailable() {
            return !terminated
        },
        terminate() {
            terminated = true
        }
    }
}

describe('parameter-validation-worker-client', () => {
    it('detects runtime worker capability', () => {
        assert.equal(ParameterValidationWorkerClient.isRuntimeSupported({ Worker: function Worker() {} }), true)
        assert.equal(ParameterValidationWorkerClient.isRuntimeSupported({}), false)
    })

    it('forwards validation payloads and returns normalized worker output', async () => {
        const largeRows = Array.from({ length: 250 }, (_, index) => ({ id: String(index + 1) }))
        let capturedPayload = null
        const rpcDouble = createRpcDouble(async (type, payload) => {
            assert.equal(type, 'validateParameters')
            capturedPayload = payload
            return {
                validation: {
                    errors: [],
                    warnings: [{ code: 'warning' }],
                    placeholders: ['name']
                },
                previewText: '[{"id":"1"}]',
                rowLineRanges: [{ start: 2, end: 4 }]
            }
        })
        const client = new ParameterValidationWorkerClient({ rpcClient: rpcDouble })
        const result = await client.validateParameters({
            definitions: [{ name: 'name', defaultValue: '' }],
            items: [{ type: 'text', text: '{{name}}' }],
            rows: largeRows,
            rawJson: JSON.stringify(largeRows)
        })

        assert.equal(Array.isArray(capturedPayload.rows), true)
        assert.equal(capturedPayload.rows.length, 250)
        assert.equal(result.validation.warnings.length, 1)
        assert.equal(result.previewText, '[{"id":"1"}]')
        assert.deepEqual(result.rowLineRanges, [{ start: 2, end: 4 }])
    })

    it('terminates on transport-level errors', async () => {
        const rpcDouble = createRpcDouble(async () => {
            throw new Error('worker unavailable')
        })
        const client = new ParameterValidationWorkerClient({ rpcClient: rpcDouble })

        await assert.rejects(() =>
            client.validateParameters({
                definitions: [],
                items: [],
                rows: [],
                rawJson: '[]'
            })
        )
        assert.equal(client.isAvailable(), false)
    })

    it('keeps worker client available for worker response errors', async () => {
        const rpcDouble = createRpcDouble(async () => {
            const error = new Error('validation failed')
            error.name = 'WorkerResponseError'
            throw error
        })
        const client = new ParameterValidationWorkerClient({ rpcClient: rpcDouble })

        await assert.rejects(() =>
            client.validateParameters({
                definitions: [],
                items: [],
                rows: [],
                rawJson: '[]'
            })
        )
        assert.equal(client.isAvailable(), true)
    })
})
