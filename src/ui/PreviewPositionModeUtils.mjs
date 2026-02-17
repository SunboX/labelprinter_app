import { RotationUtils } from '../RotationUtils.mjs'

/**
 * Shared helpers for mixed flow/absolute feed-axis positioning.
 */
export class PreviewPositionModeUtils {
    /**
     * Normalizes a persisted item position mode.
     * @param {unknown} value
     * @returns {'flow' | 'absolute'}
     */
    static normalizeMode(value) {
        const normalized = String(value || '')
            .trim()
            .toLowerCase()
        return normalized === 'absolute' ? 'absolute' : 'flow'
    }

    /**
     * Resolves one item's active position mode.
     * @param {Record<string, any> | null | undefined} item
     * @returns {'flow' | 'absolute'}
     */
    static resolveItemMode(item) {
        return PreviewPositionModeUtils.normalizeMode(item?.positionMode)
    }

    /**
     * Returns true when the item contributes span to the flow cursor.
     * @param {Record<string, any> | null | undefined} item
     * @returns {boolean}
     */
    static shouldAdvanceFlowCursor(item) {
        return PreviewPositionModeUtils.resolveItemMode(item) === 'flow'
    }

    /**
     * Resolves feed-axis draw start for one item in mixed mode.
     * @param {{
     *  item: Record<string, any> | null | undefined,
     *  flowCursor: number,
     *  feedPadStart?: number,
     *  isHorizontal: boolean,
     *  span?: number,
     *  drawSpan?: number,
     *  feedOffset?: number,
     *  centerInFlowSpan?: boolean
     * }} options
     * @returns {number}
     */
    static resolveFeedAxisStart({
        item,
        flowCursor,
        feedPadStart = 0,
        isHorizontal,
        span = 0,
        drawSpan = 1,
        feedOffset = 0,
        centerInFlowSpan = false
    }) {
        const mode = PreviewPositionModeUtils.resolveItemMode(item)
        const safeFlowCursor = Number.isFinite(Number(flowCursor)) ? Number(flowCursor) : 0
        const safeFeedPadStart = Math.max(0, Number(feedPadStart) || 0)
        const safeSpan = Math.max(0, Number(span) || 0)
        const safeDrawSpan = Math.max(1, Number(drawSpan) || 1)
        const safeFeedOffset = Number(feedOffset) || 0
        const baseAxisStart = mode === 'flow' ? safeFlowCursor : safeFeedPadStart

        if (isHorizontal) {
            return baseAxisStart + safeFeedOffset
        }

        if (mode === 'flow' && centerInFlowSpan) {
            const centeredOffset = Math.max(0, (safeSpan - safeDrawSpan) / 2 + safeFeedOffset)
            return baseAxisStart + centeredOffset
        }

        return baseAxisStart + safeFeedOffset
    }

    /**
     * Resolves feed-axis end for one draw block.
     * @param {{
     *  item: Record<string, any> | null | undefined,
     *  flowCursor: number,
     *  feedPadStart?: number,
     *  isHorizontal: boolean,
     *  span?: number,
     *  drawSpan?: number,
     *  feedOffset?: number,
     *  centerInFlowSpan?: boolean
     * }} options
     * @returns {number}
     */
    static resolveFeedAxisEnd(options) {
        const start = PreviewPositionModeUtils.resolveFeedAxisStart(options)
        const safeDrawSpan = Math.max(1, Number(options?.drawSpan) || 1)
        return start + safeDrawSpan
    }

    /**
     * Resolves the next feed-axis cursor in mixed mode.
     * @param {{
     *  item: Record<string, any> | null | undefined,
     *  flowCursor: number,
     *  span?: number
     * }} options
     * @returns {number}
     */
    static resolveNextFlowCursor({ item, flowCursor, span = 0 }) {
        const safeCursor = Number.isFinite(Number(flowCursor)) ? Number(flowCursor) : 0
        if (!PreviewPositionModeUtils.shouldAdvanceFlowCursor(item)) {
            return safeCursor
        }
        return safeCursor + Math.max(0, Number(span) || 0)
    }

    /**
     * Estimates the farthest occupied feed-axis position for mixed-mode blocks.
     * @param {Array<{
     *  ref: object,
     *  span: number,
     *  textAdvanceWidth?: number,
     *  textInkLeft?: number,
     *  textInkWidth?: number,
     *  ascent?: number,
     *  descent?: number,
     *  fontSizeDots?: number,
     *  shapeWidth?: number,
     *  shapeHeight?: number,
     *  imageWidth?: number,
     *  imageHeight?: number,
     *  iconWidth?: number,
     *  iconHeight?: number,
     *  barcodeWidth?: number,
     *  barcodeHeight?: number,
     *  qrSize?: number
     * }>} blocks
     * @param {boolean} isHorizontal
     * @param {number} feedPadStart
     * @returns {number}
     */
    static computeMaxFlowAxisEnd(blocks, isHorizontal, feedPadStart) {
        let cursor = Math.max(0, feedPadStart || 0)
        let maxEnd = cursor
        blocks.forEach((block) => {
            const item = block.ref || {}
            if (isHorizontal) {
                let feedOffset = Number(item.xOffset || 0)
                let size = Math.max(1, block.span || 1)
                let crossSize = Math.max(
                    1,
                    block.shapeHeight || block.imageHeight || block.iconHeight || block.barcodeHeight || block.qrSize || 1
                )
                if (item.type === 'text') {
                    const inkLeft = Math.max(0, block.textInkLeft || 0)
                    const inkWidth = Math.max(1, block.textInkWidth || block.textAdvanceWidth || 1)
                    const textHeight = Math.max(
                        1,
                        block.textTotalHeight || (block.ascent || block.fontSizeDots || 0) + (block.descent || 0)
                    )
                    feedOffset += inkLeft
                    size = inkWidth
                    crossSize = textHeight
                } else if (item.type === 'shape') {
                    size = Math.max(1, block.shapeWidth || item.width || 1)
                    crossSize = Math.max(1, block.shapeHeight || item.height || 1)
                } else if (item.type === 'image') {
                    size = Math.max(1, block.imageWidth || item.width || 1)
                    crossSize = Math.max(1, block.imageHeight || item.height || 1)
                } else if (item.type === 'icon') {
                    size = Math.max(1, block.iconWidth || item.width || 1)
                    crossSize = Math.max(1, block.iconHeight || item.height || 1)
                } else if (item.type === 'barcode') {
                    size = Math.max(1, block.barcodeWidth || item.width || 1)
                    crossSize = Math.max(1, block.barcodeHeight || item.height || 1)
                } else if (item.type === 'qr') {
                    size = Math.max(1, block.qrSize || item.size || 1)
                    crossSize = size
                }
                const start = PreviewPositionModeUtils.resolveFeedAxisStart({
                    item,
                    flowCursor: cursor,
                    feedPadStart,
                    isHorizontal: true,
                    span: block.span,
                    drawSpan: size,
                    feedOffset
                })
                maxEnd = Math.max(
                    maxEnd,
                    PreviewPositionModeUtils.resolveFeedAxisEnd({
                        item,
                        flowCursor: cursor,
                        feedPadStart,
                        isHorizontal: true,
                        span: block.span,
                        drawSpan: size,
                        feedOffset
                    })
                )
                const rotatedBounds = RotationUtils.computeRotatedBounds(
                    { x: start, y: 0, width: size, height: crossSize },
                    item.rotation
                )
                maxEnd = Math.max(maxEnd, rotatedBounds.x + rotatedBounds.width)
            } else {
                let size = Math.max(1, block.span || 1)
                let crossSize = Math.max(
                    1,
                    block.shapeWidth || block.imageWidth || block.iconWidth || block.barcodeWidth || block.qrSize || 1
                )
                const yAdjust = Number(item.yOffset || 0)
                if (item.type === 'text') {
                    const textHeight = Math.max(
                        1,
                        block.textTotalHeight || (block.ascent || block.fontSizeDots || 0) + (block.descent || 0)
                    )
                    const textWidth = Math.max(1, block.textInkWidth || block.textAdvanceWidth || 1)
                    size = textHeight
                    crossSize = textWidth
                } else if (item.type === 'shape') {
                    const shapeHeight = Math.max(1, block.shapeHeight || item.height || 1)
                    size = shapeHeight
                    crossSize = Math.max(1, block.shapeWidth || item.width || 1)
                } else if (item.type === 'image') {
                    const imageHeight = Math.max(1, block.imageHeight || item.height || 1)
                    size = imageHeight
                    crossSize = Math.max(1, block.imageWidth || item.width || 1)
                } else if (item.type === 'icon') {
                    const iconHeight = Math.max(1, block.iconHeight || item.height || 1)
                    size = iconHeight
                    crossSize = Math.max(1, block.iconWidth || item.width || 1)
                } else if (item.type === 'barcode') {
                    const barcodeHeight = Math.max(1, block.barcodeHeight || item.height || 1)
                    size = barcodeHeight
                    crossSize = Math.max(1, block.barcodeWidth || item.width || 1)
                } else if (item.type === 'qr') {
                    const qrSize = Math.max(1, block.qrSize || item.size || 1)
                    size = qrSize
                    crossSize = qrSize
                }
                const start = PreviewPositionModeUtils.resolveFeedAxisStart({
                    item,
                    flowCursor: cursor,
                    feedPadStart,
                    isHorizontal: false,
                    span: block.span,
                    drawSpan: size,
                    feedOffset: yAdjust,
                    centerInFlowSpan: true
                })
                maxEnd = Math.max(
                    maxEnd,
                    PreviewPositionModeUtils.resolveFeedAxisEnd({
                        item,
                        flowCursor: cursor,
                        feedPadStart,
                        isHorizontal: false,
                        span: block.span,
                        drawSpan: size,
                        feedOffset: yAdjust,
                        centerInFlowSpan: true
                    })
                )
                const rotatedBounds = RotationUtils.computeRotatedBounds(
                    { x: 0, y: start, width: crossSize, height: size },
                    item.rotation
                )
                maxEnd = Math.max(maxEnd, rotatedBounds.y + rotatedBounds.height)
            }
            cursor = PreviewPositionModeUtils.resolveNextFlowCursor({
                item,
                flowCursor: cursor,
                span: block.span
            })
        })
        return maxEnd
    }
}
