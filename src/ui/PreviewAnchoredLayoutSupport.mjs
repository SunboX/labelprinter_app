// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

/** Reuses each type's drawing path while anchoring its rotated visible bounds. */
export class PreviewAnchoredLayoutSupport {
    /**
     * Paints one anchored block using the same code for preview and print.
     * @param {object} renderer
     * @param {object} options
     */
    static render(renderer, options) {
        const { ctx, block, layoutItems } = options
        const item = block.ref
        const local = {
            ...options,
            block: { ...block, ref: { ...item, positionAnchor: undefined, xOffset: 0, yOffset: 0 } },
            layoutItems: []
        }
        // A transparent measurement pass includes text bearings, rotation, and true polygon bounds.
        ctx.save()
        try {
            ctx.globalAlpha = 0
            renderer._renderFlowBlock(local)
        } finally {
            ctx.restore()
        }
        const measured = local.layoutItems[0]
        if (!measured) return
        const x = Number(item.xOffset) || 0
        const y = Number(item.yOffset) || 0
        ctx.save()
        try {
            ctx.translate(x - measured.bounds.x, y - measured.bounds.y)
            local.layoutItems = []
            renderer._renderFlowBlock(local)
        } finally {
            ctx.restore()
        }
        const entry = local.layoutItems[0]
        layoutItems.push({ ...entry, item, bounds: { ...entry.bounds, x, y } })
    }
}
