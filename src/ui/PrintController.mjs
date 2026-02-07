import { Job, Label, Media, P700, WebBluetoothBackend, WebUSBBackend } from 'labelprinterkit-web/src/index.mjs'

/**
 * Handles printing the current label state.
 */
export class PrintController {
    /**
     * @param {object} els
     * @param {object} state
     * @param {Record<string, Function>} printerMap
     * @param {{ buildCanvasFromState: () => Promise<object> }} previewRenderer
     * @param {(text: string, type?: string) => void} setStatus
     */
    constructor(els, state, printerMap, previewRenderer, setStatus) {
        this.els = els
        this.state = state
        this.printerMap = printerMap
        this.previewRenderer = previewRenderer
        this.setStatus = setStatus
    }

    /**
     * Sends the current label to the selected printer backend.
     * @returns {Promise<void>}
     */
    async print() {
        this.setStatus('Rendering label...', 'info')
        this.els.print.disabled = true
        try {
            const { printCanvas, media, res } = await this.previewRenderer.buildCanvasFromState()
            const label = new Label(res, printCanvas)
            const job = new Job(media || Media[this.state.media] || Media.W24)
            job.addPage(label)

            this.setStatus(`Requesting ${this.state.backend.toUpperCase()} device...`, 'info')
            const backend = await this.#connectBackend()
            const PrinterClass = this.printerMap[this.state.printer] || P700
            const printer = new PrinterClass(backend)
            await printer.print(job)
            this.setStatus('Print job sent.', 'success')
        } catch (err) {
            console.error(err)
            this.setStatus(err?.message || 'Failed to print', 'error')
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
            return WebUSBBackend.requestDevice({ filters: [{ classCode: 7 }] })
        }
        if (mode === 'ble') {
            return WebBluetoothBackend.requestDevice({
                serviceUuid: this.state.ble.serviceUuid,
                writeCharacteristicUuid: this.state.ble.writeCharacteristicUuid,
                notifyCharacteristicUuid: this.state.ble.notifyCharacteristicUuid || undefined,
                filters: this.state.ble.namePrefix ? [{ namePrefix: this.state.ble.namePrefix }] : undefined
            })
        }
        throw new Error('Unknown backend mode')
    }
}
