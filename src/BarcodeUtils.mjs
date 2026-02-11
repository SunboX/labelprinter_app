/**
 * Barcode option helpers shared by editor, renderer, and project IO.
 */
export class BarcodeUtils {
    static #supportedFormats = Object.freeze([
        'CODE128',
        'CODE128A',
        'CODE128B',
        'CODE128C',
        'CODE39',
        'EAN13',
        'EAN8',
        'EAN5',
        'EAN2',
        'UPC',
        'UPCE',
        'ITF14',
        'MSI',
        'MSI10',
        'MSI11',
        'MSI1010',
        'MSI1110',
        'codabar',
        'pharmacode'
    ])

    static #defaultFormat = 'CODE128'
    static #defaultShowText = false
    static #defaultModuleWidth = 2
    static #defaultMargin = 0
    static #minModuleWidth = 1
    static #maxModuleWidth = 6
    static #minMargin = 0
    static #maxMargin = 30
    static #formatLookup = new Map(BarcodeUtils.#supportedFormats.map((format) => [format.toUpperCase(), format]))

    /**
     * Returns all supported JsBarcode formats in UI order.
     * @returns {string[]}
     */
    static getSupportedFormats() {
        return [...BarcodeUtils.#supportedFormats]
    }

    /**
     * Returns the default barcode format.
     * @returns {string}
     */
    static getDefaultFormat() {
        return BarcodeUtils.#defaultFormat
    }

    /**
     * Normalizes a user-provided barcode format.
     * @param {unknown} value
     * @returns {string}
     */
    static normalizeFormat(value) {
        const normalized = String(value || '').trim().toUpperCase()
        return BarcodeUtils.#formatLookup.get(normalized) || BarcodeUtils.#defaultFormat
    }

    /**
     * Normalizes the barcode module width in pixels.
     * @param {unknown} value
     * @returns {number}
     */
    static normalizeModuleWidth(value) {
        const numeric = Math.round(Number(value))
        if (!Number.isFinite(numeric)) return BarcodeUtils.#defaultModuleWidth
        return Math.max(BarcodeUtils.#minModuleWidth, Math.min(BarcodeUtils.#maxModuleWidth, numeric))
    }

    /**
     * Normalizes the barcode quiet zone margin in pixels.
     * @param {unknown} value
     * @returns {number}
     */
    static normalizeMargin(value) {
        const numeric = Math.round(Number(value))
        if (!Number.isFinite(numeric)) return BarcodeUtils.#defaultMargin
        return Math.max(BarcodeUtils.#minMargin, Math.min(BarcodeUtils.#maxMargin, numeric))
    }

    /**
     * Normalizes the human-readable barcode text visibility option.
     * @param {unknown} value
     * @returns {boolean}
     */
    static normalizeShowText(value) {
        if (typeof value === 'boolean') return value
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase()
            if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
            if (['0', 'false', 'no', 'off'].includes(normalized)) return false
        }
        if (typeof value === 'number') {
            return value !== 0
        }
        return BarcodeUtils.#defaultShowText
    }

    /**
     * Normalizes barcode item render options.
     * Legacy aliases are accepted for project backward compatibility.
     * @param {object} [item={}]
     * @returns {{
     *  barcodeFormat: string,
     *  barcodeShowText: boolean,
     *  barcodeModuleWidth: number,
     *  barcodeMargin: number
     * }}
     */
    static normalizeItemOptions(item = {}) {
        return {
            barcodeFormat: BarcodeUtils.normalizeFormat(item.barcodeFormat ?? item.format),
            barcodeShowText: BarcodeUtils.normalizeShowText(item.barcodeShowText ?? item.displayValue),
            barcodeModuleWidth: BarcodeUtils.normalizeModuleWidth(item.barcodeModuleWidth ?? item.moduleWidth),
            barcodeMargin: BarcodeUtils.normalizeMargin(item.barcodeMargin ?? item.margin)
        }
    }
}
