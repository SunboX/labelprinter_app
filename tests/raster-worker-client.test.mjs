import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RasterWorkerClient } from '../src/ui/RasterWorkerClient.mjs'

/**
 * Creates a minimal RPC client double.
 * @param {(type: string, payload: object) => Promise<any>} requestImpl
 * @returns {{ request: Function, isAvailable: () => boolean, terminate: () => void }}
 */
function createRpcDouble(requestImpl) {
    let terminated = false
    return {
        async request(type, payload) {
            return requestImpl(type, payload)
        },
        isAvailable() {
            return !terminated
        },
        terminate() {
            terminated = true
        }
    }
}

describe('raster-worker-client', () => {
    it('detects required worker runtime capabilities', () => {
        assert.equal(
            RasterWorkerClient.isRuntimeSupported({
                Worker: function Worker() {},
                OffscreenCanvas: function OffscreenCanvas() {},
                createImageBitmap: () => {}
            }),
            true
        )
        assert.equal(RasterWorkerClient.isRuntimeSupported({ Worker: function Worker() {} }), false)
    })

    it('forwards raster image requests through RPC payloads', async () => {
        const rpcDouble = createRpcDouble(async (_type, payload) => ({
            cacheKey: payload.cacheKey,
            width: payload.width,
            height: payload.height,
            bitmap: { id: 'bitmap' }
        }))
        const client = new RasterWorkerClient({ rpcClient: rpcDouble })
        const result = await client.rasterizeImage({
            source: 'data:image/png;base64,aaaa',
            width: 32,
            height: 16,
            cacheKey: 'abc',
            options: { imageDither: 'threshold' }
        })

        assert.equal(result.cacheKey, 'abc')
        assert.equal(result.width, 32)
        assert.equal(result.height, 16)
    })

    it('terminates and disables on transport-level RPC failures', async () => {
        const rpcDouble = createRpcDouble(async () => {
            throw new Error('transport failed')
        })
        const client = new RasterWorkerClient({ rpcClient: rpcDouble })

        await assert.rejects(() =>
            client.rasterizeIcon({
                source: '/assets/icons/icon-home.svg',
                width: 24,
                height: 24,
                cacheKey: 'icon:home'
            })
        )
        assert.equal(client.isAvailable(), false)
    })

    it('keeps client available for per-request worker response errors', async () => {
        const rpcDouble = createRpcDouble(async () => {
            const error = new Error('decode failed')
            error.name = 'WorkerResponseError'
            throw error
        })
        const client = new RasterWorkerClient({ rpcClient: rpcDouble })

        await assert.rejects(() =>
            client.rasterizeImage({
                source: 'bad',
                width: 1,
                height: 1,
                cacheKey: 'bad',
                options: {}
            })
        )
        assert.equal(client.isAvailable(), true)
    })
})
