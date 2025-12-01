function concatBytes(a, b) {
    const out = new Uint8Array(a.length + b.length)
    out.set(a, 0)
    out.set(b, a.length)
    return out
}

export class WebSerialBackend {
    constructor(port, { baudRate = 9600, bufferSize = 255 } = {}) {
        this.port = port
        this.options = { baudRate, bufferSize }
        this.writer = null
        this.reader = null
        this.buffer = new Uint8Array()
    }

    static async requestPort(options = {}) {
        if (!navigator?.serial) {
            throw new Error('WebSerial is not available in this environment')
        }
        const port = await navigator.serial.requestPort()
        const backend = new WebSerialBackend(port, options)
        await backend.open()
        return backend
    }

    async open() {
        await this.port.open({ baudRate: this.options.baudRate, bufferSize: this.options.bufferSize })
        this.writer = this.port.writable.getWriter()
        this.reader = this.port.readable.getReader()
    }

    async ensureOpen() {
        if (!this.port.readable || !this.port.writable) {
            await this.open()
        }
    }

    async write(data) {
        const payload = data instanceof Uint8Array ? data : new Uint8Array(data)
        await this.ensureOpen()
        await this.writer.write(payload)
    }

    async read(count) {
        await this.ensureOpen()
        while (this.buffer.length < count) {
            const { value, done } = await this.reader.read()
            if (done || !value) {
                break
            }
            this.buffer = concatBytes(this.buffer, value)
        }
        if (this.buffer.length === 0) {
            return null
        }
        const slice = this.buffer.slice(0, count)
        this.buffer = this.buffer.slice(count)
        return slice
    }

    async close() {
        if (this.reader) {
            await this.reader.cancel()
            this.reader.releaseLock()
        }
        if (this.writer) {
            await this.writer.close()
            this.writer.releaseLock()
        }
        await this.port.close()
    }
}
