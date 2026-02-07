/**
 * Shape menu interaction helpers.
 */
export class ShapeMenuUtils {
    /**
     * Determines whether an interaction happened outside the shape menu and its trigger.
     * @param {{ target?: unknown, composedPath?: () => unknown[] }} event
     * @param {{ contains?: (target: unknown) => boolean }} menu
     * @param {{ contains?: (target: unknown) => boolean }} trigger
     * @returns {boolean}
     */
    static isOutsideShapeMenuInteraction(event, menu, trigger) {
        if (!event || !menu || !trigger) return true
        // Prefer composedPath so Shadow DOM or nested nodes still count as inside.
        const path = typeof event.composedPath === 'function' ? event.composedPath() : null
        if (Array.isArray(path) && path.length) {
            if (path.includes(menu) || path.includes(trigger)) {
                return false
            }
        }
        const target = event.target
        if (target && typeof menu.contains === 'function' && menu.contains(target)) {
            return false
        }
        if (target && typeof trigger.contains === 'function' && trigger.contains(target)) {
            return false
        }
        return target !== menu && target !== trigger
    }
}
