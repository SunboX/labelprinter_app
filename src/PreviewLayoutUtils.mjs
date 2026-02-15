/**
 * Layout helpers for preview and ruler geometry.
 */
export class PreviewLayoutUtils {
    static DEFAULT_PX_PER_MM = 4.5
    static MIN_DISPLAY_WIDTH_MM = 260
    static MIN_DISPLAY_HEIGHT_MM = 140
    static WIDTH_PADDING_MM = 30
    static HEIGHT_PADDING_MM = 40

    /**
     * Computes the preview sizing metrics for the layout stage.
     * @param {number} labelMmWidth
     * @param {number} labelMmHeight
     * @param {number} [maxWidthPx=0]
     * @param {number} [maxHeightPx=0]
     * @returns {{ displayWidthMm: number, displayHeightMm: number, pxPerMm: number }}
     */
    static computePreviewMetrics(labelMmWidth, labelMmHeight, maxWidthPx = 0, maxHeightPx = 0) {
        const safeWidth = Number.isFinite(labelMmWidth) ? labelMmWidth : 0
        const safeHeight = Number.isFinite(labelMmHeight) ? labelMmHeight : 0
        const safeMaxWidthPx = Number.isFinite(maxWidthPx) ? maxWidthPx : 0
        const safeMaxHeightPx = Number.isFinite(maxHeightPx) ? maxHeightPx : 0
        const displayWidthMm = Math.max(safeWidth + PreviewLayoutUtils.WIDTH_PADDING_MM, PreviewLayoutUtils.MIN_DISPLAY_WIDTH_MM)
        const displayHeightMm = Math.max(
            safeHeight + PreviewLayoutUtils.HEIGHT_PADDING_MM,
            PreviewLayoutUtils.MIN_DISPLAY_HEIGHT_MM
        )
        let pxPerMm = PreviewLayoutUtils.DEFAULT_PX_PER_MM
        if (safeMaxWidthPx > 0) {
            pxPerMm = Math.min(pxPerMm, safeMaxWidthPx / displayWidthMm)
        }
        if (safeMaxHeightPx > 0) {
            pxPerMm = Math.min(pxPerMm, safeMaxHeightPx / displayHeightMm)
        }
        return {
            displayWidthMm,
            displayHeightMm,
            pxPerMm
        }
    }

    /**
     * Computes the auto label length in dots from content extent.
     * @param {number} baseLengthDots
     * @param {number} contentEndDots
     * @param {number} trailingPaddingDots
     * @param {number} minLengthDots
     * @returns {number}
     */
    static computeAutoLabelLengthDots(baseLengthDots, contentEndDots, trailingPaddingDots, minLengthDots) {
        // Keep this argument for compatibility with existing callers; auto sizing is
        // intentionally driven by actual rendered content so overlap/stacking can shrink length.
        void baseLengthDots
        const safeContentEnd = Math.max(0, Number.isFinite(contentEndDots) ? contentEndDots : 0)
        const safeTrailingPadding = Math.max(0, Number.isFinite(trailingPaddingDots) ? trailingPaddingDots : 0)
        const safeMin = Math.max(0, Number.isFinite(minLengthDots) ? minLengthDots : 0)
        const dynamicLength = safeContentEnd + safeTrailingPadding
        return Math.max(safeMin, dynamicLength)
    }

    /**
     * Computes the label width tag placement relative to the tape strip.
     * @param {number} tapeStartX
     * @param {number} tapeCenterY
     * @param {number} tagRectWidth
     * @param {number} tagRectHeight
     * @param {number} labelTagGap
     * @param {number} [labelTagInset=0]
     * @returns {{ tapeOffset: number, labelLeft: number, labelTop: number }}
     */
    static computeLabelTagLayout(tapeStartX, tapeCenterY, tagRectWidth, tagRectHeight, labelTagGap, labelTagInset = 0) {
        const safeTapeStartX = Number.isFinite(tapeStartX) ? tapeStartX : 0
        const safeTapeCenterY = Number.isFinite(tapeCenterY) ? tapeCenterY : 0
        const safeTagRectWidth = Math.max(0, Number.isFinite(tagRectWidth) ? tagRectWidth : 0)
        const safeTagRectHeight = Math.max(0, Number.isFinite(tagRectHeight) ? tagRectHeight : 0)
        const safeGap = Math.max(0, Number.isFinite(labelTagGap) ? labelTagGap : 0)
        // Allow the inset to exceed the gap so the label can overlap the strip if desired.
        const safeInset = Math.max(0, Number.isFinite(labelTagInset) ? labelTagInset : 0)
        const tapeOffset = safeTagRectWidth ? safeTagRectWidth + safeGap : 0
        return {
            tapeOffset,
            labelLeft: Math.max(0, safeTapeStartX - safeGap - safeTagRectWidth + safeInset),
            labelTop: safeTapeCenterY - safeTagRectWidth / 2 + safeTagRectHeight / 2
        }
    }

    /**
     * Computes the preview label dimensions in millimeters.
     * @param {number} widthDots
     * @param {number} heightDots
     * @param {number} dotsPerMmX
     * @param {number} dotsPerMmY
     * @param {number | null | undefined} mediaWidthMm
     * @param {boolean} isHorizontal
     * @returns {{ labelMmWidth: number, labelMmHeight: number }}
     */
    static computeLabelMmDimensions(widthDots, heightDots, dotsPerMmX, dotsPerMmY, mediaWidthMm, isHorizontal) {
        const safeWidthDots = Number.isFinite(widthDots) ? widthDots : 0
        const safeHeightDots = Number.isFinite(heightDots) ? heightDots : 0
        const safeDotsPerMmX = Number.isFinite(dotsPerMmX) && dotsPerMmX > 0 ? dotsPerMmX : 1
        const safeDotsPerMmY = Number.isFinite(dotsPerMmY) && dotsPerMmY > 0 ? dotsPerMmY : safeDotsPerMmX
        const safeMediaWidth = Number.isFinite(mediaWidthMm) && mediaWidthMm > 0 ? mediaWidthMm : null
        let labelMmWidth = safeWidthDots / safeDotsPerMmX
        let labelMmHeight = safeHeightDots / safeDotsPerMmY
        if (safeMediaWidth) {
            if (isHorizontal) {
                labelMmHeight = safeMediaWidth
            } else {
                labelMmWidth = safeMediaWidth
            }
        }
        return { labelMmWidth, labelMmHeight }
    }

    /**
     * Computes the dotted margin marker rectangle for the preview canvas.
     * @param {number} widthPx
     * @param {number} heightPx
     * @param {number} marginStartPx
     * @param {number} marginEndPx
     * @param {number} insetPx
     * @returns {{ x: number, y: number, width: number, height: number }}
     */
    static computeMarginMarkerRect(widthPx, heightPx, marginStartPx, marginEndPx, insetPx) {
        const safeWidth = Math.max(0, Number.isFinite(widthPx) ? widthPx : 0)
        const safeHeight = Math.max(0, Number.isFinite(heightPx) ? heightPx : 0)
        const safeMarginStart = Math.max(0, Math.min(Number.isFinite(marginStartPx) ? marginStartPx : 0, safeWidth))
        const safeMarginEnd = Math.max(
            0,
            Math.min(Number.isFinite(marginEndPx) ? marginEndPx : 0, Math.max(0, safeWidth - safeMarginStart))
        )
        const safeInset = Math.max(0, Math.min(Number.isFinite(insetPx) ? insetPx : 0, safeHeight / 2))
        const width = Math.max(0, safeWidth - safeMarginStart - safeMarginEnd)
        const height = Math.max(0, safeHeight - safeInset * 2)
        return {
            x: safeMarginStart,
            y: safeInset,
            width,
            height
        }
    }
}
