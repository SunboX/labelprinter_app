import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PrintPageWorkerPoolClient } from '../src/ui/PrintPageWorkerPoolClient.mjs'

/**
 * Sleeps for a short duration.
 * @param {number} durationMs
 * @returns {Promise<void>}
 */
function sleep(durationMs) {
    return new Promise((resolve) => setTimeout(resolve, durationMs))
}

/**
 * Creates a minimal RPC client double.
 * @param {(type: string, payload: object, options: object) => Promise<any>} requestImpl
 * @returns {{ request: Function, isAvailable: () => boolean, terminate: () => void, wasTerminated: () => boolean }}
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
        },
        wasTerminated() {
            return terminated
        }
    }
}

describe('print-page-worker-pool-client', () => {
    it('detects required worker runtime capabilities', () => {
        assert.equal(
            PrintPageWorkerPoolClient.isRuntimeSupported({
                Worker: function Worker() {},
                OffscreenCanvas: function OffscreenCanvas() {},
                createImageBitmap: () => {}
            }),
            true
        )
        assert.equal(PrintPageWorkerPoolClient.isRuntimeSupported({ Worker: function Worker() {} }), false)
    })

    it('returns page outputs in stable pageIndex order despite out-of-order completion', async () => {
        const rpcClientA = createRpcDouble(async (_type, payload) => {
            if (payload.pageIndex === 0) {
                await sleep(20)
            }
            if (payload.pageIndex === 2) {
                await sleep(5)
            }
            return {
                pageIndex: payload.pageIndex,
                res: { id: 'LOW' },
                media: { id: 'W9' },
                width: 128,
                height: 64,
                bitmap: { id: `bitmap-${payload.pageIndex}` }
            }
        })
        const rpcClientB = createRpcDouble(async (_type, payload) => {
            await sleep(1)
            return {
                pageIndex: payload.pageIndex,
                res: { id: 'LOW' },
                media: { id: 'W9' },
                width: 128,
                height: 64,
                bitmap: { id: `bitmap-${payload.pageIndex}` }
            }
        })
        const client = new PrintPageWorkerPoolClient({
            rpcClients: [rpcClientA, rpcClientB]
        })

        const pages = await client.renderPages({
            stateSnapshot: { items: [{ type: 'text', positionMode: 'flow', rotation: 0 }] },
            parameterValueMaps: [{ a: '1' }, { a: '2' }, { a: '3' }]
        })

        assert.deepEqual(
            pages.map((page) => page.pageIndex),
            [0, 1, 2]
        )
        assert.deepEqual(
            pages.map((page) => page.bitmap.id),
            ['bitmap-0', 'bitmap-1', 'bitmap-2']
        )
    })

    it('marks pages as errored and terminates client on transport failures', async () => {
        const rpcClient = createRpcDouble(async () => {
            throw new Error('worker crashed')
        })
        const client = new PrintPageWorkerPoolClient({ rpcClients: [rpcClient] })

        const pages = await client.renderPages({
            stateSnapshot: { items: [{ type: 'text', positionMode: 'flow', rotation: 0 }] },
            parameterValueMaps: [{}]
        })

        assert.equal(pages.length, 1)
        assert.equal(pages[0].pageIndex, 0)
        assert.match(String(pages[0].error || ''), /worker crashed/)
        assert.equal(rpcClient.wasTerminated(), true)
    })

    it('keeps worker client available for per-request worker response errors', async () => {
        const rpcClient = createRpcDouble(async () => {
            const error = new Error('unsupported payload')
            error.name = 'WorkerResponseError'
            throw error
        })
        const client = new PrintPageWorkerPoolClient({ rpcClients: [rpcClient] })

        const pages = await client.renderPages({
            stateSnapshot: { items: [{ type: 'text', positionMode: 'flow', rotation: 0 }] },
            parameterValueMaps: [{}]
        })

        assert.equal(pages.length, 1)
        assert.match(String(pages[0].error || ''), /unsupported payload/)
        assert.equal(rpcClient.wasTerminated(), false)
    })

    it('accepts only flow-mode text, qr, and barcode items for worker snapshots', () => {
        const rpcClient = createRpcDouble(async () => ({
            pageIndex: 0,
            res: { id: 'LOW' },
            media: { id: 'W9' },
            width: 128,
            height: 64,
            bitmap: { id: 'bitmap-0' }
        }))
        const client = new PrintPageWorkerPoolClient({ rpcClients: [rpcClient] })

        assert.equal(
            client.canRenderStateSnapshot({
                items: [
                    { type: 'text', positionMode: 'flow', rotation: 0 },
                    { type: 'qr', positionMode: 'flow', rotation: 0 },
                    { type: 'barcode', positionMode: 'flow', rotation: 0 }
                ]
            }),
            true
        )
        assert.equal(
            client.canRenderStateSnapshot({ items: [{ type: 'image', positionMode: 'flow', rotation: 0 }] }),
            false
        )
        assert.equal(
            client.canRenderStateSnapshot({ items: [{ type: 'text', positionMode: 'flow', rotation: 10 }] }),
            false
        )
    })
})
