import { AiRebuildPostProcessUtils } from './AiRebuildPostProcessUtils.mjs'

/**
 * Header row fitting helpers for boxed barcode form layouts.
 */
export class AiBoxedBarcodeHeaderLayoutUtils {
    /**
     * Shrinks top-row header text sizes to fit both boxed cells.
     * @param {{
     *  rowResolution: {
     *    leftHeader: { item: Record<string, any> },
     *    rightHeader: { item: Record<string, any> }
     *  },
     *  boundsById: Map<string, { x: number, y: number, width: number, height: number }>,
     *  frame: { x: number, y: number, width: number, height: number },
     *  layoutTargets: { leftHeaderX: number, rightHeaderX: number, dividerX: number },
     *  headerCap: number
     * }} options
     * @returns {boolean}
     */
    static fitHeaderTextToCells({ rowResolution, boundsById, frame, layoutTargets, headerCap }) {
        const leftItem = rowResolution.leftHeader.item
        const rightItem = rowResolution.rightHeader.item
        const leftBounds = boundsById.get(leftItem?.id) || null
        const rightBounds = boundsById.get(rightItem?.id) || null
        if (!leftBounds || !rightBounds) return false

        const leftCellWidth = Math.max(48, layoutTargets.dividerX - layoutTargets.leftHeaderX - 8)
        const rightCellWidth = Math.max(48, frame.x + frame.width - layoutTargets.rightHeaderX - 6)
        const sharedCellWidth = Math.max(40, Math.min(leftCellWidth, rightCellWidth))
        const minHeaderSize = Math.max(6, Math.round(Number(headerCap || 16) * 0.42))
        const leftCurrentSize = Math.max(6, Math.round(Number(leftItem?.fontSize || 12)))
        const rightCurrentSize = Math.max(6, Math.round(Number(rightItem?.fontSize || 12)))
        const targetSize = Math.min(
            AiBoxedBarcodeHeaderLayoutUtils.#resolveFittedFontSize({
                currentSize: leftCurrentSize,
                currentWidth: Number(leftBounds.width || 1),
                maxWidth: sharedCellWidth,
                headerCap,
                minHeaderSize
            }),
            AiBoxedBarcodeHeaderLayoutUtils.#resolveFittedFontSize({
                currentSize: rightCurrentSize,
                currentWidth: Number(rightBounds.width || 1),
                maxWidth: sharedCellWidth,
                headerCap,
                minHeaderSize
            })
        )
        let didMutate = false
        didMutate =
            AiBoxedBarcodeHeaderLayoutUtils.#applyHeaderFontSize({
                item: leftItem,
                boundsById,
                nextSize: targetSize
            }) || didMutate
        didMutate =
            AiBoxedBarcodeHeaderLayoutUtils.#applyHeaderFontSize({
                item: rightItem,
                boundsById,
                nextSize: targetSize
            }) || didMutate
        return didMutate
    }

    /**
     * Resolves residual overlap between top-row duplicate headers.
     * @param {{
     *  rowResolution: {
     *    leftHeader: { item: Record<string, any> },
     *    rightHeader: { item: Record<string, any> }
     *  },
     *  boundsById: Map<string, { x: number, y: number, width: number, height: number }>,
     *  previewSize: { width: number, height: number },
     *  frame: { x: number, y: number, width: number, height: number },
     *  layoutTargets: { leftHeaderX: number, rightHeaderX: number, headerTopY: number },
     *  headerCap: number,
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
    static resolveTopHeaderOverlap({ rowResolution, boundsById, previewSize, frame, layoutTargets, headerCap, shiftItemToTarget }) {
        if (typeof shiftItemToTarget !== 'function') return false
        let didMutate = false
        const leftItem = rowResolution.leftHeader.item
        const rightItem = rowResolution.rightHeader.item
        const minHeaderSize = Math.max(6, Math.round(Number(headerCap || 16) * 0.42))
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const leftBounds = boundsById.get(leftItem?.id) || null
            const rightBounds = boundsById.get(rightItem?.id) || null
            if (!leftBounds || !rightBounds) break
            const overlap = AiRebuildPostProcessUtils.computeBoundsOverlap(leftBounds, rightBounds)
            if (Number(overlap.overlapX || 0) <= 0) break

            const desiredGap = 8
            const leftRight = Number(leftBounds.x || 0) + Number(leftBounds.width || 0)
            const minimumRightX = leftRight + desiredGap
            const shifted = shiftItemToTarget({
                item: rightItem,
                boundsById,
                previewSize,
                targetX: Math.max(layoutTargets.rightHeaderX, minimumRightX),
                targetY: layoutTargets.headerTopY
            })
            didMutate = shifted || didMutate

            const postShiftRightBounds = boundsById.get(rightItem?.id) || null
            if (!postShiftRightBounds) break
            const remainingOverlap = AiRebuildPostProcessUtils.computeBoundsOverlap(
                leftBounds,
                postShiftRightBounds
            )
            if (Number(remainingOverlap.overlapX || 0) <= 0) break
            const postShiftGap =
                Number(postShiftRightBounds.x || 0) -
                (Number(leftBounds.x || 0) + Number(leftBounds.width || 0))
            if (postShiftGap < desiredGap) {
                const minLeftX = frame.x + 2
                const leftShiftBudget = Math.max(0, Number(leftBounds.x || 0) - minLeftX)
                const desiredLeftShift = Math.min(leftShiftBudget, Math.round(desiredGap - postShiftGap))
                if (desiredLeftShift > 0) {
                    didMutate =
                        shiftItemToTarget({
                            item: leftItem,
                            boundsById,
                            previewSize,
                            targetX: Number(leftBounds.x || 0) - desiredLeftShift,
                            targetY: layoutTargets.headerTopY
                        }) || didMutate
                    const shiftedLeftBounds = boundsById.get(leftItem?.id) || null
                    const shiftedRightBounds = boundsById.get(rightItem?.id) || null
                    if (shiftedLeftBounds && shiftedRightBounds) {
                        const shiftedOverlap = AiRebuildPostProcessUtils.computeBoundsOverlap(
                            shiftedLeftBounds,
                            shiftedRightBounds
                        )
                        if (Number(shiftedOverlap.overlapX || 0) <= 0) break
                    }
                }
            }

            const nextSize = Math.max(
                minHeaderSize,
                Math.min(
                    Number(leftItem.fontSize || 12),
                    Number(rightItem.fontSize || 12)
                ) - 1
            )
            const leftChanged = AiBoxedBarcodeHeaderLayoutUtils.#applyHeaderFontSize({
                item: leftItem,
                boundsById,
                nextSize
            })
            const rightChanged = AiBoxedBarcodeHeaderLayoutUtils.#applyHeaderFontSize({
                item: rightItem,
                boundsById,
                nextSize
            })
            if (!leftChanged && !rightChanged) break
            didMutate = true
            const frameRight = frame.x + frame.width
            const rightBoundsNow = boundsById.get(rightItem?.id) || null
            if (!rightBoundsNow) continue
            const maxRightX = Math.max(layoutTargets.rightHeaderX, frameRight - Number(rightBoundsNow.width || 1) - 4)
            didMutate =
                shiftItemToTarget({
                    item: rightItem,
                    boundsById,
                    previewSize,
                    targetX: Math.min(Math.max(layoutTargets.rightHeaderX, minimumRightX), maxRightX),
                    targetY: layoutTargets.headerTopY
                }) || didMutate
        }
        return didMutate
    }

    /**
     * Resolves a fitted header font size from current bounds width and cell width.
     * @param {{
     *  currentSize: number,
     *  currentWidth: number,
     *  maxWidth: number,
     *  headerCap: number,
     *  minHeaderSize: number
     * }} options
     * @returns {number}
     */
    static #resolveFittedFontSize({ currentSize, currentWidth, maxWidth, headerCap, minHeaderSize }) {
        const safeCurrentSize = Math.max(6, Math.round(Number(currentSize || 12)))
        const safeCurrentWidth = Math.max(1, Number(currentWidth || 1))
        const safeMaxWidth = Math.max(24, Number(maxWidth || 24))
        const safeHeaderCap = Math.max(8, Math.round(Number(headerCap || 16)))
        const safeMin = Math.max(6, Math.round(Number(minHeaderSize || 9)))
        const fitted = safeCurrentWidth <= safeMaxWidth
            ? safeCurrentSize
            : Math.floor((safeCurrentSize * (safeMaxWidth - 2)) / safeCurrentWidth)
        return Math.max(safeMin, Math.min(safeHeaderCap, fitted))
    }

    /**
     * Applies one header font size and scales cached bounds as a predictive approximation.
     * @param {{
     *  item: Record<string, any>,
     *  boundsById: Map<string, { x: number, y: number, width: number, height: number }>,
     *  nextSize: number
     * }} options
     * @returns {boolean}
     */
    static #applyHeaderFontSize({ item, boundsById, nextSize }) {
        if (!item || item.type !== 'text') return false
        const targetSize = Math.max(6, Math.round(Number(nextSize || item.fontSize || 12)))
        const currentSize = Math.max(6, Math.round(Number(item.fontSize || 12)))
        if (currentSize === targetSize) return false
        item.fontSize = targetSize
        const bounds = boundsById.get(item.id) || null
        if (!bounds) return true
        const ratio = targetSize / currentSize
        bounds.width = Math.max(1, Number(bounds.width || 1) * ratio)
        bounds.height = Math.max(1, Number(bounds.height || 1) * ratio)
        boundsById.set(item.id, bounds)
        return true
    }
}
