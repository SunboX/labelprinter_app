/**
 * Zoom math helpers for the preview stage.
 */
export class ZoomUtils {
    static #zoomMin = 0.5
    static #zoomMax = 2.5
    static #zoomStep = 0.1

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
}
