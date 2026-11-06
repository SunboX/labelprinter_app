// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import { AlignmentUtils } from '../AlignmentUtils.mjs'
import { Media, Resolution } from 'labelprinterkit-web/src/index.mjs'
import { QrSizeUtils } from '../QrSizeUtils.mjs'
import { ManualLayoutUtils } from './ManualLayoutUtils.mjs'

/** Applies one proportional transform to a stable snapshot of a selection. */
export class SelectionTransformUtils {
    /** Captures actual visible bounds and pins each selected object. @param {object[]} entries @returns {object} */
    static snapshot(entries) {
        const bounds = AlignmentUtils.computeBoundingRect(entries.map((entry) => entry.bounds))
        const members = entries.map((entry) => {
            ManualLayoutUtils.pin(entry.item, entry.bounds)
            const original = { ...entry.item }
            if (original.type === 'text' && original._renderedFontSize > 0) original.fontSize = original._renderedFontSize
            return { item: entry.item, original, bounds: { ...entry.bounds } }
        })
        return { bounds, members }
    }

    /**
     * Computes common scale limits so no member is individually distorted at a size limit.
     * @param {object} snapshot
     * @param {object} state
     * @param {object} edges
     * @returns {{min: number, max: number}}
     */
    static limits(snapshot, state, edges) {
        let min = 0.001
        let max = Infinity
        const padding = snapshot.members.some(({ original }) => ['image', 'icon', 'barcode'].includes(original.type)) ? 4 : 0
        const printArea = (Media[state.media] || Media.W24).printArea - padding
        const horizontal = state.orientation === 'horizontal'
        const crossStart = horizontal ? snapshot.bounds.y : snapshot.bounds.x
        const crossSize = horizontal ? snapshot.bounds.height : snapshot.bounds.width
        const reverse = horizontal ? edges.top : edges.left
        const crossMax = reverse ? (crossStart + crossSize) / crossSize : (printArea - crossStart) / crossSize
        max = Math.min(max, Math.max(1, crossMax))
        for (const { original: item } of snapshot.members) {
            if (item.type === 'text') {
                const dotScale = (Resolution[state.resolution] || Resolution.LOW).dots[1] / 96
                min = Math.max(min, 4 / ((item.fontSize || 16) * dotScale))
                max = Math.min(max, Math.max(1, 64 / (item.fontSize || 16)))
                if (item._textScaleLimit > 0) max = Math.min(max, Math.max(1, item._textScaleLimit))
            } else if (item.type === 'qr') {
                min = Math.max(min, 1 / item.size)
                max = Math.min(max, Math.max(1, QrSizeUtils.computeMaxQrSizeDots(state) / item.size))
            } else {
                const minimum = item.type === 'barcode' ? 16 : ['image', 'icon'].includes(item.type) ? 8 : 2
                min = Math.max(min, (item.type === 'shape' ? 4 : minimum) / item.width, minimum / item.height)
            }
            if (item.strokeWidth > 0) min = Math.max(min, 0.1 / item.strokeWidth)
            if (item.type === 'barcode') {
                if (item.barcodeModuleWidth > 0) {
                    min = Math.max(min, 0.1 / item.barcodeModuleWidth)
                    max = Math.min(max, Math.max(1, 6 / item.barcodeModuleWidth))
                }
                if (item.barcodeMargin > 0) max = Math.min(max, Math.max(1, 30 / item.barcodeMargin))
            }
        }
        return { min, max: Math.max(min, max) }
    }

    /**
     * Scales all dimensions and relative positions about the opposite group corner.
     * @param {object} snapshot
     * @param {number} requestedScale
     * @param {object} edges
     * @param {object} state
     * @returns {number} Applied common scale.
     */
    static apply(snapshot, requestedScale, edges, state) {
        const limits = SelectionTransformUtils.limits(snapshot, state, edges)
        const scale = Math.max(limits.min, Math.min(limits.max, Number(requestedScale) || limits.min))
        const group = snapshot.bounds
        const x = group.x + (edges.left ? group.width * (1 - scale) : 0)
        const y = group.y + (edges.top ? group.height * (1 - scale) : 0)
        for (const { item, original, bounds } of snapshot.members) {
            for (const key of [
                'width',
                'height',
                'size',
                'fontSize',
                'strokeWidth',
                'cornerRadius',
                'barcodeModuleWidth',
                'barcodeMargin'
            ]) {
                if (Number.isFinite(original[key])) item[key] = original[key] * scale
            }
            item.xOffset = x + (bounds.x - group.x) * scale
            item.yOffset = y + (bounds.y - group.y) * scale
            item.positionMode = 'absolute'
            item.positionAnchor = 'top-left'
        }
        return scale
    }
}
