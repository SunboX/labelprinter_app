import { Job, Label, Media, P700, WebBluetoothBackend, WebUSBBackend } from 'labelprinterkit-web/src/index.mjs'

const WEBUSB_DEVICE_STORAGE_KEY = 'labelprinter.app.webusb.lastDevice.v1'
const WEBUSB_PRINTER_CLASS_CODE = 7
const WEBUSB_DEFAULT_INTERFACE_NUMBER = 0
const WEBUSB_DEFAULT_OUT_ENDPOINT_NUMBER = 0x02
const WEBUSB_DEFAULT_IN_ENDPOINT_NUMBER = 0x01
const WEBUSB_REQUEST_FILTERS = [{ classCode: WEBUSB_PRINTER_CLASS_CODE }]

/**
 * Handles printing the current label state.
 */
export class PrintController {
    /**
     * @param {object} els
     * @param {object} state
     * @param {Record<string, Function>} printerMap
     * @param {{ buildCanvasFromState: (options?: { parameterValues?: Record<string, string> }) => Promise<object> }} previewRenderer
     * @param {(text: string, type?: string) => void} setStatus
     * @param {(key: string, params?: Record<string, string | number>) => string} translate
     */
    constructor(els, state, printerMap, previewRenderer, setStatus, translate) {
        this.els = els
        this.state = state
        this.printerMap = printerMap
        this.previewRenderer = previewRenderer
        this.setStatus = setStatus
        this.translate = typeof translate === 'function' ? translate : (key) => key
    }

    /**
     * Sends the current label to the selected printer backend.
     * @param {Array<Record<string, string>>} [parameterValueMaps=[]]
     * @returns {Promise<void>}
     */
    async print(parameterValueMaps = []) {
        const normalizedValueMaps =
            Array.isArray(parameterValueMaps) && parameterValueMaps.length ? parameterValueMaps : [{}]

        this.setStatus(
            normalizedValueMaps.length > 1
                ? this.translate('print.renderingMany', { count: normalizedValueMaps.length })
                : this.translate('print.renderingSingle'),
            'info'
        )
        this.els.print.disabled = true
        try {
            let media = null
            const pages = []
            for (let index = 0; index < normalizedValueMaps.length; index += 1) {
                const valueMap = normalizedValueMaps[index]
                const renderResult = await this.previewRenderer.buildCanvasFromState({ parameterValues: valueMap })
                media = renderResult.media
                pages.push(new Label(renderResult.res, renderResult.printCanvas))
            }
            const job = new Job(media || Media[this.state.media] || Media.W24)
            pages.forEach((page) => job.addPage(page))

            this.setStatus(
                this.translate('print.requestingDevice', { backend: this.state.backend.toUpperCase() }),
                'info'
            )
            const backend = await this.#connectBackend()
            const PrinterClass = this.printerMap[this.state.printer] || P700
            const printer = new PrinterClass(backend)
            await printer.print(job)
            this.setStatus(
                normalizedValueMaps.length > 1
                    ? this.translate('print.sentMany', { count: normalizedValueMaps.length })
                    : this.translate('print.sentSingle'),
                'success'
            )
        } catch (err) {
            console.error(err)
            this.setStatus(err?.message || this.translate('print.failed'), 'error')
        } finally {
            this.els.print.disabled = false
        }
    }

    /**
     * Connects to a backend based on the selected mode.
     * @returns {Promise<object>}
     */
    async #connectBackend() {
        const mode = this.state.backend
        if (mode === 'usb') {
            return this.#connectUsbBackend()
        }
        if (mode === 'ble') {
            return WebBluetoothBackend.requestDevice({
                serviceUuid: this.state.ble.serviceUuid,
                writeCharacteristicUuid: this.state.ble.writeCharacteristicUuid,
                notifyCharacteristicUuid: this.state.ble.notifyCharacteristicUuid || undefined,
                filters: this.state.ble.namePrefix ? [{ namePrefix: this.state.ble.namePrefix }] : undefined
            })
        }
        throw new Error(this.translate('print.unknownBackend'))
    }

    /**
     * Connects to WebUSB with reconnect-first fallback to the chooser flow.
     * @returns {Promise<object>}
     */
    async #connectUsbBackend() {
        const reconnectResult = await this.#tryReconnectUsbGrantedDevice()
        if (reconnectResult) {
            this.#writeStoredUsbIdentity(reconnectResult.device)
            return reconnectResult.backend
        }

        const chooserResult = await this.#requestUsbDeviceFromChooser()
        this.#writeStoredUsbIdentity(chooserResult.device)
        return chooserResult.backend
    }

    /**
     * Attempts to reconnect using previously granted WebUSB devices.
     * @returns {Promise<{ backend: object, device: object } | null>}
     */
    async #tryReconnectUsbGrantedDevice() {
        const usbApi = this.#getNavigatorUsb()
        if (!usbApi || typeof usbApi.getDevices !== 'function') {
            return null
        }

        let grantedDevices = []
        try {
            const devices = await usbApi.getDevices()
            grantedDevices = Array.isArray(devices) ? devices : []
        } catch (_error) {
            grantedDevices = []
        }
        if (!grantedDevices.length) {
            return null
        }

        const storedIdentity = this.#readStoredUsbIdentity()
        const candidate = this.#selectGrantedUsbCandidate(grantedDevices, storedIdentity)
        if (!candidate) {
            return null
        }

        const matchedStoredIdentity = this.#matchesStoredUsbIdentity(candidate, storedIdentity)
        try {
            const backend = await this.#openUsbDevice(candidate)
            return { backend, device: candidate }
        } catch (_error) {
            if (matchedStoredIdentity) {
                this.#clearStoredUsbIdentity()
            }
            return this.#requestUsbDeviceFromChooser()
        }
    }

    /**
     * Requests a USB device via browser chooser.
     * @returns {Promise<{ backend: object, device: object | null }>}
     */
    async #requestUsbDeviceFromChooser() {
        const backend = await WebUSBBackend.requestDevice({ filters: WEBUSB_REQUEST_FILTERS })
        await this.#configureUsbBackendTransport(backend)
        return { backend, device: backend?.device || null }
    }

    /**
     * Opens a granted USB device through the toolkit backend.
     * @param {object} device
     * @returns {Promise<object>}
     */
    async #openUsbDevice(device) {
        const backendOptions = this.#resolveUsbBackendOptions(device) || undefined
        const backend = new WebUSBBackend(device, backendOptions)
        this.#normalizeUsbBackendEndpoints(backend)
        await backend.open()
        return backend
    }

    /**
     * Reads the persisted USB device identity from local storage.
     * @returns {{ vendorId: number, productId: number, serialNumber: string | null } | null}
     */
    #readStoredUsbIdentity() {
        const storage = this.#getStorage()
        if (!storage) return null

        try {
            const rawValue = storage.getItem(WEBUSB_DEVICE_STORAGE_KEY)
            if (!rawValue) return null

            const parsed = JSON.parse(rawValue)
            const vendorId = Number(parsed?.vendorId)
            const productId = Number(parsed?.productId)
            const serialValue = parsed?.serialNumber
            const serialNumber = typeof serialValue === 'string' ? serialValue : serialValue === null ? null : null

            if (!Number.isInteger(vendorId) || vendorId < 0 || !Number.isInteger(productId) || productId < 0) {
                this.#clearStoredUsbIdentity()
                return null
            }
            if (serialValue !== null && typeof serialValue !== 'string') {
                this.#clearStoredUsbIdentity()
                return null
            }

            return { vendorId, productId, serialNumber }
        } catch (_error) {
            this.#clearStoredUsbIdentity()
            return null
        }
    }

    /**
     * Persists USB device identity for future reconnect attempts.
     * @param {object | null} device
     */
    #writeStoredUsbIdentity(device) {
        const storage = this.#getStorage()
        if (!storage || !device) return

        const vendorId = Number(device.vendorId)
        const productId = Number(device.productId)
        if (!Number.isInteger(vendorId) || vendorId < 0 || !Number.isInteger(productId) || productId < 0) {
            return
        }

        const payload = {
            vendorId,
            productId,
            serialNumber: typeof device.serialNumber === 'string' ? device.serialNumber : null
        }
        try {
            storage.setItem(WEBUSB_DEVICE_STORAGE_KEY, JSON.stringify(payload))
        } catch (_error) {
            // Ignore storage write failures in restricted contexts.
        }
    }

    /**
     * Clears the persisted USB device identity.
     */
    #clearStoredUsbIdentity() {
        const storage = this.#getStorage()
        if (!storage) return
        try {
            storage.removeItem(WEBUSB_DEVICE_STORAGE_KEY)
        } catch (_error) {
            // Ignore storage removal failures in restricted contexts.
        }
    }

    /**
     * Picks a reconnect candidate from granted devices.
     * @param {Array<object>} devices
     * @param {{ vendorId: number, productId: number, serialNumber: string | null } | null} storedIdentity
     * @returns {object | null}
     */
    #selectGrantedUsbCandidate(devices, storedIdentity) {
        if (!Array.isArray(devices) || !devices.length) {
            return null
        }

        const compatibleDevices = devices.filter((device) => this.#isUsbReconnectCandidateCompatible(device, storedIdentity))
        if (!compatibleDevices.length) {
            return null
        }

        if (storedIdentity) {
            const matchingDevices = compatibleDevices.filter((device) =>
                this.#matchesStoredUsbIdentity(device, storedIdentity)
            )
            if (matchingDevices.length === 1) {
                return matchingDevices[0]
            }
        }

        if (compatibleDevices.length === 1) {
            return compatibleDevices[0]
        }

        return null
    }

    /**
     * Compares a granted device against a stored device identity.
     * @param {object | null} device
     * @param {{ vendorId: number, productId: number, serialNumber: string | null } | null} storedIdentity
     * @returns {boolean}
     */
    #matchesStoredUsbIdentity(device, storedIdentity) {
        if (!device || !storedIdentity) {
            return false
        }
        if (Number(device.vendorId) !== storedIdentity.vendorId || Number(device.productId) !== storedIdentity.productId) {
            return false
        }
        if (storedIdentity.serialNumber === null) {
            return true
        }
        return String(device.serialNumber || '') === storedIdentity.serialNumber
    }

    /**
     * Configures backend transport details using USB descriptors when available.
     * @param {object | null} backend
     * @returns {Promise<void>}
     */
    async #configureUsbBackendTransport(backend) {
        if (!backend || typeof backend !== 'object') {
            return
        }

        const resolvedOptions = this.#resolveUsbBackendOptions(backend?.device)
        if (resolvedOptions) {
            const currentInterfaceNumber = Number(backend.interfaceNumber)
            const hasClaimInterface = typeof backend?.device?.claimInterface === 'function'
            const hasReleaseInterface = typeof backend?.device?.releaseInterface === 'function'
            if (
                Number.isInteger(currentInterfaceNumber) &&
                currentInterfaceNumber >= 0 &&
                hasClaimInterface &&
                hasReleaseInterface &&
                currentInterfaceNumber !== resolvedOptions.interfaceNumber
            ) {
                try {
                    await backend.device.releaseInterface(currentInterfaceNumber)
                } catch (_error) {
                    // Ignore release failures and retry with the resolved interface.
                }
                await backend.device.claimInterface(resolvedOptions.interfaceNumber)
            }

            backend.interfaceNumber = resolvedOptions.interfaceNumber
            backend.outEndpoint = resolvedOptions.outEndpoint
            backend.inEndpoint = resolvedOptions.inEndpoint
            return
        }

        this.#normalizeUsbBackendEndpoints(backend)
    }

    /**
     * Determines whether a granted USB device is safe for reconnect.
     * @param {object} device
     * @param {{ vendorId: number, productId: number, serialNumber: string | null } | null} storedIdentity
     * @returns {boolean}
     */
    #isUsbReconnectCandidateCompatible(device, storedIdentity) {
        if (!device) {
            return false
        }
        if (this.#matchesStoredUsbIdentity(device, storedIdentity)) {
            return true
        }
        return this.#resolveUsbBackendOptions(device) !== null
    }

    /**
     * Resolves backend endpoint/interface settings from USB descriptors.
     * @param {object | null} device
     * @returns {{ interfaceNumber: number, outEndpoint: number, inEndpoint: number | null } | null}
     */
    #resolveUsbBackendOptions(device) {
        const configurations = Array.isArray(device?.configurations) ? device.configurations : []
        for (const configuration of configurations) {
            const interfaces = Array.isArray(configuration?.interfaces) ? configuration.interfaces : []
            for (const iface of interfaces) {
                const interfaceNumber = Number(iface?.interfaceNumber)
                if (!Number.isInteger(interfaceNumber) || interfaceNumber < 0) {
                    continue
                }
                const alternates = Array.isArray(iface?.alternates) ? iface.alternates : []
                for (const alternate of alternates) {
                    if (Number(alternate?.interfaceClass) !== WEBUSB_PRINTER_CLASS_CODE) {
                        continue
                    }
                    const endpoints = Array.isArray(alternate?.endpoints) ? alternate.endpoints : []
                    const outEndpoint = this.#findUsbEndpointNumber(endpoints, 'out')
                    if (outEndpoint == null) {
                        continue
                    }
                    const inEndpoint = this.#findUsbEndpointNumber(endpoints, 'in')
                    if (inEndpoint == null) {
                        continue
                    }
                    return {
                        interfaceNumber,
                        outEndpoint,
                        inEndpoint
                    }
                }
            }
        }
        return null
    }

    /**
     * Finds an endpoint number for the requested direction.
     * @param {Array<object>} endpoints
     * @param {'in' | 'out'} direction
     * @returns {number | null}
     */
    #findUsbEndpointNumber(endpoints, direction) {
        const expectedDirection = String(direction)
        for (const endpoint of endpoints) {
            const endpointDirection = String(endpoint?.direction || '').toLowerCase()
            if (endpointDirection !== expectedDirection) {
                continue
            }
            const normalizedNumber = this.#normalizeUsbEndpointNumber(
                endpoint?.endpointNumber ?? endpoint?.endpointAddress ?? endpoint?.address
            )
            if (normalizedNumber != null) {
                return normalizedNumber
            }
        }
        return null
    }

    /**
     * Normalizes endpoint numbers to the 1-15 range used by WebUSB transfer APIs.
     * @param {number | null | undefined} value
     * @returns {number | null}
     */
    #normalizeUsbEndpointNumber(value) {
        const numericValue = Number(value)
        if (!Number.isInteger(numericValue)) {
            return null
        }
        if (numericValue >= 1 && numericValue <= 15) {
            return numericValue
        }
        const maskedValue = numericValue & 0x0f
        if (maskedValue >= 1 && maskedValue <= 15) {
            return maskedValue
        }
        return null
    }

    /**
     * Applies default-safe endpoint normalization for toolkit backend instances.
     * @param {object | null} backend
     */
    #normalizeUsbBackendEndpoints(backend) {
        if (!backend || typeof backend !== 'object') {
            return
        }

        const normalizedInterfaceNumber = Number(backend.interfaceNumber)
        backend.interfaceNumber =
            Number.isInteger(normalizedInterfaceNumber) && normalizedInterfaceNumber >= 0
                ? normalizedInterfaceNumber
                : WEBUSB_DEFAULT_INTERFACE_NUMBER

        const normalizedOutEndpoint = this.#normalizeUsbEndpointNumber(backend.outEndpoint)
        backend.outEndpoint =
            normalizedOutEndpoint == null ? WEBUSB_DEFAULT_OUT_ENDPOINT_NUMBER : normalizedOutEndpoint

        if (backend.inEndpoint == null) {
            return
        }
        const normalizedInEndpoint = this.#normalizeUsbEndpointNumber(backend.inEndpoint)
        backend.inEndpoint = normalizedInEndpoint == null ? WEBUSB_DEFAULT_IN_ENDPOINT_NUMBER : normalizedInEndpoint
    }

    /**
     * Resolves the WebUSB API handle from the current runtime.
     * @returns {object | null}
     */
    #getNavigatorUsb() {
        if (typeof navigator === 'undefined') {
            return null
        }
        return navigator?.usb || null
    }

    /**
     * Resolves local storage in browser and test runtimes.
     * @returns {Storage | null}
     */
    #getStorage() {
        if (typeof window !== 'undefined' && window?.localStorage) {
            return window.localStorage
        }
        if (typeof globalThis !== 'undefined' && globalThis?.localStorage) {
            return globalThis.localStorage
        }
        return null
    }
}
