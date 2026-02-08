/**
 * QR code option helpers used by the editor and renderer.
 */
export class QrCodeUtils {
    static #errorCorrectionLevels = ['L', 'M', 'Q', 'H']
    static #encodingModes = ['auto', 'byte', 'alphanumeric', 'numeric']
    static #defaultErrorCorrectionLevel = 'M'
    static #defaultVersion = 0
    static #defaultEncodingMode = 'auto'

    /**
     * Returns supported QR error correction levels.
     * @returns {string[]}
     */
    static getErrorCorrectionLevels() {
        return [...QrCodeUtils.#errorCorrectionLevels]
    }

    /**
     * Returns supported QR encoding modes.
     * @returns {string[]}
     */
    static getEncodingModes() {
        return [...QrCodeUtils.#encodingModes]
    }

    /**
     * Returns the default error correction level.
     * @returns {string}
     */
    static getDefaultErrorCorrectionLevel() {
        return QrCodeUtils.#defaultErrorCorrectionLevel
    }

    /**
     * Returns the default QR version (`0` means auto).
     * @returns {number}
     */
    static getDefaultVersion() {
        return QrCodeUtils.#defaultVersion
    }

    /**
     * Returns the default encoding mode.
     * @returns {string}
     */
    static getDefaultEncodingMode() {
        return QrCodeUtils.#defaultEncodingMode
    }

    /**
     * Normalizes an error correction level.
     * @param {unknown} value
     * @returns {'L' | 'M' | 'Q' | 'H'}
     */
    static normalizeErrorCorrectionLevel(value) {
        const normalized = String(value || '').trim().toUpperCase()
        if (QrCodeUtils.#errorCorrectionLevels.includes(normalized)) {
            return normalized
        }
        return QrCodeUtils.#defaultErrorCorrectionLevel
    }

    /**
     * Normalizes a QR version.
     * `0` means auto version selection.
     * @param {unknown} value
     * @returns {number}
     */
    static normalizeVersion(value) {
        if (value === '' || value === null || value === undefined) {
            return QrCodeUtils.#defaultVersion
        }
        const version = Math.round(Number(value))
        if (!Number.isFinite(version)) {
            return QrCodeUtils.#defaultVersion
        }
        if (version <= 0) {
            return QrCodeUtils.#defaultVersion
        }
        return Math.max(1, Math.min(40, version))
    }

    /**
     * Normalizes an encoding mode.
     * @param {unknown} value
     * @returns {'auto' | 'byte' | 'alphanumeric' | 'numeric'}
     */
    static normalizeEncodingMode(value) {
        const normalized = String(value || '').trim().toLowerCase()
        if (QrCodeUtils.#encodingModes.includes(normalized)) {
            return normalized
        }
        return QrCodeUtils.#defaultEncodingMode
    }

    /**
     * Normalizes QR options from an item-like object.
     * @param {object} item
     * @returns {{ qrErrorCorrectionLevel: string, qrVersion: number, qrEncodingMode: string }}
     */
    static normalizeItemOptions(item) {
        const source = item || {}
        const rawErrorCorrectionLevel = source.qrErrorCorrectionLevel ?? source.errorCorrectionLevel
        const rawVersion = source.qrVersion ?? source.version
        const rawEncodingMode = source.qrEncodingMode ?? source.encodingMode
        return {
            qrErrorCorrectionLevel: QrCodeUtils.normalizeErrorCorrectionLevel(rawErrorCorrectionLevel),
            qrVersion: QrCodeUtils.normalizeVersion(rawVersion),
            qrEncodingMode: QrCodeUtils.normalizeEncodingMode(rawEncodingMode)
        }
    }

    /**
     * Builds a QR payload for the selected encoding mode.
     * @param {string} data
     * @param {string} encodingMode
     * @returns {string | Array<{ data: string, mode: string }>}
     */
    static buildQrPayload(data, encodingMode) {
        const safeData = String(data || '')
        const mode = QrCodeUtils.normalizeEncodingMode(encodingMode)
        if (mode === 'auto') {
            return safeData
        }
        return [{ data: safeData, mode }]
    }
}
