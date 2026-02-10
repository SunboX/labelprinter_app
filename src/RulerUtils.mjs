/**
 * Ruler geometry helpers for preview axes.
 */
export class RulerUtils {
    /**
     * Computes the ruler scale values for rendering tick marks with a pixel offset.
     * @param {number} lengthMm
     * @param {number} axisLengthPx
     * @param {number} [offsetPx=0]
     * @returns {{ pixelsPerMm: number, startPx: number, usableLengthPx: number }}
     */
    static computeRulerScale(lengthMm, axisLengthPx, offsetPx = 0) {
        const safeLengthMm = Math.max(1, Number.isFinite(lengthMm) ? lengthMm : 0)
        const safeAxisLengthPx = Math.max(0, Number.isFinite(axisLengthPx) ? axisLengthPx : 0)
        const safeOffsetPx = Math.max(0, Math.min(Number.isFinite(offsetPx) ? offsetPx : 0, safeAxisLengthPx))
        const usableLengthPx = Math.max(0, safeAxisLengthPx - safeOffsetPx)
        return {
            pixelsPerMm: usableLengthPx / safeLengthMm,
            startPx: safeOffsetPx,
            usableLengthPx
        }
    }

    /**
     * Computes the highlight range for a ruler axis.
     * @param {number} startPx
     * @param {number} pixelsPerMm
     * @param {number} highlightLengthMm
     * @param {number} axisLengthPx
     * @returns {{ startPx: number, endPx: number, lengthPx: number }}
     */
    static computeRulerHighlight(startPx, pixelsPerMm, highlightLengthMm, axisLengthPx) {
        const safeStartPx = Math.max(0, Number.isFinite(startPx) ? startPx : 0)
        const safePixelsPerMm = Math.max(0, Number.isFinite(pixelsPerMm) ? pixelsPerMm : 0)
        const safeHighlightMm = Math.max(0, Number.isFinite(highlightLengthMm) ? highlightLengthMm : 0)
        const safeAxisLengthPx = Math.max(0, Number.isFinite(axisLengthPx) ? axisLengthPx : 0)
        const highlightPx = safeHighlightMm * safePixelsPerMm
        const clampedStart = Math.min(safeStartPx, safeAxisLengthPx)
        const endPx = Math.min(safeAxisLengthPx, clampedStart + highlightPx)
        return {
            startPx: clampedStart,
            endPx,
            lengthPx: Math.max(0, endPx - clampedStart)
        }
    }

    /**
     * Determines whether an axis position is visible in the current ruler viewport.
     * @param {number} positionPx
     * @param {number} axisLengthPx
     * @param {number} [bleedPx=0]
     * @returns {boolean}
     */
    static isAxisPositionVisible(positionPx, axisLengthPx, bleedPx = 0) {
        const safePositionPx = Number.isFinite(positionPx) ? positionPx : NaN
        const safeAxisLengthPx = Math.max(0, Number.isFinite(axisLengthPx) ? axisLengthPx : 0)
        const safeBleedPx = Math.max(0, Number.isFinite(bleedPx) ? bleedPx : 0)
        if (!Number.isFinite(safePositionPx)) return false
        return safePositionPx >= 0 - safeBleedPx && safePositionPx <= safeAxisLengthPx + safeBleedPx
    }

    /**
     * Computes a clamped label position for ruler text so edge labels remain visible.
     * @param {number} positionPx
     * @param {number} startPx
     * @param {number} axisLengthPx
     * @param {number} [edgeInsetPx=0]
     * @returns {number}
     */
    static computeRulerLabelPosition(positionPx, startPx, axisLengthPx, edgeInsetPx = 0) {
        const safeAxisLengthPx = Math.max(0, Number.isFinite(axisLengthPx) ? axisLengthPx : 0)
        const safeStartPx = Math.max(0, Math.min(Number.isFinite(startPx) ? startPx : 0, safeAxisLengthPx))
        const safePositionPx = Number.isFinite(positionPx) ? positionPx : safeStartPx
        const safeInsetPx = Math.max(0, Number.isFinite(edgeInsetPx) ? edgeInsetPx : 0)
        const minLabelPos = Math.min(safeAxisLengthPx, safeStartPx + safeInsetPx)
        const maxLabelPos = Math.max(minLabelPos, safeAxisLengthPx - safeInsetPx)
        return Math.min(Math.max(safePositionPx, minLabelPos), maxLabelPos)
    }
}
