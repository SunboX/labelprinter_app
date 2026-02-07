/**
 * @typedef {object} HandlePosition
 * @property {string} name
 * @property {number} x
 * @property {number} y
 */

/**
 * Interaction helpers for drag, resize and multi-selection.
 */
export class InteractionUtils {
    /**
     * Computes handle positions around a rectangle.
     * @param {{ x: number, y: number, width: number, height: number }} bounds
     * @returns {HandlePosition[]}
     */
    static computeHandlePositions(bounds) {
        const { x, y, width, height } = bounds
        const midX = x + width / 2
        const midY = y + height / 2
        return [
            { name: 'nw', x, y },
            { name: 'n', x: midX, y },
            { name: 'ne', x: x + width, y },
            { name: 'e', x: x + width, y: midY },
            { name: 'se', x: x + width, y: y + height },
            { name: 's', x: midX, y: y + height },
            { name: 'sw', x, y: y + height },
            { name: 'w', x, y: midY }
        ]
    }

    /**
     * Returns the handle name at a given point.
     * @param {{ x: number, y: number }} point
     * @param {{ x: number, y: number, width: number, height: number }} bounds
     * @param {number} handleRadius
     * @returns {string | null}
     */
    static getHandleAtPoint(point, bounds, handleRadius) {
        const radius = Math.max(1, handleRadius)
        const radiusSq = radius * radius
        const handles = InteractionUtils.computeHandlePositions(bounds)
        for (const handle of handles) {
            const dx = point.x - handle.x
            const dy = point.y - handle.y
            if (dx * dx + dy * dy <= radiusSq) {
                return handle.name
            }
        }
        const insideX = point.x >= bounds.x && point.x <= bounds.x + bounds.width
        const insideY = point.y >= bounds.y && point.y <= bounds.y + bounds.height
        if (insideX && insideY) {
            return 'move'
        }
        return null
    }

    /**
     * Maps a handle name to a CSS cursor.
     * @param {string} handle
     * @returns {string}
     */
    static getCursorForHandle(handle) {
        switch (handle) {
            case 'move':
                return 'crosshair'
            case 'n':
            case 's':
                return 'ns-resize'
            case 'e':
            case 'w':
                return 'ew-resize'
            case 'ne':
            case 'sw':
                return 'nesw-resize'
            case 'nw':
            case 'se':
                return 'nwse-resize'
            default:
                return 'default'
        }
    }

    /**
     * Maps InteractJS edge flags to a handle name.
     * @param {{ left?: boolean, right?: boolean, top?: boolean, bottom?: boolean } | null | undefined} edges
     * @returns {string}
     */
    static getHandleFromEdges(edges) {
        if (!edges) return 'move'
        const vertical = edges.top ? 'n' : edges.bottom ? 's' : ''
        const horizontal = edges.left ? 'w' : edges.right ? 'e' : ''
        const handle = `${vertical}${horizontal}`
        return handle || 'move'
    }

    /**
     * Maps a handle name to InteractJS edge flags.
     * @param {string} handle
     * @returns {{ left?: boolean, right?: boolean, top?: boolean, bottom?: boolean } | null}
     */
    static getEdgesFromHandle(handle) {
        switch (handle) {
            case 'n':
                return { top: true }
            case 's':
                return { bottom: true }
            case 'e':
                return { right: true }
            case 'w':
                return { left: true }
            case 'ne':
                return { top: true, right: true }
            case 'nw':
                return { top: true, left: true }
            case 'se':
                return { bottom: true, right: true }
            case 'sw':
                return { bottom: true, left: true }
            default:
                return null
        }
    }

    /**
     * Determines whether an item type should be interactive in the preview.
     * @param {string} type
     * @returns {boolean}
     */
    static isInteractiveItemType(type) {
        return ['text', 'shape', 'qr'].includes(type)
    }

    /**
     * Detects the additive multi-select modifier state.
     * Cmd is used on macOS, Ctrl on Windows/Linux.
     * @param {{ ctrlKey?: boolean, metaKey?: boolean } | null | undefined} eventLike
     * @returns {boolean}
     */
    static isAdditiveSelectionModifier(eventLike) {
        return !!(eventLike?.ctrlKey || eventLike?.metaKey)
    }

    /**
     * Determines whether resize handles should render for the current selection size.
     * Handles are hidden for multi-selection to avoid implying single-item scaling.
     * @param {number} selectedCount
     * @returns {boolean}
     */
    static shouldRenderResizeHandles(selectedCount) {
        const safeCount = Number.isFinite(selectedCount) ? selectedCount : 0
        return safeCount <= 1
    }

    /**
     * Resolves the item ids that should move during a drag interaction.
     * If the origin item is part of the current selection, the full selection moves.
     * Otherwise, only the origin item moves.
     * @param {string} originId
     * @param {Set<string> | string[] | null | undefined} selectedIds
     * @returns {string[]}
     */
    static resolveDragItemIds(originId, selectedIds) {
        if (typeof originId !== 'string' || !originId) return []
        const selectedList = Array.isArray(selectedIds)
            ? selectedIds
            : selectedIds instanceof Set
              ? Array.from(selectedIds)
              : []
        const normalizedSelection = selectedList.filter((id) => typeof id === 'string' && id)
        if (!normalizedSelection.includes(originId)) {
            return [originId]
        }
        return [originId, ...normalizedSelection.filter((id) => id !== originId)]
    }

    /**
     * Resolves the next selection ids for a hitbox pointer interaction.
     * - Additive mode toggles the origin item.
     * - Plain click keeps an existing multi-selection when clicking a selected item.
     * - Plain click on an unselected item collapses to single selection.
     * @param {string} originId
     * @param {Set<string> | string[] | null | undefined} selectedIds
     * @param {boolean} isAdditive
     * @returns {string[]}
     */
    static resolveSelectionIds(originId, selectedIds, isAdditive) {
        if (typeof originId !== 'string' || !originId) return []
        const selectedList = Array.isArray(selectedIds)
            ? selectedIds
            : selectedIds instanceof Set
              ? Array.from(selectedIds)
              : []
        const normalizedSelection = Array.from(
            new Set(selectedList.filter((id) => typeof id === 'string' && id))
        )
        const isOriginSelected = normalizedSelection.includes(originId)
        if (isAdditive) {
            if (!isOriginSelected) {
                return [...normalizedSelection, originId]
            }
            return normalizedSelection.filter((id) => id !== originId)
        }
        if (isOriginSelected && normalizedSelection.length > 1) {
            return normalizedSelection
        }
        return [originId]
    }

    /**
     * Clamps a translation delta so bounds remain inside a container.
     * @param {{ x: number, y: number, width: number, height: number }} bounds
     * @param {{ width: number, height: number }} container
     * @param {number} dx
     * @param {number} dy
     * @returns {{ dx: number, dy: number }}
     */
    static clampTranslationDelta(bounds, container, dx, dy) {
        const minDx = -bounds.x
        const maxDx = container.width - (bounds.x + bounds.width)
        const minDy = -bounds.y
        const maxDy = container.height - (bounds.y + bounds.height)
        const clampedDx = minDx <= maxDx ? Math.max(minDx, Math.min(maxDx, dx)) : 0
        const clampedDy = minDy <= maxDy ? Math.max(minDy, Math.min(maxDy, dy)) : 0
        return { dx: clampedDx, dy: clampedDy }
    }
}
