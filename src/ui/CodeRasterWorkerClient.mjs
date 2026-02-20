import { WorkerRpcClient } from './WorkerRpcClient.mjs'

/**
 * Worker client for QR and barcode raster rendering.
 */
export class CodeRasterWorkerClient {
    #rpcClient = null
    #available = false

    /**
     * @param {{ rpcClient?: WorkerRpcClient | null }} [options={}] 
     */
    constructor(options = {}) {
        this.#rpcClient = options.rpcClient || null
        if (!this.#rpcClient && CodeRasterWorkerClient.isRuntimeSupported()) {
            this.#rpcClient = new WorkerRpcClient(
                () => new Worker(new URL('../workers/CodeRasterWorker.mjs', import.meta.url)),
                { timeoutMs: 25000 }
            )
        }
        this.#available = Boolean(this.#rpcClient && this.#rpcClient.isAvailable())
    }

    /**
     * Returns whether current runtime supports code raster worker prerequisites.
     * @param {any} [runtime=globalThis]
     * @returns {boolean}
     */
    static isRuntimeSupported(runtime = globalThis) {
        const ref = runtime && typeof runtime === 'object' ? runtime : {}
        return (
            typeof ref.Worker === 'function' &&
            typeof ref.OffscreenCanvas === 'function' &&
            typeof ref.createImageBitmap === 'function'
        )
    }

    /**
     * Creates a default client when runtime prerequisites are met.
     * @returns {CodeRasterWorkerClient | null}
     */
    static createDefault() {
        if (!CodeRasterWorkerClient.isRuntimeSupported()) return null
        try {
            return new CodeRasterWorkerClient()
        } catch (_error) {
            return null
        }
    }

    /**
     * Returns whether code raster worker requests can currently be sent.
     * @returns {boolean}
     */
    isAvailable() {
        return this.#available && Boolean(this.#rpcClient?.isAvailable())
    }

    /**
     * Builds one QR raster bitmap.
     * @param {{ data?: string, width?: number, cacheKey?: string, options?: object }} request
     * @returns {Promise<{ cacheKey: string, bitmap: ImageBitmap, width: number, height: number }>}
     */
    async buildQrRaster(request) {
        return this.#buildCodeRaster('qr', request)
    }

    /**
     * Builds one barcode raster bitmap.
     * @param {{ data?: string, width?: number, height?: number, cacheKey?: string, options?: object }} request
     * @returns {Promise<{ cacheKey: string, bitmap: ImageBitmap, width: number, height: number }>}
     */
    async buildBarcodeRaster(request) {
        return this.#buildCodeRaster('barcode', request)
    }

    /**
     * Terminates the underlying worker transport.
     */
    terminate() {
        this.#available = false
        this.#rpcClient?.terminate()
    }

    /**
     * Sends one code-raster request.
     * @param {'qr' | 'barcode'} mode
     * @param {{ data?: string, width?: number, height?: number, cacheKey?: string, options?: object }} request
     * @returns {Promise<{ cacheKey: string, bitmap: ImageBitmap, width: number, height: number }>}
     */
    async #buildCodeRaster(mode, request) {
        if (!this.isAvailable()) {
            throw new Error('Code raster worker is unavailable.')
        }
        const safeWidth = Math.max(1, Math.round(Number(request?.width) || 1))
        const safeHeight = Math.max(1, Math.round(Number(request?.height) || safeWidth))
        const payload = {
            mode,
            data: String(request?.data || ''),
            width: safeWidth,
            height: safeHeight,
            cacheKey: String(request?.cacheKey || ''),
            options: request?.options && typeof request.options === 'object' ? request.options : {}
        }
        try {
            const result = await this.#rpcClient.request('buildCodeRaster', payload, { timeoutMs: 25000 })
            if (!result?.bitmap) {
                throw new Error('Code raster worker returned no bitmap payload.')
            }
            return result
        } catch (error) {
            if (error?.name !== 'WorkerResponseError') {
                this.terminate()
            }
            throw error
        }
    }
}
