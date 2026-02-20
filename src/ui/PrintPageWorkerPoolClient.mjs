import { WorkerRpcClient } from './WorkerRpcClient.mjs'

/**
 * Worker-pool client for batch print-page rendering.
 */
export class PrintPageWorkerPoolClient {
    #rpcClients = []
    #available = false

    /**
     * @param {{ rpcClients?: WorkerRpcClient[] | null, poolSize?: number }} [options={}] 
     */
    constructor(options = {}) {
        const providedClients = Array.isArray(options.rpcClients) ? options.rpcClients.filter(Boolean) : []
        if (providedClients.length) {
            this.#rpcClients = providedClients
        } else if (PrintPageWorkerPoolClient.isRuntimeSupported()) {
            const poolSize = PrintPageWorkerPoolClient.#resolvePoolSize(options.poolSize)
            this.#rpcClients = Array.from({ length: poolSize }, () =>
                new WorkerRpcClient(
                    () => new Worker(new URL('../workers/PrintPageWorker.mjs', import.meta.url)),
                    { timeoutMs: 45000 }
                )
            )
        }
        this.#available = this.#rpcClients.length > 0 && this.#rpcClients.every((client) => client.isAvailable())
    }

    /**
     * Returns whether current runtime supports print-page worker prerequisites.
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
     * @returns {PrintPageWorkerPoolClient | null}
     */
    static createDefault() {
        if (!PrintPageWorkerPoolClient.isRuntimeSupported()) return null
        try {
            return new PrintPageWorkerPoolClient()
        } catch (_error) {
            return null
        }
    }

    /**
     * Returns whether pool requests can currently be sent.
     * @returns {boolean}
     */
    isAvailable() {
        return this.#available && this.#rpcClients.length > 0 && this.#rpcClients.some((client) => client.isAvailable())
    }

    /**
     * Returns whether the snapshot shape is eligible for worker rendering.
     * This worker path keeps strict parity by handling text/qr/barcode-only batches.
     * @param {{ items?: Array<{ type?: string, positionMode?: string, rotation?: number }> }} stateSnapshot
     * @returns {boolean}
     */
    canRenderStateSnapshot(stateSnapshot) {
        const items = Array.isArray(stateSnapshot?.items) ? stateSnapshot.items : []
        return items.every((item) => {
            const type = String(item?.type || '').trim().toLowerCase()
            const mode = String(item?.positionMode || 'flow').trim().toLowerCase()
            const rotation = Math.round(Number(item?.rotation || 0))
            return ['text', 'qr', 'barcode'].includes(type) && mode === 'flow' && rotation === 0
        })
    }

    /**
     * Renders all pages in parallel across the worker pool.
     * Failed pages are returned with an error marker so callers can fall back per page.
     * @param {{
     *  stateSnapshot: object,
     *  parameterValueMaps: Array<Record<string, string>>
     * }} options
     * @returns {Promise<Array<{
     *  pageIndex: number,
     *  res?: object,
     *  media?: object,
     *  width?: number,
     *  height?: number,
     *  bitmap?: ImageBitmap,
     *  error?: string
     * }>>}
     */
    async renderPages({ stateSnapshot, parameterValueMaps }) {
        if (!this.isAvailable()) {
            throw new Error('Print page worker pool is unavailable.')
        }
        const safeMaps = Array.isArray(parameterValueMaps) ? parameterValueMaps : []
        const tasks = safeMaps.map((parameterValues, pageIndex) =>
            this.#renderOnePage({
                pageIndex,
                stateSnapshot,
                parameterValues,
                rpcClient: this.#rpcClients[pageIndex % this.#rpcClients.length]
            })
        )
        return Promise.all(tasks)
    }

    /**
     * Terminates all worker transports.
     */
    dispose() {
        this.#available = false
        this.#rpcClients.forEach((client) => client?.terminate?.())
        this.#rpcClients = []
    }

    /**
     * Renders one page via one pool worker.
     * @param {{ pageIndex: number, stateSnapshot: object, parameterValues: Record<string, string>, rpcClient: WorkerRpcClient }} options
     * @returns {Promise<{ pageIndex: number, res?: object, media?: object, width?: number, height?: number, bitmap?: ImageBitmap, error?: string }>}
     */
    async #renderOnePage({ pageIndex, stateSnapshot, parameterValues, rpcClient }) {
        if (!rpcClient?.isAvailable?.()) {
            return { pageIndex, error: 'worker-unavailable' }
        }
        try {
            const result = await rpcClient.request(
                'renderPrintPage',
                {
                    pageIndex,
                    stateSnapshot: stateSnapshot && typeof stateSnapshot === 'object' ? stateSnapshot : {},
                    parameterValues: parameterValues && typeof parameterValues === 'object' ? parameterValues : {}
                },
                { timeoutMs: 45000 }
            )
            if (!result?.bitmap) {
                return { pageIndex, error: 'missing-bitmap' }
            }
            return {
                pageIndex,
                res: result.res,
                media: result.media,
                width: Number(result.width) || 1,
                height: Number(result.height) || 1,
                bitmap: result.bitmap
            }
        } catch (error) {
            if (error?.name !== 'WorkerResponseError') {
                rpcClient.terminate()
            }
            return {
                pageIndex,
                error: error instanceof Error ? error.message : 'print-page-worker-error'
            }
        }
    }

    /**
     * Resolves a safe worker-pool size.
     * @param {number | undefined} requestedPoolSize
     * @returns {number}
     */
    static #resolvePoolSize(requestedPoolSize) {
        const requested = Math.round(Number(requestedPoolSize) || 0)
        if (requested > 0) {
            return Math.max(1, Math.min(8, requested))
        }
        const hardwareConcurrency = Math.max(1, Math.round(Number(globalThis?.navigator?.hardwareConcurrency) || 1))
        return Math.min(4, Math.max(1, hardwareConcurrency - 1))
    }
}
