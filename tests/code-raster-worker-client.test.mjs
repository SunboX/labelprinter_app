import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CodeRasterWorkerClient } from '../src/ui/CodeRasterWorkerClient.mjs'

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

describe('code-raster-worker-client', () => {
    it('detects required worker runtime capabilities', () => {
        assert.equal(
            CodeRasterWorkerClient.isRuntimeSupported({
                Worker: function Worker() {},
                OffscreenCanvas: function OffscreenCanvas() {},
                createImageBitmap: () => {}
            }),
            true
        )
        assert.equal(CodeRasterWorkerClient.isRuntimeSupported({ Worker: function Worker() {} }), false)
    })

    it('forwards QR raster payloads through RPC', async () => {
        let capturedType = ''
        let capturedPayload = null
        const rpcDouble = createRpcDouble(async (type, payload) => {
            capturedType = type
            capturedPayload = payload
            return {
                cacheKey: payload.cacheKey,
                width: payload.width,
                height: payload.height,
                bitmap: { id: 'qr-bitmap' }
            }
        })
        const client = new CodeRasterWorkerClient({ rpcClient: rpcDouble })
        const result = await client.buildQrRaster({
            data: 'HELLO',
            width: 88,
            cacheKey: 'qr::88::hello',
            options: { qrErrorCorrectionLevel: 'H', qrVersion: 4 }
        })

        assert.equal(capturedType, 'buildCodeRaster')
        assert.equal(capturedPayload.mode, 'qr')
        assert.equal(capturedPayload.data, 'HELLO')
        assert.equal(capturedPayload.width, 88)
        assert.equal(capturedPayload.height, 88)
        assert.equal(result.cacheKey, 'qr::88::hello')
    })

    it('normalizes barcode dimensions and forwards barcode mode', async () => {
        let capturedPayload = null
        const rpcDouble = createRpcDouble(async (_type, payload) => {
            capturedPayload = payload
            return {
                cacheKey: payload.cacheKey,
                width: payload.width,
                height: payload.height,
                bitmap: { id: 'barcode-bitmap' }
            }
        })
        const client = new CodeRasterWorkerClient({ rpcClient: rpcDouble })
        await client.buildBarcodeRaster({
            data: '123456',
            width: 0,
            height: 0,
            cacheKey: 'bar::123456',
            options: { barcodeFormat: 'CODE128' }
        })

        assert.equal(capturedPayload.mode, 'barcode')
        assert.equal(capturedPayload.width, 1)
        assert.equal(capturedPayload.height, 1)
    })

    it('terminates and disables on transport-level RPC failures', async () => {
        const rpcDouble = createRpcDouble(async () => {
            throw new Error('transport failed')
        })
        const client = new CodeRasterWorkerClient({ rpcClient: rpcDouble })

        await assert.rejects(() =>
            client.buildQrRaster({
                data: 'bad',
                width: 16,
                cacheKey: 'bad',
                options: {}
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
        const client = new CodeRasterWorkerClient({ rpcClient: rpcDouble })

        await assert.rejects(() =>
            client.buildBarcodeRaster({
                data: 'bad',
                width: 32,
                height: 16,
                cacheKey: 'bad',
                options: {}
            })
        )
        assert.equal(client.isAvailable(), true)
    })
})
