function concatBytes(a, b) {
    const out = new Uint8Array(a.length + b.length)
    out.set(a, 0)
    out.set(b, a.length)
    return out
}

export class WebBluetoothBackend {
    constructor(device, { serviceUuid, writeCharacteristicUuid, notifyCharacteristicUuid = null, readCharacteristicUuid = null } = {}) {
        if (!serviceUuid || !writeCharacteristicUuid) {
            throw new Error('serviceUuid and writeCharacteristicUuid are required for WebBluetoothBackend')
        }
        this.device = device
        this.serviceUuid = serviceUuid
        this.writeCharacteristicUuid = writeCharacteristicUuid
        this.notifyCharacteristicUuid = notifyCharacteristicUuid || readCharacteristicUuid
        this.readCharacteristicUuid = readCharacteristicUuid

        this.server = null
        this.service = null
        this.writeCharacteristic = null
        this.notifyCharacteristic = null
        this.readCharacteristic = null
        this.buffer = new Uint8Array()
        this.waiters = []
    }

    static async requestDevice({
        filters,
        serviceUuid,
        writeCharacteristicUuid,
        notifyCharacteristicUuid = null,
        readCharacteristicUuid = null
    } = {}) {
        if (!navigator?.bluetooth) {
            throw new Error('Web Bluetooth is not available in this environment')
        }
        const requestFilters = filters && filters.length ? filters : [{ services: [serviceUuid] }]
        const device = await navigator.bluetooth.requestDevice({
            filters: requestFilters,
            optionalServices: [serviceUuid]
        })
        const backend = new WebBluetoothBackend(device, {
            serviceUuid,
            writeCharacteristicUuid,
            notifyCharacteristicUuid,
            readCharacteristicUuid
        })
        await backend.open()
        return backend
    }

    async open() {
        if (!this.server || !this.server.connected) {
            this.server = await this.device.gatt.connect()
        }
        this.service = await this.server.getPrimaryService(this.serviceUuid)
        this.writeCharacteristic = await this.service.getCharacteristic(this.writeCharacteristicUuid)

        if (this.notifyCharacteristicUuid) {
            this.notifyCharacteristic = await this.service.getCharacteristic(this.notifyCharacteristicUuid)
            await this.notifyCharacteristic.startNotifications()
            this.notifyCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
                const chunk = new Uint8Array(event.target.value.buffer)
                this.buffer = concatBytes(this.buffer, chunk)
                this.waiters.forEach((resolve) => resolve())
                this.waiters = []
            })
        }

        if (this.readCharacteristicUuid && !this.notifyCharacteristicUuid) {
            this.readCharacteristic = await this.service.getCharacteristic(this.readCharacteristicUuid)
        }
    }

    async ensureOpen() {
        if (!this.server || !this.server.connected) {
            await this.open()
        }
    }

    async write(data) {
        const payload = data instanceof Uint8Array ? data : new Uint8Array(data)
        await this.ensureOpen()
        if (typeof this.writeCharacteristic.writeValueWithoutResponse === 'function') {
            await this.writeCharacteristic.writeValueWithoutResponse(payload)
        } else {
            await this.writeCharacteristic.writeValue(payload)
        }
    }

    async read(count) {
        await this.ensureOpen()
        if (this.notifyCharacteristic) {
            if (this.buffer.length < count) {
                await new Promise((resolve) => this.waiters.push(resolve))
            }
            if (this.buffer.length === 0) {
                return null
            }
            const slice = this.buffer.slice(0, count)
            this.buffer = this.buffer.slice(count)
            return slice
        }

        if (this.readCharacteristic) {
            const value = await this.readCharacteristic.readValue()
            const chunk = new Uint8Array(value.buffer)
            return chunk.slice(0, count)
        }

        return null
    }

    async close() {
        try {
            if (this.notifyCharacteristic) {
                await this.notifyCharacteristic.stopNotifications()
            }
        } catch {
            // ignore
        }
        if (this.server?.connected) {
            await this.server.disconnect()
        }
    }
}
