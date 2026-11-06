// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import { RotationUtils } from '../RotationUtils.mjs'

/** Stable printable-area coordinates for manually placed objects. */
export class ManualLayoutUtils {
    /** Returns whether an item has a persistent top-left anchor. @param {object} item @returns {boolean} */
    static isAnchored(item) {
        return item?.positionMode === 'absolute' && item.positionAnchor === 'top-left'
    }

    /** Pins the current visible bounds without moving the object. @param {object} item @param {object} [bounds] */
    static pin(item, bounds = item?._layoutBounds) {
        if (ManualLayoutUtils.isAnchored(item) || !bounds) return
        item.positionMode = 'absolute'
        item.positionAnchor = 'top-left'
        item.xOffset = Number(bounds.x) || 0
        item.yOffset = Number(bounds.y) || 0
    }

    /** Estimates occupied bounds for automatic label length before painting. @param {object} block @returns {object} */
    static estimateBounds(block) {
        const item = block.ref
        const width =
            block.textInkWidth ||
            block.textAdvanceWidth ||
            block.shapeWidth ||
            block.imageWidth ||
            block.iconWidth ||
            block.barcodeWidth ||
            block.qrSize ||
            1
        const height =
            block.textTotalHeight ||
            block.textHeight ||
            block.shapeHeight ||
            block.imageHeight ||
            block.iconHeight ||
            block.barcodeHeight ||
            block.qrSize ||
            1
        const rotated = RotationUtils.computeRotatedBounds({ x: 0, y: 0, width, height }, item.rotation)
        return { x: Number(item.xOffset) || 0, y: Number(item.yOffset) || 0, width: rotated.width, height: rotated.height }
    }
}
