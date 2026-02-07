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
        throw new Error(this.translate('print.unknownBackend'))
    }
}
