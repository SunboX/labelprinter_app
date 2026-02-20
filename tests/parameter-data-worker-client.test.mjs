import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ParameterDataWorkerClient } from '../src/ui/ParameterDataWorkerClient.mjs'

/**
 * Builds an RPC double with availability tracking.
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

describe('parameter-data-worker-client', () => {
    it('detects runtime worker capability', () => {
        assert.equal(ParameterDataWorkerClient.isRuntimeSupported({ Worker: function Worker() {} }), true)
        assert.equal(ParameterDataWorkerClient.isRuntimeSupported({}), false)
    })

    it('parses spreadsheet payloads through worker RPC and transfers buffers', async () => {
        const rpcDouble = createRpcDouble(async (type, payload, options) => {
            assert.equal(type, 'parseSpreadsheet')
            assert.equal(payload.sourceName, 'rows.xlsx')
            assert.equal(payload.bytes instanceof Uint8Array, true)
            assert.equal(Array.isArray(options.transfer), true)
            assert.equal(options.transfer.length, 1)
            return { rows: [{ a: '1' }] }
        })
        const client = new ParameterDataWorkerClient({ rpcClient: rpcDouble })
        const rows = await client.parseSpreadsheet(new Uint8Array([1, 2, 3]), 'rows.xlsx')

        assert.deepEqual(rows, [{ a: '1' }])
    })

    it('terminates on transport-level errors', async () => {
        const rpcDouble = createRpcDouble(async () => {
            throw new Error('worker unavailable')
        })
        const client = new ParameterDataWorkerClient({ rpcClient: rpcDouble })

        await assert.rejects(() => client.parseSpreadsheet(new Uint8Array([1]), 'rows.xlsx'))
        assert.equal(client.isAvailable(), false)
    })

    it('keeps worker client available for worker response errors', async () => {
        const rpcDouble = createRpcDouble(async () => {
            const error = new Error('parse failed')
            error.name = 'WorkerResponseError'
            throw error
        })
        const client = new ParameterDataWorkerClient({ rpcClient: rpcDouble })

        await assert.rejects(() => client.parseSpreadsheet(new Uint8Array([1]), 'rows.xlsx'))
        assert.equal(client.isAvailable(), true)
    })
})
