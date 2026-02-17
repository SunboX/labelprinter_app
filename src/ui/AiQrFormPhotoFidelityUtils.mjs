import { AiRebuildPostProcessUtils } from './AiRebuildPostProcessUtils.mjs'
import { QrSizeUtils } from '../QrSizeUtils.mjs'

/**
 * QR form-photo reconstruction helpers that preserve inventory-like two-column layouts.
 */
export class AiQrFormPhotoFidelityUtils {
    /**
     * Detects heading/value + right-side QR absolute reconstruction patterns.
     * @param {{
     *  items: Array<Record<string, any>>,
     *  markerEvidence: boolean,
     *  boundsById: Map<string, { x: number, y: number, width: number, height: number }>
     * }} options
     * @returns {{
     *  matched: boolean,
     *  roles: {
     *    qrItem: Record<string, any> | null,
     *    qrBounds: { x: number, y: number, width: number, height: number } | null,
     *    textItems: Array<Record<string, any>>,
     *    textEntries: Array<{ item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } }>,
     *    headingItems: Array<Record<string, any>>
     *  } | null
     * }}
     */
    static detectQrFormAbsolutePattern({ items, markerEvidence, boundsById }) {
        const safeItems = Array.isArray(items) ? items : []
        if (markerEvidence) return { matched: false, roles: null }
        const qrItems = safeItems.filter((item) => item?.type === 'qr')
        const barcodeItems = safeItems.filter((item) => item?.type === 'barcode')
        const textItems = safeItems.filter((item) => item?.type === 'text')
        if (qrItems.length !== 1 || barcodeItems.length !== 0) return { matched: false, roles: null }
        if (textItems.length < 4 || textItems.length > 8) return { matched: false, roles: null }
        const involvedItems = [...textItems, qrItems[0]]
        if (!involvedItems.every((item) => AiQrFormPhotoFidelityUtils.#isAbsolutePositionItem(item))) {
            return { matched: false, roles: null }
        }
        const roles = AiQrFormPhotoFidelityUtils.resolveQrFormRoles(safeItems, boundsById)
        if (!roles.qrItem || !roles.qrBounds || roles.headingItems.length < 2 || roles.textEntries.length < 4) {
            return { matched: false, roles: null }
        }
        const qrCenterX = Number(roles.qrBounds.x || 0) + Number(roles.qrBounds.width || 0) / 2
        const leftCount = roles.textEntries.filter((entry) => {
            const textRight = Number(entry.bounds.x || 0) + Number(entry.bounds.width || 0)
            return textRight <= qrCenterX
        }).length
        if (leftCount < Math.ceil(roles.textEntries.length / 2)) {
            return { matched: false, roles: null }
        }
        return { matched: true, roles }
    }

    /**
     * Resolves structural role assignments for QR form-photo layouts.
     * @param {Array<Record<string, any>>} items
     * @param {Map<string, { x: number, y: number, width: number, height: number }>} boundsById
     * @returns {{
     *  qrItem: Record<string, any> | null,
     *  qrBounds: { x: number, y: number, width: number, height: number } | null,
     *  textItems: Array<Record<string, any>>,
     *  textEntries: Array<{ item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } }>,
     *  headingItems: Array<Record<string, any>>
     * }}
     */
    static resolveQrFormRoles(items, boundsById) {
        const safeItems = Array.isArray(items) ? items : []
        const qrItem = safeItems.find((item) => item?.type === 'qr') || null
        const qrBounds = AiQrFormPhotoFidelityUtils.#resolveBounds(qrItem, boundsById)
        const textEntries = safeItems
            .filter((item) => item?.type === 'text')
            .map((item) => ({
                item,
                bounds: AiQrFormPhotoFidelityUtils.#resolveBounds(item, boundsById)
            }))
            .filter((entry) => entry.bounds)
        const textItems = textEntries.map((entry) => entry.item)
        const headingItems = textItems.filter((item) => AiQrFormPhotoFidelityUtils.#isHeadingLikeText(item))
        return {
            qrItem,
            qrBounds,
            textItems,
            textEntries,
            headingItems
        }
    }

    /**
     * Applies deterministic spacing and column constraints for QR form-photo layouts.
     * @param {{
     *  roles: {
     *    qrItem: Record<string, any> | null,
     *    qrBounds: { x: number, y: number, width: number, height: number } | null,
     *    textItems: Array<Record<string, any>>,
     *    textEntries: Array<{ item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } }>,
     *    headingItems: Array<Record<string, any>>
     *  } | null,
     *  boundsById: Map<string, { x: number, y: number, width: number, height: number }>,
     *  previewSize: { width: number, height: number },
     *  state: Record<string, any>
     * }} options
     * @returns {{ didMutate: boolean, placementResolved: boolean }}
     */
    static applyQrFormFidelityPass({ roles, boundsById, previewSize, state }) {
        const qrItem = roles?.qrItem || null
        if (!qrItem || !(boundsById instanceof Map)) {
            return { didMutate: false, placementResolved: false }
        }
        const textEntries = AiQrFormPhotoFidelityUtils.#resolveTopToBottomTextEntries(
            AiQrFormPhotoFidelityUtils.#collectTextEntries(roles, boundsById)
        )
        const qrBounds = AiQrFormPhotoFidelityUtils.#resolveBounds(qrItem, boundsById)
        if (!qrBounds || textEntries.length < 2) {
            return { didMutate: false, placementResolved: false }
        }

        let didMutate = false
        let downscaledText = false
        if (AiQrFormPhotoFidelityUtils.#applyFirstHeadingValueUnderlinePairConsistency(textEntries)) {
            didMutate = true
        }
        const previewHeight = Math.max(1, Number(previewSize?.height || 1))
        let verticalTargets = AiQrFormPhotoFidelityUtils.#buildVerticalStackTargets(textEntries, previewHeight)
        if (!verticalTargets.fits) {
            const compactTargets = AiQrFormPhotoFidelityUtils.#buildVerticalStackTargets(textEntries, previewHeight, {
                compressToMinimumGap: true
            })
            if (!compactTargets.fits) {
                const scalingResult = AiQrFormPhotoFidelityUtils.#applyAdaptiveVerticalTextDownscale(
                    textEntries,
                    previewHeight
                )
                if (scalingResult.didMutate) {
                    return { didMutate: true, placementResolved: false }
                }
                return { didMutate, placementResolved: false }
            }
            verticalTargets = compactTargets
        }
        textEntries.forEach((entry, index) => {
            const targetY = Number(verticalTargets.targets[index] || 0)
            if (
                AiQrFormPhotoFidelityUtils.#shiftItem(
                    boundsById,
                    previewSize,
                    entry.item,
                    Number(entry.bounds.x || 0),
                    targetY
                )
            ) {
                didMutate = true
            }
        })

        const minimumColumnGap = 4
        let currentQrBounds = AiQrFormPhotoFidelityUtils.#resolveBounds(qrItem, boundsById)
        if (currentQrBounds) {
            const textColumnRight = AiQrFormPhotoFidelityUtils.#resolveTextColumnRight(
                AiQrFormPhotoFidelityUtils.#collectTextEntries(roles, boundsById)
            )
            const overlapX = textColumnRight + minimumColumnGap - Number(currentQrBounds.x || 0)
            if (overlapX > 0) {
                const previewWidth = Math.max(1, Number(previewSize?.width || 1))
                const maxQrX = previewWidth - Number(currentQrBounds.width || 0)
                const targetX = Math.min(maxQrX, Number(currentQrBounds.x || 0) + overlapX)
                if (targetX > Number(currentQrBounds.x || 0) + 0.5) {
                    if (
                        AiQrFormPhotoFidelityUtils.#shiftItem(
                            boundsById,
                            previewSize,
                            qrItem,
                            targetX,
                            Number(currentQrBounds.y || 0)
                        )
                    ) {
                        didMutate = true
                    }
                } else {
                    const minimumQrSize = QrSizeUtils.clampQrSizeToLabel(
                        state,
                        Math.max(40, Math.round(previewHeight * 0.35))
                    )
                    const maxAllowedSize = Math.max(1, Math.floor(previewWidth - (textColumnRight + minimumColumnGap)))
                    const currentSize = Math.max(
                        1,
                        Number(qrItem.size || qrItem.width || qrItem.height || currentQrBounds.width || 1)
                    )
                    const targetSize = QrSizeUtils.clampQrSizeToLabel(
                        state,
                        Math.max(minimumQrSize, Math.min(currentSize, maxAllowedSize))
                    )
                    if (targetSize < currentSize) {
                        qrItem.size = targetSize
                        qrItem.width = targetSize
                        qrItem.height = targetSize
                        boundsById.set(qrItem.id, {
                            ...currentQrBounds,
                            width: targetSize,
                            height: targetSize
                        })
                        didMutate = true
                    }
                    currentQrBounds = AiQrFormPhotoFidelityUtils.#resolveBounds(qrItem, boundsById)
                    const nextTextRight = AiQrFormPhotoFidelityUtils.#resolveTextColumnRight(
                        AiQrFormPhotoFidelityUtils.#collectTextEntries(roles, boundsById)
                    )
                    const residualOverlap = nextTextRight + minimumColumnGap - Number(currentQrBounds?.x || 0)
                    if (residualOverlap > 0) {
                        const changed = AiQrFormPhotoFidelityUtils.#downscaleTextForResidualOverlap(
                            AiQrFormPhotoFidelityUtils.#resolveTopToBottomTextEntries(
                                AiQrFormPhotoFidelityUtils.#collectTextEntries(roles, boundsById)
                            )
                        )
                        if (changed) {
                            didMutate = true
                            downscaledText = true
                        }
                    }
                }
            }
        }

        if (downscaledText) {
            return { didMutate, placementResolved: false }
        }

        const placementResolved = AiQrFormPhotoFidelityUtils.#isPlacementResolved({
            roles,
            boundsById,
            previewSize
        })
        return { didMutate, placementResolved }
    }

    /**
     * Returns whether the given item uses absolute positioning mode.
     * @param {Record<string, any> | null} item
     * @returns {boolean}
     */
    static #isAbsolutePositionItem(item) {
        const positionMode = String(item?.positionMode || 'flow')
            .trim()
            .toLowerCase()
        return positionMode === 'absolute'
    }

    /**
     * Returns true when one text item looks like a heading row (trailing colon).
     * @param {Record<string, any> | null} item
     * @returns {boolean}
     */
    static #isHeadingLikeText(item) {
        if (!item || item.type !== 'text') return false
        const lines = String(item.text || '')
            .replace(/\r/g, '')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
        if (!lines.length) return false
        return /:\s*$/.test(lines[lines.length - 1])
    }

    /**
     * Collects current text entries with resolved bounds.
     * @param {{
     *  textItems?: Array<Record<string, any>>,
     *  textEntries?: Array<{ item: Record<string, any> }>
     * } | null} roles
     * @param {Map<string, { x: number, y: number, width: number, height: number }>} boundsById
     * @returns {Array<{ item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } }>}
     */
    static #collectTextEntries(roles, boundsById) {
        const textItems = Array.isArray(roles?.textItems)
            ? roles.textItems
            : Array.isArray(roles?.textEntries)
              ? roles.textEntries.map((entry) => entry.item)
              : []
        return textItems
            .map((item) => ({
                item,
                bounds: AiQrFormPhotoFidelityUtils.#resolveBounds(item, boundsById)
            }))
            .filter((entry) => entry.bounds)
    }

    /**
     * Resolves text entries in deterministic top-to-bottom reading order.
     * @param {Array<{ item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } }>} textEntries
     * @returns {Array<{ item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } }>}
     */
    static #resolveTopToBottomTextEntries(textEntries) {
        const safeEntries = Array.isArray(textEntries) ? textEntries : []
        return [...safeEntries].sort((left, right) => {
            const leftY = Number(left?.bounds?.y || 0)
            const rightY = Number(right?.bounds?.y || 0)
            if (leftY !== rightY) return leftY - rightY
            const leftX = Number(left?.bounds?.x || 0)
            const rightX = Number(right?.bounds?.x || 0)
            return leftX - rightX
        })
    }

    /**
     * Resolves the first heading/value pair from ordered text entries.
     * A heading row is identified by a trailing colon.
     * @param {Array<{ item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } }>} orderedTextEntries
     * @returns {{
     *  headingEntry: { item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } },
     *  valueEntry: { item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } }
     * } | null}
     */
    static #resolveFirstHeadingValuePair(orderedTextEntries) {
        for (let index = 0; index < orderedTextEntries.length - 1; index += 1) {
            const headingEntry = orderedTextEntries[index]
            if (!AiQrFormPhotoFidelityUtils.#isHeadingLikeText(headingEntry?.item)) continue
            const valueEntry = orderedTextEntries[index + 1]
            if (!valueEntry?.item || valueEntry.item.type !== 'text') continue
            return { headingEntry, valueEntry }
        }
        return null
    }

    /**
     * Keeps underline style consistent for the first heading/value pair when one already indicates underline intent.
     * @param {Array<{ item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } }>} textEntries
     * @returns {boolean}
     */
    static #applyFirstHeadingValueUnderlinePairConsistency(textEntries) {
        const orderedEntries = AiQrFormPhotoFidelityUtils.#resolveTopToBottomTextEntries(textEntries)
        const firstPair = AiQrFormPhotoFidelityUtils.#resolveFirstHeadingValuePair(orderedEntries)
        if (!firstPair) return false
        const underlineIntent =
            Boolean(firstPair.headingEntry.item?.textUnderline) || Boolean(firstPair.valueEntry.item?.textUnderline)
        if (!underlineIntent) return false
        let didMutate = false
        if (!Boolean(firstPair.headingEntry.item?.textUnderline)) {
            firstPair.headingEntry.item.textUnderline = true
            didMutate = true
        }
        if (!Boolean(firstPair.valueEntry.item?.textUnderline)) {
            firstPair.valueEntry.item.textUnderline = true
            didMutate = true
        }
        return didMutate
    }

    /**
     * Resolves one item bounds snapshot from map entries.
     * @param {Record<string, any> | null} item
     * @param {Map<string, { x: number, y: number, width: number, height: number }>} boundsById
     * @returns {{ x: number, y: number, width: number, height: number } | null}
     */
    static #resolveBounds(item, boundsById) {
        if (!item || !(boundsById instanceof Map)) return null
        const bounds = boundsById.get(item.id)
        if (!bounds) return null
        return {
            x: Number(bounds.x || 0),
            y: Number(bounds.y || 0),
            width: Math.max(1, Number(bounds.width || 1)),
            height: Math.max(1, Number(bounds.height || 1))
        }
    }

    /**
     * Applies bounded coordinate shifts through item offsets and updates bounds cache.
     * @param {Map<string, { x: number, y: number, width: number, height: number }>} boundsById
     * @param {{ width: number, height: number }} previewSize
     * @param {Record<string, any>} item
     * @param {number} targetX
     * @param {number} targetY
     * @returns {boolean}
     */
    static #shiftItem(boundsById, previewSize, item, targetX, targetY) {
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
        bounds.x = clamped.x
        bounds.y = clamped.y
        boundsById.set(item.id, bounds)
        return true
    }

    /**
     * Returns the right-most x position of the left text column.
     * @param {Array<{ bounds: { x: number, y: number, width: number, height: number } }>} textEntries
     * @returns {number}
     */
    static #resolveTextColumnRight(textEntries) {
        return textEntries.reduce(
            (maximum, entry) =>
                Math.max(maximum, Number(entry.bounds.x || 0) + Number(entry.bounds.width || 0)),
            0
        )
    }

    /**
     * Builds a vertical stack plan that preserves row order and keeps content inside the preview.
     * @param {Array<{ item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } }>} textEntries
     * @param {number} previewHeight
     * @param {{ compressToMinimumGap?: boolean }} [options]
     * @returns {{ fits: boolean, targets: number[] }}
     */
    static #buildVerticalStackTargets(textEntries, previewHeight, options = {}) {
        const safeEntries = Array.isArray(textEntries) ? textEntries : []
        if (!safeEntries.length) return { fits: false, targets: [] }
        const safePreviewHeight = Math.max(1, Number(previewHeight || 1))
        const compressToMinimumGap = Boolean(options?.compressToMinimumGap)
        const rowGaps = []
        let requiredHeight = Number(safeEntries[0].bounds.height || 0)
        for (let index = 1; index < safeEntries.length; index += 1) {
            const previous = safeEntries[index - 1]
            const current = safeEntries[index]
            const gap = compressToMinimumGap
                ? 3
                : Math.max(
                      3,
                      Math.round(
                          Math.max(8, Number(current.item?.fontSize || previous.item?.fontSize || 12)) * 0.25
                      )
                  )
            rowGaps.push(gap)
            requiredHeight += gap + Number(current.bounds.height || 0)
        }
        const currentTop = Number(safeEntries[0].bounds.y || 0)
        const maxStartY = safePreviewHeight - requiredHeight
        if (!Number.isFinite(maxStartY) || maxStartY < 0) return { fits: false, targets: [] }
        const targets = [Math.max(0, Math.min(currentTop, maxStartY))]
        for (let index = 1; index < safeEntries.length; index += 1) {
            const previous = safeEntries[index - 1]
            const previousTarget = Number(targets[index - 1] || 0)
            targets.push(previousTarget + Number(previous.bounds.height || 0) + Number(rowGaps[index - 1] || 0))
        }
        return { fits: true, targets }
    }

    /**
     * Computes the total vertical space needed for stacked text rows with minimum visible gaps.
     * @param {Array<{ item: Record<string, any>, bounds: { height: number } }>} textEntries
     * @returns {number}
     */
    static #computeRequiredStackHeight(textEntries) {
        const safeEntries = Array.isArray(textEntries) ? textEntries : []
        if (!safeEntries.length) return 0
        let requiredHeight = Number(safeEntries[0]?.bounds?.height || 0)
        for (let index = 1; index < safeEntries.length; index += 1) {
            const previous = safeEntries[index - 1]
            const current = safeEntries[index]
            const gap = Math.max(
                3,
                Math.round(
                    Math.max(8, Number(current?.item?.fontSize || previous?.item?.fontSize || 12)) * 0.25
                )
            )
            requiredHeight += gap + Number(current?.bounds?.height || 0)
        }
        return requiredHeight
    }

    /**
     * Applies deterministic proportional downscaling when stacked rows cannot fit in preview height.
     * @param {Array<{ item: Record<string, any>, bounds: { x: number, y: number, width: number, height: number } }>} textEntries
     * @param {number} previewHeight
     * @returns {{ didMutate: boolean, scaleFactor: number }}
     */
    static #applyAdaptiveVerticalTextDownscale(textEntries, previewHeight) {
        const safeEntries = Array.isArray(textEntries) ? textEntries : []
        const safePreviewHeight = Math.max(1, Number(previewHeight || 1))
        if (!safeEntries.length) return { didMutate: false, scaleFactor: 1 }
        const requiredHeight = AiQrFormPhotoFidelityUtils.#computeRequiredStackHeight(safeEntries)
        if (requiredHeight <= safePreviewHeight + 0.5) {
            return { didMutate: false, scaleFactor: 1 }
        }
        const scaleFactor = Math.max(0.2, Math.min(1, safePreviewHeight / requiredHeight))
        let didMutate = false
        safeEntries.forEach((entry) => {
            const currentFontSize = Math.max(10, Math.round(Number(entry.item?.fontSize || 12)))
            const nextFontSize = Math.max(10, Math.round(currentFontSize * scaleFactor))
            if (nextFontSize >= currentFontSize) return
            entry.item.fontSize = nextFontSize
            didMutate = true
        })
        return { didMutate, scaleFactor }
    }

    /**
     * Applies mild text downsizing to handle unresolved residual QR overlap.
     * @param {Array<{ item: Record<string, any> }>} textEntries
     * @returns {boolean}
     */
    static #downscaleTextForResidualOverlap(textEntries) {
        let didMutate = false
        textEntries.forEach((entry) => {
            const currentFontSize = Math.max(10, Math.round(Number(entry.item?.fontSize || 12)))
            const nextFontSize = Math.max(10, Math.round(currentFontSize * 0.85))
            if (nextFontSize >= currentFontSize) return
            entry.item.fontSize = nextFontSize
            didMutate = true
        })
        return didMutate
    }

    /**
     * Returns whether row order, visibility, and column separation are currently satisfied.
     * @param {{
     *  roles: {
     *    qrItem: Record<string, any> | null,
     *    textItems: Array<Record<string, any>>
     *  } | null,
     *  boundsById: Map<string, { x: number, y: number, width: number, height: number }>,
     *  previewSize: { width: number, height: number }
     * }} options
     * @returns {boolean}
     */
    static #isPlacementResolved({ roles, boundsById, previewSize }) {
        const qrItem = roles?.qrItem || null
        if (!qrItem) return false
        const textEntries = AiQrFormPhotoFidelityUtils.#resolveTopToBottomTextEntries(
            AiQrFormPhotoFidelityUtils.#collectTextEntries(roles, boundsById)
        )
        const qrBounds = AiQrFormPhotoFidelityUtils.#resolveBounds(qrItem, boundsById)
        if (!qrBounds || textEntries.length < 2) return false
        for (let index = 1; index < textEntries.length; index += 1) {
            const previous = textEntries[index - 1]
            const current = textEntries[index]
            const minimumGap = 3
            const minimumY = Number(previous.bounds.y || 0) + Number(previous.bounds.height || 0) + minimumGap
            if (Number(current.bounds.y || 0) < minimumY - 0.5) return false
        }
        const previewWidth = Math.max(1, Number(previewSize?.width || 1))
        const previewHeight = Math.max(1, Number(previewSize?.height || 1))
        const textColumnRight = AiQrFormPhotoFidelityUtils.#resolveTextColumnRight(textEntries)
        const bottomMostText = textEntries.reduce(
            (maximum, entry) =>
                Math.max(maximum, Number(entry.bounds.y || 0) + Number(entry.bounds.height || 0)),
            0
        )
        const qrInsideBounds =
            Number(qrBounds.x || 0) >= -0.5 &&
            Number(qrBounds.y || 0) >= -0.5 &&
            Number(qrBounds.x || 0) + Number(qrBounds.width || 0) <= previewWidth + 0.5 &&
            Number(qrBounds.y || 0) + Number(qrBounds.height || 0) <= previewHeight + 0.5
        return (
            bottomMostText <= previewHeight + 0.5 &&
            Number(qrBounds.x || 0) >= textColumnRight + 3 &&
            qrInsideBounds
        )
    }
}
