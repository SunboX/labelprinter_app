import { WorkerRpcClient } from './WorkerRpcClient.mjs'

/**
 * Worker client for large parameter validation/preview computations.
 */
export class ParameterValidationWorkerClient {
    #rpcClient = null
    #available = false

    /**
     * @param {{ rpcClient?: WorkerRpcClient | null }} [options={}] 
     */
    constructor(options = {}) {
        this.#rpcClient = options.rpcClient || null
        if (!this.#rpcClient && ParameterValidationWorkerClient.isRuntimeSupported()) {
            this.#rpcClient = new WorkerRpcClient(
                () => new Worker(new URL('../workers/ParameterValidationWorker.mjs', import.meta.url), { type: 'module' }),
                { timeoutMs: 20000 }
            )
        }
        this.#available = Boolean(this.#rpcClient && this.#rpcClient.isAvailable())
    }

    /**
     * Returns whether current runtime supports worker validation.
     * @param {any} [runtime=globalThis]
     * @returns {boolean}
     */
    static isRuntimeSupported(runtime = globalThis) {
        const ref = runtime && typeof runtime === 'object' ? runtime : {}
        return typeof ref.Worker === 'function'
    }

    /**
     * Creates a default client when runtime worker support is present.
     * @returns {ParameterValidationWorkerClient | null}
     */
    static createDefault() {
        if (!ParameterValidationWorkerClient.isRuntimeSupported()) return null
        try {
            return new ParameterValidationWorkerClient()
        } catch (_error) {
            return null
        }
    }

    /**
     * Returns whether requests can currently be sent.
     * @returns {boolean}
     */
    isAvailable() {
        return this.#available && Boolean(this.#rpcClient?.isAvailable())
    }

    /**
     * Validates parameter setup and builds pretty preview metadata.
     * @param {{ definitions?: unknown[], items?: unknown[], rows?: unknown[], rawJson?: string }} payload
     * @returns {Promise<{
     *  validation: { errors: object[], warnings: object[], placeholders: string[] },
     *  previewText: string,
     *  rowLineRanges: Array<{ start: number, end: number }>
     * }>}
     */
    async validateParameters(payload) {
        if (!this.isAvailable()) {
            throw new Error('Parameter validation worker is unavailable.')
        }
        const safePayload = {
            definitions: Array.isArray(payload?.definitions) ? payload.definitions : [],
            items: Array.isArray(payload?.items) ? payload.items : [],
            rows: Array.isArray(payload?.rows) ? payload.rows : [],
            rawJson: String(payload?.rawJson || '')
        }
        try {
            const result = await this.#rpcClient.request('validateParameters', safePayload, { timeoutMs: 20000 })
            return {
                validation: result?.validation || { errors: [], warnings: [], placeholders: [] },
                previewText: String(result?.previewText || '[]'),
                rowLineRanges: Array.isArray(result?.rowLineRanges) ? result.rowLineRanges : []
            }
        } catch (error) {
            if (error?.name !== 'WorkerResponseError') {
                this.terminate()
            }
            throw error
        }
    }

    /**
     * Terminates the underlying worker transport.
     */
    terminate() {
        this.#available = false
        this.#rpcClient?.terminate()
    }
}
