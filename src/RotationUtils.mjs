/**
 * Helpers for rotating preview and print items around their center point.
 */
export class RotationUtils {
    /**
     * Normalizes a degree value to the range -180..180.
     * @param {unknown} value
     * @param {number} [fallback=0]
     * @returns {number}
     */
    static normalizeDegrees(value, fallback = 0) {
        const fallbackValue = Number.isFinite(Number(fallback)) ? Number(fallback) : 0
        const rawValue = Number(value)
        if (!Number.isFinite(rawValue)) return fallbackValue
        const normalizedValue = ((rawValue % 360) + 360) % 360
        const signedValue = normalizedValue > 180 ? normalizedValue - 360 : normalizedValue
        return Math.round(signedValue * 1000) / 1000
    }

    /**
     * Returns true when a normalized angle is meaningfully non-zero.
     * @param {unknown} value
     * @param {number} [epsilon=0.0001]
     * @returns {boolean}
     */
    static hasRotation(value, epsilon = 0.0001) {
        const safeEpsilon = Math.max(0.0001, Math.abs(Number(epsilon) || 0))
        return Math.abs(RotationUtils.normalizeDegrees(value, 0)) > safeEpsilon
    }

    /**
     * Converts degrees to radians.
     * @param {number} degrees
     * @returns {number}
     */
    static toRadians(degrees) {
        return (Number(degrees) || 0) * (Math.PI / 180)
    }

    /**
     * Computes an axis-aligned bounds rectangle for a rotated rectangle.
     * @param {{ x: number, y: number, width: number, height: number }} bounds
     * @param {unknown} rotationDegrees
     * @returns {{ x: number, y: number, width: number, height: number }}
     */
    static computeRotatedBounds(bounds, rotationDegrees) {
        const safeBounds = {
            x: Number(bounds?.x) || 0,
            y: Number(bounds?.y) || 0,
            width: Math.max(1, Number(bounds?.width) || 1),
            height: Math.max(1, Number(bounds?.height) || 1)
        }
        const normalizedRotation = RotationUtils.normalizeDegrees(rotationDegrees, 0)
        if (!RotationUtils.hasRotation(normalizedRotation)) {
            return safeBounds
        }
        const radians = RotationUtils.toRadians(normalizedRotation)
        const sinValue = Math.sin(radians)
        const cosValue = Math.cos(radians)
        const centerX = safeBounds.x + safeBounds.width / 2
        const centerY = safeBounds.y + safeBounds.height / 2
        const halfWidth = safeBounds.width / 2
        const halfHeight = safeBounds.height / 2
        const corners = [
            { x: -halfWidth, y: -halfHeight },
            { x: halfWidth, y: -halfHeight },
            { x: halfWidth, y: halfHeight },
            { x: -halfWidth, y: halfHeight }
        ]
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        corners.forEach((corner) => {
            const rotatedX = centerX + corner.x * cosValue - corner.y * sinValue
            const rotatedY = centerY + corner.x * sinValue + corner.y * cosValue
            minX = Math.min(minX, rotatedX)
            minY = Math.min(minY, rotatedY)
            maxX = Math.max(maxX, rotatedX)
            maxY = Math.max(maxY, rotatedY)
        })
        return {
            x: minX,
            y: minY,
            width: Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY)
        }
    }

    /**
     * Draws content with an optional center-based rotation transform.
     * @param {CanvasRenderingContext2D} ctx
     * @param {{ x: number, y: number, width: number, height: number }} bounds
     * @param {unknown} rotationDegrees
     * @param {() => void} drawCallback
     */
    static drawWithRotation(ctx, bounds, rotationDegrees, drawCallback) {
        if (typeof drawCallback !== 'function') return
        const normalizedRotation = RotationUtils.normalizeDegrees(rotationDegrees, 0)
        if (!RotationUtils.hasRotation(normalizedRotation)) {
            drawCallback()
            return
        }
        const centerX = (Number(bounds?.x) || 0) + Math.max(1, Number(bounds?.width) || 1) / 2
        const centerY = (Number(bounds?.y) || 0) + Math.max(1, Number(bounds?.height) || 1) / 2
        ctx.save()
        try {
            ctx.translate(centerX, centerY)
            ctx.rotate(RotationUtils.toRadians(normalizedRotation))
            ctx.translate(-centerX, -centerY)
            drawCallback()
        } finally {
            ctx.restore()
        }
    }
}
