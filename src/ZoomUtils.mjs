/**
 * Zoom math helpers for the preview stage.
 */
export class ZoomUtils {
    static #zoomMin = 0.5
    static #zoomMax = 2.5
    static #zoomStep = 0.1
    static #zoomPreferenceStorageKey = 'labelprinter-app.zoom-preference.v1'
    static #displayFingerprintKeys = Object.freeze([
        'screenWidth',
        'screenHeight',
        'availWidth',
        'availHeight',
        'colorDepth',
        'pixelDepth',
        'devicePixelRatio'
    ])

    /**
     * Returns the minimum supported zoom factor.
     * @returns {number}
     */
    static get ZOOM_MIN() {
        return ZoomUtils.#zoomMin
    }

    /**
     * Returns the maximum supported zoom factor.
     * @returns {number}
     */
    static get ZOOM_MAX() {
        return ZoomUtils.#zoomMax
    }

    /**
     * Returns the zoom step used for incremental controls.
     * @returns {number}
     */
    static get ZOOM_STEP() {
        return ZoomUtils.#zoomStep
    }

    /**
     * Returns the localStorage key used for zoom preference persistence.
     * @returns {string}
     */
    static get ZOOM_PREFERENCE_STORAGE_KEY() {
        return ZoomUtils.#zoomPreferenceStorageKey
    }

    /**
     * Clamps a zoom level to the supported range.
     * @param {number} zoom
     * @returns {number}
     */
    static clampZoom(zoom) {
        const value = Number.isFinite(zoom) ? zoom : 1
        return Math.min(ZoomUtils.#zoomMax, Math.max(ZoomUtils.#zoomMin, value))
    }

    /**
     * Steps the current zoom level by one increment.
     * @param {number} currentZoom
     * @param {1 | -1} direction
     * @returns {number}
     */
    static stepZoom(currentZoom, direction) {
        const current = ZoomUtils.clampZoom(currentZoom)
        const delta = direction === -1 ? -ZoomUtils.#zoomStep : ZoomUtils.#zoomStep
        const stepped = Math.round((current + delta) * 100) / 100
        return ZoomUtils.clampZoom(stepped)
    }

    /**
     * Formats a zoom level as a percentage label.
     * @param {number} zoom
     * @returns {string}
     */
    static formatZoomLabel(zoom) {
        return `${Math.round(ZoomUtils.clampZoom(zoom) * 100)}%`
    }

    /**
     * Builds a display fingerprint from window/screen metrics.
     * @param {Window | object} [windowRef=globalThis]
     * @returns {Record<string, number>}
     */
    static buildDisplayFingerprint(windowRef = globalThis) {
        const screenRef = windowRef?.screen ?? {}
        return {
            screenWidth: ZoomUtils.#coerceNumber(screenRef.width, 0),
            screenHeight: ZoomUtils.#coerceNumber(screenRef.height, 0),
            availWidth: ZoomUtils.#coerceNumber(screenRef.availWidth, 0),
            availHeight: ZoomUtils.#coerceNumber(screenRef.availHeight, 0),
            colorDepth: ZoomUtils.#coerceNumber(screenRef.colorDepth, 0),
            pixelDepth: ZoomUtils.#coerceNumber(screenRef.pixelDepth, 0),
            devicePixelRatio: ZoomUtils.#coerceNumber(windowRef?.devicePixelRatio, 1)
        }
    }

    /**
     * Creates a serializable zoom preference payload.
     * @param {number} zoom
     * @param {Window | object} [windowRef=globalThis]
     * @returns {{ zoom: number, display: Record<string, number> }}
     */
    static createZoomPreferencePayload(zoom, windowRef = globalThis) {
        return {
            zoom: ZoomUtils.clampZoom(zoom),
            display: ZoomUtils.buildDisplayFingerprint(windowRef)
        }
    }

    /**
     * Parses and normalizes a persisted zoom preference payload.
     * @param {string | object | null | undefined} rawValue
     * @returns {{ zoom: number, display: Record<string, number> } | null}
     */
    static parseZoomPreferencePayload(rawValue) {
        if (rawValue === null || rawValue === undefined) return null
        let parsedValue = rawValue
        if (typeof rawValue === 'string') {
            try {
                parsedValue = JSON.parse(rawValue)
            } catch (_error) {
                return null
            }
        }
        if (!parsedValue || typeof parsedValue !== 'object') return null
        if (!('zoom' in parsedValue) || !('display' in parsedValue)) return null
        return {
            zoom: ZoomUtils.clampZoom(Number(parsedValue.zoom)),
            display: ZoomUtils.#normalizeDisplayFingerprint(parsedValue.display)
        }
    }

    /**
     * Compares two display fingerprints.
     * @param {Record<string, number>} left
     * @param {Record<string, number>} right
     * @returns {boolean}
     */
    static isSameDisplayFingerprint(left, right) {
        if (!left || !right) return false
        return ZoomUtils.#displayFingerprintKeys.every(
            (key) => ZoomUtils.#coerceNumber(left[key], NaN) === ZoomUtils.#coerceNumber(right[key], NaN)
        )
    }

    /**
     * Resolves a persisted zoom value when the display fingerprint still matches.
     * @param {string | object | null | undefined} rawPreference
     * @param {Window | object} [windowRef=globalThis]
     * @returns {number | null}
     */
    static resolvePersistedZoom(rawPreference, windowRef = globalThis) {
        const parsedPreference = ZoomUtils.parseZoomPreferencePayload(rawPreference)
        if (!parsedPreference) return null
        const currentDisplay = ZoomUtils.buildDisplayFingerprint(windowRef)
        if (!ZoomUtils.isSameDisplayFingerprint(parsedPreference.display, currentDisplay)) {
            return null
        }
        return ZoomUtils.clampZoom(parsedPreference.zoom)
    }

    /**
     * Normalizes display fingerprint values into numbers.
     * @param {object} rawDisplay
     * @returns {Record<string, number>}
     */
    static #normalizeDisplayFingerprint(rawDisplay) {
        const display = rawDisplay && typeof rawDisplay === 'object' ? rawDisplay : {}
        return {
            screenWidth: ZoomUtils.#coerceNumber(display.screenWidth, 0),
            screenHeight: ZoomUtils.#coerceNumber(display.screenHeight, 0),
            availWidth: ZoomUtils.#coerceNumber(display.availWidth, 0),
            availHeight: ZoomUtils.#coerceNumber(display.availHeight, 0),
            colorDepth: ZoomUtils.#coerceNumber(display.colorDepth, 0),
            pixelDepth: ZoomUtils.#coerceNumber(display.pixelDepth, 0),
            devicePixelRatio: ZoomUtils.#coerceNumber(display.devicePixelRatio, 1)
        }
    }

    /**
     * Coerces a value to finite number with fallback.
     * @param {unknown} value
     * @param {number} fallback
     * @returns {number}
     */
    static #coerceNumber(value, fallback) {
        const numericValue = Number(value)
        return Number.isFinite(numericValue) ? numericValue : fallback
    }
}
