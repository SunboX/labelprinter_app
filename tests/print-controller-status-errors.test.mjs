import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { PrintController } from '../src/ui/PrintController.mjs'
import { ErrorCodes, Media, MediaType, P700, Resolution, Status, StatusCodes, WebUSBBackend } from 'labelprinterkit-web/src/index.mjs'

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
const originalRequestDevice = WebUSBBackend.requestDevice

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
 * Installs a navigator.usb mock.
 * @param {() => Promise<Array<object>>} getDevices
 */
function installNavigatorUsb(getDevices) {
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
            usb: {
                getDevices
            }
        }
    })
}

/**
 * Creates a minimal canvas-like object compatible with labelprinterkit Label rendering.
 * @returns {{ width: number, height: number, getContext: Function }}
 */
function createFakeRenderCanvas() {
    const width = Resolution.LOW.minLength
    const height = Media.W9.printArea
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
 * Creates a preview renderer stub that returns deterministic media and canvas output.
 * @returns {{ buildCanvasFromState: () => Promise<{ media: object, res: object, printCanvas: { render: Function } }> }}
 */
function createPreviewRenderer() {
    const canvas = createFakeRenderCanvas()
    return {
        async buildCanvasFromState() {
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
}

/**
 * Builds a toolkit Status object from simple fixture options.
 * @param {{ errorMask?: number, mediaWidth?: number, mediaType?: number, statusCode?: number }} [options={}]
 * @returns {Status}
 */
function createStatus({
    errorMask = 0,
    mediaWidth = Media.W9.width,
    mediaType = MediaType.LAMINATED_TAPE,
    statusCode = StatusCodes.STATUS_REPLY
} = {}) {
    const data = new Uint8Array(32)
    data[8] = Number(errorMask) & 0xff
    data[9] = (Number(errorMask) >> 8) & 0xff
    data[10] = Number(mediaWidth) || 0
    data[11] = Number(mediaType) || MediaType.NO_MEDIA
    data[18] = Number(statusCode) || StatusCodes.STATUS_REPLY
    return new Status(data)
}

/**
 * Fake backend that mimics toolkit backend write/getStatus behavior.
 */
class FakeStatusBackend {
    /**
     * @param {Status[]} statuses
     */
    constructor(statuses) {
        this.statuses = Array.isArray(statuses) ? [...statuses] : []
        this.writes = []
        this.statusCalls = 0
        this.device = {
            vendorId: 0x1234,
            productId: 0x5678,
            serialNumber: 'STATUS-TEST'
        }
    }

    /**
     * @param {Uint8Array | ArrayLike<number>} data
     * @returns {Promise<void>}
     */
    async write(data) {
        this.writes.push(data instanceof Uint8Array ? data : new Uint8Array(data))
    }

    /**
     * @returns {Promise<Status>}
     */
    async getStatus() {
        this.statusCalls += 1
        const next = this.statuses.shift()
        if (!next) {
            throw new Error('No response from printer')
        }
        return next
    }
}

/**
 * Creates a PrintController test harness.
 * @returns {{ controller: PrintController, els: { print: { disabled: boolean } }, statusUpdates: Array<{ text: string, type: string }> }}
 */
function createControllerHarness() {
    const els = { print: { disabled: false } }
    const statusUpdates = []
    const state = {
        media: 'W9',
        backend: 'usb',
        printer: 'P700',
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
        { P700 },
        createPreviewRenderer(),
        (text, type = 'info') => statusUpdates.push({ text, type }),
        (key) => key
    )
    return { controller, els, statusUpdates }
}

beforeEach(() => {
    WebUSBBackend.requestDevice = originalRequestDevice
})

afterEach(() => {
    WebUSBBackend.requestDevice = originalRequestDevice
    restoreGlobalProperty('navigator', originalNavigatorDescriptor)
})

describe('print-controller printer status errors', () => {
    it('surfaces pre-flight NO_MEDIA errors as user-facing status messages', async () => {
        installNavigatorUsb(async () => [])
        const backend = new FakeStatusBackend([
            createStatus({
                errorMask: ErrorCodes.NO_MEDIA,
                mediaWidth: 0,
                mediaType: MediaType.NO_MEDIA
            })
        ])
        WebUSBBackend.requestDevice = async () => backend

        const { controller, els, statusUpdates } = createControllerHarness()
        const originalConsoleError = console.error
        console.error = () => {}
        try {
            await controller.print([{}])
        } finally {
            console.error = originalConsoleError
        }

        assert.equal(backend.statusCalls, 1)
        assert.equal(els.print.disabled, false)
        assert.equal(statusUpdates.at(-1)?.text, 'No tape is loaded. Insert a tape cassette and try again.')
        assert.equal(statusUpdates.at(-1)?.type, 'error')
    })

    it('surfaces post-print media mismatch errors as user-facing status messages', async () => {
        installNavigatorUsb(async () => [])
        const backend = new FakeStatusBackend([
            createStatus({
                mediaWidth: Media.W9.width,
                mediaType: Media.W9.mediaType
            }),
            createStatus({
                mediaWidth: Media.W24.width,
                mediaType: Media.W24.mediaType
            })
        ])
        WebUSBBackend.requestDevice = async () => backend

        const { controller, els, statusUpdates } = createControllerHarness()
        const originalConsoleError = console.error
        console.error = () => {}
        try {
            await controller.print([{}])
        } finally {
            console.error = originalConsoleError
        }

        assert.equal(backend.statusCalls, 2)
        assert.equal(els.print.disabled, false)
        assert.equal(
            statusUpdates.at(-1)?.text,
            'Loaded media mismatch: printer has 24mm tape, but this job expects 9mm tape. Load 9mm tape and retry.'
        )
        assert.equal(statusUpdates.at(-1)?.type, 'error')
    })
})
