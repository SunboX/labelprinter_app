/**
 * Lightweight RPC wrapper around module workers.
 * Handles request correlation, timeout cleanup, and stale response drops.
 */
export class WorkerRpcClient {
    #createWorker = null
    #worker = null
    #defaultTimeoutMs = 15000
    #nextRequestIdValue = 1
    #pendingRequests = new Map()
    #isTerminated = false

    /**
     * @param {() => Worker} createWorker
     * @param {{ timeoutMs?: number }} [options={}]
     */
    constructor(createWorker, options = {}) {
        this.#createWorker = typeof createWorker === 'function' ? createWorker : null
        this.#defaultTimeoutMs = Math.max(1, Number(options.timeoutMs) || 15000)
    }

    /**
     * Returns whether this client can currently issue worker requests.
     * @returns {boolean}
     */
    isAvailable() {
        return !this.#isTerminated && typeof this.#createWorker === 'function'
    }

    /**
     * Sends one RPC request and resolves with the success payload.
     * @param {string} type
     * @param {Record<string, unknown>} [payload={}]
     * @param {{ timeoutMs?: number, transfer?: Transferable[] }} [options={}]
     * @returns {Promise<any>}
     */
    request(type, payload = {}, options = {}) {
        if (!this.isAvailable()) {
            return Promise.reject(new Error('Worker RPC client is unavailable.'))
        }
        const worker = this.#ensureWorker()
        const requestType = String(type || '').trim()
        if (!requestType) {
            return Promise.reject(new Error('Worker RPC request type is required.'))
        }
        const requestId = this.#nextRequestId()
        const timeoutMs = Math.max(1, Number(options.timeoutMs) || this.#defaultTimeoutMs)
        const transferList = Array.isArray(options.transfer) ? options.transfer : []
        const envelope = { type: requestType, requestId, payload: payload && typeof payload === 'object' ? payload : {} }

        return new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                this.#pendingRequests.delete(requestId)
                reject(new Error(`Worker RPC request timed out after ${timeoutMs}ms.`))
            }, timeoutMs)
            this.#pendingRequests.set(requestId, {
                requestType,
                resolve,
                reject,
                timeoutHandle
            })
            try {
                worker.postMessage(envelope, transferList)
            } catch (error) {
                clearTimeout(timeoutHandle)
                this.#pendingRequests.delete(requestId)
                reject(error instanceof Error ? error : new Error('Failed to post message to worker.'))
            }
        })
    }

    /**
     * Terminates the active worker and rejects pending requests.
     */
    terminate() {
        this.#isTerminated = true
        if (this.#worker && typeof this.#worker.terminate === 'function') {
            this.#worker.terminate()
        }
        this.#worker = null
        this.#rejectPendingRequests('Worker RPC client terminated.')
    }

    /**
     * Lazily creates a worker instance.
     * @returns {Worker}
     */
    #ensureWorker() {
        if (this.#worker) return this.#worker
        try {
            this.#worker = this.#createWorker()
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to initialize worker.'
            throw new Error(message)
        }
        if (!this.#worker || typeof this.#worker.postMessage !== 'function') {
            this.#worker = null
            throw new Error('Worker factory returned an invalid worker instance.')
        }
        this.#worker.onmessage = (event) => this.#handleWorkerMessage(event)
        this.#worker.onerror = (error) => this.#handleWorkerRuntimeError(error)
        return this.#worker
    }

    /**
     * Handles worker responses.
     * @param {{ data?: any }} event
     */
    #handleWorkerMessage(event) {
        const message = event?.data || {}
        const requestId = Number(message?.requestId)
        if (!Number.isInteger(requestId) || requestId < 1) return
        const pending = this.#pendingRequests.get(requestId)
        // Ignore stale/late responses after timeout or cancellation.
        if (!pending) return
        const messageType = String(message?.type || '')
        const successType = `${pending.requestType}:ok`
        const errorType = `${pending.requestType}:error`
        if (messageType !== successType && messageType !== errorType) return

        clearTimeout(pending.timeoutHandle)
        this.#pendingRequests.delete(requestId)
        if (messageType === successType) {
            pending.resolve(message?.payload)
            return
        }
        const workerErrorMessage = String(message?.error?.message || 'Worker request failed.')
        const workerError = new Error(workerErrorMessage)
        workerError.name = 'WorkerResponseError'
        pending.reject(workerError)
    }

    /**
     * Handles runtime worker failures.
     * @param {ErrorEvent | Event | unknown} error
     */
    #handleWorkerRuntimeError(error) {
        const message =
            typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
                ? error.message
                : 'Worker runtime error.'
        this.#worker = null
        this.#rejectPendingRequests(message)
    }

    /**
     * Rejects all in-flight requests and clears timers.
     * @param {string} message
     */
    #rejectPendingRequests(message) {
        const pendingEntries = Array.from(this.#pendingRequests.values())
        this.#pendingRequests.clear()
        pendingEntries.forEach((pending) => {
            clearTimeout(pending.timeoutHandle)
            pending.reject(new Error(message))
        })
    }

    /**
     * Returns the next request id.
     * @returns {number}
     */
    #nextRequestId() {
        const requestId = this.#nextRequestIdValue
        this.#nextRequestIdValue += 1
        return requestId
    }
}
