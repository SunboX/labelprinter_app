import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { WorkerRpcClient } from '../src/ui/WorkerRpcClient.mjs'

/**
 * Minimal worker test double for RPC client tests.
 */
class FakeWorker {
    /**
     * @param {(message: any, worker: FakeWorker) => void} [onPostMessage]
     */
    constructor(onPostMessage = () => {}) {
        this.onmessage = null
        this.onerror = null
        this.#onPostMessage = onPostMessage
        this.#isTerminated = false
    }

    #onPostMessage = () => {}
    #isTerminated = false

    /**
     * @param {any} message
     */
    postMessage(message) {
        if (this.#isTerminated) {
            throw new Error('Worker already terminated')
        }
        this.#onPostMessage(message, this)
    }

    /**
     * @returns {void}
     */
    terminate() {
        this.#isTerminated = true
    }

    /**
     * @param {any} data
     */
    emitMessage(data) {
        this.onmessage?.({ data })
    }

    /**
     * @param {string} message
     */
    emitError(message) {
        this.onerror?.({ message })
    }
}

/**
 * Sleeps for a short duration.
 * @param {number} durationMs
 * @returns {Promise<void>}
 */
function sleep(durationMs) {
    return new Promise((resolve) => setTimeout(resolve, durationMs))
}

describe('worker-rpc-client', () => {
    it('resolves correlated success responses', async () => {
        const worker = new FakeWorker((message, workerRef) => {
            setTimeout(() => {
                workerRef.emitMessage({
                    type: `${message.type}:ok`,
                    requestId: message.requestId,
                    payload: { ok: true }
                })
            }, 0)
        })
        const rpcClient = new WorkerRpcClient(() => worker, { timeoutMs: 50 })
        const result = await rpcClient.request('ping', { value: 1 })

        assert.deepEqual(result, { ok: true })
    })

    it('times out requests and ignores stale responses', async () => {
        let firstRequestId = 0
        const worker = new FakeWorker((message) => {
            if (!firstRequestId) {
                firstRequestId = message.requestId
            }
        })
        const rpcClient = new WorkerRpcClient(() => worker, { timeoutMs: 20 })

        await assert.rejects(() => rpcClient.request('slow'), /timed out/)
        worker.emitMessage({
            type: 'slow:ok',
            requestId: firstRequestId,
            payload: { stale: true }
        })

        const secondPromise = rpcClient.request('slow', {}, { timeoutMs: 50 })
        await sleep(0)
        worker.emitMessage({
            type: 'slow:ok',
            requestId: firstRequestId + 1,
            payload: { fresh: true }
        })
        const secondResult = await secondPromise
        assert.deepEqual(secondResult, { fresh: true })
    })

    it('surfaces worker error payloads with WorkerResponseError', async () => {
        const worker = new FakeWorker((message, workerRef) => {
            workerRef.emitMessage({
                type: `${message.type}:error`,
                requestId: message.requestId,
                error: { message: 'bad request' }
            })
        })
        const rpcClient = new WorkerRpcClient(() => worker, { timeoutMs: 50 })

        await assert.rejects(
            () => rpcClient.request('parse'),
            (error) => error?.name === 'WorkerResponseError' && /bad request/.test(String(error.message))
        )
    })

    it('rejects pending requests when worker runtime errors occur', async () => {
        const worker = new FakeWorker()
        const rpcClient = new WorkerRpcClient(() => worker, { timeoutMs: 100 })
        const requestPromise = rpcClient.request('render')
        worker.emitError('worker crashed')

        await assert.rejects(() => requestPromise, /worker crashed/)
    })
})
