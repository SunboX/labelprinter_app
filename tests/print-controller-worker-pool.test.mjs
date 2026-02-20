import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { PrintController } from '../src/ui/PrintController.mjs'
import { Media, Resolution, WebUSBBackend } from 'labelprinterkit-web/src/index.mjs'

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
const originalRequestDevice = WebUSBBackend.requestDevice
const originalOffscreenCanvas = globalThis.OffscreenCanvas

/**
 * Restores a global property to its original descriptor.
 * @param {string} name
 * @param {PropertyDescriptor | undefined} descriptor
 */
function restoreGlobalProperty(name, descriptor) {
    if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor)
        return
    }
    Reflect.deleteProperty(globalThis, name)
}

/**
 * Installs a minimal navigator.usb test double.
 */
function installNavigatorUsb() {
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
            usb: {
                async getDevices() {
                    return []
                }
            }
        }
    })
}

/**
 * Installs a minimal OffscreenCanvas implementation for Node tests.
 */
function installFakeOffscreenCanvas() {
    class FakeOffscreenCanvas {
        /**
         * @param {number} width
         * @param {number} height
         */
        constructor(width, height) {
            this.width = Math.max(1, Math.round(Number(width) || 1))
            this.height = Math.max(1, Math.round(Number(height) || 1))
            this.#data = new Uint8ClampedArray(this.width * this.height * 4)
            this.#data.fill(255)
        }

        #data = new Uint8ClampedArray(0)

        /**
         * @returns {{ fillStyle: string, fillRect: Function, drawImage: Function, getImageData: Function }}
         */
        getContext() {
            return {
                fillStyle: '#fff',
                fillRect: () => {},
                drawImage: () => {},
                getImageData: () => ({
                    width: this.width,
                    height: this.height,
                    data: this.#data
                })
            }
        }
    }

    globalThis.OffscreenCanvas = FakeOffscreenCanvas
}

/**
 * Creates a minimal canvas-like object compatible with labelprinterkit Label rendering.
 * @param {object} [media=Media.W9]
 * @returns {{ width: number, height: number, getContext: Function }}
 */
function createFakeRenderCanvas(media = Media.W9) {
    const width = Resolution.LOW.minLength
    const height = Math.max(1, Number(media?.printArea) || Media.W9.printArea)
    const data = new Uint8ClampedArray(width * height * 4)
    data.fill(255)
    return {
        width,
        height,
        getContext() {
            return {
                getImageData() {
                    return { width, height, data }
                }
            }
        }
    }
}

/**
 * Tracks jobs passed into the printer constructor.
 */
class RecordingPrinter {
    /** Resets static test fields. */
    static reset() {
        RecordingPrinter.lastBackend = null
        RecordingPrinter.lastJob = null
    }

    /**
     * @param {object} backend
     */
    constructor(backend) {
        RecordingPrinter.lastBackend = backend
    }

    /**
     * @param {object} job
     * @returns {Promise<void>}
     */
    async print(job) {
        RecordingPrinter.lastJob = job
    }
}

RecordingPrinter.lastBackend = null
RecordingPrinter.lastJob = null

/**
 * Creates a PrintController harness with worker-pool and preview stubs.
 * @param {{ printPageWorkerPoolClient?: object | null }} [options={}]
 * @returns {{ controller: PrintController, previewCalls: Array<Record<string, string> | undefined>, statusUpdates: Array<{ text: string, type: string }> }}
 */
function createControllerHarness(options = {}) {
    const previewCalls = []
    const previewRenderer = {
        async buildCanvasFromState(callOptions = {}) {
            previewCalls.push(callOptions.parameterValues)
            const canvas = createFakeRenderCanvas(Media.W9)
            return {
                media: Media.W9,
                res: Resolution.LOW,
                printCanvas: {
                    render() {
                        return canvas
                    }
                }
            }
        }
    }

    const statusUpdates = []
    const els = { print: { disabled: false } }
    const state = {
        media: 'W9',
        resolution: 'LOW',
        orientation: 'horizontal',
        mediaLengthMm: null,
        backend: 'usb',
        printer: 'P700',
        items: [{ id: 'item-1', type: 'text', positionMode: 'flow', rotation: 0, text: 'hello' }],
        ble: {
            serviceUuid: 'service',
            writeCharacteristicUuid: 'write',
            notifyCharacteristicUuid: 'notify',
            namePrefix: 'PT-'
        }
    }

    const controller = new PrintController(
        els,
        state,
        { P700: RecordingPrinter },
        previewRenderer,
        (text, type = 'info') => statusUpdates.push({ text, type }),
        (key) => key,
        { printPageWorkerPoolClient: options.printPageWorkerPoolClient || null }
    )

    return { controller, previewCalls, statusUpdates }
}

beforeEach(() => {
    RecordingPrinter.reset()
    installNavigatorUsb()
    installFakeOffscreenCanvas()
    WebUSBBackend.requestDevice = async () => ({
        device: {
            vendorId: 0x1111,
            productId: 0x2222,
            serialNumber: 'WORKER-POOL'
        }
    })
})

afterEach(() => {
    WebUSBBackend.requestDevice = originalRequestDevice
    restoreGlobalProperty('navigator', originalNavigatorDescriptor)
    if (typeof originalOffscreenCanvas === 'undefined') {
        Reflect.deleteProperty(globalThis, 'OffscreenCanvas')
    } else {
        globalThis.OffscreenCanvas = originalOffscreenCanvas
    }
})

describe('print-controller worker pool', () => {
    it('uses worker pool pages for multi-row jobs without preview fallback when all pages succeed', async () => {
        let renderPagesCalls = 0
        const workerPoolClient = {
            isAvailable() {
                return true
            },
            canRenderStateSnapshot() {
                return true
            },
            async renderPages({ parameterValueMaps }) {
                renderPagesCalls += 1
                return parameterValueMaps.map((_, pageIndex) => ({
                    pageIndex,
                    res: Resolution.LOW,
                    media: Media.W9,
                    width: Resolution.LOW.minLength,
                    height: Media.W9.printArea,
                    bitmap: {
                        close() {}
                    }
                }))
            }
        }

        const { controller, previewCalls, statusUpdates } = createControllerHarness({ printPageWorkerPoolClient: workerPoolClient })
        await controller.print([{ name: 'a' }, { name: 'b' }])

        assert.equal(renderPagesCalls, 1)
        assert.equal(previewCalls.length, 0)
        assert.equal(RecordingPrinter.lastJob?.pages?.length, 2)
        assert.equal(statusUpdates.at(-1)?.text, 'print.sentMany')
    })

    it('falls back per page when one worker page fails', async () => {
        const workerPoolClient = {
            isAvailable() {
                return true
            },
            canRenderStateSnapshot() {
                return true
            },
            async renderPages() {
                return [
                    {
                        pageIndex: 0,
                        res: Resolution.LOW,
                        media: Media.W9,
                        width: Resolution.LOW.minLength,
                        height: Media.W9.printArea,
                        bitmap: {
                            close() {}
                        }
                    },
                    {
                        pageIndex: 1,
                        error: 'worker crashed'
                    }
                ]
            }
        }

        const { controller, previewCalls, statusUpdates } = createControllerHarness({ printPageWorkerPoolClient: workerPoolClient })
        const secondRow = { name: 'fallback-row' }
        await controller.print([{ name: 'from-worker' }, secondRow])

        assert.equal(previewCalls.length, 1)
        assert.deepEqual(previewCalls[0], secondRow)
        assert.equal(RecordingPrinter.lastJob?.pages?.length, 2)
        assert.equal(statusUpdates.at(-1)?.text, 'print.sentMany')
    })

    it('keeps sequential preview rendering for single-row jobs', async () => {
        let renderPagesCalls = 0
        const workerPoolClient = {
            isAvailable() {
                return true
            },
            canRenderStateSnapshot() {
                return true
            },
            async renderPages() {
                renderPagesCalls += 1
                return []
            }
        }

        const { controller, previewCalls } = createControllerHarness({ printPageWorkerPoolClient: workerPoolClient })
        await controller.print([{ single: 'row' }])

        assert.equal(renderPagesCalls, 0)
        assert.equal(previewCalls.length, 1)
        assert.deepEqual(previewCalls[0], { single: 'row' })
    })
})
