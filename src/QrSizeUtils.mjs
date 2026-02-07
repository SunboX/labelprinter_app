import { Media, Resolution } from 'labelprinterkit-web/src/index.mjs'

/**
 * QR sizing helpers bound to media and resolution constraints.
 */
export class QrSizeUtils {
    static #mmPerInch = 25.4
    static #defaultQrSizeDots = 120
    static #minQrSizeDots = 8
    static #feedPaddingDots = 10

    /**
     * Returns the minimum QR size in dots.
     * @returns {number}
     */
    static get MIN_QR_SIZE_DOTS() {
        return QrSizeUtils.#minQrSizeDots
    }

    /**
     * Resolves the selected media configuration.
     * @param {object} state
     * @returns {{ printArea?: number }}
     */
    static #resolveMedia(state) {
        const mediaId = state?.media
        return Media[mediaId] || Media.W24
    }

    /**
     * Resolves the selected print resolution configuration.
     * @param {object} state
     * @returns {{ dots?: number[], minLength?: number }}
     */
    static #resolveResolution(state) {
        const resolutionId = state?.resolution
        return Resolution[resolutionId] || Resolution.LOW
    }

    /**
     * Computes the maximum QR size allowed by a fixed label length override.
     * @param {object} state
     * @param {{ dots?: number[], minLength?: number }} resolution
     * @returns {number}
     */
    static #computeLengthConstrainedQrMax(state, resolution) {
        const lengthMm = Number(state?.mediaLengthMm)
        if (!Number.isFinite(lengthMm) || lengthMm <= 0) return Number.POSITIVE_INFINITY
        const dotsPerInch = resolution?.dots?.[1] || resolution?.dots?.[0] || 180
        const minLength = Math.max(0, Number(resolution?.minLength) || 0)
        const forcedLengthDots = Math.max(minLength, Math.round((lengthMm / QrSizeUtils.#mmPerInch) * dotsPerInch))
        return Math.max(1, forcedLengthDots - QrSizeUtils.#feedPaddingDots)
    }

    /**
     * Computes the maximum QR size that fits the current label setup.
     * @param {object} state
     * @returns {number}
     */
    static computeMaxQrSizeDots(state) {
        const media = QrSizeUtils.#resolveMedia(state)
        const resolution = QrSizeUtils.#resolveResolution(state)
        const maxByWidth = Math.max(1, Number(media?.printArea) || QrSizeUtils.#defaultQrSizeDots)
        const maxByLength = QrSizeUtils.#computeLengthConstrainedQrMax(state, resolution)
        return Math.max(1, Math.floor(Math.min(maxByWidth, maxByLength)))
    }

    /**
     * Computes the initial QR size for newly added QR items.
     * @param {object} state
     * @returns {number}
     */
    static computeInitialQrSizeDots(state) {
        return Math.min(QrSizeUtils.#defaultQrSizeDots, QrSizeUtils.computeMaxQrSizeDots(state))
    }

    /**
     * Clamps a QR size to the current label constraints.
     * @param {object} state
     * @param {number} value
     * @returns {number}
     */
    static clampQrSizeToLabel(state, value) {
        const maxSize = QrSizeUtils.computeMaxQrSizeDots(state)
        const safeValue = Number.isFinite(value) ? Number(value) : QrSizeUtils.computeInitialQrSizeDots(state)
        return Math.max(1, Math.min(maxSize, Math.round(safeValue)))
    }
}
