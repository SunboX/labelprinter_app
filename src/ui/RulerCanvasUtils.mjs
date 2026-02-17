import { RulerUtils } from '../RulerUtils.mjs'

/**
 * Utilities for drawing ruler canvases in the preview workspace.
 */
export class RulerCanvasUtils {
    /**
     * Draws a millimeter ruler axis into a canvas.
     * @param {HTMLCanvasElement} canvas
     * @param {number} lengthDots
     * @param {number} dpi
     * @param {'x' | 'y'} [orientation='x']
     * @param {boolean} [showUnitLabel=true]
     * @param {number} [offsetPx=0]
     * @param {number} [axisLengthPxOverride=0]
     * @param {number} [highlightLengthMm=0]
     * @param {number} [viewportShiftPx=0]
     */
    static drawRulerAxis(
        canvas,
        lengthDots,
        dpi,
        orientation = 'x',
        showUnitLabel = true,
        offsetPx = 0,
        axisLengthPxOverride = 0,
        highlightLengthMm = 0,
        viewportShiftPx = 0
    ) {
        if (!canvas || !dpi || !lengthDots) return
        const parent = canvas.parentElement
        const cssWidth = Math.max(
            1,
            Math.round(parent?.clientWidth || canvas.clientWidth || canvas.getBoundingClientRect().width || 0)
        )
        const cssHeight = Math.max(
            1,
            Math.round(parent?.clientHeight || canvas.clientHeight || canvas.getBoundingClientRect().height || 0)
        )
        if (!cssWidth || !cssHeight) return
        canvas.style.width = `${cssWidth}px`
        canvas.style.height = `${cssHeight}px`
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.max(1, Math.round(cssWidth * dpr))
        canvas.height = Math.max(1, Math.round(cssHeight * dpr))
        const ctx = canvas.getContext('2d')
        ctx.save()
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, cssWidth, cssHeight)
        const rootStyles = getComputedStyle(document.documentElement)
        const rulerBase = rootStyles.getPropertyValue('--ruler-base').trim() || '#23262f'
        ctx.fillStyle = rulerBase
        ctx.fillRect(0, 0, cssWidth, cssHeight)
        ctx.strokeStyle = '#5b606a'
        ctx.lineWidth = 1

        const dotsPerMm = dpi / 25.4
        const lengthMm = lengthDots / dotsPerMm
        const axisLengthPx = orientation === 'x' ? cssWidth : cssHeight
        const safeViewportShiftPx = Number.isFinite(viewportShiftPx) ? viewportShiftPx : 0
        // Keep ruler zoom in sync with the tape even when the tape is wider than the visible viewport.
        const scaleAxisPx = axisLengthPxOverride > 0 ? axisLengthPxOverride : axisLengthPx
        const { pixelsPerMm, startPx } = RulerUtils.computeRulerScale(lengthMm, scaleAxisPx, offsetPx)
        const { startPx: highlightStartPx, lengthPx: highlightLengthPx } = RulerUtils.computeRulerHighlight(
            startPx,
            pixelsPerMm,
            highlightLengthMm,
            axisLengthPx
        )
        if (highlightLengthPx > 0) {
            const highlightColor = rootStyles.getPropertyValue('--ruler').trim() || '#2a2f3a'
            ctx.fillStyle = highlightColor
            if (orientation === 'x') {
                ctx.fillRect(highlightStartPx - safeViewportShiftPx, 0, highlightLengthPx, cssHeight)
            } else {
                ctx.fillRect(0, highlightStartPx - safeViewportShiftPx, cssWidth, highlightLengthPx)
            }
        }

        const horizontalLabelInset = 6
        const verticalLabelInset = 6
        const tickBleedPx = 1

        for (let mm = 0; mm <= lengthMm; mm += 1) {
            const pos = startPx + mm * pixelsPerMm - safeViewportShiftPx
            if (!RulerUtils.isAxisPositionVisible(pos, axisLengthPx, tickBleedPx)) continue
            const isMajor = mm % 10 === 0
            const isMid = mm % 5 === 0
            const size = isMajor ? 14 : isMid ? 9 : 6
            ctx.beginPath()
            if (orientation === 'x') {
                ctx.moveTo(pos, 0)
                ctx.lineTo(pos, size)
            } else {
                ctx.moveTo(0, pos)
                ctx.lineTo(size, pos)
            }
            ctx.stroke()
            if (isMajor) {
                ctx.fillStyle = '#d7dbe4'
                ctx.font = '10px Barlow, sans-serif'
                if (orientation === 'x') {
                    const labelText = `${mm}`
                    const measuredLabelWidth = ctx.measureText(labelText).width
                    const labelInset = Math.max(horizontalLabelInset, Math.ceil(measuredLabelWidth / 2 + 2))
                    const labelX = RulerUtils.computeRulerLabelPosition(pos, startPx, axisLengthPx, labelInset)
                    ctx.textAlign = 'center'
                    ctx.textBaseline = 'alphabetic'
                    ctx.fillText(labelText, labelX, cssHeight - 6)
                } else {
                    const labelPos = RulerUtils.computeRulerLabelPosition(pos, startPx, axisLengthPx, verticalLabelInset)
                    ctx.save()
                    ctx.translate(cssWidth - 9, labelPos)
                    ctx.rotate(-Math.PI / 2)
                    ctx.textAlign = 'center'
                    ctx.textBaseline = 'middle'
                    ctx.fillText(`${mm}`, 0, 0)
                    ctx.restore()
                }
            }
        }

        if (showUnitLabel) {
            ctx.fillStyle = '#d7dbe4'
            ctx.font = '10px Barlow, sans-serif'
            ctx.textAlign = 'left'
            ctx.textBaseline = 'alphabetic'
            ctx.fillText('mm', 4, 12)
        }
        ctx.restore()
    }
}
