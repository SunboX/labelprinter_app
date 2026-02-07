import { Job, Label, Media, P700, WebBluetoothBackend, WebUSBBackend } from 'labelprinterkit-web/src/index.mjs'

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
     * @param {Array<Record<string, string>>} [parameterValueMaps=[]]
     * @returns {Promise<void>}
     */
    async print(parameterValueMaps = []) {
        const normalizedValueMaps =
            Array.isArray(parameterValueMaps) && parameterValueMaps.length ? parameterValueMaps : [{}]

        this.setStatus(
            normalizedValueMaps.length > 1
                ? `Rendering ${normalizedValueMaps.length} labels...`
                : 'Rendering label...',
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

            this.setStatus(`Requesting ${this.state.backend.toUpperCase()} device...`, 'info')
            const backend = await this.#connectBackend()
            const PrinterClass = this.printerMap[this.state.printer] || P700
            const printer = new PrinterClass(backend)
            await printer.print(job)
            this.setStatus(
                normalizedValueMaps.length > 1
                    ? `Print job sent (${normalizedValueMaps.length} labels).`
                    : 'Print job sent.',
                'success'
            )
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
