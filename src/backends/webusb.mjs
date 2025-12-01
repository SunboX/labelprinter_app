export class WebUSBBackend {
    constructor(device, { outEndpoint = 0x02, inEndpoint = 0x81, interfaceNumber = 0 } = {}) {
        this.device = device
        this.outEndpoint = outEndpoint
        this.inEndpoint = inEndpoint
        this.interfaceNumber = interfaceNumber
    }

    static async requestDevice({ filters = [{ classCode: 7 }] } = {}) {
        if (!navigator?.usb) {
            throw new Error('WebUSB is not available in this environment')
        }
        const device = await navigator.usb.requestDevice({ filters })
        const backend = new WebUSBBackend(device)
        await backend.open()
        return backend
    }

    async open() {
        if (!this.device.opened) {
            await this.device.open()
        }
        if (!this.device.configuration) {
            await this.device.selectConfiguration(1)
        }
        await this.device.claimInterface(this.interfaceNumber)
    }

    async ensureOpen() {
        if (!this.device.opened) {
            await this.open()
        }
    }

    async write(data) {
        const payload = data instanceof Uint8Array ? data : new Uint8Array(data)
        await this.ensureOpen()
        await this.device.transferOut(this.outEndpoint, payload)
    }

    async read(count) {
        await this.ensureOpen()
        if (this.inEndpoint == null) {
            return null
        }
        const result = await this.device.transferIn(this.inEndpoint, count)
        if (result?.status !== 'ok' || !result.data) {
            return null
        }
        return new Uint8Array(result.data.buffer)
    }

    async close() {
        try {
            await this.device.releaseInterface(this.interfaceNumber)
        } catch (err) {
            console.warn('Failed to release interface', err)
        }
        if (this.device.opened) {
            await this.device.close()
        }
    }
}
