import { WorkerRpcClient } from './WorkerRpcClient.mjs'

/**
 * Worker client for image/icon rasterization requests.
 */
export class RasterWorkerClient {
    #rpcClient = null
    #available = false

    /**
     * @param {{ rpcClient?: WorkerRpcClient | null }} [options={}]
     */
    constructor(options = {}) {
        this.#rpcClient = options.rpcClient || null
        if (!this.#rpcClient && RasterWorkerClient.isRuntimeSupported()) {
            this.#rpcClient = new WorkerRpcClient(
                () => new Worker(new URL('../workers/RasterWorker.mjs', import.meta.url), { type: 'module' }),
                { timeoutMs: 25000 }
            )
        }
        this.#available = Boolean(this.#rpcClient && this.#rpcClient.isAvailable())
    }

    /**
     * Returns whether current runtime supports the raster worker prerequisites.
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
     * @returns {RasterWorkerClient | null}
     */
    static createDefault() {
        if (!RasterWorkerClient.isRuntimeSupported()) return null
        try {
            return new RasterWorkerClient()
        } catch (_error) {
            return null
        }
    }

    /**
     * Returns whether raster worker requests can currently be sent.
     * @returns {boolean}
     */
    isAvailable() {
        return this.#available && Boolean(this.#rpcClient?.isAvailable())
    }

    /**
     * Rasterizes one image source using printer-oriented monochrome settings.
     * @param {{
     *  source: string,
     *  width: number,
     *  height: number,
     *  cacheKey: string,
     *  options: { imageDither: string, imageThreshold: number, imageSmoothing: string, imageInvert: boolean }
     * }} request
     * @returns {Promise<{ cacheKey: string, bitmap: ImageBitmap, width: number, height: number }>}
     */
    async rasterizeImage(request) {
        return this.#rasterize('image', request)
    }

    /**
     * Rasterizes one icon source to strict black/transparent pixels.
     * @param {{ source: string, width: number, height: number, cacheKey: string }} request
     * @returns {Promise<{ cacheKey: string, bitmap: ImageBitmap, width: number, height: number }>}
     */
    async rasterizeIcon(request) {
        return this.#rasterize('icon', request)
    }

    /**
     * Terminates the underlying worker transport.
     */
    terminate() {
        this.#available = false
        this.#rpcClient?.terminate()
    }

    /**
     * Sends one rasterization RPC request.
     * @param {'image' | 'icon'} mode
     * @param {{ source?: string, width?: number, height?: number, cacheKey?: string, options?: object }} request
     * @returns {Promise<{ cacheKey: string, bitmap: ImageBitmap, width: number, height: number }>}
     */
    async #rasterize(mode, request) {
        if (!this.isAvailable()) {
            throw new Error('Raster worker is unavailable.')
        }
        const payload = {
            mode,
            source: String(request?.source || ''),
            width: Math.max(1, Math.round(Number(request?.width) || 1)),
            height: Math.max(1, Math.round(Number(request?.height) || 1)),
            cacheKey: String(request?.cacheKey || ''),
            options: request?.options && typeof request.options === 'object' ? request.options : {}
        }
        try {
            const result = await this.#rpcClient.request('rasterize', payload, { timeoutMs: 25000 })
            if (!result?.bitmap) {
                throw new Error('Raster worker returned no bitmap payload.')
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
