// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import { RotationUtils } from './RotationUtils.mjs'

/** Geometry shared by image settings, preview, and print output. */
export class ImageDimensionUtils {
    /**
     * Fits the rotated image to the printable cross axis, preserving its aspect ratio.
     * @param {number} width
     * @param {number} height
     * @param {number} limit
     * @param {boolean} isHorizontal
     * @param {number} [rotation=0]
     * @returns {{width: number, height: number}}
     */
    static constrain(width, height, limit, isHorizontal, rotation = 0) {
        const safeWidth = Math.max(8, Number(width) || 8)
        const safeHeight = Math.max(8, Number(height) || 8)
        const bounds = RotationUtils.computeRotatedBounds({ x: 0, y: 0, width: safeWidth, height: safeHeight }, rotation)
        const crossSize = isHorizontal ? bounds.height : bounds.width
        const scale = Math.min(1, Math.max(8, limit) / crossSize)
        return { width: safeWidth * scale, height: safeHeight * scale }
    }

    /**
     * Maps the local image axes to the nearest displayed horizontal/vertical axes.
     * @param {number} rotation
     * @returns {boolean}
     */
    static swapsAxes(rotation) {
        const angle = RotationUtils.toRadians(rotation)
        return Math.abs(Math.sin(angle)) > Math.abs(Math.cos(angle))
    }

    /**
     * Changes one local dimension without shrinking the other dimension at the tape edge.
     * @param {object} item
     * @param {'width' | 'height'} key
     * @param {number} value
     * @param {number} limit
     * @param {boolean} isHorizontal
     */
    static setDimension(item, key, value, limit, isHorizontal) {
        const angle = RotationUtils.toRadians(item.rotation)
        const sin = Math.abs(Math.sin(angle))
        const cos = Math.abs(Math.cos(angle))
        const widthFactor = isHorizontal ? sin : cos
        const heightFactor = isHorizontal ? cos : sin
        const factor = key === 'width' ? widthFactor : heightFactor
        const otherKey = key === 'width' ? 'height' : 'width'
        const otherFactor = key === 'width' ? heightFactor : widthFactor
        const max = factor > 0.000001 ? (limit - item[otherKey] * otherFactor) / factor : Infinity
        item[key] = Math.max(8, Math.min(value, max))
    }
}
