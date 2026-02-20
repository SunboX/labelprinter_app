import { WorkerRpcClient } from './WorkerRpcClient.mjs'

/**
 * Worker client for spreadsheet parameter data parsing.
 */
export class ParameterDataWorkerClient {
    #rpcClient = null
    #available = false

    /**
     * @param {{ rpcClient?: WorkerRpcClient | null }} [options={}]
     */
    constructor(options = {}) {
        this.#rpcClient = options.rpcClient || null
        if (!this.#rpcClient && ParameterDataWorkerClient.isRuntimeSupported()) {
            this.#rpcClient = new WorkerRpcClient(
                () => new Worker(new URL('../workers/ParameterDataWorker.mjs', import.meta.url), { type: 'module' }),
                { timeoutMs: 25000 }
            )
        }
        this.#available = Boolean(this.#rpcClient && this.#rpcClient.isAvailable())
    }

    /**
     * Returns whether current runtime supports worker parsing.
     * @param {any} [runtime=globalThis]
     * @returns {boolean}
     */
    static isRuntimeSupported(runtime = globalThis) {
        const ref = runtime && typeof runtime === 'object' ? runtime : {}
        return typeof ref.Worker === 'function'
    }

    /**
     * Creates a default client when runtime worker support is present.
     * @returns {ParameterDataWorkerClient | null}
     */
    static createDefault() {
        if (!ParameterDataWorkerClient.isRuntimeSupported()) return null
        try {
            return new ParameterDataWorkerClient()
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
     * Parses spreadsheet-like bytes into normalized row objects.
     * @param {Uint8Array} bytes
     * @param {string} sourceName
     * @returns {Promise<Record<string, unknown>[]>}
     */
    async parseSpreadsheet(bytes, sourceName = '') {
        if (!this.isAvailable()) {
            throw new Error('Parameter data worker is unavailable.')
        }
        const safeBytes = ParameterDataWorkerClient.#normalizeBytes(bytes)
        // Transfer a cloned buffer so caller-owned input remains usable.
        const transferableBytes = new Uint8Array(safeBytes)
        try {
            const result = await this.#rpcClient.request(
                'parseSpreadsheet',
                {
                    bytes: transferableBytes,
                    sourceName: String(sourceName || '')
                },
                {
                    timeoutMs: 25000,
                    transfer: [transferableBytes.buffer]
                }
            )
            return Array.isArray(result?.rows) ? result.rows : []
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

    /**
     * Normalizes unknown byte inputs to Uint8Array.
     * @param {unknown} value
     * @returns {Uint8Array}
     */
    static #normalizeBytes(value) {
        if (value instanceof Uint8Array) return value
        if (value instanceof ArrayBuffer) return new Uint8Array(value)
        if (ArrayBuffer.isView(value)) {
            return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        }
        return new Uint8Array(0)
    }
}
