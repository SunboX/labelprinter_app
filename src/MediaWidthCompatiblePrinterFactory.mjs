import { PrinterErrorCode } from 'labelprinterkit-web/src/index.mjs'

/**
 * Wraps toolkit printer classes so media compatibility is decided by tape width.
 */
export class MediaWidthCompatiblePrinterFactory {
    static #wrappedPrinterCache = new WeakMap()

    /**
     * Wraps each printer class in the supplied map with width-tolerant status handling.
     * @param {Record<string, Function>} printerMap
     * @returns {Record<string, Function>}
     */
    static createPrinterMap(printerMap) {
        const entries = Object.entries(printerMap || {})
        return Object.fromEntries(entries.map(([printerId, PrinterClass]) => [printerId, this.#wrapPrinterClass(PrinterClass)]))
    }

    /**
     * Creates or reuses a width-tolerant wrapper for a toolkit printer class.
     * @param {Function} PrinterClass
     * @returns {Function}
     */
    static #wrapPrinterClass(PrinterClass) {
        if (typeof PrinterClass !== 'function') {
            return PrinterClass
        }
        const cachedPrinterClass = this.#wrappedPrinterCache.get(PrinterClass)
        if (cachedPrinterClass) {
            return cachedPrinterClass
        }

        class MediaWidthCompatiblePrinter extends PrinterClass {
            /**
             * Ignores toolkit media mismatch errors when printer and job widths match.
             * @param {object} status
             * @param {object} job
             * @returns {void}
             */
            _assertStatus(status, job) {
                try {
                    super._assertStatus(status, job)
                } catch (error) {
                    if (MediaWidthCompatiblePrinterFactory.#isWidthCompatibleMediaMismatch(error)) {
                        return
                    }
                    throw error
                }
            }
        }

        this.#wrappedPrinterCache.set(PrinterClass, MediaWidthCompatiblePrinter)
        return MediaWidthCompatiblePrinter
    }

    /**
     * Checks whether a printer status error should be ignored because widths match.
     * @param {unknown} error
     * @returns {boolean}
     */
    static #isWidthCompatibleMediaMismatch(error) {
        if (error?.code !== PrinterErrorCode.MEDIA_MISMATCH) {
            return false
        }

        const loadedWidth = Number(error?.details?.loadedMedia?.width)
        const expectedWidth = Number(error?.details?.expectedMedia?.width)
        if (!Number.isFinite(loadedWidth) || !Number.isFinite(expectedWidth)) {
            return false
        }

        return loadedWidth > 0 && loadedWidth === expectedWidth
    }
}
