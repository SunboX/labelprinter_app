import { PreviewLayoutUtils } from '../PreviewLayoutUtils.mjs'
import { RulerUtils } from '../RulerUtils.mjs'
import { ParameterTemplateUtils } from '../ParameterTemplateUtils.mjs'
import { ImageRasterUtils } from '../ImageRasterUtils.mjs'
import { IconRasterUtils } from '../IconRasterUtils.mjs'
import { ShapeDrawUtils } from '../ShapeDrawUtils.mjs'
import { TextSizingUtils } from '../TextSizingUtils.mjs'
import { RotationUtils } from '../RotationUtils.mjs'
import { QrSizeUtils } from '../QrSizeUtils.mjs'
import { Media, Resolution } from 'labelprinterkit-web/src/index.mjs'
import { PreviewRendererCanvasSupport } from './PreviewRendererCanvasSupport.mjs'
import { PreviewRendererBase } from './PreviewRendererBase.mjs'

/**
 * Canvas construction and low-level rendering helpers for preview output.
 */
export class PreviewRendererCanvasBuild extends PreviewRendererBase {
    /**
     * Builds the preview and print canvases based on the current state.
     * @param {{ parameterValues?: Record<string, string> }} [options={}]
     * @returns {Promise<{
     *  preview: HTMLCanvasElement,
     *  printCanvas: HTMLCanvasElement,
     *  width: number,
     *  height: number,
     *  res: { dots: number[], minLength: number },
     *  printWidth: number,
     *  marginStart: number,
     *  marginEnd: number,
     *  isHorizontal: boolean,
     *  media: object
     * }>}
     */
    async buildCanvasFromState(options = {}) {
        const media = Media[this.state.media] || Media.W24
        const res = Resolution[this.state.resolution] || Resolution.LOW
        const isHorizontal = this.state.orientation === 'horizontal'
        const printWidth = media.printArea || 128
        const marginStart = media.lmargin || 0
        const marginEnd = media.rmargin || 0
        const baseDotScale = (res?.dots?.[1] || res?.dots?.[0] || 180) / 96
        // Keep text vertical sizing anchored to W9 so wider tapes (for example W24) do not inflate text height.
        const mediaCompensatedDotScale = TextSizingUtils.computeMediaCompensatedDotScale({
            resolutionDpi: res?.dots?.[1] || res?.dots?.[0] || 180,
            printAreaDots: printWidth,
            mediaWidthMm: media?.width || 9,
            referencePrintAreaDots: Media.W9?.printArea || 64,
            referenceWidthMm: Media.W9?.width || 9
        })
        // Keep text width on the feed axis unchanged across media widths while only compensating cross-axis height.
        const textVerticalScale = isHorizontal ? mediaCompensatedDotScale / baseDotScale : 1
        const textDotScale = baseDotScale
        const maxFontDots = Math.max(8, printWidth)
        const parameterValues = this._resolveParameterValues(options.parameterValues)

        const measureCtx = document.createElement('canvas').getContext('2d')
        const feedPadStart = 2 // dots of leading whitespace so print matches preview
        const feedPadEnd = 8 // trailing whitespace
        const blocks = []
        const layoutItems = []
        for (const item of this.state.items) {
            if (item.type === 'text') {
                const resolvedText = ParameterTemplateUtils.resolveTemplateString(item.text || '', parameterValues)
                const family = item.fontFamily || 'sans-serif'
                const requestedSizeDots = Math.round((item.fontSize || 16) * textDotScale)
                const {
                    size: fontSizeDots,
                    advanceWidth: textAdvanceWidth,
                    totalHeight: textTotalHeight,
                    ascent,
                    descent,
                    inkLeft,
                    inkWidth,
                    lineGap,
                    lines: textLines,
                    lineMetrics,
                    underlineOffset,
                    underlineThickness,
                    strikethroughOffset,
                    strikethroughThickness
                } = PreviewRendererCanvasSupport.resolveTextMetrics({
                    ctx: measureCtx,
                    text: resolvedText,
                    family,
                    requestedSize: requestedSizeDots,
                    maxHeight: maxFontDots,
                    bold: Boolean(item.textBold),
                    italic: Boolean(item.textItalic),
                    underline: Boolean(item.textUnderline),
                    strikethrough: Boolean(item.textStrikethrough)
                })
                const scaledAscent = ascent * textVerticalScale
                const scaledDescent = descent * textVerticalScale
                const scaledTextHeight = Math.max(1, textTotalHeight * textVerticalScale)
                // Keep base flow dimensions stable while dragging; offsets are visual translation only.
                const span = isHorizontal
                    ? Math.max(textAdvanceWidth, scaledTextHeight)
                    : Math.max(scaledTextHeight + 4, scaledTextHeight)
                blocks.push({
                    ref: item,
                    resolvedText,
                    span,
                    fontSizeDots,
                    textHeight: scaledTextHeight,
                    textAdvanceWidth,
                    textInkLeft: inkLeft,
                    textInkWidth: inkWidth,
                    family,
                    ascent: scaledAscent,
                    descent: scaledDescent,
                    textVerticalScale,
                    textLines,
                    textLineGap: lineGap,
                    textLineMetrics: lineMetrics,
                    textTotalHeight: scaledTextHeight,
                    textUnderlineOffset: underlineOffset,
                    textUnderlineThickness: underlineThickness,
                    textStrikethroughOffset: strikethroughOffset,
                    textStrikethroughThickness: strikethroughThickness
                })
                continue
            }

            if (item.type === 'shape') {
                const shapeWidth = Math.max(item.width || 120, 4)
                const shapeHeight = Math.max(item.height || 12, 2)
                // Keep base flow dimensions stable while dragging; offsets are visual translation only.
                const span = isHorizontal ? shapeWidth : Math.max(shapeHeight + 4, shapeHeight)
                blocks.push({ ref: item, span, shapeWidth, shapeHeight })
                continue
            }

            if (item.type === 'image') {
                const rawImageWidth = Math.max(8, Math.round(Number(item.width) || 80))
                const rawImageHeight = Math.max(8, Math.round(Number(item.height) || 80))
                const { width: imageWidth, height: imageHeight } = this._constrainImageDimensionsToPrintWidth(
                    rawImageWidth,
                    rawImageHeight,
                    printWidth,
                    isHorizontal
                )
                const imageCanvas = item.imageData
                    ? await this._getCachedImageCanvas(item, imageWidth, imageHeight)
                    : null
                const span = isHorizontal ? imageWidth : Math.max(imageHeight + 4, imageHeight)
                blocks.push({ ref: item, span, imageWidth, imageHeight, imageCanvas })
                continue
            }

            if (item.type === 'icon') {
                const rawIconWidth = Math.max(8, Math.round(Number(item.width) || 72))
                const rawIconHeight = Math.max(8, Math.round(Number(item.height) || 72))
                const { width: iconWidth, height: iconHeight } = this._constrainImageDimensionsToPrintWidth(
                    rawIconWidth,
                    rawIconHeight,
                    printWidth,
                    isHorizontal
                )
                const iconCanvas = await IconRasterUtils.getCachedIconCanvas({
                    item,
                    width: iconWidth,
                    height: iconHeight,
                    cache: this._imageRenderCache,
                    loadSourceImage: this._getSourceImage.bind(this)
                })
                const span = isHorizontal ? iconWidth : Math.max(iconHeight + 4, iconHeight)
                blocks.push({ ref: item, span, iconWidth, iconHeight, iconCanvas })
                continue
            }

            if (item.type === 'barcode') {
                const resolvedBarcodeData = ParameterTemplateUtils.resolveTemplateString(item.data || '', parameterValues)
                const rawBarcodeWidth = Math.max(16, Math.round(Number(item.width) || 220))
                const rawBarcodeHeight = Math.max(16, Math.round(Number(item.height) || 64))
                const { width: barcodeWidth, height: barcodeHeight } = this._constrainImageDimensionsToPrintWidth(
                    rawBarcodeWidth,
                    rawBarcodeHeight,
                    printWidth,
                    isHorizontal
                )
                const barcodeCanvas = PreviewRendererCanvasSupport.getCachedBarcodeCanvas(
                    this,
                    resolvedBarcodeData,
                    barcodeWidth,
                    barcodeHeight,
                    item
                )
                const span = isHorizontal ? barcodeWidth : Math.max(barcodeHeight + 4, barcodeHeight)
                blocks.push({ ref: item, span, barcodeWidth, barcodeHeight, barcodeCanvas })
                continue
            }

            if (item.type === 'qr') {
                const resolvedQrData = ParameterTemplateUtils.resolveTemplateString(item.data || '', parameterValues)
                const qrSize = QrSizeUtils.clampQrSizeToLabel(this.state, Number(item.size) || 1)
                const qrCanvas = await PreviewRendererCanvasSupport.getCachedQrCanvas(this, resolvedQrData, qrSize, item)
                const span = qrSize
                blocks.push({ ref: item, span, qrSize, qrCanvas })
            }
        }

        const baseTotalLength = feedPadStart + blocks.reduce((sum, block) => sum + block.span, 0) + feedPadEnd
        const contentAxisEnd = this._computeMaxFlowAxisEnd(blocks, isHorizontal, feedPadStart)
        const minLength = res.minLength
        const autoLengthDots = PreviewLayoutUtils.computeAutoLabelLengthDots(baseTotalLength, contentAxisEnd, feedPadEnd, minLength)
        const forcedLengthDots = this.state.mediaLengthMm
            ? Math.max(minLength, Math.round((this.state.mediaLengthMm / 25.4) * res.dots[1]))
            : null
        const length = forcedLengthDots ? Math.max(forcedLengthDots, autoLengthDots) : autoLengthDots
        const canvas = document.createElement('canvas')
        canvas.width = isHorizontal ? length : printWidth
        canvas.height = isHorizontal ? printWidth : length
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#000'

        let flowCursor = feedPadStart
        for (const block of blocks) {
            this._renderFlowBlock({
                ctx,
                block,
                flowCursor,
                canvas,
                isHorizontal,
                textDotScale,
                maxFontDots,
                layoutItems
            })
            flowCursor += block.span
        }

        // Preview shows only the printable area; margins are hinted in render().
        const preview = canvas
        const printCanvas = isHorizontal ? canvas : this._rotateForPrint(canvas)
        const effectiveMedia = { ...media, printArea: printWidth, lmargin: marginStart, rmargin: marginEnd }
        return {
            preview,
            printCanvas,
            width: preview.width,
            height: preview.height,
            res,
            printWidth,
            marginStart,
            marginEnd,
            isHorizontal,
            media: effectiveMedia,
            layoutItems
        }
    }

    /**
     * Renders one block on the flow axis and appends interactive bounds.
     * @param {{
     *  ctx: CanvasRenderingContext2D,
     *  block: object,
     *  flowCursor: number,
     *  canvas: HTMLCanvasElement,
     *  isHorizontal: boolean,
     *  textDotScale: number,
     *  maxFontDots: number,
     *  layoutItems: Array<object>
     * }} options
     */
    _renderFlowBlock({ ctx, block, flowCursor, canvas, isHorizontal, textDotScale, maxFontDots, layoutItems }) {
        const item = block?.ref
        if (!item) return

        if (item.type === 'text') {
            this._renderTextFlowBlock({ ctx, block, flowCursor, canvas, isHorizontal, textDotScale, maxFontDots, layoutItems })
            return
        }
        if (item.type === 'qr') {
            this._renderQrFlowBlock({ ctx, block, flowCursor, canvas, isHorizontal, layoutItems })
            return
        }
        if (item.type === 'barcode') {
            this._renderRasterFlowBlock({
                ctx,
                block,
                flowCursor,
                canvas,
                isHorizontal,
                layoutItems,
                drawCanvas: block.barcodeCanvas,
                drawWidth: Math.max(16, block.barcodeWidth || item.width || 16),
                drawHeight: Math.max(16, block.barcodeHeight || item.height || 16)
            })
            return
        }
        if (item.type === 'image') {
            this._renderRasterFlowBlock({
                ctx,
                block,
                flowCursor,
                canvas,
                isHorizontal,
                layoutItems,
                drawCanvas: block.imageCanvas,
                drawWidth: Math.max(1, block.imageWidth || item.width || 1),
                drawHeight: Math.max(1, block.imageHeight || item.height || 1)
            })
            return
        }
        if (item.type === 'icon') {
            this._renderRasterFlowBlock({
                ctx,
                block,
                flowCursor,
                canvas,
                isHorizontal,
                layoutItems,
                drawCanvas: block.iconCanvas,
                drawWidth: Math.max(1, block.iconWidth || item.width || 1),
                drawHeight: Math.max(1, block.iconHeight || item.height || 1)
            })
            return
        }
        if (item.type === 'shape') {
            this._renderShapeFlowBlock({ ctx, block, flowCursor, canvas, isHorizontal, layoutItems })
        }
    }

    /**
     * Renders one text block on the flow axis and appends interactive bounds.
     * @param {{
     *  ctx: CanvasRenderingContext2D,
     *  block: object,
     *  flowCursor: number,
     *  canvas: HTMLCanvasElement,
     *  isHorizontal: boolean,
     *  textDotScale: number,
     *  maxFontDots: number,
     *  layoutItems: Array<object>
     * }} options
     */
    _renderTextFlowBlock({ ctx, block, flowCursor, canvas, isHorizontal, textDotScale, maxFontDots, layoutItems }) {
        const item = block.ref
        const resolvedSize =
            block.fontSizeDots || Math.min(Math.max(8, Math.round((item.fontSize || 16) * textDotScale)), maxFontDots)
        ctx.font = PreviewRendererCanvasSupport.buildTextFontDeclaration({
            size: resolvedSize,
            family: block.family || item.fontFamily || 'sans-serif',
            bold: Boolean(item.textBold),
            italic: Boolean(item.textItalic)
        })
        ctx.textBaseline = 'alphabetic'
        const verticalScale = Number.isFinite(block.textVerticalScale) ? block.textVerticalScale : 1
        const underlineMetrics = PreviewRendererCanvasSupport.computeUnderlineMetrics(resolvedSize, 1)
        const underlineOffset = Math.max(1, Number(block.textUnderlineOffset || underlineMetrics.offset)) * verticalScale
        const underlineThickness = Math.max(1, Number(block.textUnderlineThickness || underlineMetrics.thickness)) * verticalScale
        const strikethroughMetrics = PreviewRendererCanvasSupport.computeStrikethroughMetrics(resolvedSize, 1)
        const strikethroughOffset =
            Math.max(1, Number(block.textStrikethroughOffset || strikethroughMetrics.offset)) * verticalScale
        const strikethroughThickness =
            Math.max(1, Number(block.textStrikethroughThickness || strikethroughMetrics.thickness)) * verticalScale
        const textLines = Array.isArray(block.textLines) && block.textLines.length ? block.textLines : [block.resolvedText || '']
        const lineMetrics = Array.isArray(block.textLineMetrics) ? block.textLineMetrics : []
        const scaledLineGap = Math.max(0, Number(block.textLineGap || 0) * verticalScale)
        const fallbackAscent = Math.max(1, Number(block.ascent || resolvedSize * verticalScale))
        const fallbackDescent = Math.max(0, Number(block.descent || 0))
        const yAdjust = item.yOffset || 0
        const drawX = this._resolveFlowDrawX(item, flowCursor, isHorizontal)

        // Preserve the previous single-line metrics/rendering path so existing text sizing snapshots stay stable.
        if (textLines.length === 1) {
            const singleLineUnderlineExtra = item.textUnderline ? underlineOffset + underlineThickness : 0
            const blockHeight = fallbackAscent + fallbackDescent + singleLineUnderlineExtra
            const baselineY = isHorizontal
                ? (canvas.height - blockHeight) / 2 + fallbackAscent + yAdjust
                : flowCursor + (block.span - blockHeight) / 2 + fallbackAscent + yAdjust
            const textMetrics = ctx.measureText(block.resolvedText || '')
            const inkLeft = Number.isFinite(textMetrics.actualBoundingBoxLeft) ? textMetrics.actualBoundingBoxLeft : 0
            const inkRight = Number.isFinite(textMetrics.actualBoundingBoxRight)
                ? textMetrics.actualBoundingBoxRight
                : textMetrics.width
            const actualAscent = Number.isFinite(textMetrics.actualBoundingBoxAscent)
                ? textMetrics.actualBoundingBoxAscent
                : fallbackAscent
            const actualDescent = Number.isFinite(textMetrics.actualBoundingBoxDescent)
                ? textMetrics.actualBoundingBoxDescent
                : fallbackDescent
            const clampedInkLeft = Math.max(0, inkLeft)
            const clampedInkRight = Math.max(clampedInkLeft, inkRight)
            const inkWidth = Math.max(1, clampedInkRight - clampedInkLeft)
            const scaledAscent = actualAscent * verticalScale
            const scaledDescent = actualDescent * verticalScale
            const underlineBoundsHeight = singleLineUnderlineExtra
            const underlineY = baselineY + underlineOffset
            const textBounds = {
                x: drawX + clampedInkLeft,
                y: baselineY - scaledAscent,
                width: inkWidth || block.textAdvanceWidth || 1,
                height: Math.max(1, scaledAscent + scaledDescent + underlineBoundsHeight)
            }
            RotationUtils.drawWithRotation(ctx, textBounds, item.rotation, () => {
                ctx.save()
                ctx.translate(drawX, baselineY)
                ctx.scale(1, verticalScale)
                ctx.fillText(block.resolvedText || '', 0, 0)
                ctx.restore()
                if (item.textUnderline) {
                    ctx.save()
                    ctx.beginPath()
                    ctx.lineWidth = underlineThickness
                    ctx.strokeStyle = '#000'
                    ctx.moveTo(drawX + clampedInkLeft, underlineY)
                    ctx.lineTo(drawX + clampedInkLeft + inkWidth, underlineY)
                    ctx.stroke()
                    ctx.restore()
                }
                if (item.textStrikethrough) {
                    const strikethroughY = baselineY - strikethroughOffset
                    ctx.save()
                    ctx.beginPath()
                    ctx.lineWidth = strikethroughThickness
                    ctx.strokeStyle = '#000'
                    ctx.moveTo(drawX + clampedInkLeft, strikethroughY)
                    ctx.lineTo(drawX + clampedInkLeft + inkWidth, strikethroughY)
                    ctx.stroke()
                    ctx.restore()
                }
            })
            layoutItems.push({
                id: item.id,
                type: item.type,
                item,
                bounds: RotationUtils.computeRotatedBounds(textBounds, item.rotation)
            })
            return
        }

        const blockHeight = Math.max(1, Number(block.textTotalHeight || fallbackAscent + fallbackDescent))
        const blockTop = isHorizontal
            ? (canvas.height - blockHeight) / 2 + yAdjust
            : flowCursor + (block.span - blockHeight) / 2 + yAdjust
        const textRenderBounds = {
            x: drawX,
            y: blockTop,
            width: Math.max(1, Number(block.textInkWidth || block.textAdvanceWidth || 1)),
            height: blockHeight
        }
        let cursorY = blockTop
        const renderedLineBounds = []
        RotationUtils.drawWithRotation(ctx, textRenderBounds, item.rotation, () => {
            textLines.forEach((line, index) => {
                const metric = lineMetrics[index]
                const lineAscent = Math.max(1, Number(metric?.ascent || fallbackAscent / Math.max(1, verticalScale)))
                const lineDescent = Math.max(0, Number(metric?.descent || fallbackDescent / Math.max(1, verticalScale)))
                const scaledAscent = lineAscent * verticalScale
                const scaledDescent = lineDescent * verticalScale
                const baselineY = cursorY + scaledAscent
                const localInkLeft = Math.max(0, Number(metric?.inkLeft || 0))
                const localInkWidth = Math.max(1, Number(metric?.inkWidth || metric?.advanceWidth || block.textAdvanceWidth || 1))
                renderedLineBounds.push({
                    x: drawX + localInkLeft,
                    y: baselineY - scaledAscent,
                    width: localInkWidth,
                    height: Math.max(1, scaledAscent + scaledDescent + (item.textUnderline ? underlineOffset + underlineThickness : 0))
                })

                ctx.save()
                ctx.translate(drawX, baselineY)
                ctx.scale(1, verticalScale)
                ctx.fillText(String(line || ''), 0, 0)
                ctx.restore()
                if (item.textUnderline) {
                    const underlineY = baselineY + underlineOffset
                    ctx.save()
                    ctx.beginPath()
                    ctx.lineWidth = underlineThickness
                    ctx.strokeStyle = '#000'
                    ctx.moveTo(drawX + localInkLeft, underlineY)
                    ctx.lineTo(drawX + localInkLeft + localInkWidth, underlineY)
                    ctx.stroke()
                    ctx.restore()
                }
                if (item.textStrikethrough) {
                    const strikethroughY = baselineY - strikethroughOffset
                    ctx.save()
                    ctx.beginPath()
                    ctx.lineWidth = strikethroughThickness
                    ctx.strokeStyle = '#000'
                    ctx.moveTo(drawX + localInkLeft, strikethroughY)
                    ctx.lineTo(drawX + localInkLeft + localInkWidth, strikethroughY)
                    ctx.stroke()
                    ctx.restore()
                }

                cursorY += scaledAscent + scaledDescent
                if (index < textLines.length - 1) {
                    cursorY += scaledLineGap
                }
            })
        })

        const textBounds = renderedLineBounds.reduce(
            (acc, entry) => {
                if (!acc) return { ...entry }
                const x = Math.min(acc.x, entry.x)
                const y = Math.min(acc.y, entry.y)
                const right = Math.max(acc.x + acc.width, entry.x + entry.width)
                const bottom = Math.max(acc.y + acc.height, entry.y + entry.height)
                return {
                    x,
                    y,
                    width: Math.max(1, right - x),
                    height: Math.max(1, bottom - y)
                }
            },
            null
        ) || {
            x: drawX,
            y: blockTop,
            width: Math.max(1, Number(block.textInkWidth || block.textAdvanceWidth || 1)),
            height: blockHeight
        }

        layoutItems.push({
            id: item.id,
            type: item.type,
            item,
            bounds: RotationUtils.computeRotatedBounds(textBounds, item.rotation)
        })
    }

    /**
     * Renders one QR block on the flow axis and appends interactive bounds.
     * @param {{
     *  ctx: CanvasRenderingContext2D,
     *  block: object,
     *  flowCursor: number,
     *  canvas: HTMLCanvasElement,
     *  isHorizontal: boolean,
     *  layoutItems: Array<object>
     * }} options
     */
    _renderQrFlowBlock({ ctx, block, flowCursor, canvas, isHorizontal, layoutItems }) {
        const item = block.ref
        const drawSize = Math.max(1, block.qrSize || item.size || 1)
        const drawX = this._resolveFlowDrawX(item, flowCursor, isHorizontal)
        const drawY = this._resolveCenteredFlowDrawY({
            flowCursor,
            span: block.span,
            drawHeight: drawSize,
            canvasHeight: canvas.height,
            yAdjust: item.yOffset || 0,
            isHorizontal
        })
        const qrBounds = { x: drawX, y: drawY, width: drawSize, height: drawSize }
        RotationUtils.drawWithRotation(ctx, qrBounds, item.rotation, () => {
            ctx.drawImage(block.qrCanvas, drawX, drawY, drawSize, drawSize)
        })
        layoutItems.push({
            id: item.id,
            type: item.type,
            item,
            bounds: RotationUtils.computeRotatedBounds(qrBounds, item.rotation)
        })
    }

    /**
     * Renders one raster block (barcode/image/icon) on the flow axis and appends bounds.
     * @param {{
     *  ctx: CanvasRenderingContext2D,
     *  block: object,
     *  flowCursor: number,
     *  canvas: HTMLCanvasElement,
     *  isHorizontal: boolean,
     *  layoutItems: Array<object>,
     *  drawCanvas: HTMLCanvasElement | null,
     *  drawWidth: number,
     *  drawHeight: number
     * }} options
     */
    _renderRasterFlowBlock({ ctx, block, flowCursor, canvas, isHorizontal, layoutItems, drawCanvas, drawWidth, drawHeight }) {
        const item = block.ref
        const safeWidth = Math.max(1, drawWidth)
        const safeHeight = Math.max(1, drawHeight)
        const drawX = this._resolveFlowDrawX(item, flowCursor, isHorizontal)
        const drawY = this._resolveCenteredFlowDrawY({
            flowCursor,
            span: block.span,
            drawHeight: safeHeight,
            canvasHeight: canvas.height,
            yAdjust: item.yOffset || 0,
            isHorizontal
        })
        const bounds = { x: drawX, y: drawY, width: safeWidth, height: safeHeight }
        if (drawCanvas) {
            RotationUtils.drawWithRotation(ctx, bounds, item.rotation, () => {
                ctx.drawImage(drawCanvas, drawX, drawY, safeWidth, safeHeight)
            })
        }
        layoutItems.push({
            id: item.id,
            type: item.type,
            item,
            bounds: RotationUtils.computeRotatedBounds(bounds, item.rotation)
        })
    }

    /**
     * Renders one shape block on the flow axis and appends interactive bounds.
     * @param {{
     *  ctx: CanvasRenderingContext2D,
     *  block: object,
     *  flowCursor: number,
     *  canvas: HTMLCanvasElement,
     *  isHorizontal: boolean,
     *  layoutItems: Array<object>
     * }} options
     */
    _renderShapeFlowBlock({ ctx, block, flowCursor, canvas, isHorizontal, layoutItems }) {
        const item = block.ref
        const shapeWidth = Math.max(1, block.shapeWidth || item.width || 1)
        const shapeHeight = Math.max(1, block.shapeHeight || item.height || 1)
        const drawX = isHorizontal
            ? this._resolveFlowDrawX(item, flowCursor, isHorizontal)
            : Math.max(0, (canvas.width - shapeWidth) / 2 + (item.xOffset || 0))
        const drawY = this._resolveCenteredFlowDrawY({
            flowCursor,
            span: block.span,
            drawHeight: shapeHeight,
            canvasHeight: canvas.height,
            yAdjust: item.yOffset || 0,
            isHorizontal
        })
        const shapeBounds = { x: drawX, y: drawY, width: shapeWidth, height: shapeHeight }
        RotationUtils.drawWithRotation(ctx, shapeBounds, item.rotation, () => {
            ShapeDrawUtils.drawShape(ctx, item, drawX, drawY, shapeWidth, shapeHeight)
        })
        const interactionBounds = ShapeDrawUtils.computeInteractionBounds(item, drawX, drawY, shapeWidth, shapeHeight)
        layoutItems.push({
            id: item.id,
            type: item.type,
            item,
            bounds: RotationUtils.computeRotatedBounds(interactionBounds, item.rotation)
        })
    }

    /**
     * Resolves X position for flow items by orientation.
     * @param {object} item
     * @param {number} flowCursor
     * @param {boolean} isHorizontal
     * @returns {number}
     */
    _resolveFlowDrawX(item, flowCursor, isHorizontal) {
        return isHorizontal ? (item.xOffset || 0) + flowCursor : item.xOffset || 0
    }

    /**
     * Resolves centered Y position for flow items by orientation.
     * @param {{
     *  flowCursor: number,
     *  span: number,
     *  drawHeight: number,
     *  canvasHeight: number,
     *  yAdjust: number,
     *  isHorizontal: boolean
     * }} options
     * @returns {number}
     */
    _resolveCenteredFlowDrawY({ flowCursor, span, drawHeight, canvasHeight, yAdjust, isHorizontal }) {
        if (isHorizontal) {
            return Math.max(0, (canvasHeight - drawHeight) / 2 + yAdjust)
        }
        return flowCursor + Math.max(0, (span - drawHeight) / 2 + yAdjust)
    }

    /**
     * Constrains image dimensions to the printable cross-axis width.
     * Horizontal layout constrains image height, vertical layout constrains image width.
     * @param {number} width
     * @param {number} height
     * @param {number} printWidth
     * @param {boolean} isHorizontal
     * @returns {{ width: number, height: number }}
     */
    _constrainImageDimensionsToPrintWidth(width, height, printWidth, isHorizontal) {
        const safeWidth = Math.max(8, Math.round(Number(width) || 8))
        const safeHeight = Math.max(8, Math.round(Number(height) || 8))
        const crossAxisLimit = Math.max(8, Math.round(Number(printWidth) || 8))
        if (isHorizontal && safeHeight > crossAxisLimit) {
            const scale = crossAxisLimit / safeHeight
            return {
                width: Math.max(8, Math.round(safeWidth * scale)),
                height: crossAxisLimit
            }
        }
        if (!isHorizontal && safeWidth > crossAxisLimit) {
            const scale = crossAxisLimit / safeWidth
            return {
                width: crossAxisLimit,
                height: Math.max(8, Math.round(safeHeight * scale))
            }
        }
        return { width: safeWidth, height: safeHeight }
    }

    /**
     * Estimates the farthest occupied position on the flow axis.
     * @param {Array<{
     *  ref: object,
     *  span: number,
     *  textAdvanceWidth?: number,
     *  textInkLeft?: number,
     *  textInkWidth?: number,
     *  ascent?: number,
     *  descent?: number,
     *  fontSizeDots?: number,
     *  shapeWidth?: number,
     *  shapeHeight?: number,
     *  imageWidth?: number,
     *  imageHeight?: number,
     *  iconWidth?: number,
     *  iconHeight?: number,
     *  barcodeWidth?: number,
     *  barcodeHeight?: number,
     *  qrSize?: number
     * }>} blocks
     * @param {boolean} isHorizontal
     * @param {number} feedPadStart
     * @returns {number}
     */
    _computeMaxFlowAxisEnd(blocks, isHorizontal, feedPadStart) {
        let cursor = Math.max(0, feedPadStart || 0)
        let maxEnd = cursor
        blocks.forEach((block) => {
            const item = block.ref || {}
            if (isHorizontal) {
                let start = cursor
                let size = Math.max(1, block.span || 1)
                let crossSize = Math.max(
                    1,
                    block.shapeHeight || block.imageHeight || block.iconHeight || block.barcodeHeight || block.qrSize || 1
                )
                if (item.type === 'text') {
                    const inkLeft = Math.max(0, block.textInkLeft || 0)
                    const inkWidth = Math.max(1, block.textInkWidth || block.textAdvanceWidth || 1)
                    const textHeight = Math.max(
                        1,
                        block.textTotalHeight || (block.ascent || block.fontSizeDots || 0) + (block.descent || 0)
                    )
                    start = cursor + (item.xOffset || 0) + inkLeft
                    size = inkWidth
                    crossSize = textHeight
                } else if (item.type === 'shape') {
                    start = cursor + (item.xOffset || 0)
                    size = Math.max(1, block.shapeWidth || item.width || 1)
                    crossSize = Math.max(1, block.shapeHeight || item.height || 1)
                } else if (item.type === 'image') {
                    start = cursor + (item.xOffset || 0)
                    size = Math.max(1, block.imageWidth || item.width || 1)
                    crossSize = Math.max(1, block.imageHeight || item.height || 1)
                } else if (item.type === 'icon') {
                    start = cursor + (item.xOffset || 0)
                    size = Math.max(1, block.iconWidth || item.width || 1)
                    crossSize = Math.max(1, block.iconHeight || item.height || 1)
                } else if (item.type === 'barcode') {
                    start = cursor + (item.xOffset || 0)
                    size = Math.max(1, block.barcodeWidth || item.width || 1)
                    crossSize = Math.max(1, block.barcodeHeight || item.height || 1)
                } else if (item.type === 'qr') {
                    start = cursor + (item.xOffset || 0)
                    size = Math.max(1, block.qrSize || item.size || 1)
                    crossSize = size
                }
                const rotatedBounds = RotationUtils.computeRotatedBounds(
                    { x: start, y: 0, width: size, height: crossSize },
                    item.rotation
                )
                maxEnd = Math.max(maxEnd, rotatedBounds.x + rotatedBounds.width)
            } else {
                let start = cursor
                let size = Math.max(1, block.span || 1)
                let crossSize = Math.max(
                    1,
                    block.shapeWidth || block.imageWidth || block.iconWidth || block.barcodeWidth || block.qrSize || 1
                )
                const yAdjust = item.yOffset || 0
                if (item.type === 'text') {
                    const textHeight = Math.max(
                        1,
                        block.textTotalHeight || (block.ascent || block.fontSizeDots || 0) + (block.descent || 0)
                    )
                    const textWidth = Math.max(1, block.textInkWidth || block.textAdvanceWidth || 1)
                    start = cursor + (Math.max(0, (block.span || textHeight) - textHeight) / 2 + yAdjust)
                    size = textHeight
                    crossSize = textWidth
                } else if (item.type === 'shape') {
                    const shapeHeight = Math.max(1, block.shapeHeight || item.height || 1)
                    start = cursor + Math.max(0, ((block.span || shapeHeight) - shapeHeight) / 2 + yAdjust)
                    size = shapeHeight
                    crossSize = Math.max(1, block.shapeWidth || item.width || 1)
                } else if (item.type === 'image') {
                    const imageHeight = Math.max(1, block.imageHeight || item.height || 1)
                    start = cursor + Math.max(0, ((block.span || imageHeight) - imageHeight) / 2 + yAdjust)
                    size = imageHeight
                    crossSize = Math.max(1, block.imageWidth || item.width || 1)
                } else if (item.type === 'icon') {
                    const iconHeight = Math.max(1, block.iconHeight || item.height || 1)
                    start = cursor + Math.max(0, ((block.span || iconHeight) - iconHeight) / 2 + yAdjust)
                    size = iconHeight
                    crossSize = Math.max(1, block.iconWidth || item.width || 1)
                } else if (item.type === 'barcode') {
                    const barcodeHeight = Math.max(1, block.barcodeHeight || item.height || 1)
                    start = cursor + Math.max(0, ((block.span || barcodeHeight) - barcodeHeight) / 2 + yAdjust)
                    size = barcodeHeight
                    crossSize = Math.max(1, block.barcodeWidth || item.width || 1)
                } else if (item.type === 'qr') {
                    const qrSize = Math.max(1, block.qrSize || item.size || 1)
                    start = cursor + Math.max(0, ((block.span || qrSize) - qrSize) / 2 + yAdjust)
                    size = qrSize
                    crossSize = qrSize
                }
                const rotatedBounds = RotationUtils.computeRotatedBounds(
                    { x: 0, y: start, width: crossSize, height: size },
                    item.rotation
                )
                maxEnd = Math.max(maxEnd, rotatedBounds.y + rotatedBounds.height)
            }
            cursor += Math.max(0, block.span || 0)
        })
        return maxEnd
    }

    /**
     * Returns a cached monochrome image canvas or generates one.
     * @param {object} item
     * @param {number} width
     * @param {number} height
     * @returns {Promise<HTMLCanvasElement | null>}
     */
    async _getCachedImageCanvas(item, width, height) {
        const imageData = String(item?.imageData || '')
        if (!imageData) return null
        const safeWidth = Math.max(1, Math.round(Number(width) || 1))
        const safeHeight = Math.max(1, Math.round(Number(height) || 1))
        const normalizedOptions = ImageRasterUtils.normalizeItemOptions(item)
        const cacheKey = this._buildImageCacheKey(imageData, safeWidth, safeHeight, normalizedOptions)
        if (this._imageRenderCache.has(cacheKey)) {
            const cached = this._imageRenderCache.get(cacheKey)
            this._imageRenderCache.delete(cacheKey)
            this._imageRenderCache.set(cacheKey, cached)
            return cached
        }
        const sourceImage = await this._getSourceImage(imageData)
        if (!sourceImage) return null
        const canvas = this._buildMonochromeImageCanvas(sourceImage, safeWidth, safeHeight, normalizedOptions)
        this._imageRenderCache.set(cacheKey, canvas)
        const maxEntries = 96
        if (this._imageRenderCache.size > maxEntries) {
            const oldestKey = this._imageRenderCache.keys().next().value
            if (oldestKey) {
                this._imageRenderCache.delete(oldestKey)
            }
        }
        return canvas
    }

    /**
     * Builds a stable cache key for rendered image variants.
     * @param {string} imageData
     * @param {number} width
     * @param {number} height
     * @param {{ imageDither: string, imageThreshold: number, imageSmoothing: string, imageInvert: boolean }} options
     * @returns {string}
     */
    _buildImageCacheKey(imageData, width, height, options) {
        const sourceHash = this._hashString(imageData)
        return `${sourceHash}:${width}x${height}:${options.imageDither}:${options.imageThreshold}:${options.imageSmoothing}:${options.imageInvert ? 1 : 0}`
    }

    /**
     * Computes a small non-cryptographic hash for cache keys.
     * @param {string} value
     * @returns {string}
     */
    _hashString(value) {
        let hash = 2166136261
        for (let i = 0; i < value.length; i += 1) {
            hash ^= value.charCodeAt(i)
            hash = Math.imul(hash, 16777619)
        }
        return (hash >>> 0).toString(16)
    }

    /**
     * Loads and caches image elements by source data URL.
     * @param {string} imageData
     * @returns {Promise<HTMLImageElement | null>}
     */
    async _getSourceImage(imageData) {
        if (!imageData) return null
        if (this._sourceImageCache.has(imageData)) {
            return this._sourceImageCache.get(imageData)
        }
        const imageElement = await this._loadImageElement(imageData)
        if (!imageElement) return null
        this._sourceImageCache.set(imageData, imageElement)
        const maxEntries = 32
        if (this._sourceImageCache.size > maxEntries) {
            const oldestKey = this._sourceImageCache.keys().next().value
            if (oldestKey) {
                this._sourceImageCache.delete(oldestKey)
            }
        }
        return imageElement
    }

    /**
     * Creates and decodes an HTML image element.
     * @param {string} imageData
     * @returns {Promise<HTMLImageElement | null>}
     */
    async _loadImageElement(imageData) {
        return new Promise((resolve) => {
            const imageElement = new Image()
            imageElement.onload = () => resolve(imageElement)
            imageElement.onerror = () => resolve(null)
            imageElement.src = imageData
        })
    }

    /**
     * Builds a monochrome image canvas from source pixels.
     * @param {CanvasImageSource} sourceImage
     * @param {number} width
     * @param {number} height
     * @param {{ imageDither: string, imageThreshold: number, imageSmoothing: string, imageInvert: boolean }} options
     * @returns {HTMLCanvasElement}
     */
    _buildMonochromeImageCanvas(sourceImage, width, height, options) {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, width, height)
        const smoothingMode = options.imageSmoothing
        ctx.imageSmoothingEnabled = smoothingMode !== 'off'
        if (ctx.imageSmoothingEnabled && 'imageSmoothingQuality' in ctx) {
            ctx.imageSmoothingQuality = smoothingMode === 'high' ? 'high' : smoothingMode === 'low' ? 'low' : 'medium'
        }
        ctx.drawImage(sourceImage, 0, 0, width, height)
        const imageData = ctx.getImageData(0, 0, width, height)
        const monochromePixels = ImageRasterUtils.convertRgbaToMonochrome(imageData.data, width, height, options)
        imageData.data.set(monochromePixels)
        ctx.putImageData(imageData, 0, 0)
        return canvas
    }

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
    _drawRulerAxis(
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

    /**
     * Rotates a canvas so the print head width matches the expected orientation.
     * @param {HTMLCanvasElement} canvas
     * @returns {HTMLCanvasElement}
     */
    _rotateForPrint(canvas) {
        const rotated = document.createElement('canvas')
        rotated.width = canvas.height
        rotated.height = canvas.width
        const ctx = rotated.getContext('2d')
        // Rotate so the canvas height matches the print head width expected by Label/Job.
        ctx.translate(rotated.width, 0)
        ctx.rotate(Math.PI / 2)
        ctx.drawImage(canvas, 0, 0)
        return rotated
    }
}
