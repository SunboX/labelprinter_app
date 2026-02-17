import { AiRebuildPlacementHeuristics } from './AiRebuildPlacementHeuristics.mjs'
import { AiRebuildPostProcessUtils } from './AiRebuildPostProcessUtils.mjs'
import { AiBoxedBarcodeGeometryUtils } from './AiBoxedBarcodeGeometryUtils.mjs'
import { AiBoxedBarcodeHeaderLayoutUtils } from './AiBoxedBarcodeHeaderLayoutUtils.mjs'
import { Media } from 'labelprinterkit-web/src/index.mjs'

/**
 * Boxed barcode reconstruction helpers for table-like reference labels.
 * Applies deterministic geometry fixes only for narrow boxed-form candidates.
 */
export class AiBoxedBarcodeFormFidelityUtils {
    /**
     * Applies boxed barcode form fidelity normalization.
     * @param {{
     *  state: { media?: string, items: Array<Record<string, any>> },
     *  previewRenderer: any,
     *  renderAfterMutation: () => Promise<void>
     * }} options
     * @returns {Promise<{
     *  applied: boolean,
     *  didMutate: boolean,
     *  reason: string,
     *  diagnostics?: Record<string, any>
     * }>}
     */
    static async apply({ state, previewRenderer, renderAfterMutation }) {
        const items = Array.isArray(state?.items) ? state.items : []
        const isHorizontal = String(state?.orientation || 'horizontal')
            .trim()
            .toLowerCase() !== 'vertical'
        const candidate = AiBoxedBarcodeFormFidelityUtils.#detectCandidate(items)
        if (!candidate.matched) {
            return {
                applied: false,
                didMutate: false,
                reason: candidate.reason
            }
        }

        const boundsReady = await AiBoxedBarcodeFormFidelityUtils.#ensureBounds({
            previewRenderer,
            renderAfterMutation,
            itemCount: items.length
        })
        if (!boundsReady) {
            return {
                applied: true,
                didMutate: false,
                reason: 'boxed-barcode-skip-missing-bounds'
            }
        }

        const entryMap = previewRenderer?._interactiveItemsById
        if (!(entryMap instanceof Map)) {
            return {
                applied: true,
                didMutate: false,
                reason: 'boxed-barcode-skip-missing-entry-map'
            }
        }

        const boundsById = AiBoxedBarcodeFormFidelityUtils.#collectBoundsById(items, entryMap)
        const rowResolution = AiBoxedBarcodeFormFidelityUtils.#resolveTopAndMiddleRows(candidate, boundsById)
        if (!rowResolution) {
            return {
                applied: true,
                didMutate: false,
                reason: 'boxed-barcode-skip-missing-rows'
            }
        }

        const hasLineShapeIntent = candidate.lineShapes.length > 0
        const hasUnderlineIntent = [rowResolution.leftHeader.item, rowResolution.rightHeader.item, rowResolution.middleRow.item]
            .some((item) => Boolean(item?.textUnderline))
        if (!hasLineShapeIntent && !hasUnderlineIntent) {
            return {
                applied: true,
                didMutate: false,
                reason: 'boxed-barcode-skip-no-form-intent'
            }
        }

        const previewSize = AiRebuildPostProcessUtils.resolvePreviewSize(previewRenderer)
        const frame = AiBoxedBarcodeFormFidelityUtils.#resolveFrame({
            rowResolution,
            previewSize
        })
        if (!frame) {
            return {
                applied: true,
                didMutate: false,
                reason: 'boxed-barcode-skip-invalid-frame'
            }
        }

        const layoutTargets = AiBoxedBarcodeFormFidelityUtils.#resolveLayoutTargets({
            rowResolution,
            frame,
            previewSize
        })
        let didMutate = false
        didMutate =
            AiBoxedBarcodeFormFidelityUtils.#enforceTopRowAlignment({
                state,
                rowResolution,
                boundsById,
                previewSize,
                frame,
                layoutTargets
            }) || didMutate
        didMutate =
            AiBoxedBarcodeGeometryUtils.enforceMiddleAndBarcodeBands({
                rowResolution,
                boundsById,
                previewSize,
                frame,
                layoutTargets,
                shiftItemToTarget: (options) => AiBoxedBarcodeFormFidelityUtils.#shiftItemToTarget(options)
            }) || didMutate
        didMutate =
            AiBoxedBarcodeFormFidelityUtils.#clearStructuralUnderlines([
                rowResolution.leftHeader.item,
                rowResolution.rightHeader.item,
                rowResolution.middleRow.item
            ]) || didMutate
        const structureResult = AiBoxedBarcodeFormFidelityUtils.#upsertStructureShapes({
            state,
            frame,
            layoutTargets,
            previewSize,
            isHorizontal
        })
        didMutate = Boolean(structureResult.didMutate) || didMutate

        const diagnostics = AiBoxedBarcodeGeometryUtils.buildDiagnostics({
            rowResolution,
            boundsById,
            layoutTargets,
            structureDiagnostics: structureResult.diagnostics,
            frame
        })

        return {
            applied: true,
            didMutate,
            reason: didMutate
                ? 'applied-boxed-barcode-form-fidelity'
                : 'boxed-barcode-form-fidelity-no-change',
            diagnostics
        }
    }

    /**
     * Detects narrow boxed-form barcode reconstruction candidates.
     * @param {Array<Record<string, any>>} items
     * @returns {{
     *  matched: boolean,
     *  reason: string,
     *  barcodeItem?: Record<string, any>,
     *  textItems?: Array<Record<string, any>>,
     *  lineShapes?: Array<Record<string, any>>,
     *  duplicateMap?: Map<string, Array<Record<string, any>>>
     * }}
     */
    static #detectCandidate(items) {
        const safeItems = Array.isArray(items) ? items : []
        const barcodeItems = safeItems.filter((item) => item?.type === 'barcode')
        const qrItems = safeItems.filter((item) => item?.type === 'qr')
        const textItems = safeItems.filter((item) => item?.type === 'text')
        const lineShapes = safeItems.filter(
            (item) =>
                item?.type === 'shape' &&
                String(item?.shapeType || '')
                    .trim()
                    .toLowerCase() === 'line'
        )

        if (barcodeItems.length !== 1 || qrItems.length !== 0) {
            return { matched: false, reason: 'boxed-barcode-skip-machine-readable-mismatch' }
        }
        if (textItems.length < 3 || textItems.length > 5) {
            return { matched: false, reason: 'boxed-barcode-skip-text-count' }
        }
        if (textItems.some((item) => AiRebuildPlacementHeuristics.isQuarterTurnText(item))) {
            return { matched: false, reason: 'boxed-barcode-skip-rotated-text' }
        }

        const duplicateMap = new Map()
        textItems.forEach((item) => {
            const normalized = AiBoxedBarcodeFormFidelityUtils.#normalizeCodeLikeText(item?.text)
            if (!AiBoxedBarcodeFormFidelityUtils.#isCodeLikeToken(normalized)) return
            const group = duplicateMap.get(normalized) || []
            group.push(item)
            duplicateMap.set(normalized, group)
        })
        const hasDuplicateCodeLikeText = [...duplicateMap.values()].some((group) => group.length >= 2)
        if (!hasDuplicateCodeLikeText) {
            return { matched: false, reason: 'boxed-barcode-skip-no-duplicate-code-text' }
        }

        return {
            matched: true,
            reason: 'boxed-barcode-candidate',
            barcodeItem: barcodeItems[0],
            textItems,
            lineShapes,
            duplicateMap
        }
    }

    /**
     * Ensures interactive bounds are available with bounded render retries.
     * @param {{
     *  previewRenderer: any,
     *  renderAfterMutation: () => Promise<void>,
     *  itemCount: number
     * }} options
     * @returns {Promise<boolean>}
     */
    static async #ensureBounds({ previewRenderer, renderAfterMutation, itemCount }) {
        const maxRenderRetries = 4
        for (let attempt = 0; attempt < maxRenderRetries; attempt += 1) {
            const entryMap = previewRenderer?._interactiveItemsById
            if (entryMap instanceof Map && entryMap.size >= itemCount) return true
            await renderAfterMutation()
        }
        const finalMap = previewRenderer?._interactiveItemsById
        return finalMap instanceof Map && finalMap.size > 0
    }

    /**
     * Builds bounds snapshots by item id from renderer entries.
     * @param {Array<Record<string, any>>} items
     * @param {Map<string, { bounds?: { x: number, y: number, width: number, height: number } }>} entryMap
     * @returns {Map<string, { x: number, y: number, width: number, height: number }>}
     */
    static #collectBoundsById(items, entryMap) {
        const boundsById = new Map()
        ;(Array.isArray(items) ? items : []).forEach((item) => {
            const bounds = entryMap.get(item.id)?.bounds || null
            if (!bounds) return
            boundsById.set(item.id, {
                x: Number(bounds.x || 0),
                y: Number(bounds.y || 0),
                width: Math.max(1, Number(bounds.width || 1)),
                height: Math.max(1, Number(bounds.height || 1))
            })
        })
        return boundsById
    }

    /**
     * Resolves top duplicate header pair and middle row above the barcode.
     * @param {{
     *  barcodeItem?: Record<string, any>,
     *  textItems?: Array<Record<string, any>>,
     *  duplicateMap?: Map<string, Array<Record<string, any>>>
     * }} candidate
     * @param {Map<string, { x: number, y: number, width: number, height: number }>} boundsById
     * @returns {{
     *  leftHeader: { item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } },
     *  rightHeader: { item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } },
     *  middleRow: { item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } },
     *  barcode: { item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } }
     * } | null}
     */
    static #resolveTopAndMiddleRows(candidate, boundsById) {
        const barcodeItem = candidate?.barcodeItem || null
        const textItems = Array.isArray(candidate?.textItems) ? candidate.textItems : []
        const duplicateMap = candidate?.duplicateMap instanceof Map ? candidate.duplicateMap : new Map()
        if (!barcodeItem) return null
        const barcodeBounds = boundsById.get(barcodeItem.id)
        if (!barcodeBounds) return null

        const textEntries = textItems
            .map((item) => ({
                item,
                bounds: boundsById.get(item.id) || null
            }))
            .filter((entry) => entry.bounds)
        if (textEntries.length < 3) return null
        const barcodeTop = Number(barcodeBounds.y || 0)
        const textAboveBarcode = textEntries.filter(
            (entry) => Number(entry.bounds.y || 0) + Number(entry.bounds.height || 0) / 2 <= barcodeTop + 2
        )
        const candidateRows = textAboveBarcode.length >= 3 ? textAboveBarcode : textEntries

        let bestHeaderPair = null
        duplicateMap.forEach((group) => {
            const groupEntries = group
                .map((item) => candidateRows.find((entry) => entry.item.id === item.id) || null)
                .filter(Boolean)
                .sort((left, right) => {
                    const leftY = Number(left?.bounds?.y || 0)
                    const rightY = Number(right?.bounds?.y || 0)
                    if (leftY !== rightY) return leftY - rightY
                    return Number(left?.bounds?.x || 0) - Number(right?.bounds?.x || 0)
                })
            if (groupEntries.length < 2) return
            const pair = [groupEntries[0], groupEntries[1]].sort(
                (left, right) => Number(left.bounds.x || 0) - Number(right.bounds.x || 0)
            )
            const score = Number(pair[0].bounds.y || 0) + Number(pair[1].bounds.y || 0)
            if (!bestHeaderPair || score < bestHeaderPair.score) {
                bestHeaderPair = {
                    leftHeader: pair[0],
                    rightHeader: pair[1],
                    score
                }
            }
        })
        if (!bestHeaderPair) return null

        const middleCandidates = candidateRows
            .filter((entry) => entry.item.id !== bestHeaderPair.leftHeader.item.id)
            .filter((entry) => entry.item.id !== bestHeaderPair.rightHeader.item.id)
            .sort(
                (left, right) =>
                    Number(right.bounds.y || 0) + Number(right.bounds.height || 0) -
                    (Number(left.bounds.y || 0) + Number(left.bounds.height || 0))
            )
        const middleRow = middleCandidates[0] || null
        if (!middleRow) return null

        return {
            leftHeader: bestHeaderPair.leftHeader,
            rightHeader: bestHeaderPair.rightHeader,
            middleRow,
            barcode: {
                item: barcodeItem,
                bounds: barcodeBounds
            }
        }
    }

    /**
     * Resolves a frame box around reconstructed content.
     * @param {{
     *  rowResolution: {
     *    leftHeader: { bounds: { x: number, y: number, width: number, height: number } },
     *    rightHeader: { bounds: { x: number, y: number, width: number, height: number } },
     *    middleRow: { bounds: { x: number, y: number, width: number, height: number } },
     *    barcode: { bounds: { x: number, y: number, width: number, height: number } }
     *  },
     *  previewSize: { width: number, height: number }
     * }} options
     * @returns {{ x: number, y: number, width: number, height: number } | null}
     */
    static #resolveFrame({ rowResolution, previewSize }) {
        const contentBounds = [
            rowResolution.leftHeader.bounds,
            rowResolution.rightHeader.bounds,
            rowResolution.middleRow.bounds,
            rowResolution.barcode.bounds
        ]
        const minX = Math.min(...contentBounds.map((bounds) => Number(bounds.x || 0)))
        const minY = Math.min(...contentBounds.map((bounds) => Number(bounds.y || 0)))
        const maxX = Math.max(...contentBounds.map((bounds) => Number(bounds.x || 0) + Number(bounds.width || 0)))
        const maxY = Math.max(...contentBounds.map((bounds) => Number(bounds.y || 0) + Number(bounds.height || 0)))
        const previewWidth = Math.max(1, Number(previewSize?.width || 1))
        const previewHeight = Math.max(1, Number(previewSize?.height || 1))
        const paddingX = 6
        const paddingTop = 4
        const paddingBottom = 4
        const x = Math.max(0, Math.round(minX - paddingX))
        const y = Math.max(0, Math.round(minY - paddingTop))
        const right = Math.min(previewWidth, Math.round(maxX + paddingX))
        const bottom = Math.min(previewHeight, Math.round(maxY + paddingBottom))
        const width = Math.max(20, right - x)
        const height = Math.max(24, bottom - y)
        if (!Number.isFinite(width) || !Number.isFinite(height) || width < 20 || height < 24) return null
        return { x, y, width, height }
    }

    /**
     * Resolves structural target coordinates inside the frame.
     * @param {{
     *  rowResolution: {
     *    leftHeader: { bounds: { x: number, y: number, width: number, height: number } },
     *    rightHeader: { bounds: { x: number, y: number, width: number, height: number } },
     *    middleRow: { bounds: { x: number, y: number, width: number, height: number } },
     *    barcode: { bounds: { x: number, y: number, width: number, height: number } }
     *  },
     *  frame: { x: number, y: number, width: number, height: number },
     *  previewSize: { width: number, height: number }
     * }} options
     * @returns {{
     *  headerTopY: number,
     *  headerSeparatorY: number,
     *  middleSeparatorY: number,
     *  dividerX: number,
     *  leftHeaderX: number,
     *  rightHeaderX: number,
     *  verticalLineLength: number,
     *  barcodeGap: number
     * }}
     */
    static #resolveLayoutTargets({ rowResolution, frame, previewSize }) {
        const leftHeaderBounds = rowResolution.leftHeader.bounds
        const rightHeaderBounds = rowResolution.rightHeader.bounds
        const middleBounds = rowResolution.middleRow.bounds
        const barcodeBounds = rowResolution.barcode.bounds
        const topHeaderY = Math.min(Number(leftHeaderBounds.y || 0), Number(rightHeaderBounds.y || 0))
        const headerBottom = Math.max(
            Number(leftHeaderBounds.y || 0) + Number(leftHeaderBounds.height || 0),
            Number(rightHeaderBounds.y || 0) + Number(rightHeaderBounds.height || 0)
        )
        const headerTextHeight = Math.max(
            Number(leftHeaderBounds.height || 0),
            Number(rightHeaderBounds.height || 0)
        )
        const frameBottom = frame.y + frame.height
        const barcodeGap = 6
        const minimumHeaderBandHeight = Math.max(16, Math.round(frame.height * 0.18))
        const headerSeparatorMax = Math.max(
            frame.y + minimumHeaderBandHeight + 4,
            Math.min(frame.y + Math.round(frame.height * 0.44), Number(barcodeBounds.y || 0) - 22)
        )
        const headerSeparatorY = Math.round(
            AiBoxedBarcodeGeometryUtils.clamp(
                headerBottom + 3,
                frame.y + minimumHeaderBandHeight,
                headerSeparatorMax
            )
        )
        const middleLinePreferredY = Math.min(
            Number(barcodeBounds.y || 0) - barcodeGap,
            Number(middleBounds.y || 0) + Number(middleBounds.height || 0) + 4
        )
        const middleSeparatorY = Math.round(
            AiBoxedBarcodeGeometryUtils.clamp(
                middleLinePreferredY,
                headerSeparatorY + 10,
                Math.min(frameBottom - 6, Number(barcodeBounds.y || 0) - barcodeGap)
            )
        )
        const dividerPreferredX = Math.round(
            (Number(leftHeaderBounds.x || 0) +
                Number(leftHeaderBounds.width || 0) +
                Number(rightHeaderBounds.x || 0)) /
                2
        )
        const dividerX = Math.max(
            frame.x + Math.round(frame.width * 0.35),
            Math.min(frame.x + Math.round(frame.width * 0.65), dividerPreferredX)
        )
        const headerTopY = Math.round(
            AiBoxedBarcodeGeometryUtils.clamp(
                topHeaderY,
                frame.y + 2,
                Math.max(frame.y + 2, headerSeparatorY - Math.max(8, headerTextHeight) - 2)
            )
        )
        const leftHeaderX = frame.x + 6
        const rightHeaderX = dividerX + 8
        const verticalLineLength = Math.max(12, headerSeparatorY - frame.y + 2)
        const previewHeight = Math.max(1, Number(previewSize?.height || 1))
        return {
            headerTopY: Math.min(Math.max(0, headerTopY), previewHeight - 4),
            headerSeparatorY,
            middleSeparatorY,
            dividerX,
            leftHeaderX,
            rightHeaderX,
            verticalLineLength,
            barcodeGap
        }
    }

    /**
     * Enforces top-row text alignment and bounded column starts.
     * @param {{
     *  state: { media?: string },
     *  rowResolution: {
     *    leftHeader: { item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } },
     *    rightHeader: { item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } },
     *    middleRow: { item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } }
     *  },
     *  boundsById: Map<string, { x: number, y: number, width: number, height: number }>,
     *  previewSize: { width: number, height: number },
     *  frame: { x: number, y: number, width: number, height: number },
     *  layoutTargets: {
     *    headerTopY: number,
     *    headerSeparatorY: number,
     *    middleSeparatorY: number,
     *    leftHeaderX: number,
     *    rightHeaderX: number,
     *    dividerX: number
     *  }
     * }} options
     * @returns {boolean}
     */
    static #enforceTopRowAlignment({ state, rowResolution, boundsById, previewSize, frame, layoutTargets }) {
        let didMutate = false
        const headerCap = AiBoxedBarcodeFormFidelityUtils.#resolveHeaderFontCap(state)
        didMutate =
            AiBoxedBarcodeHeaderLayoutUtils.fitHeaderTextToCells({
                rowResolution,
                boundsById,
                frame,
                layoutTargets,
                headerCap
            }) || didMutate

        didMutate =
            AiBoxedBarcodeFormFidelityUtils.#shiftItemToTarget({
                item: rowResolution.leftHeader.item,
                boundsById,
                previewSize,
                targetX: layoutTargets.leftHeaderX,
                targetY: layoutTargets.headerTopY
            }) || didMutate
        didMutate =
            AiBoxedBarcodeFormFidelityUtils.#shiftItemToTarget({
                item: rowResolution.rightHeader.item,
                boundsById,
                previewSize,
                targetX: layoutTargets.rightHeaderX,
                targetY: layoutTargets.headerTopY
            }) || didMutate
        didMutate =
            AiBoxedBarcodeHeaderLayoutUtils.resolveTopHeaderOverlap({
                rowResolution,
                boundsById,
                previewSize,
                frame,
                layoutTargets,
                headerCap,
                shiftItemToTarget: (options) => AiBoxedBarcodeFormFidelityUtils.#shiftItemToTarget(options)
            }) || didMutate

        return didMutate
    }

    /**
     * Clears text underline flags for structure rows.
     * @param {Array<Record<string, any>>} textItems
     * @returns {boolean}
     */
    static #clearStructuralUnderlines(textItems) {
        let didMutate = false
        ;(Array.isArray(textItems) ? textItems : []).forEach((item) => {
            if (!item || item.type !== 'text') return
            if (!item.textUnderline) return
            item.textUnderline = false
            didMutate = true
        })
        return didMutate
    }

    /**
     * Upserts frame and divider shapes for boxed layouts.
     * @param {{
     *  state: { items: Array<Record<string, any>> },
     *  frame: { x: number, y: number, width: number, height: number },
     *  layoutTargets: {
     *    headerSeparatorY: number,
     *    middleSeparatorY: number,
     *    dividerX: number,
     *    verticalLineLength: number
     *  },
     *  previewSize: { width: number, height: number },
     *  isHorizontal: boolean
     * }} options
     * @returns {{
     *  didMutate: boolean,
     *  diagnostics: {
     *    frame: Record<string, any> | null,
     *    headerSeparator: Record<string, any> | null,
     *    middleSeparator: Record<string, any> | null,
     *    verticalDivider: Record<string, any> | null
     *  }
     * }}
     */
    static #upsertStructureShapes({ state, frame, layoutTargets, previewSize, isHorizontal }) {
        const items = Array.isArray(state?.items) ? state.items : []
        const shapeItems = items.filter((item) => item?.type === 'shape')
        const rectShapes = shapeItems.filter(
            (item) =>
                String(item?.shapeType || '')
                    .trim()
                    .toLowerCase() === 'rect'
        )
        const lineShapes = shapeItems.filter(
            (item) =>
                String(item?.shapeType || '')
                    .trim()
                    .toLowerCase() === 'line'
        )
        let didMutate = false
        const usedLineIds = new Set()
        const diagnostics = {
            frame: null,
            headerSeparator: null,
            middleSeparator: null,
            verticalDivider: null
        }

        const frameShape =
            [...rectShapes].sort(
                (left, right) =>
                    Number(right?.width || 0) * Number(right?.height || 0) -
                    Number(left?.width || 0) * Number(left?.height || 0)
            )[0] || null
        const frameResult = AiBoxedBarcodeFormFidelityUtils.#upsertFrameRect({
            items,
            frameShape,
            target: frame,
            previewSize,
            isHorizontal
        })
        didMutate = frameResult.changed || didMutate
        diagnostics.frame = frameResult.diagnostic

        const headerResult = AiBoxedBarcodeFormFidelityUtils.#upsertLineShape({
            items,
            lineShapes,
            usedLineIds,
            target: {
                x: frame.x + 1,
                y: layoutTargets.headerSeparatorY,
                width: Math.max(8, frame.width - 2),
                height: 2,
                rotation: 0
            },
            previewSize,
            isHorizontal,
            role: 'headerSeparator',
            orientation: 'horizontal'
        })
        didMutate = headerResult.changed || didMutate
        diagnostics.headerSeparator = headerResult.diagnostic

        const middleResult = AiBoxedBarcodeFormFidelityUtils.#upsertLineShape({
            items,
            lineShapes,
            usedLineIds,
            target: {
                x: frame.x + 1,
                y: layoutTargets.middleSeparatorY,
                width: Math.max(8, frame.width - 2),
                height: 2,
                rotation: 0
            },
            previewSize,
            isHorizontal,
            role: 'middleSeparator',
            orientation: 'horizontal'
        })
        didMutate = middleResult.changed || didMutate
        diagnostics.middleSeparator = middleResult.diagnostic

        const dividerResult = AiBoxedBarcodeFormFidelityUtils.#upsertLineShape({
            items,
            lineShapes,
            usedLineIds,
            target: {
                x: layoutTargets.dividerX,
                y: frame.y + 1,
                width: Math.max(8, layoutTargets.verticalLineLength),
                height: 2,
                rotation: 90
            },
            previewSize,
            isHorizontal,
            role: 'verticalDivider',
            orientation: 'vertical'
        })
        didMutate = dividerResult.changed || didMutate
        diagnostics.verticalDivider = dividerResult.diagnostic

        return { didMutate, diagnostics }
    }

    /**
     * Upserts one frame rectangle.
     * @param {{
     *  items: Array<Record<string, any>>,
     *  frameShape: Record<string, any> | null,
     *  target: { x: number, y: number, width: number, height: number },
     *  previewSize: { width: number, height: number },
     *  isHorizontal: boolean
     * }} options
     * @returns {{ changed: boolean, diagnostic: Record<string, any> | null }}
     */
    static #upsertFrameRect({ items, frameShape, target, previewSize, isHorizontal }) {
        const safeTarget = {
            x: Math.max(0, Math.round(Number(target?.x || 0))),
            y: Math.max(0, Math.round(Number(target?.y || 0))),
            width: Math.max(20, Math.round(Number(target?.width || 20))),
            height: Math.max(24, Math.round(Number(target?.height || 24)))
        }
        const offsetTarget = AiBoxedBarcodeGeometryUtils.resolveShapeOffsetsFromDrawTarget({
            target: safeTarget,
            previewSize,
            isHorizontal
        })
        const shape =
            frameShape ||
            {
                id: AiRebuildPostProcessUtils.createGeneratedItemId('shape-frame'),
                type: 'shape',
                shapeType: 'rect'
            }
        let changed = AiBoxedBarcodeFormFidelityUtils.#applyShapePatch(shape, {
            shapeType: 'rect',
            positionMode: 'absolute',
            xOffset: offsetTarget.xOffset,
            yOffset: offsetTarget.yOffset,
            width: safeTarget.width,
            height: safeTarget.height,
            rotation: 0,
            strokeWidth: 2
        })
        if (!frameShape) {
            shape.cornerRadius = 0
            items.push(shape)
            return {
                changed: true,
                diagnostic: AiBoxedBarcodeGeometryUtils.buildShapeDiagnostic({
                    shape,
                    role: 'frame',
                    previewSize,
                    isHorizontal
                })
            }
        }
        if (Number(shape.cornerRadius || 0) !== 0) {
            shape.cornerRadius = 0
            changed = true
        }
        return {
            changed,
            diagnostic: AiBoxedBarcodeGeometryUtils.buildShapeDiagnostic({
                shape,
                role: 'frame',
                previewSize,
                isHorizontal
            })
        }
    }

    /**
     * Upserts one separator line by orientation and proximity.
     * @param {{
     *  items: Array<Record<string, any>>,
     *  lineShapes: Array<Record<string, any>>,
     *  usedLineIds: Set<string>,
     *  target: { x: number, y: number, width: number, height: number, rotation: number },
     *  previewSize: { width: number, height: number },
     *  isHorizontal: boolean,
     *  role: string,
     *  orientation: 'horizontal' | 'vertical'
     * }} options
     * @returns {{ changed: boolean, diagnostic: Record<string, any> | null }}
     */
    static #upsertLineShape({ items, lineShapes, usedLineIds, target, previewSize, isHorizontal, role, orientation }) {
        const safeTarget = {
            x: Math.max(0, Math.round(Number(target?.x || 0))),
            y: Math.max(0, Math.round(Number(target?.y || 0))),
            width: Math.max(8, Math.round(Number(target?.width || 8))),
            height: Math.max(2, Math.round(Number(target?.height || 2))),
            rotation: Math.round(Number(target?.rotation || 0))
        }
        const offsetTarget = AiBoxedBarcodeGeometryUtils.resolveShapeOffsetsFromDrawTarget({
            target: safeTarget,
            previewSize,
            isHorizontal
        })
        const lineShape =
            [...lineShapes]
                .filter((shape) => !usedLineIds.has(String(shape?.id || '')))
                .map((shape) => ({
                    shape,
                    score: AiBoxedBarcodeFormFidelityUtils.#scoreLineCandidate(shape, offsetTarget, orientation)
                }))
                .sort((left, right) => left.score - right.score)[0]?.shape || null
        if (lineShape) {
            usedLineIds.add(String(lineShape.id || ''))
        }
        const shape =
            lineShape ||
            {
                id: AiRebuildPostProcessUtils.createGeneratedItemId('shape-line'),
                type: 'shape',
                shapeType: 'line'
            }
        const changed = AiBoxedBarcodeFormFidelityUtils.#applyShapePatch(shape, {
            shapeType: 'line',
            positionMode: 'absolute',
            xOffset: offsetTarget.xOffset,
            yOffset: offsetTarget.yOffset,
            width: safeTarget.width,
            height: 2,
            rotation: safeTarget.rotation,
            strokeWidth: 2
        })
        if (!lineShape) {
            items.push(shape)
            return {
                changed: true,
                diagnostic: AiBoxedBarcodeGeometryUtils.buildShapeDiagnostic({
                    shape,
                    role,
                    previewSize,
                    isHorizontal
                })
            }
        }
        return {
            changed,
            diagnostic: AiBoxedBarcodeGeometryUtils.buildShapeDiagnostic({
                shape,
                role,
                previewSize,
                isHorizontal
            })
        }
    }

    /**
     * Scores one line shape candidate against a target geometry.
     * @param {Record<string, any>} shape
     * @param {{ xOffset: number, yOffset: number, rotation: number }} target
     * @param {'horizontal' | 'vertical'} orientation
     * @returns {number}
     */
    static #scoreLineCandidate(shape, target, orientation) {
        const isVertical = AiBoxedBarcodeFormFidelityUtils.#isVerticalLineShape(shape)
        const orientationPenalty = orientation === 'vertical' ? (isVertical ? 0 : 500) : isVertical ? 500 : 0
        const xDelta = Math.abs(Number(shape?.xOffset || 0) - Number(target.xOffset || 0))
        const yDelta = Math.abs(Number(shape?.yOffset || 0) - Number(target.yOffset || 0))
        const rotationDelta = Math.abs(
            (Math.abs(Number(shape?.rotation || 0)) % 180) - (Math.abs(Number(target.rotation || 0)) % 180)
        )
        return orientationPenalty + xDelta * 0.5 + yDelta + rotationDelta
    }

    /**
     * Returns true when a line shape is mostly vertical.
     * @param {Record<string, any>} shape
     * @returns {boolean}
     */
    static #isVerticalLineShape(shape) {
        const rotation = Math.abs(Number(shape?.rotation || 0)) % 180
        if (Math.abs(rotation - 90) <= 20) return true
        return Number(shape?.height || 0) > Number(shape?.width || 0) * 1.2
    }

    /**
     * Applies a shape property patch and returns whether anything changed.
     * @param {Record<string, any>} shape
     * @param {Record<string, string | number>} patch
     * @returns {boolean}
     */
    static #applyShapePatch(shape, patch) {
        let changed = false
        Object.entries(patch || {}).forEach(([key, value]) => {
            const nextValue = typeof value === 'number' ? Math.round(value) : value
            if (shape[key] === nextValue) return
            shape[key] = nextValue
            changed = true
        })
        return changed
    }

    /**
     * Shifts one item to a target top-left coordinate using current bounds.
     * @param {{
     *  item: Record<string, any>,
     *  boundsById: Map<string, { x: number, y: number, width: number, height: number }>,
     *  previewSize: { width: number, height: number },
     *  targetX: number,
     *  targetY: number
     * }} options
     * @returns {boolean}
     */
    static #shiftItemToTarget({ item, boundsById, previewSize, targetX, targetY }) {
        const bounds = boundsById.get(item?.id)
        if (!bounds) return false
        const clamped = AiRebuildPostProcessUtils.clampTarget(bounds, previewSize, targetX, targetY)
        if (
            Math.round(Number(clamped.x || 0)) === Math.round(Number(bounds.x || 0)) &&
            Math.round(Number(clamped.y || 0)) === Math.round(Number(bounds.y || 0))
        ) {
            return false
        }
        AiRebuildPostProcessUtils.shiftItemTo(item, bounds, clamped.x, clamped.y)
        bounds.x = Number(clamped.x || 0)
        bounds.y = Number(clamped.y || 0)
        boundsById.set(item.id, bounds)
        return true
    }

    /**
     * Resolves a media-scaled top-row font cap (W24 baseline = 16).
     * @param {{ media?: string }} state
     * @returns {number}
     */
    static #resolveHeaderFontCap(state) {
        const mediaWidthMm = AiBoxedBarcodeFormFidelityUtils.#resolveMediaWidthMm(state)
        const scale = Math.max(0.7, Math.min(1.6, mediaWidthMm / 24))
        return Math.max(10, Math.round(16 * scale))
    }

    /**
     * Resolves tape width in millimeters from state media code.
     * @param {{ media?: string } | undefined} state
     * @returns {number}
     */
    static #resolveMediaWidthMm(state) {
        const mediaCode = String(state?.media || '')
            .trim()
            .toUpperCase()
        const widthMatch = mediaCode.match(/^W(\d{1,2})$/)
        const widthFromCode = widthMatch ? Number(widthMatch[1]) : Number.NaN
        if (Number.isFinite(widthFromCode) && widthFromCode >= 3 && widthFromCode <= 62) return widthFromCode
        const media = Media[mediaCode] || null
        const mediaWidth = Number(media?.width || 0)
        if (Number.isFinite(mediaWidth) && mediaWidth > 0) return mediaWidth
        return 24
    }

    /**
     * Normalizes one text value for duplicate code-like matching.
     * @param {string} text
     * @returns {string}
     */
    static #normalizeCodeLikeText(text) {
        return String(text || '').replace(/\s+/g, '').toUpperCase().trim()
    }

    /**
     * Returns true when normalized text resembles a long code token.
     * @param {string} normalized
     * @returns {boolean}
     */
    static #isCodeLikeToken(normalized) {
        const token = String(normalized || '')
        if (token.length < 10) return false
        return /[A-Z]/.test(token) && /\d/.test(token)
    }
}
