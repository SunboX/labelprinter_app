import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { PrintController } from '../src/ui/PrintController.mjs'
import { Media, Resolution, WebUSBBackend } from 'labelprinterkit-web/src/index.mjs'

const WEBUSB_DEVICE_STORAGE_KEY = 'labelprinter.app.webusb.lastDevice.v1'
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const originalRequestDevice = WebUSBBackend.requestDevice
const originalOpen = WebUSBBackend.prototype.open

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
 * Builds an in-memory localStorage replacement.
 * @param {Record<string, string>} [initialValues={}]
 * @returns {{ getItem: Function, setItem: Function, removeItem: Function }}
 */
function createMemoryStorage(initialValues = {}) {
    const values = new Map(Object.entries(initialValues).map(([key, value]) => [key, String(value)]))
    return {
        getItem(key) {
            return values.has(key) ? values.get(key) : null
        },
        setItem(key, value) {
            values.set(key, String(value))
        },
        removeItem(key) {
            values.delete(key)
        }
    }
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
 * Installs a localStorage mock.
 * @param {{ getItem: Function, setItem: Function, removeItem: Function }} storage
 */
function installLocalStorage(storage) {
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: storage
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
 * Creates printer-compatible WebUSB configuration descriptors.
 * @returns {Array<object>}
 */
function createPrinterUsbConfigurations() {
    return [
        {
            interfaces: [
                {
                    interfaceNumber: 0,
                    alternates: [
                        {
                            interfaceClass: 7,
                            endpoints: [
                                { direction: 'out', endpointNumber: 2 },
                                { direction: 'in', endpointNumber: 1 }
                            ]
                        }
                    ]
                }
            ]
        }
    ]
}

/**
 * Creates a fake USB device object.
 * @param {{ vendorId?: number, productId?: number, serialNumber?: string | null, configurations?: Array<object> }} [overrides={}]
 * @returns {{ vendorId: number, productId: number, serialNumber: string | null, configurations: Array<object> }}
 */
function createUsbDevice(overrides = {}) {
    return {
        vendorId: 0x1234,
        productId: 0x5678,
        serialNumber: 'SERIAL-1',
        configurations: createPrinterUsbConfigurations(),
        ...overrides
    }
}

/**
 * Serializes a USB device identity using the storage schema.
 * @param {{ vendorId: number, productId: number, serialNumber: string | null }} device
 * @returns {string}
 */
function serializeUsbIdentity(device) {
    return JSON.stringify({
        vendorId: Number(device.vendorId),
        productId: Number(device.productId),
        serialNumber: typeof device.serialNumber === 'string' ? device.serialNumber : null
    })
}

/**
 * Tracks the backend passed into the printer constructor.
 */
class RecordingPrinter {
    /**
     * Resets static tracking values between tests.
     */
    static reset() {
        RecordingPrinter.backend = null
        RecordingPrinter.errorMessage = null
    }

    /**
     * @param {object} backend
     */
    constructor(backend) {
        RecordingPrinter.backend = backend
    }

    /**
     * @returns {Promise<void>}
     */
    async print() {
        if (RecordingPrinter.errorMessage) {
            throw new Error(RecordingPrinter.errorMessage)
        }
    }
}

RecordingPrinter.backend = null
RecordingPrinter.errorMessage = null

/**
 * Creates a PrintController test harness.
 * @returns {{ controller: PrintController, els: { print: { disabled: boolean } }, statuses: Array<{ text: string, type: string }> }}
 */
function createControllerHarness() {
    const els = { print: { disabled: false } }
    const statuses = []
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
        { P700: RecordingPrinter },
        createPreviewRenderer(),
        (text, type = 'info') => statuses.push({ text, type }),
        (key) => key
    )
    return { controller, els, statuses }
}

beforeEach(() => {
    RecordingPrinter.reset()
    WebUSBBackend.requestDevice = originalRequestDevice
    WebUSBBackend.prototype.open = originalOpen
})

afterEach(() => {
    WebUSBBackend.requestDevice = originalRequestDevice
    WebUSBBackend.prototype.open = originalOpen
    restoreGlobalProperty('navigator', originalNavigatorDescriptor)
    restoreGlobalProperty('localStorage', originalLocalStorageDescriptor)
})

describe('print-controller usb reconnect', () => {
    it('reuses remembered granted usb device without chooser', async () => {
        const rememberedDevice = createUsbDevice({ serialNumber: 'REM-1' })
        const storage = createMemoryStorage({
            [WEBUSB_DEVICE_STORAGE_KEY]: serializeUsbIdentity(rememberedDevice)
        })
        installLocalStorage(storage)
        installNavigatorUsb(async () => [rememberedDevice])

        let chooserCalls = 0
        WebUSBBackend.requestDevice = async () => {
            chooserCalls += 1
            return { device: createUsbDevice({ serialNumber: 'CHOOSER-1' }) }
        }

        const openedDevices = []
        WebUSBBackend.prototype.open = async function openStub() {
            openedDevices.push(this.device)
        }

        const { controller } = createControllerHarness()
        await controller.print([{}])

        assert.equal(chooserCalls, 0)
        assert.equal(openedDevices.length, 1)
        assert.equal(openedDevices[0], rememberedDevice)
        assert.equal(RecordingPrinter.backend?.device, rememberedDevice)
    })

    it('uses chooser when no granted devices are available', async () => {
        const storage = createMemoryStorage()
        installLocalStorage(storage)
        installNavigatorUsb(async () => [])

        const chooserDevice = createUsbDevice({ serialNumber: 'CHOOSER-2' })
        let chooserCalls = 0
        WebUSBBackend.requestDevice = async () => {
            chooserCalls += 1
            return { device: chooserDevice }
        }

        const { controller } = createControllerHarness()
        await controller.print([{}])

        assert.equal(chooserCalls, 1)
        assert.equal(RecordingPrinter.backend?.device, chooserDevice)
        assert.equal(storage.getItem(WEBUSB_DEVICE_STORAGE_KEY), serializeUsbIdentity(chooserDevice))
    })

    it('uses chooser when multiple granted devices exist and no remembered match', async () => {
        const grantedA = createUsbDevice({ serialNumber: 'GRANTED-A' })
        const grantedB = createUsbDevice({ serialNumber: 'GRANTED-B' })
        const rememberedOther = createUsbDevice({ serialNumber: 'REM-OTHER' })
        const storage = createMemoryStorage({
            [WEBUSB_DEVICE_STORAGE_KEY]: serializeUsbIdentity(rememberedOther)
        })
        installLocalStorage(storage)
        installNavigatorUsb(async () => [grantedA, grantedB])

        let chooserCalls = 0
        const chooserDevice = createUsbDevice({ serialNumber: 'CHOOSER-3' })
        WebUSBBackend.requestDevice = async () => {
            chooserCalls += 1
            return { device: chooserDevice }
        }
        WebUSBBackend.prototype.open = async function openStub() {
            throw new Error('granted device should not be opened in this scenario')
        }

        const { controller } = createControllerHarness()
        await controller.print([{}])

        assert.equal(chooserCalls, 1)
        assert.equal(RecordingPrinter.backend?.device, chooserDevice)
    })

    it('falls back to chooser when remembered granted device fails to open', async () => {
        const rememberedDevice = createUsbDevice({ serialNumber: 'REM-FAIL' })
        const chooserDevice = createUsbDevice({ serialNumber: 'CHOOSER-4' })
        const storage = createMemoryStorage({
            [WEBUSB_DEVICE_STORAGE_KEY]: serializeUsbIdentity(rememberedDevice)
        })
        installLocalStorage(storage)
        installNavigatorUsb(async () => [rememberedDevice])

        let chooserCalls = 0
        WebUSBBackend.requestDevice = async () => {
            chooserCalls += 1
            return { device: chooserDevice }
        }
        WebUSBBackend.prototype.open = async function openStub() {
            if (this.device === rememberedDevice) {
                throw new Error('claim failed')
            }
        }

        const { controller } = createControllerHarness()
        await controller.print([{}])

        assert.equal(chooserCalls, 1)
        assert.equal(RecordingPrinter.backend?.device, chooserDevice)
        assert.equal(storage.getItem(WEBUSB_DEVICE_STORAGE_KEY), serializeUsbIdentity(chooserDevice))
    })

    it('auto-uses a single granted device when no remembered identity exists', async () => {
        const grantedDevice = createUsbDevice({ serialNumber: 'GRANTED-SINGLE' })
        const storage = createMemoryStorage()
        installLocalStorage(storage)
        installNavigatorUsb(async () => [grantedDevice])

        let chooserCalls = 0
        WebUSBBackend.requestDevice = async () => {
            chooserCalls += 1
            return { device: createUsbDevice({ serialNumber: 'CHOOSER-5' }) }
        }
        WebUSBBackend.prototype.open = async function openStub() {}

        const { controller } = createControllerHarness()
        await controller.print([{}])

        assert.equal(chooserCalls, 0)
        assert.equal(RecordingPrinter.backend?.device, grantedDevice)
        assert.equal(storage.getItem(WEBUSB_DEVICE_STORAGE_KEY), serializeUsbIdentity(grantedDevice))
    })

    it('uses chooser when the only granted device is not printer-compatible', async () => {
        const incompatibleDevice = createUsbDevice({
            serialNumber: 'GRANTED-INCOMPATIBLE',
            configurations: [
                {
                    interfaces: [
                        {
                            interfaceNumber: 0,
                            alternates: [
                                {
                                    interfaceClass: 3,
                                    endpoints: [{ direction: 'in', endpointNumber: 1 }]
                                }
                            ]
                        }
                    ]
                }
            ]
        })
        const storage = createMemoryStorage()
        installLocalStorage(storage)
        installNavigatorUsb(async () => [incompatibleDevice])

        const openedDevices = []
        WebUSBBackend.prototype.open = async function openStub() {
            openedDevices.push(this.device)
        }

        let chooserCalls = 0
        const chooserDevice = createUsbDevice({ serialNumber: 'CHOOSER-INCOMPATIBLE' })
        WebUSBBackend.requestDevice = async () => {
            chooserCalls += 1
            return { device: chooserDevice }
        }

        const { controller } = createControllerHarness()
        await controller.print([{}])

        assert.equal(chooserCalls, 1)
        assert.equal(openedDevices.length, 0)
        assert.equal(RecordingPrinter.backend?.device, chooserDevice)
    })

    it('normalizes chooser backend endpoint numbers for WebUSB transfer APIs', async () => {
        const storage = createMemoryStorage()
        installLocalStorage(storage)
        installNavigatorUsb(async () => [])

        const chooserDevice = createUsbDevice({ serialNumber: 'CHOOSER-ENDPOINTS' })
        WebUSBBackend.requestDevice = async () => ({
            device: chooserDevice,
            interfaceNumber: 0,
            outEndpoint: 0x02,
            inEndpoint: 0x81
        })

        const { controller } = createControllerHarness()
        await controller.print([{}])

        assert.equal(RecordingPrinter.backend?.outEndpoint, 2)
        assert.equal(RecordingPrinter.backend?.inEndpoint, 1)
    })

    it('persists identity after chooser connection and subsequent granted reconnect', async () => {
        const storage = createMemoryStorage()
        installLocalStorage(storage)

        const chooserDevice = createUsbDevice({ serialNumber: 'CHOOSER-6' })
        const grantedDevice = createUsbDevice({ serialNumber: 'GRANTED-6' })
        let getDevicesCalls = 0
        installNavigatorUsb(async () => {
            getDevicesCalls += 1
            return getDevicesCalls === 1 ? [] : [grantedDevice]
        })

        let chooserCalls = 0
        WebUSBBackend.requestDevice = async () => {
            chooserCalls += 1
            return { device: chooserDevice }
        }
        WebUSBBackend.prototype.open = async function openStub() {}

        const firstHarness = createControllerHarness()
        await firstHarness.controller.print([{}])
        assert.equal(storage.getItem(WEBUSB_DEVICE_STORAGE_KEY), serializeUsbIdentity(chooserDevice))

        const secondHarness = createControllerHarness()
        await secondHarness.controller.print([{}])
        assert.equal(chooserCalls, 1)
        assert.equal(RecordingPrinter.backend?.device, grantedDevice)
        assert.equal(storage.getItem(WEBUSB_DEVICE_STORAGE_KEY), serializeUsbIdentity(grantedDevice))
    })

    it('re-enables print button and keeps success/error status behavior', async () => {
        const storage = createMemoryStorage()
        installLocalStorage(storage)
        installNavigatorUsb(async () => [])

        const chooserDevice = createUsbDevice({ serialNumber: 'CHOOSER-7' })
        WebUSBBackend.requestDevice = async () => ({ device: chooserDevice })

        const successHarness = createControllerHarness()
        await successHarness.controller.print([{}])
        assert.equal(successHarness.els.print.disabled, false)
        assert.equal(successHarness.statuses.at(0)?.text, 'print.renderingSingle')
        assert.equal(successHarness.statuses.at(0)?.type, 'info')
        assert.equal(successHarness.statuses.at(-1)?.text, 'print.sentSingle')
        assert.equal(successHarness.statuses.at(-1)?.type, 'success')

        WebUSBBackend.requestDevice = async () => {
            throw new Error('chooser failed')
        }
        const errorHarness = createControllerHarness()
        const originalConsoleError = console.error
        console.error = () => {}
        try {
            await errorHarness.controller.print([{}])
        } finally {
            console.error = originalConsoleError
        }
        assert.equal(errorHarness.els.print.disabled, false)
        assert.equal(errorHarness.statuses.at(-1)?.text, 'chooser failed')
        assert.equal(errorHarness.statuses.at(-1)?.type, 'error')
    })
})
