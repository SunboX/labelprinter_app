import { AiRebuildPostProcessUtils } from './AiRebuildPostProcessUtils.mjs'

/**
 * Shared geometry and diagnostics helpers for boxed barcode reconstruction.
 */
export class AiBoxedBarcodeGeometryUtils {
    /**
     * Clamps a numeric value to an inclusive range.
     * @param {number} value
     * @param {number} min
     * @param {number} max
     * @returns {number}
     */
    static clamp(value, min, max) {
        const safeMin = Number.isFinite(Number(min)) ? Number(min) : Number.NEGATIVE_INFINITY
        const safeMax = Number.isFinite(Number(max)) ? Number(max) : Number.POSITIVE_INFINITY
        const low = Math.min(safeMin, safeMax)
        const high = Math.max(safeMin, safeMax)
        return Math.max(low, Math.min(high, Number(value || 0)))
    }

    /**
     * Converts draw-space y into horizontal center-relative yOffset.
     * @param {number} drawY
     * @param {number} itemHeight
     * @param {number} previewHeight
     * @returns {number}
     */
    static toHorizontalYOffset(drawY, itemHeight, previewHeight) {
        const safePreviewHeight = Math.max(1, Number(previewHeight || 1))
        const safeItemHeight = Math.max(1, Number(itemHeight || 1))
        return Math.round(Number(drawY || 0) - (safePreviewHeight - safeItemHeight) / 2)
    }

    /**
     * Converts draw-space x into horizontal absolute xOffset.
     * @param {number} drawX
     * @param {number} [feedPadStart=2]
     * @returns {number}
     */
    static toHorizontalXOffset(drawX, feedPadStart = 2) {
        return Math.max(0, Math.round(Number(drawX || 0) - Number(feedPadStart || 0)))
    }

    /**
     * Converts horizontal center-relative yOffset back into draw-space y.
     * @param {number} yOffset
     * @param {number} itemHeight
     * @param {number} previewHeight
     * @returns {number}
     */
    static toHorizontalDrawY(yOffset, itemHeight, previewHeight) {
        const safePreviewHeight = Math.max(1, Number(previewHeight || 1))
        const safeItemHeight = Math.max(1, Number(itemHeight || 1))
        return (safePreviewHeight - safeItemHeight) / 2 + Number(yOffset || 0)
    }

    /**
     * Converts horizontal xOffset back into draw-space x.
     * @param {number} xOffset
     * @param {number} [feedPadStart=2]
     * @returns {number}
     */
    static toHorizontalDrawX(xOffset, feedPadStart = 2) {
        return Number(feedPadStart || 0) + Number(xOffset || 0)
    }

    /**
     * Resolves shape offsets from draw-space geometry in horizontal previews.
     * @param {{
     *  target: { x: number, y: number, width: number, height: number },
     *  previewSize: { width: number, height: number },
     *  isHorizontal: boolean
     * }} options
     * @returns {{ xOffset: number, yOffset: number, width: number, height: number }}
     */
    static resolveShapeOffsetsFromDrawTarget({ target, previewSize, isHorizontal }) {
        const safeWidth = Math.max(1, Math.round(Number(target?.width || 1)))
        const safeHeight = Math.max(1, Math.round(Number(target?.height || 1)))
        const drawX = Math.max(0, Math.round(Number(target?.x || 0)))
        const drawY = Math.max(0, Math.round(Number(target?.y || 0)))
        if (!isHorizontal) {
            return {
                xOffset: drawX,
                yOffset: drawY,
                width: safeWidth,
                height: safeHeight
            }
        }
        return {
            xOffset: AiBoxedBarcodeGeometryUtils.toHorizontalXOffset(drawX),
            yOffset: AiBoxedBarcodeGeometryUtils.toHorizontalYOffset(
                drawY,
                safeHeight,
                Number(previewSize?.height || 1)
            ),
            width: safeWidth,
            height: safeHeight
        }
    }

    /**
     * Builds one shape diagnostic snapshot with derived draw-space positions.
     * @param {{
     *  shape: Record<string, any>,
     *  role: string,
     *  previewSize: { width: number, height: number },
     *  isHorizontal: boolean
     * }} options
     * @returns {Record<string, any> | null}
     */
    static buildShapeDiagnostic({ shape, role, previewSize, isHorizontal }) {
        if (!shape) return null
        const width = Math.max(1, Math.round(Number(shape?.width || 1)))
        const height = Math.max(1, Math.round(Number(shape?.height || 1)))
        const xOffset = Math.round(Number(shape?.xOffset || 0))
        const yOffset = Math.round(Number(shape?.yOffset || 0))
        const drawX = isHorizontal ? AiBoxedBarcodeGeometryUtils.toHorizontalDrawX(xOffset) : xOffset
        const drawY = isHorizontal
            ? AiBoxedBarcodeGeometryUtils.toHorizontalDrawY(
                  yOffset,
                  height,
                  Number(previewSize?.height || 1)
              )
            : yOffset
        return {
            role: String(role || ''),
            id: String(shape?.id || ''),
            shapeType: String(shape?.shapeType || ''),
            xOffset,
            yOffset,
            width,
            height,
            rotation: Math.round(Number(shape?.rotation || 0)),
            drawX: Math.round(drawX),
            drawY: Math.round(drawY)
        }
    }

    /**
     * Builds debug diagnostics for boxed-form guard application.
     * @param {{
     *  rowResolution: {
     *    middleRow: { item: Record<string, any> },
     *    barcode: { item: Record<string, any> }
     *  },
     *  boundsById: Map<string, { x: number, y: number, width: number, height: number }>,
     *  layoutTargets: {
     *    headerTopY: number,
     *    headerSeparatorY: number,
     *    middleSeparatorY: number,
     *    dividerX: number,
     *    leftHeaderX: number,
     *    rightHeaderX: number,
     *    verticalLineLength: number,
     *    barcodeGap: number
     *  },
     *  structureDiagnostics: {
     *    frame: Record<string, any> | null,
     *    headerSeparator: Record<string, any> | null,
     *    middleSeparator: Record<string, any> | null,
     *    verticalDivider: Record<string, any> | null
     *  },
     *  frame: { x: number, y: number, width: number, height: number }
     * }} options
     * @returns {Record<string, any>}
     */
    static buildDiagnostics({ rowResolution, boundsById, layoutTargets, structureDiagnostics, frame }) {
        const middleBounds = boundsById.get(rowResolution.middleRow.item.id) || null
        const barcodeBounds = boundsById.get(rowResolution.barcode.item.id) || null
        const overlap = middleBounds && barcodeBounds ? AiRebuildPostProcessUtils.computeBoundsOverlap(middleBounds, barcodeBounds) : null
        const middleBottom = middleBounds ? Number(middleBounds.y || 0) + Number(middleBounds.height || 0) : null
        const barcodeTop = barcodeBounds ? Number(barcodeBounds.y || 0) : null
        const requiredGap = Math.max(4, Number(layoutTargets.barcodeGap || 6))
        const middleTextGapToBarcode = middleBottom === null || barcodeTop === null ? null : barcodeTop - middleBottom
        return {
            rowTargets: {
                frame: {
                    x: Math.round(Number(frame?.x || 0)),
                    y: Math.round(Number(frame?.y || 0)),
                    width: Math.round(Number(frame?.width || 0)),
                    height: Math.round(Number(frame?.height || 0))
                },
                headerTopY: Math.round(Number(layoutTargets.headerTopY || 0)),
                headerSeparatorY: Math.round(Number(layoutTargets.headerSeparatorY || 0)),
                middleSeparatorY: Math.round(Number(layoutTargets.middleSeparatorY || 0)),
                dividerX: Math.round(Number(layoutTargets.dividerX || 0)),
                leftHeaderX: Math.round(Number(layoutTargets.leftHeaderX || 0)),
                rightHeaderX: Math.round(Number(layoutTargets.rightHeaderX || 0)),
                verticalLineLength: Math.round(Number(layoutTargets.verticalLineLength || 0)),
                barcodeGap: requiredGap
            },
            shapeTargets: structureDiagnostics || null,
            overlapChecks: {
                middleAndBarcodeOverlap: Boolean(overlap && Number(overlap.area || 0) > 0),
                middleTextAboveBarcode: middleTextGapToBarcode === null ? null : middleTextGapToBarcode >= requiredGap,
                barcodeBelowMiddleSeparator:
                    barcodeTop === null
                        ? null
                        : barcodeTop >= Number(layoutTargets.middleSeparatorY || 0) + requiredGap,
                middleTextGapToBarcode: middleTextGapToBarcode === null ? null : Math.round(middleTextGapToBarcode)
            }
        }
    }

    /**
     * Keeps middle-row text and barcode in non-overlapping row bands.
     * @param {{
     *  rowResolution: {
     *    middleRow: { item: Record<string, any> },
     *    barcode: { item: Record<string, any> }
     *  },
     *  boundsById: Map<string, { x: number, y: number, width: number, height: number }>,
     *  previewSize: { width: number, height: number },
     *  frame: { x: number, y: number, width: number, height: number },
     *  layoutTargets: { headerSeparatorY: number, middleSeparatorY: number, barcodeGap: number },
     *  shiftItemToTarget: (options: {
     *    item: Record<string, any>,
     *    boundsById: Map<string, { x: number, y: number, width: number, height: number }>,
     *    previewSize: { width: number, height: number },
     *    targetX: number,
     *    targetY: number
     *  }) => boolean
     * }} options
     * @returns {boolean}
     */
    static enforceMiddleAndBarcodeBands({ rowResolution, boundsById, previewSize, frame, layoutTargets, shiftItemToTarget }) {
        if (typeof shiftItemToTarget !== 'function') return false
        let didMutate = false
        const middleItem = rowResolution.middleRow.item
        const barcodeItem = rowResolution.barcode.item
        const middleBounds = boundsById.get(middleItem?.id)
        const barcodeBounds = boundsById.get(barcodeItem?.id)
        const minBandGap = Math.max(4, Number(layoutTargets.barcodeGap || 6))

        if (middleBounds) {
            const minMiddleY = layoutTargets.headerSeparatorY + 3
            const maxMiddleY = Math.max(
                minMiddleY,
                layoutTargets.middleSeparatorY - Number(middleBounds.height || 0) - 2
            )
            const middleTargetY = AiBoxedBarcodeGeometryUtils.clamp(
                Number(middleBounds.y || 0),
                minMiddleY,
                maxMiddleY
            )
            didMutate =
                shiftItemToTarget({
                    item: middleItem,
                    boundsById,
                    previewSize,
                    targetX: Number(middleBounds.x || 0),
                    targetY: middleTargetY
                }) || didMutate
        }

        if (barcodeBounds) {
            const minBarcodeY = layoutTargets.middleSeparatorY + minBandGap
            const frameBottom = frame.y + frame.height
            const maxBarcodeY = Math.max(
                minBarcodeY,
                frameBottom - Number(barcodeBounds.height || 0) - 2
            )
            const barcodeTargetY = AiBoxedBarcodeGeometryUtils.clamp(
                Number(barcodeBounds.y || 0),
                minBarcodeY,
                maxBarcodeY
            )
            didMutate =
                shiftItemToTarget({
                    item: barcodeItem,
                    boundsById,
                    previewSize,
                    targetX: Number(barcodeBounds.x || 0),
                    targetY: barcodeTargetY
                }) || didMutate
        }

        const updatedMiddleBounds = boundsById.get(middleItem?.id)
        const updatedBarcodeBounds = boundsById.get(barcodeItem?.id)
        if (updatedMiddleBounds && updatedBarcodeBounds) {
            const middleBottom = Number(updatedMiddleBounds.y || 0) + Number(updatedMiddleBounds.height || 0)
            const barcodeTop = Number(updatedBarcodeBounds.y || 0)
            const requiredMiddleBottom = barcodeTop - minBandGap
            if (middleBottom > requiredMiddleBottom) {
                const middleTargetY = Math.max(
                    layoutTargets.headerSeparatorY + 3,
                    requiredMiddleBottom - Number(updatedMiddleBounds.height || 0)
                )
                didMutate =
                    shiftItemToTarget({
                        item: middleItem,
                        boundsById,
                        previewSize,
                        targetX: Number(updatedMiddleBounds.x || 0),
                        targetY: middleTargetY
                    }) || didMutate
            }
        }

        const finalMiddleBounds = boundsById.get(middleItem?.id)
        const finalBarcodeBounds = boundsById.get(barcodeItem?.id)
        if (finalMiddleBounds && finalBarcodeBounds) {
            const middleBottom = Number(finalMiddleBounds.y || 0) + Number(finalMiddleBounds.height || 0)
            const barcodeTop = Number(finalBarcodeBounds.y || 0)
            if (middleBottom + minBandGap > barcodeTop) {
                const frameBottom = frame.y + frame.height
                const barcodeHeight = Number(finalBarcodeBounds.height || 0)
                const maxByFrame = Math.max(0, frameBottom - barcodeHeight - 2)
                const maxByPreview = Math.max(0, Number(previewSize?.height || 0) - barcodeHeight)
                const maxBarcodeY = Math.min(maxByFrame, maxByPreview)
                const desiredBarcodeY = middleBottom + minBandGap
                const barcodeTargetY = AiBoxedBarcodeGeometryUtils.clamp(
                    desiredBarcodeY,
                    Number(finalBarcodeBounds.y || 0),
                    maxBarcodeY
                )
                didMutate =
                    shiftItemToTarget({
                        item: barcodeItem,
                        boundsById,
                        previewSize,
                        targetX: Number(finalBarcodeBounds.x || 0),
                        targetY: barcodeTargetY
                    }) || didMutate
            }
        }
        return didMutate
    }
}
