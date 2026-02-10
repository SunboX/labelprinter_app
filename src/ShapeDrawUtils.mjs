/**
 * Canvas helpers for drawing vector form primitives.
 */
export class ShapeDrawUtils {
    /**
     * Computes the interactive bounds for a rendered shape.
     * Most shapes fill the provided rect; polygon uses its true drawn path bounds.
     * @param {object} item
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     * @returns {{ x: number, y: number, width: number, height: number }}
     */
    static computeInteractionBounds(item, x, y, width, height) {
        const type = item?.shapeType || 'rect'
        const strokePadding = Math.max(0, (Math.max(1, item?.strokeWidth || 2) || 1) / 2)
        if (type !== 'polygon') {
            return { x, y, width, height }
        }
        const sides = Math.max(3, Math.min(24, Math.floor(item?.sides || 6)))
        const points = ShapeDrawUtils.#computePolygonPoints(x, y, width, height, sides)
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        points.forEach((point) => {
            minX = Math.min(minX, point.x)
            minY = Math.min(minY, point.y)
            maxX = Math.max(maxX, point.x)
            maxY = Math.max(maxY, point.y)
        })
        if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
            return { x, y, width, height }
        }
        return {
            x: minX - strokePadding,
            y: minY - strokePadding,
            width: Math.max(1, maxX - minX + strokePadding * 2),
            height: Math.max(1, maxY - minY + strokePadding * 2)
        }
    }

    /**
     * Draws a supported shape type onto a 2D canvas context.
     * @param {CanvasRenderingContext2D} ctx
     * @param {object} item
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    static drawShape(ctx, item, x, y, width, height) {
        const type = item.shapeType || 'rect'
        const lw = Math.max(1, item.strokeWidth || 2)
        ctx.save()
        ctx.lineWidth = lw
        ctx.strokeStyle = '#000'
        ctx.beginPath()
        if (type === 'rect') {
            ctx.strokeRect(x, y, width, height)
        } else if (type === 'roundRect') {
            const r = Math.min(item.cornerRadius || 8, width / 2, height / 2)
            ctx.beginPath()
            ctx.moveTo(x + r, y)
            ctx.lineTo(x + width - r, y)
            ctx.quadraticCurveTo(x + width, y, x + width, y + r)
            ctx.lineTo(x + width, y + height - r)
            ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
            ctx.lineTo(x + r, y + height)
            ctx.quadraticCurveTo(x, y + height, x, y + height - r)
            ctx.lineTo(x, y + r)
            ctx.quadraticCurveTo(x, y, x + r, y)
            ctx.stroke()
        } else if (type === 'oval') {
            ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
            ctx.stroke()
        } else if (type === 'polygon') {
            const sides = Math.max(3, Math.min(24, Math.floor(item.sides || 6)))
            const points = ShapeDrawUtils.#computePolygonPoints(x, y, width, height, sides)
            points.forEach((point, index) => {
                if (index === 0) ctx.moveTo(point.x, point.y)
                else ctx.lineTo(point.x, point.y)
            })
            ctx.closePath()
            ctx.stroke()
        } else if (type === 'triangle') {
            ctx.moveTo(x + width / 2, y)
            ctx.lineTo(x + width, y + height)
            ctx.lineTo(x, y + height)
            ctx.closePath()
            ctx.stroke()
        } else if (type === 'diamond') {
            ctx.moveTo(x + width / 2, y)
            ctx.lineTo(x + width, y + height / 2)
            ctx.lineTo(x + width / 2, y + height)
            ctx.lineTo(x, y + height / 2)
            ctx.closePath()
            ctx.stroke()
        } else if (type === 'arrowRight') {
            const shaft = Math.max(4, Math.round(height * 0.35))
            const top = y + (height - shaft) / 2
            const bottom = top + shaft
            const head = Math.max(10, Math.round(width * 0.28))
            ctx.moveTo(x, top)
            ctx.lineTo(x + width - head, top)
            ctx.lineTo(x + width - head, y)
            ctx.lineTo(x + width, y + height / 2)
            ctx.lineTo(x + width - head, y + height)
            ctx.lineTo(x + width - head, bottom)
            ctx.lineTo(x, bottom)
            ctx.closePath()
            ctx.stroke()
        } else if (type === 'arrowLeft') {
            const shaft = Math.max(4, Math.round(height * 0.35))
            const top = y + (height - shaft) / 2
            const bottom = top + shaft
            const head = Math.max(10, Math.round(width * 0.28))
            ctx.moveTo(x + width, top)
            ctx.lineTo(x + head, top)
            ctx.lineTo(x + head, y)
            ctx.lineTo(x, y + height / 2)
            ctx.lineTo(x + head, y + height)
            ctx.lineTo(x + head, bottom)
            ctx.lineTo(x + width, bottom)
            ctx.closePath()
            ctx.stroke()
        } else if (type === 'plus') {
            const cx = x + width / 2
            const cy = y + height / 2
            ctx.moveTo(cx, y)
            ctx.lineTo(cx, y + height)
            ctx.moveTo(x, cy)
            ctx.lineTo(x + width, cy)
            ctx.stroke()
        } else if (type === 'dot') {
            const radius = Math.max(2, Math.min(width, height) / 2 - lw / 2)
            ctx.beginPath()
            ctx.arc(x + width / 2, y + height / 2, radius, 0, Math.PI * 2)
            ctx.fillStyle = '#000'
            ctx.fill()
        } else if (type === 'warningTriangle') {
            ctx.moveTo(x + width / 2, y)
            ctx.lineTo(x + width, y + height)
            ctx.lineTo(x, y + height)
            ctx.closePath()
            ctx.stroke()
            const exclamationHeight = Math.max(6, Math.round(height * 0.34))
            const exclamationTop = y + Math.max(8, Math.round(height * 0.3))
            ctx.beginPath()
            ctx.moveTo(x + width / 2, exclamationTop)
            ctx.lineTo(x + width / 2, exclamationTop + exclamationHeight)
            ctx.stroke()
            ctx.beginPath()
            ctx.arc(
                x + width / 2,
                y + height - Math.max(7, Math.round(height * 0.2)),
                Math.max(1.5, lw * 0.6),
                0,
                Math.PI * 2
            )
            ctx.fillStyle = '#000'
            ctx.fill()
        } else if (type === 'line') {
            ctx.moveTo(x, y + height / 2)
            ctx.lineTo(x + width, y + height / 2)
            ctx.stroke()
        }
        ctx.restore()
    }

    /**
     * Computes polygon points centered inside the provided rectangle.
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     * @param {number} sides
     * @returns {Array<{ x: number, y: number }>}
     */
    static #computePolygonPoints(x, y, width, height, sides) {
        const cx = x + width / 2
        const cy = y + height / 2
        const radius = Math.min(width, height) / 2
        const points = []
        for (let index = 0; index < sides; index += 1) {
            const angle = -Math.PI / 2 + (index * 2 * Math.PI) / sides
            points.push({
                x: cx + radius * Math.cos(angle),
                y: cy + radius * Math.sin(angle)
            })
        }
        return points
    }
}
