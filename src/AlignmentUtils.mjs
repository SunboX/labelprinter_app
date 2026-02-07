/**
 * Alignment helpers for preview item positioning.
 */
export class AlignmentUtils {
    static #referenceModes = new Set(['selection', 'largest', 'smallest', 'label'])
    static #alignModes = new Set(['left', 'center', 'right', 'top', 'middle', 'bottom'])

    /**
     * Computes a bounding rectangle for a list of rectangles.
     * @param {Array<{ x: number, y: number, width: number, height: number }>} rects
     * @returns {{ x: number, y: number, width: number, height: number } | null}
     */
    static computeBoundingRect(rects) {
        const list = Array.isArray(rects) ? rects.filter((rect) => rect && rect.width > 0 && rect.height > 0) : []
        if (!list.length) return null
        let left = Number.POSITIVE_INFINITY
        let top = Number.POSITIVE_INFINITY
        let right = Number.NEGATIVE_INFINITY
        let bottom = Number.NEGATIVE_INFINITY
        list.forEach((rect) => {
            left = Math.min(left, rect.x)
            top = Math.min(top, rect.y)
            right = Math.max(right, rect.x + rect.width)
            bottom = Math.max(bottom, rect.y + rect.height)
        })
        return {
            x: left,
            y: top,
            width: Math.max(0, right - left),
            height: Math.max(0, bottom - top)
        }
    }

    /**
     * Computes the alignment reference rectangle for selected entries.
     * @param {Array<{ bounds: { x: number, y: number, width: number, height: number } }>} entries
     * @param {'selection' | 'largest' | 'smallest' | 'label'} referenceMode
     * @param {{ x: number, y: number, width: number, height: number }} labelBounds
     * @returns {{ x: number, y: number, width: number, height: number } | null}
     */
    static resolveAlignmentReferenceRect(entries, referenceMode, labelBounds) {
        const mode = AlignmentUtils.#referenceModes.has(referenceMode) ? referenceMode : 'selection'
        const safeEntries = Array.isArray(entries) ? entries.filter((entry) => entry?.bounds) : []
        if (mode === 'label') {
            const rect = labelBounds
            if (!rect || rect.width <= 0 || rect.height <= 0) return null
            return rect
        }
        if (!safeEntries.length) return null
        if (mode === 'selection') {
            return AlignmentUtils.computeBoundingRect(safeEntries.map((entry) => entry.bounds))
        }
        const sorted = [...safeEntries].sort((left, right) => {
            const leftArea = left.bounds.width * left.bounds.height
            const rightArea = right.bounds.width * right.bounds.height
            return leftArea - rightArea
        })
        const entry = mode === 'smallest' ? sorted[0] : sorted[sorted.length - 1]
        return entry?.bounds || null
    }

    /**
     * Computes the alignment delta for a bounds rectangle.
     * @param {{ x: number, y: number, width: number, height: number }} bounds
     * @param {{ x: number, y: number, width: number, height: number }} referenceRect
     * @param {'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'} alignMode
     * @returns {{ deltaX: number, deltaY: number }}
     */
    static computeAlignmentDelta(bounds, referenceRect, alignMode) {
        const mode = AlignmentUtils.#alignModes.has(alignMode) ? alignMode : 'left'
        const rect = bounds || { x: 0, y: 0, width: 0, height: 0 }
        const ref = referenceRect || { x: 0, y: 0, width: 0, height: 0 }
        if (mode === 'left') {
            return { deltaX: ref.x - rect.x, deltaY: 0 }
        }
        if (mode === 'center') {
            return {
                deltaX: ref.x + ref.width / 2 - (rect.x + rect.width / 2),
                deltaY: 0
            }
        }
        if (mode === 'right') {
            return { deltaX: ref.x + ref.width - (rect.x + rect.width), deltaY: 0 }
        }
        if (mode === 'top') {
            return { deltaX: 0, deltaY: ref.y - rect.y }
        }
        if (mode === 'middle') {
            return {
                deltaX: 0,
                deltaY: ref.y + ref.height / 2 - (rect.y + rect.height / 2)
            }
        }
        return {
            deltaX: 0,
            deltaY: ref.y + ref.height - (rect.y + rect.height)
        }
    }
}
