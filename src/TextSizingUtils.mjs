/**
 * Text sizing helpers that keep font appearance stable across media widths.
 */
export class TextSizingUtils {
    /**
     * Computes a media-aware font scale in printer dots from CSS pixels.
     * The scale is anchored to a reference media (W9 by default) so changing tape width
     * does not make text appear larger than on W9 when print head limits are reached.
     * @param {{
     *   resolutionDpi: number,
     *   printAreaDots: number,
     *   mediaWidthMm: number,
     *   referencePrintAreaDots?: number,
     *   referenceWidthMm?: number
     * }} options
     * @returns {number}
     */
    static computeMediaCompensatedDotScale(options) {
        const safeResolutionDpi = Math.max(1, Number(options?.resolutionDpi) || 180)
        const baseScale = safeResolutionDpi / 96
        const safePrintAreaDots = Math.max(1, Number(options?.printAreaDots) || 1)
        const safeMediaWidthMm = Math.max(1, Number(options?.mediaWidthMm) || 1)
        const safeReferencePrintAreaDots = Math.max(1, Number(options?.referencePrintAreaDots) || 64)
        const safeReferenceWidthMm = Math.max(1, Number(options?.referenceWidthMm) || 9)
        const currentDotsPerMm = safePrintAreaDots / safeMediaWidthMm
        const referenceDotsPerMm = safeReferencePrintAreaDots / safeReferenceWidthMm
        if (!Number.isFinite(currentDotsPerMm) || !Number.isFinite(referenceDotsPerMm) || referenceDotsPerMm <= 0) {
            return baseScale
        }
        return baseScale * (currentDotsPerMm / referenceDotsPerMm)
    }
}
