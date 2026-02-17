import { AiRebuildPlacementHeuristics } from './AiRebuildPlacementHeuristics.mjs'
import { AiRebuildPostProcessUtils } from './AiRebuildPostProcessUtils.mjs'

/**
 * Barcode-photo reconstruction helpers that preserve high-confidence absolute layouts.
 */
export class AiBarcodePhotoFidelityUtils {
    /**
     * Detects the absolute barcode-photo reconstruction pattern.
     * @param {{
     *  items: Array<Record<string, any>>,
     *  markerEvidence: boolean,
     *  boundsById: Map<string, { x: number, y: number, width: number, height: number }>
     * }} options
     * @returns {{
     *  matched: boolean,
     *  roles: {
     *    sideTextItem: Record<string, any> | null,
     *    shortTokenTextItem: Record<string, any> | null,
     *    codeTextItem: Record<string, any> | null,
     *    barcodeItem: Record<string, any> | null
     *  } | null
     * }}
     */
    static detectBarcodePhotoAbsolutePattern({ items, markerEvidence, boundsById }) {
        const safeItems = Array.isArray(items) ? items : []
        if (markerEvidence) return { matched: false, roles: null }
        const textItems = safeItems.filter((item) => item?.type === 'text')
        const barcodeItems = safeItems.filter((item) => item?.type === 'barcode')
        if (textItems.length < 3 || barcodeItems.length < 1) {
            return { matched: false, roles: null }
        }
        const absoluteCandidates = [...textItems, ...barcodeItems]
        if (!absoluteCandidates.every((item) => AiBarcodePhotoFidelityUtils.#isAbsolutePositionItem(item))) {
            return { matched: false, roles: null }
        }
        const roles = AiBarcodePhotoFidelityUtils.resolveBarcodePhotoRoles(safeItems, boundsById)
        if (!roles.sideTextItem || !roles.shortTokenTextItem || !roles.codeTextItem || !roles.barcodeItem) {
            return { matched: false, roles: null }
        }
        const codeBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(roles.codeTextItem, boundsById)
        const barcodeBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(roles.barcodeItem, boundsById)
        if (!codeBounds || !barcodeBounds) {
            return { matched: false, roles: null }
        }
        const horizontalDelta = Math.abs(Number(barcodeBounds.x || 0) - Number(codeBounds.x || 0))
        const verticalDelta = Number(barcodeBounds.y || 0) - Number(codeBounds.y || 0)
        const codeCenter = AiBarcodePhotoFidelityUtils.#resolveCenter(codeBounds)
        const barcodeCenter = AiBarcodePhotoFidelityUtils.#resolveCenter(barcodeBounds)
        const centerDistance = Math.hypot(codeCenter.x - barcodeCenter.x, codeCenter.y - barcodeCenter.y)
        const looksNear = horizontalDelta <= 56 && verticalDelta >= -12 && verticalDelta <= 120 && centerDistance <= 220
        if (!looksNear) return { matched: false, roles: null }
        return {
            matched: true,
            roles
        }
    }

    /**
     * Resolves structural role assignments for barcode-photo layouts.
     * @param {Array<Record<string, any>>} items
     * @param {Map<string, { x: number, y: number, width: number, height: number }>} boundsById
     * @returns {{
     *  sideTextItem: Record<string, any> | null,
     *  shortTokenTextItem: Record<string, any> | null,
     *  codeTextItem: Record<string, any> | null,
     *  barcodeItem: Record<string, any> | null
     * }}
     */
    static resolveBarcodePhotoRoles(items, boundsById) {
        const safeItems = Array.isArray(items) ? items : []
        const textItems = safeItems.filter((item) => item?.type === 'text')
        const barcodeItems = safeItems.filter((item) => item?.type === 'barcode')
        const sideCandidates = textItems.filter((item) => AiRebuildPlacementHeuristics.isQuarterTurnText(item))
        const sideTextItem =
            [...sideCandidates].sort((left, right) => {
                const leftBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(left, boundsById)
                const rightBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(right, boundsById)
                return Number(leftBounds?.x || left?.xOffset || 0) - Number(rightBounds?.x || right?.xOffset || 0)
            })[0] || null

        const codeCandidates = textItems.filter(
            (item) =>
                !AiRebuildPlacementHeuristics.isQuarterTurnText(item) &&
                !AiRebuildPlacementHeuristics.isShortTokenText(item)
        )
        let bestPair = null
        barcodeItems.forEach((barcodeItem) => {
            const barcodeBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(barcodeItem, boundsById)
            if (!barcodeBounds) return
            codeCandidates.forEach((codeTextItem) => {
                const codeBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(codeTextItem, boundsById)
                if (!codeBounds) return
                const score = AiBarcodePhotoFidelityUtils.#computeBarcodeCodePairScore(barcodeBounds, codeBounds)
                if (!bestPair || score < bestPair.score) {
                    bestPair = { barcodeItem, codeTextItem, score }
                }
            })
        })

        const barcodeItem = bestPair?.barcodeItem || barcodeItems[0] || null
        const codeTextItem = bestPair?.codeTextItem || null
        const shortTokenCandidates = textItems.filter((item) => {
            if (!AiRebuildPlacementHeuristics.isShortTokenText(item)) return false
            if (sideTextItem?.id && String(item.id || '') === String(sideTextItem.id || '')) return false
            return true
        })
        let shortTokenTextItem = shortTokenCandidates[0] || null
        if (codeTextItem && shortTokenCandidates.length) {
            const codeBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(codeTextItem, boundsById)
            if (codeBounds) {
                shortTokenTextItem =
                    [...shortTokenCandidates].sort((left, right) => {
                        const leftBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(left, boundsById)
                        const rightBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(right, boundsById)
                        const leftScore = AiBarcodePhotoFidelityUtils.#computeShortTokenScore(leftBounds, codeBounds)
                        const rightScore = AiBarcodePhotoFidelityUtils.#computeShortTokenScore(rightBounds, codeBounds)
                        return leftScore - rightScore
                    })[0] || shortTokenTextItem
            }
        }

        return {
            sideTextItem,
            shortTokenTextItem,
            codeTextItem,
            barcodeItem
        }
    }

    /**
     * Applies minimum prominence floors for barcode-photo layouts.
     * Keeps model-provided values when they already exceed floors.
     * @param {{
     *  roles: {
     *    sideTextItem: Record<string, any> | null,
     *    shortTokenTextItem: Record<string, any> | null,
     *    codeTextItem: Record<string, any> | null,
     *    barcodeItem: Record<string, any> | null
     *  },
     *  floors: {
     *    minTokenFontSize: number,
     *    minBarcodeWidth: number,
     *    minBarcodeHeight: number
     *  }
     * }} options
     * @returns {{ didMutate: boolean }}
     */
    static applyBarcodePhotoProminenceFloors({ roles, floors }) {
        const shortTokenTextItem = roles?.shortTokenTextItem || null
        const barcodeItem = roles?.barcodeItem || null
        if (!shortTokenTextItem || !barcodeItem) {
            return { didMutate: false }
        }

        const minTokenFontSize = Math.max(6, Math.round(Number(floors?.minTokenFontSize || 0)))
        const minBarcodeWidth = Math.max(1, Math.round(Number(floors?.minBarcodeWidth || 0)))
        const minBarcodeHeight = Math.max(1, Math.round(Number(floors?.minBarcodeHeight || 0)))
        let didMutate = false

        if (Number(shortTokenTextItem.fontSize || 0) < minTokenFontSize) {
            shortTokenTextItem.fontSize = minTokenFontSize
            didMutate = true
        }
        if (Number(barcodeItem.width || 0) < minBarcodeWidth) {
            barcodeItem.width = minBarcodeWidth
            didMutate = true
        }
        if (Number(barcodeItem.height || 0) < minBarcodeHeight) {
            barcodeItem.height = minBarcodeHeight
            didMutate = true
        }

        return { didMutate }
    }

    /**
     * Applies minimal deterministic movement for barcode-photo fidelity.
     * @param {{
     *  roles: {
     *    sideTextItem: Record<string, any> | null,
     *    shortTokenTextItem: Record<string, any> | null,
     *    codeTextItem: Record<string, any> | null,
     *    barcodeItem: Record<string, any> | null
     *  },
     *  boundsById: Map<string, { x: number, y: number, width: number, height: number }>,
     *  previewSize: { width: number, height: number }
     * }} options
     * @returns {{ didMutate: boolean }}
     */
    static applyBarcodePhotoFidelityPass({ roles, boundsById, previewSize }) {
        const sideTextItem = roles?.sideTextItem || null
        const shortTokenTextItem = roles?.shortTokenTextItem || null
        const codeTextItem = roles?.codeTextItem || null
        const barcodeItem = roles?.barcodeItem || null
        if (!sideTextItem || !shortTokenTextItem || !codeTextItem || !barcodeItem) {
            return { didMutate: false }
        }

        const shiftItem = (item, targetX, targetY) =>
            AiBarcodePhotoFidelityUtils.#shiftItem(boundsById, previewSize, item, targetX, targetY)
        let didMutate = false

        const minimumSideToTokenGap = 6
        const minimumSideToCodeGap = 12
        const leftGutterRightRatio = 0.22
        let sideBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(sideTextItem, boundsById)
        let tokenBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(shortTokenTextItem, boundsById)
        let codeBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(codeTextItem, boundsById)
        if (sideBounds && tokenBounds && codeBounds) {
            const previewWidth = Math.max(1, Number(previewSize?.width || 220))
            const sideRight = Number(sideBounds.x || 0) + Number(sideBounds.width || 0)
            const sideRightLimit = Math.min(
                Number(tokenBounds.x || 0) - minimumSideToTokenGap,
                Number(codeBounds.x || 0) - minimumSideToCodeGap,
                Math.round(previewWidth * leftGutterRightRatio)
            )
            if (Number.isFinite(sideRightLimit) && sideRight > sideRightLimit) {
                if (
                    shiftItem(
                        sideTextItem,
                        sideRightLimit - Number(sideBounds.width || 0),
                        Number(sideBounds.y || 0)
                    )
                ) {
                    didMutate = true
                }
            }
        }

        sideBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(sideTextItem, boundsById)
        if (sideBounds && Number(sideBounds.x || 0) < 0) {
            if (shiftItem(sideTextItem, 0, Number(sideBounds.y || 0))) didMutate = true
        }

        const minimumTokenGap = 6
        tokenBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(shortTokenTextItem, boundsById)
        codeBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(codeTextItem, boundsById)
        if (tokenBounds && codeBounds) {
            const desiredTokenRight = Number(codeBounds.x || 0) - minimumTokenGap
            const tokenRight = Number(tokenBounds.x || 0) + Number(tokenBounds.width || 0)
            if (tokenRight > desiredTokenRight) {
                if (shiftItem(shortTokenTextItem, desiredTokenRight - Number(tokenBounds.width || 0), Number(tokenBounds.y || 0))) {
                    didMutate = true
                }
            }
            tokenBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(shortTokenTextItem, boundsById)
            codeBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(codeTextItem, boundsById)
            if (tokenBounds && codeBounds) {
                const overlap = Number(tokenBounds.x || 0) + Number(tokenBounds.width || 0) - (Number(codeBounds.x || 0) - minimumTokenGap)
                if (overlap > 0) {
                    if (shiftItem(codeTextItem, Number(codeBounds.x || 0) + overlap, Number(codeBounds.y || 0))) {
                        didMutate = true
                    }
                }
            }
        }

        const targetGap = 12
        const minimumGap = 8
        const maximumGap = 22
        const maxColumnDelta = 24
        codeBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(codeTextItem, boundsById)
        let barcodeBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(barcodeItem, boundsById)
        if (codeBounds && barcodeBounds) {
            const horizontalDelta = Math.abs(Number(barcodeBounds.x || 0) - Number(codeBounds.x || 0))
            if (horizontalDelta > maxColumnDelta) {
                if (shiftItem(barcodeItem, Number(codeBounds.x || 0), Number(barcodeBounds.y || 0))) {
                    didMutate = true
                }
            }
            barcodeBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(barcodeItem, boundsById)
            if (barcodeBounds) {
                const codeBottom = Number(codeBounds.y || 0) + Number(codeBounds.height || 0)
                const currentGap = Number(barcodeBounds.y || 0) - codeBottom
                if (currentGap < minimumGap || currentGap > maximumGap) {
                    if (shiftItem(barcodeItem, Number(barcodeBounds.x || 0), codeBottom + targetGap)) {
                        didMutate = true
                    }
                }
            }
        }

        codeBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(codeTextItem, boundsById)
        barcodeBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(barcodeItem, boundsById)
        if (codeBounds && barcodeBounds) {
            const upperBandMaxTop = Math.max(0, Math.round(Number(previewSize?.height || 1) * 0.68))
            if (Number(barcodeBounds.y || 0) > upperBandMaxTop) {
                const requestedShift = Number(barcodeBounds.y || 0) - upperBandMaxTop
                const safeShift = Math.max(
                    0,
                    Math.min(requestedShift, Number(codeBounds.y || 0), Number(barcodeBounds.y || 0))
                )
                if (safeShift > 0) {
                    if (shiftItem(codeTextItem, Number(codeBounds.x || 0), Number(codeBounds.y || 0) - safeShift)) {
                        didMutate = true
                    }
                    barcodeBounds = AiBarcodePhotoFidelityUtils.#resolveBounds(barcodeItem, boundsById)
                    if (barcodeBounds) {
                        if (shiftItem(barcodeItem, Number(barcodeBounds.x || 0), Number(barcodeBounds.y || 0) - safeShift)) {
                            didMutate = true
                        }
                    }
                }
            }
        }

        return { didMutate }
    }

    /**
     * Finds nearest square marker shape to one text line.
     * @param {{ bounds?: { x: number, y: number, width: number, height: number } | null }} lineEntry
     * @param {Array<Record<string, any>>} markerShapes
     * @param {Map<string, { bounds?: { x: number, y: number, width: number, height: number } }>} [entryMap]
     * @returns {Record<string, any> | null}
     */
    static findNearestShapeToLine(lineEntry, markerShapes, entryMap) {
        if (!Array.isArray(markerShapes) || !markerShapes.length) return null
        const lineBounds = lineEntry?.bounds
        if (!lineBounds || !(entryMap instanceof Map)) {
            return markerShapes[0] || null
        }
        const lineCenterX = Number(lineBounds.x || 0) + Number(lineBounds.width || 0) / 2
        const lineCenterY = Number(lineBounds.y || 0) + Number(lineBounds.height || 0) / 2
        let best = null
        markerShapes.forEach((shape) => {
            const bounds = entryMap.get(shape.id)?.bounds
            if (!bounds) return
            const centerX = Number(bounds.x || 0) + Number(bounds.width || 0) / 2
            const centerY = Number(bounds.y || 0) + Number(bounds.height || 0) / 2
            const distance = Math.hypot(centerX - lineCenterX, centerY - lineCenterY)
            if (!best || distance < best.distance) {
                best = { shape, distance }
            }
        })
        return best?.shape || markerShapes[0] || null
    }

    /**
     * Creates a normalized text item from a source style item.
     * @param {Record<string, any> | null} source
     * @param {string} text
     * @returns {Record<string, any>}
     */
    static createTextItemFromSource(source, text) {
        const fallbackFontSize = Math.max(8, Math.round(Number(source?.fontSize || 12)))
        return {
            id: AiRebuildPostProcessUtils.createGeneratedItemId('text'),
            type: 'text',
            positionMode: 'absolute',
            text: String(text || ''),
            xOffset: Number(source?.xOffset || 0),
            yOffset: Number(source?.yOffset || 0),
            rotation: Number(source?.rotation || 0),
            fontFamily: String(source?.fontFamily || 'Barlow'),
            fontSize: fallbackFontSize,
            textBold: Boolean(source?.textBold),
            textItalic: Boolean(source?.textItalic),
            textUnderline: Boolean(source?.textUnderline),
            textStrikethrough: Boolean(source?.textStrikethrough)
        }
    }

    /**
     * Creates or normalizes a marker shape item.
     * @param {Record<string, any> | null} source
     * @param {Record<string, any>} optionItem
     * @returns {Record<string, any>}
     */
    static createMarkerShapeFromSource(source, optionItem) {
        const markerSize = AiRebuildPostProcessUtils.resolveMarkerSquareSize({ source, optionItem })
        const hasSourceX = Number.isFinite(Number(source?.xOffset))
        const hasSourceY = Number.isFinite(Number(source?.yOffset))
        const fallbackX = Math.max(0, Number(optionItem?.xOffset || 0) - markerSize - 8)
        return {
            id: AiRebuildPostProcessUtils.createGeneratedItemId('shape'),
            type: 'shape',
            positionMode: 'absolute',
            shapeType: 'rect',
            width: Math.max(8, Math.round(markerSize)),
            height: Math.max(8, Math.round(markerSize)),
            strokeWidth: Math.max(1, Math.round(Number(source?.strokeWidth || 2))),
            cornerRadius: 0,
            sides: 4,
            xOffset: hasSourceX ? Number(source.xOffset) : fallbackX,
            yOffset: hasSourceY ? Number(source.yOffset) : Number(optionItem?.yOffset || 0),
            rotation: Number(source?.rotation || 0)
        }
    }

    /**
     * Returns true when an item uses absolute positioning mode.
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
     * Resolves one item bounds snapshot from map entries.
     * @param {Record<string, any> | null} item
     * @param {Map<string, { x: number, y: number, width: number, height: number }>} boundsById
     * @returns {{ x: number, y: number, width: number, height: number } | null}
     */
    static #resolveBounds(item, boundsById) {
        if (!item || !(boundsById instanceof Map)) return null
        const bounds = boundsById.get(item.id)
        if (!bounds) return null
        return bounds
    }

    /**
     * Resolves a bounds center.
     * @param {{ x: number, y: number, width: number, height: number }} bounds
     * @returns {{ x: number, y: number }}
     */
    static #resolveCenter(bounds) {
        return {
            x: Number(bounds?.x || 0) + Number(bounds?.width || 0) / 2,
            y: Number(bounds?.y || 0) + Number(bounds?.height || 0) / 2
        }
    }

    /**
     * Scores one barcode-to-code pair candidate.
     * @param {{ x: number, y: number, width: number, height: number }} barcodeBounds
     * @param {{ x: number, y: number, width: number, height: number }} codeBounds
     * @returns {number}
     */
    static #computeBarcodeCodePairScore(barcodeBounds, codeBounds) {
        const horizontalDelta = Math.abs(Number(barcodeBounds.x || 0) - Number(codeBounds.x || 0))
        const verticalDelta = Number(barcodeBounds.y || 0) - Number(codeBounds.y || 0)
        const barcodeCenter = AiBarcodePhotoFidelityUtils.#resolveCenter(barcodeBounds)
        const codeCenter = AiBarcodePhotoFidelityUtils.#resolveCenter(codeBounds)
        const centerDistance = Math.hypot(barcodeCenter.x - codeCenter.x, barcodeCenter.y - codeCenter.y)
        let score = horizontalDelta * 2 + Math.abs(verticalDelta) + centerDistance * 0.2
        if (verticalDelta < -6) score += 48
        if (horizontalDelta > 64) score += (horizontalDelta - 64) * 2.2
        return score
    }

    /**
     * Scores short-token proximity to code text.
     * @param {{ x: number, y: number, width: number, height: number } | null} tokenBounds
     * @param {{ x: number, y: number, width: number, height: number }} codeBounds
     * @returns {number}
     */
    static #computeShortTokenScore(tokenBounds, codeBounds) {
        if (!tokenBounds) return Number.POSITIVE_INFINITY
        const tokenCenter = AiBarcodePhotoFidelityUtils.#resolveCenter(tokenBounds)
        const codeCenter = AiBarcodePhotoFidelityUtils.#resolveCenter(codeBounds)
        const distance = Math.hypot(tokenCenter.x - codeCenter.x, tokenCenter.y - codeCenter.y)
        const rightSidePenalty = Number(tokenBounds.x || 0) > Number(codeBounds.x || 0) ? 36 : 0
        return distance + rightSidePenalty
    }

    /**
     * Shifts one item to a target top-left position and updates bounds cache.
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
}
