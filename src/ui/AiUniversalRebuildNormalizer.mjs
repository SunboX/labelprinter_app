import { AiRebuildPostProcessUtils } from './AiRebuildPostProcessUtils.mjs'
import { AiRebuildPlacementHeuristics } from './AiRebuildPlacementHeuristics.mjs'
import { AiBarcodePhotoFidelityUtils } from './AiBarcodePhotoFidelityUtils.mjs'
import { AiQrFormPhotoFidelityUtils } from './AiQrFormPhotoFidelityUtils.mjs'
import { Media } from 'labelprinterkit-web/src/index.mjs'
/**
 * Universal, structure-driven rebuild normalizer for assistant redraw flows.
 */
export class AiUniversalRebuildNormalizer {
    /**
     * Runs universal normalization on current state items.
     * @param {{
     *  state: { items: Array<Record<string, any>> },
     *  previewRenderer: any,
     *  renderAfterMutation: () => Promise<void>,
     *  onWarning?: (warning: { key: string, params?: Record<string, string | number> }) => void
     * }} options
     * @returns {Promise<{ applied: boolean, didMutate: boolean, confidence: number, reason: string, placementResolved: boolean }>}
     */
    static async normalize({ state, previewRenderer, renderAfterMutation, onWarning }) {
        const items = Array.isArray(state?.items) ? state.items : []
        if (!items.length) {
            return {
                applied: false,
                didMutate: false,
                confidence: 0,
                reason: 'empty-items',
                placementResolved: false
            }
        }
        const emittedWarnings = new Set()
        const emitWarning = (key, params = {}) => {
            const warningKey = String(key || '').trim()
            if (!warningKey) return
            const warningId = `${warningKey}:${JSON.stringify(params)}`
            if (emittedWarnings.has(warningId)) return
            emittedWarnings.add(warningId)
            if (typeof onWarning === 'function') {
                onWarning({ key: warningKey, params })
            }
        }

        let didMutate = false
        let confidence = 0
        let reason = 'no-op'
        const duplicateAggregate = AiRebuildPostProcessUtils.findDuplicatedAggregateTextItem(items)
        if (duplicateAggregate?.id) {
            const filtered = items.filter((item) => item.id !== duplicateAggregate.id)
            if (filtered.length !== items.length) {
                items.splice(0, items.length, ...filtered)
                didMutate = true
                confidence = Math.max(confidence, 0.32)
                reason = 'removed-aggregate-text'
            }
        }

        const markerSnapshot = AiUniversalRebuildNormalizer.#captureMarkerSnapshot(items)
        const markerCleanup = AiRebuildPostProcessUtils.stripLeadingMarkersFromTextItems(items)
        if (markerCleanup.changedCount > 0) {
            didMutate = true
            confidence = Math.max(confidence, 0.4)
            reason = 'normalized-marker-prefixes'
        }

        if (didMutate) {
            await renderAfterMutation()
        }
        const machineItemCount = items.filter((item) => AiUniversalRebuildNormalizer.#isMachineReadable(item)).length
        const markerRewrite = await AiUniversalRebuildNormalizer.#maybeRewriteMarkerGroup({
            state,
            previewRenderer,
            renderAfterMutation,
            markerSnapshot,
            machineItemCount
        })
        if (markerRewrite.didMutate) {
            didMutate = true
            confidence = Math.max(confidence, markerRewrite.confidence)
            reason = markerRewrite.reason || reason
            await renderAfterMutation()
        }
        const placement = await AiUniversalRebuildNormalizer.#applyPlacementSolver({
            state,
            previewRenderer,
            renderAfterMutation,
            markerEvidence:
                markerSnapshot.markerEntries.length > 0 ||
                markerCleanup.removedMarkerCount > 0 ||
                markerRewrite.markerShapeCount > 0
        })
        const placementReason = String(placement.reason || '')
        const placementReasonIsBarcodePhotoFidelity = [
            'applied-barcode-photo-fidelity',
            'barcode-photo-fidelity-no-change',
            'applied-qr-form-photo-fidelity',
            'qr-form-photo-fidelity-no-change'
        ].includes(placementReason)
        if (placement.didMutate) {
            didMutate = true
            confidence = Math.max(confidence, placement.confidence)
            reason = placement.reason || reason
        } else if (reason === 'no-op' && placementReasonIsBarcodePhotoFidelity) {
            confidence = Math.max(confidence, Number(placement.confidence || 0))
            reason = placementReason
        }
        if (placement.markerEvidence && !placement.placementResolved) {
            emitWarning('assistant.warningNormalizationPlacementApproximate')
        }
        if (didMutate && confidence < 0.55) {
            emitWarning('assistant.warningNormalizationLowConfidence')
        }
        AiRebuildPostProcessUtils.debugLog('assistant-debug-normalize', 'normalize-result', {
            didMutate,
            confidence,
            reason,
            placementResolved: placement.placementResolved,
            markerEvidence: placement.markerEvidence,
            itemCountAfter: Array.isArray(state?.items) ? state.items.length : 0
        })

        return {
            applied: didMutate,
            didMutate,
            confidence: Number(confidence.toFixed(3)),
            reason,
            placementResolved: placement.placementResolved
        }
    }
    /**
     * Captures marker evidence before text cleanup mutates line prefixes.
     * @param {Array<Record<string, any>>} items
     * @returns {{ lineEntries: Array<{ line: string, item: Record<string, any>, globalIndex: number, hasMarker: boolean }>, markerEntries: Array<{ line: string, item: Record<string, any>, globalIndex: number, hasMarker: boolean }> }}
     */
    static #captureMarkerSnapshot(items) {
        const lineEntries = AiRebuildPostProcessUtils.collectTextLineEntries(items)
        const markerEntries = lineEntries.filter((entry) => entry.hasMarker)
        return { lineEntries, markerEntries }
    }
    /**
     * Returns true for machine-readable items.
     * @param {Record<string, any>} item
     * @returns {boolean}
     */
    static #isMachineReadable(item) {
        const type = String(item?.type || '')
            .trim()
            .toLowerCase()
        return type === 'qr' || type === 'barcode'
    }
    /**
     * Rewrites marker-like text groups into heading + option + marker structure when confidence is sufficient.
     * @param {{
     *  state: { items: Array<Record<string, any>> },
     *  previewRenderer: any,
     *  renderAfterMutation: () => Promise<void>,
     *  markerSnapshot: { lineEntries: Array<any>, markerEntries: Array<any> },
     *  machineItemCount: number
     * }} options
     * @returns {Promise<{ didMutate: boolean, confidence: number, reason: string, markerShapeCount: number }>}
     */
    static async #maybeRewriteMarkerGroup({
        state,
        previewRenderer,
        renderAfterMutation,
        markerSnapshot,
        machineItemCount
    }) {
        const items = Array.isArray(state?.items) ? state.items : []
        const textItems = items.filter((item) => item?.type === 'text')
        const markerShapes = items.filter((item) => AiRebuildPostProcessUtils.isSquareMarkerShape(item))
        const markerShapeCount = markerShapes.length

        if (!textItems.length || machineItemCount > 0) {
            return {
                didMutate: false,
                confidence: 0,
                reason: 'skip-machine-readable',
                markerShapeCount
            }
        }

        const hasTextMarker = markerSnapshot.markerEntries.length > 0
        const hasShapeMarkerPattern = markerShapes.length > 0 && textItems.length >= 2
        if (!hasTextMarker && !hasShapeMarkerPattern) {
            return {
                didMutate: false,
                confidence: 0,
                reason: 'skip-no-marker-evidence',
                markerShapeCount
            }
        }
        if (!hasTextMarker && textItems.length > 3) {
            return {
                didMutate: false,
                confidence: 0.2,
                reason: 'skip-ambiguous-many-text-items',
                markerShapeCount
            }
        }

        await AiUniversalRebuildNormalizer.#ensureBounds(state, previewRenderer, renderAfterMutation)
        const entryMap = previewRenderer?._interactiveItemsById instanceof Map ? previewRenderer._interactiveItemsById : null
        if (!hasTextMarker && markerShapes.length > 0 && textItems.length === 2) {
            const orderedTextItems = [...textItems].sort(
                (left, right) =>
                    AiRebuildPostProcessUtils.resolveItemTop(left, entryMap) -
                    AiRebuildPostProcessUtils.resolveItemTop(right, entryMap)
            )
            let headingSource = orderedTextItems[0] || null
            let optionSource = orderedTextItems[orderedTextItems.length - 1] || null
            if (
                headingSource &&
                optionSource &&
                Math.abs(
                    AiRebuildPostProcessUtils.resolveItemTop(optionSource, entryMap) -
                        AiRebuildPostProcessUtils.resolveItemTop(headingSource, entryMap)
                ) < 2
            ) {
                const nearestOption = AiRebuildPostProcessUtils.findNearestTextItemToMarkers(
                    textItems,
                    markerShapes,
                    entryMap
                )
                if (nearestOption) {
                    optionSource = nearestOption
                    headingSource = textItems.find((item) => item.id !== optionSource.id) || headingSource
                }
            }
            const headingText = String(headingSource?.text || '').trim()
            const optionText = String(optionSource?.text || '').trim()
            if (headingSource && optionSource && headingText && optionText) {
                const optionBounds = entryMap instanceof Map ? entryMap.get(optionSource.id)?.bounds || null : null
                const markerSource = AiBarcodePhotoFidelityUtils.findNearestShapeToLine(
                    { bounds: optionBounds },
                    markerShapes,
                    entryMap || undefined
                ) || markerShapes[0] || null
                const headingItem = AiBarcodePhotoFidelityUtils.createTextItemFromSource(headingSource, headingText)
                const optionItem = AiBarcodePhotoFidelityUtils.createTextItemFromSource(optionSource, optionText)
                AiUniversalRebuildNormalizer.#enforceStackedMarkerSections({
                    headingItem,
                    optionItem,
                    headingText,
                    headingSource,
                    optionSource
                })
                AiRebuildPostProcessUtils.harmonizeMarkerSectionSizing({ state, headingItem, optionItem })
                const markerItem = AiBarcodePhotoFidelityUtils.createMarkerShapeFromSource(markerSource, optionItem)
                const passthrough = items.filter((item) => {
                    if (item.type === 'text') return false
                    if (markerSource && item.id === markerSource.id) return false
                    if (AiRebuildPostProcessUtils.isSquareMarkerShape(item)) return false
                    return true
                })
                const nextItems = [...passthrough, headingItem, markerItem, optionItem]
                const sameStructure =
                    nextItems.length === items.length &&
                    nextItems.every((candidate, index) => candidate.id === items[index]?.id)
                if (!sameStructure) {
                    items.splice(0, items.length, ...nextItems)
                    return {
                        didMutate: true,
                        confidence: 0.74,
                        reason: 'rewrote-shape-two-text-group',
                        markerShapeCount: 1
                    }
                }
            }
        }
        const lineEntries = AiRebuildPostProcessUtils.collectTextLineEntries(items, entryMap || undefined)
        if (!lineEntries.length) {
            return {
                didMutate: false,
                confidence: 0,
                reason: 'skip-no-lines',
                markerShapeCount
            }
        }

        const optionStart = hasTextMarker
            ? AiUniversalRebuildNormalizer.#resolveMarkerOptionStart(lineEntries, markerSnapshot)
            : AiUniversalRebuildNormalizer.#findNearestOptionLineFromMarkerShape(lineEntries, markerShapes, entryMap)
        if (!optionStart) {
            return {
                didMutate: false,
                confidence: 0.25,
                reason: 'skip-no-option-anchor',
                markerShapeCount
            }
        }

        const headingLines = lineEntries
            .filter((entry) => entry.globalIndex < optionStart.globalIndex)
            .map((entry) => String(entry.line || '').trim())
            .filter(Boolean)
        if (!headingLines.length) {
            return {
                didMutate: false,
                confidence: 0.3,
                reason: 'skip-no-heading-lines',
                markerShapeCount
            }
        }

        const optionLineCandidates = lineEntries.filter((entry) => entry.globalIndex >= optionStart.globalIndex)
        const firstOption = AiRebuildPostProcessUtils.stripLeadingMarker(String(optionLineCandidates[0]?.line || '')).text
        const secondOption = optionLineCandidates
            .slice(1)
            .map((entry) => String(entry.line || '').trim())
            .find((line) => line && !AiRebuildPostProcessUtils.hasLeadingMarker(line))
        const optionLines = [firstOption]
        if (secondOption && (secondOption.startsWith('(') || secondOption.length <= 48)) {
            optionLines.push(secondOption)
        }

        const headingText = headingLines.join('\n').trim()
        const optionText = optionLines.map((line) => String(line || '').trim()).filter(Boolean).join('\n').trim()
        if (!headingText || !optionText) {
            return {
                didMutate: false,
                confidence: 0.35,
                reason: 'skip-invalid-sections',
                markerShapeCount
            }
        }

        const headingSource =
            lineEntries.find((entry) => entry.globalIndex < optionStart.globalIndex)?.item || textItems[0] || null
        const markerSource = AiBarcodePhotoFidelityUtils.findNearestShapeToLine(optionStart, markerShapes, entryMap)
        const optionSource = AiUniversalRebuildNormalizer.#resolveOptionSourceItem({
            optionStartItem: optionStart.item || null,
            headingSource,
            textItems,
            optionPrimaryLine: firstOption,
            markerSource,
            entryMap
        })

        const headingItem = AiBarcodePhotoFidelityUtils.createTextItemFromSource(headingSource, headingText)
        const optionItem = AiBarcodePhotoFidelityUtils.createTextItemFromSource(optionSource, optionText)
        AiUniversalRebuildNormalizer.#enforceStackedMarkerSections({
            headingItem,
            optionItem,
            headingText,
            headingSource,
            optionSource
        })
        AiUniversalRebuildNormalizer.#refineMarkerSectionTypography({
            hasTextMarker,
            headingSource,
            optionSource,
            headingItem,
            optionItem
        })
        AiRebuildPostProcessUtils.harmonizeMarkerSectionSizing({ state, headingItem, optionItem })
        const markerItem = AiBarcodePhotoFidelityUtils.createMarkerShapeFromSource(markerSource, optionItem)

        const passthrough = items.filter((item) => {
            if (item.type === 'text') return false
            if (markerSource && item.id === markerSource.id) return false
            if (AiRebuildPostProcessUtils.isSquareMarkerShape(item)) return false
            return true
        })

        const nextItems = [...passthrough, headingItem, markerItem, optionItem]
        const sameStructure =
            nextItems.length === items.length &&
            nextItems.every((candidate, index) => candidate.id === items[index]?.id)

        if (!sameStructure) {
            items.splice(0, items.length, ...nextItems)
            return {
                didMutate: true,
                confidence: hasTextMarker ? 0.82 : 0.67,
                reason: hasTextMarker ? 'rewrote-marker-text-group' : 'rewrote-shape-text-group',
                markerShapeCount: 1
            }
        }

        return {
            didMutate: false,
            confidence: 0.45,
            reason: 'skip-structure-unchanged',
            markerShapeCount
        }
    }
    /**
     * Finds option anchor line nearest to an existing marker shape.
     * @param {Array<{ bounds: { x: number, y: number, width: number, height: number } | null }>} lineEntries
     * @param {Array<Record<string, any>>} markerShapes
     * @param {Map<string, { bounds?: { x: number, y: number, width: number, height: number } }>} [entryMap]
     * @returns {any | null}
     */
    static #findNearestOptionLineFromMarkerShape(lineEntries, markerShapes, entryMap) {
        const textLines = Array.isArray(lineEntries) ? lineEntries.filter((entry) => entry?.line) : []
        if (!textLines.length || !Array.isArray(markerShapes) || !markerShapes.length) return null
        const shapeEntries = markerShapes
            .map((shape) => ({
                shape,
                bounds: entryMap instanceof Map ? entryMap.get(shape.id)?.bounds || null : null
            }))
            .filter((entry) => entry.bounds)
        if (!shapeEntries.length) {
            return textLines[textLines.length - 1] || null
        }
        let best = null
        textLines.forEach((line) => {
            const lineBounds = line.bounds
            if (!lineBounds) return
            const lineCenterX = Number(lineBounds.x || 0) + Number(lineBounds.width || 0) / 2
            const lineCenterY = Number(lineBounds.y || 0) + Number(lineBounds.height || 0) / 2
            shapeEntries.forEach((shapeEntry) => {
                const bounds = shapeEntry.bounds
                const shapeCenterX = Number(bounds.x || 0) + Number(bounds.width || 0) / 2
                const shapeCenterY = Number(bounds.y || 0) + Number(bounds.height || 0) / 2
                const dx = lineCenterX - shapeCenterX
                const dy = lineCenterY - shapeCenterY
                const distance = Math.hypot(dx, dy)
                if (!best || distance < best.distance) {
                    best = { line, distance }
                }
            })
        })
        return best?.line || textLines[textLines.length - 1] || null
    }
    /**
     * Resolves option-start line after marker prefixes were stripped from current text state.
     * @param {Array<{ globalIndex: number }>} lineEntries
     * @param {{ markerEntries: Array<{ globalIndex: number }> }} markerSnapshot
     * @returns {any | null}
     */
    static #resolveMarkerOptionStart(lineEntries, markerSnapshot) {
        const markerIndex = Number(markerSnapshot?.markerEntries?.[0]?.globalIndex)
        if (!Number.isFinite(markerIndex)) return null
        return (
            lineEntries.find((entry) => Number(entry?.globalIndex) === markerIndex) ||
            lineEntries[Math.max(0, Math.min(lineEntries.length - 1, Math.round(markerIndex)))] ||
            null
        )
    }
    /**
     * Chooses the best source item for option text style/anchor reconstruction.
     * @param {{
     *  optionStartItem: Record<string, any> | null,
     *  headingSource: Record<string, any> | null,
     *  textItems: Array<Record<string, any>>,
     *  optionPrimaryLine: string,
     *  markerSource: Record<string, any> | null,
     *  entryMap: Map<string, { bounds?: { x: number, y: number, width: number, height: number } }> | null
     * }} options
     * @returns {Record<string, any> | null}
     */
    static #resolveOptionSourceItem({ optionStartItem, headingSource, textItems, optionPrimaryLine, markerSource, entryMap }) {
        const fallback = optionStartItem || headingSource || textItems[0] || null
        const normalizedPrimary = AiRebuildPostProcessUtils.normalizeText(optionPrimaryLine)
        if (!normalizedPrimary) return fallback

        const candidates = textItems.filter((item) => {
            if (!item || item.id === headingSource?.id) return false
            const normalizedText = AiRebuildPostProcessUtils.normalizeText(item.text)
            return normalizedText.includes(normalizedPrimary)
        })
        if (!candidates.length) return fallback

        const markerBounds = markerSource && entryMap instanceof Map ? entryMap.get(markerSource.id)?.bounds || null : null
        if (markerBounds) {
            const markerCenterX = Number(markerBounds.x || 0) + Number(markerBounds.width || 0) / 2
            const markerCenterY = Number(markerBounds.y || 0) + Number(markerBounds.height || 0) / 2
            let best = null
            candidates.forEach((candidate) => {
                const bounds = entryMap.get(candidate.id)?.bounds || null
                if (!bounds) return
                const candidateCenterX = Number(bounds.x || 0) + Number(bounds.width || 0) / 2
                const candidateCenterY = Number(bounds.y || 0) + Number(bounds.height || 0) / 2
                const distance = Math.hypot(markerCenterX - candidateCenterX, markerCenterY - candidateCenterY)
                const linePenalty = AiUniversalRebuildNormalizer.#countNonEmptyLines(candidate.text) * 4
                const score = distance + linePenalty
                if (!best || score < best.score) {
                    best = { candidate, score }
                }
            })
            if (best?.candidate) return best.candidate
        }

        return (
            [...candidates].sort((left, right) => {
                const leftLines = AiUniversalRebuildNormalizer.#countNonEmptyLines(left.text)
                const rightLines = AiUniversalRebuildNormalizer.#countNonEmptyLines(right.text)
                if (leftLines !== rightLines) return leftLines - rightLines
                return Number(right?.yOffset || 0) - Number(left?.yOffset || 0)
            })[0] || fallback
        )
    }
    /**
     * Ensures marker-like heading/option sections remain stacked and leave marker gutter room.
     * @param {{
     *  headingItem: Record<string, any>,
     *  optionItem: Record<string, any>,
     *  headingText: string,
     *  headingSource: Record<string, any> | null,
     *  optionSource: Record<string, any> | null
     * }} options
     */
    static #enforceStackedMarkerSections({ headingItem, optionItem, headingText, headingSource, optionSource }) {
        if (!headingItem || !optionItem) return
        const headingLineCount = AiUniversalRebuildNormalizer.#countNonEmptyLines(headingText)
        const headingLineHeight = Math.max(8, Math.round(Number(headingItem.fontSize || 12) * 1.15))
        // Keep a clearly visible breathing gap between heading and checkbox rows.
        const sectionGap = Math.max(6, Math.round(headingLineHeight * 0.55))
        const minimumOptionY = Number(headingItem.yOffset || 0) + headingLineCount * headingLineHeight + sectionGap

        if (Number(optionItem.yOffset || 0) < minimumOptionY || headingSource?.id === optionSource?.id) {
            optionItem.yOffset = minimumOptionY
        }

        if (headingSource?.id === optionSource?.id) {
            const markerGutter = Math.max(12, Math.round(Number(optionItem.fontSize || 12) * 1.1))
            const minimumOptionX = Number(headingItem.xOffset || 0) + markerGutter
            if (Number(optionItem.xOffset || 0) < minimumOptionX) {
                optionItem.xOffset = minimumOptionX
            }
        }
    }
    /**
     * Refines marker section typography for text-marker monolith splits.
     * Keeps heading emphasis while normalizing option readability.
     * @param {{
     *  hasTextMarker: boolean,
     *  headingSource: Record<string, any> | null,
     *  optionSource: Record<string, any> | null,
     *  headingItem: Record<string, any>,
     *  optionItem: Record<string, any>
     * }} options
     */
    static #refineMarkerSectionTypography({ hasTextMarker, headingSource, optionSource, headingItem, optionItem }) {
        if (!hasTextMarker) return
        if (!headingItem || !optionItem) return
        if (!headingSource || !optionSource) return
        if (String(headingSource.id || '') !== String(optionSource.id || '')) return

        headingItem.textItalic = Boolean(headingSource.textItalic)
        optionItem.textItalic = false

        const headingSize = Math.max(8, Math.round(Number(headingItem.fontSize || 12)))
        const optionSize = Math.max(8, Math.round(Number(optionItem.fontSize || 12)))
        if (optionSize >= headingSize) {
            optionItem.fontSize = Math.max(8, Math.round(headingSize * 0.9))
        }
    }
    /**
     * Counts non-empty lines in one text value.
     * @param {string} text
     * @returns {number}
     */
    static #countNonEmptyLines(text) {
        return Math.max(
            1,
            String(text || '')
                .replace(/\r/g, '')
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean).length
        )
    }
    /**
     * Applies bounded placement solving using current interactive bounds.
     * @param {{
     *  state: { items: Array<Record<string, any>> },
     *  previewRenderer: any,
     *  renderAfterMutation: () => Promise<void>,
     *  markerEvidence: boolean
     * }} options
     * @returns {Promise<{ didMutate: boolean, confidence: number, reason: string, placementResolved: boolean, markerEvidence: boolean }>}
     */
    static async #applyPlacementSolver({ state, previewRenderer, renderAfterMutation, markerEvidence }) {
        const items = Array.isArray(state?.items) ? state.items : []
        if (!items.length) {
            return {
                didMutate: false,
                confidence: 0,
                reason: 'skip-empty',
                placementResolved: false,
                markerEvidence
            }
        }

        const previewSize = AiRebuildPostProcessUtils.resolvePreviewSize(previewRenderer)
        const boundsReady = await AiUniversalRebuildNormalizer.#ensureBounds(state, previewRenderer, renderAfterMutation)
        if (!boundsReady) {
            return {
                didMutate: false,
                confidence: 0,
                reason: 'missing-bounds',
                placementResolved: false,
                markerEvidence
            }
        }

        const maxSolveIterations = 5
        let didMutate = false
        let placementResolved = false
        let usedBarcodePhotoFidelity = false
        let usedQrFormPhotoFidelity = false, qrFormFidelityMutated = false
        for (let iteration = 0; iteration < maxSolveIterations; iteration += 1) {
            const entryMap = previewRenderer?._interactiveItemsById
            if (!(entryMap instanceof Map)) break
            const boundsById = new Map()
            items.forEach((item) => {
                const bounds = entryMap.get(item.id)?.bounds
                if (bounds) {
                    boundsById.set(item.id, {
                        x: Number(bounds.x || 0),
                        y: Number(bounds.y || 0),
                        width: Math.max(1, Number(bounds.width || 1)),
                        height: Math.max(1, Number(bounds.height || 1))
                    })
                }
            })

            let movedThisIteration = false
            const barcodePhotoPattern = usedBarcodePhotoFidelity
                ? {
                      matched: true,
                      roles: AiBarcodePhotoFidelityUtils.resolveBarcodePhotoRoles(items, boundsById)
                  }
                : AiBarcodePhotoFidelityUtils.detectBarcodePhotoAbsolutePattern({
                      items,
                      markerEvidence,
                      boundsById
                  })
            if (barcodePhotoPattern.matched) {
                usedBarcodePhotoFidelity = true
                const prominenceFloors = AiUniversalRebuildNormalizer.#resolveBarcodePhotoProminenceFloors(state)
                const prominenceResult = AiBarcodePhotoFidelityUtils.applyBarcodePhotoProminenceFloors({
                    roles: barcodePhotoPattern.roles,
                    floors: prominenceFloors
                })
                if (prominenceResult.didMutate) {
                    movedThisIteration = true
                    didMutate = true
                    await renderAfterMutation()
                    continue
                }
                const fidelityResult = AiBarcodePhotoFidelityUtils.applyBarcodePhotoFidelityPass({
                    roles: barcodePhotoPattern.roles,
                    boundsById,
                    previewSize
                })
                if (!fidelityResult.didMutate) {
                    placementResolved = true
                    break
                }
                movedThisIteration = true
                didMutate = true
                await renderAfterMutation()
                continue
            }
            if (usedBarcodePhotoFidelity) {
                placementResolved = true
                break
            }
            const qrFormPhotoPattern = usedQrFormPhotoFidelity
                ? { matched: true, roles: AiQrFormPhotoFidelityUtils.resolveQrFormRoles(items, boundsById) }
                : AiQrFormPhotoFidelityUtils.detectQrFormAbsolutePattern({ items, markerEvidence, boundsById })
            if (qrFormPhotoPattern.matched) {
                usedQrFormPhotoFidelity = true
                const qrFormFidelityResult = AiQrFormPhotoFidelityUtils.applyQrFormFidelityPass({ roles: qrFormPhotoPattern.roles, boundsById, previewSize, state })
                if (qrFormFidelityResult.didMutate) {
                    qrFormFidelityMutated = true
                    movedThisIteration = true
                    didMutate = true
                    await renderAfterMutation()
                    continue
                }
                if (qrFormFidelityResult.placementResolved) {
                    placementResolved = true
                    break
                }
                placementResolved = false
                break
            }
            const markerPairs = AiUniversalRebuildNormalizer.#resolveMarkerTextPairs(items, boundsById)
            const verticalFlowAdjusted = AiUniversalRebuildNormalizer.#enforceMarkerFlowVerticalStack(
                items,
                boundsById,
                previewSize,
                markerPairs
            )
            if (verticalFlowAdjusted) {
                movedThisIteration = true
            }
            markerPairs.forEach(({ markerItem, textItem }) => {
                const markerBounds = boundsById.get(markerItem.id)
                const textBounds = boundsById.get(textItem.id)
                if (!markerBounds || !textBounds) return
                const gap = Math.max(
                    10,
                    Math.round(previewSize.height * 0.065),
                    Math.round(Math.max(8, Number(textItem.fontSize || 12)) * 0.75)
                )
                const desiredX = Number(textBounds.x || 0) - Number(markerBounds.width || 0) - gap
                const desiredY =
                    Number(textBounds.y || 0) +
                    Math.round((Number(textBounds.height || 0) - Number(markerBounds.height || 0)) / 2)
                const clamped = AiRebuildPostProcessUtils.clampTarget(markerBounds, previewSize, desiredX, desiredY)
                const markerRight = Number(markerBounds.x || 0) + Number(markerBounds.width || 0)
                const textLeft = Number(textBounds.x || 0)
                const needsLeftAdjustment = markerRight > textLeft - 1
                const needsVerticalAdjustment =
                    Math.abs(Number(markerBounds.y || 0) - Number(clamped.y || 0)) >
                    Math.max(1, Number(markerBounds.height || 0) * 0.2)
                if (!needsLeftAdjustment && !needsVerticalAdjustment) return
                AiRebuildPostProcessUtils.shiftItemTo(markerItem, markerBounds, clamped.x, clamped.y)
                boundsById.set(markerItem.id, {
                    ...markerBounds,
                    x: clamped.x,
                    y: clamped.y
                })
                movedThisIteration = true
            })

            const orderedEntries = items
                .map((item) => ({ item, bounds: boundsById.get(item.id) || null }))
                .filter((entry) => entry.bounds)
                .sort((left, right) => {
                    const leftY = Number(left.bounds?.y || 0)
                    const rightY = Number(right.bounds?.y || 0)
                    if (leftY !== rightY) return leftY - rightY
                    return Number(left.bounds?.x || 0) - Number(right.bounds?.x || 0)
                })

            for (let leftIndex = 0; leftIndex < orderedEntries.length; leftIndex += 1) {
                for (let rightIndex = leftIndex + 1; rightIndex < orderedEntries.length; rightIndex += 1) {
                    const leftEntry = orderedEntries[leftIndex]
                    const rightEntry = orderedEntries[rightIndex]
                    const overlap = AiRebuildPostProcessUtils.computeBoundsOverlap(leftEntry.bounds, rightEntry.bounds)
                    if (overlap.area <= 0) continue
                    const pushGap = Math.max(2, Math.round(previewSize.height * 0.02))
                    const pushRightX = Number(rightEntry.bounds.x || 0) + overlap.overlapX + pushGap
                    const pushDownY = Number(rightEntry.bounds.y || 0) + overlap.overlapY + pushGap
                    const isTextTextOverlap = leftEntry.item?.type === 'text' && rightEntry.item?.type === 'text'
                    const touchesMachineReadable =
                        AiUniversalRebuildNormalizer.#isMachineReadable(leftEntry.item) ||
                        AiUniversalRebuildNormalizer.#isMachineReadable(rightEntry.item)
                    const preferVerticalFlow = AiRebuildPlacementHeuristics.shouldPreferVerticalOverlapFlow({
                        leftItem: leftEntry.item,
                        rightItem: rightEntry.item,
                        isTextTextOverlap,
                        touchesMachineReadable
                    })
                    const preferHorizontal =
                        !preferVerticalFlow &&
                        Number(previewSize.width || 0) >= Number(previewSize.height || 0) &&
                        pushRightX + Number(rightEntry.bounds.width || 0) <= Number(previewSize.width || 0)
                    const target = AiRebuildPostProcessUtils.clampTarget(
                        rightEntry.bounds,
                        previewSize,
                        preferHorizontal ? pushRightX : Number(rightEntry.bounds.x || 0),
                        preferHorizontal ? Number(rightEntry.bounds.y || 0) : pushDownY
                    )
                    if (
                        Math.round(target.x) === Math.round(Number(rightEntry.bounds.x || 0)) &&
                        Math.round(target.y) === Math.round(Number(rightEntry.bounds.y || 0))
                    ) {
                        continue
                    }
                    AiRebuildPostProcessUtils.shiftItemTo(rightEntry.item, rightEntry.bounds, target.x, target.y)
                    rightEntry.bounds.x = target.x
                    rightEntry.bounds.y = target.y
                    movedThisIteration = true
                }
            }

            orderedEntries.forEach((entry) => {
                const clamped = AiRebuildPostProcessUtils.clampTarget(
                    entry.bounds,
                    previewSize,
                    Number(entry.bounds.x || 0),
                    Number(entry.bounds.y || 0)
                )
                if (
                    Math.round(clamped.x) === Math.round(Number(entry.bounds.x || 0)) &&
                    Math.round(clamped.y) === Math.round(Number(entry.bounds.y || 0))
                ) {
                    return
                }
                AiRebuildPostProcessUtils.shiftItemTo(entry.item, entry.bounds, clamped.x, clamped.y)
                entry.bounds.x = clamped.x
                entry.bounds.y = clamped.y
                movedThisIteration = true
            })

            if (AiRebuildPostProcessUtils.enforceMarkerLeftOfText({ markerPairs, boundsById, previewSize })) {
                movedThisIteration = true
            }

            if (!movedThisIteration) {
                placementResolved = true
                break
            }

            didMutate = true
            await renderAfterMutation()
        }

        if (usedBarcodePhotoFidelity) {
            return {
                didMutate,
                confidence: didMutate ? 0.78 : 0.72,
                reason: didMutate ? 'applied-barcode-photo-fidelity' : 'barcode-photo-fidelity-no-change',
                placementResolved: true,
                markerEvidence
            }
        }
        if (usedQrFormPhotoFidelity && (qrFormFidelityMutated || !didMutate)) {
            return { didMutate, confidence: didMutate ? 0.75 : 0.7, reason: didMutate ? 'applied-qr-form-photo-fidelity' : 'qr-form-photo-fidelity-no-change', placementResolved, markerEvidence }
        }
        const confidence = markerEvidence ? (placementResolved ? 0.72 : 0.52) : didMutate ? (placementResolved ? 0.64 : 0.46) : 0.18
        return {
            didMutate,
            confidence,
            reason: didMutate ? 'applied-placement-solver' : 'placement-no-change',
            placementResolved,
            markerEvidence
        }
    }
    /**
     * Resolves adaptive prominence floors for this style pattern.
     * Uses W24 as reference and scales by media print-area ratio with safety clamps.
     * @param {{ media?: string }} state
     * @returns {{ minTokenFontSize: number, minBarcodeWidth: number, minBarcodeHeight: number }}
     */
    static #resolveBarcodePhotoProminenceFloors(state) {
        const baseFloors = {
            minTokenFontSize: 58,
            minBarcodeWidth: 240,
            minBarcodeHeight: 40
        }
        const referencePrintArea = Math.max(1, Number(Media?.W24?.printArea || 128))
        const mediaId = String(state?.media || 'W24').trim()
        const media = Media[mediaId] || Media.W24 || null
        const mediaPrintArea = Math.max(1, Number(media?.printArea || referencePrintArea))
        const rawScale = mediaPrintArea / referencePrintArea
        const scale = Math.max(0.72, Math.min(1.35, rawScale))
        return {
            minTokenFontSize: Math.max(18, Math.round(baseFloors.minTokenFontSize * scale)),
            minBarcodeWidth: Math.max(96, Math.round(baseFloors.minBarcodeWidth * scale)),
            minBarcodeHeight: Math.max(16, Math.round(baseFloors.minBarcodeHeight * scale))
        }
    }
    /**
     * Enforces vertical heading-to-option flow for marker-paired text groups using actual rendered bounds.
     * @param {Array<Record<string, any>>} items
     * @param {Map<string, { x: number, y: number, width: number, height: number }>} boundsById
     * @param {{ width: number, height: number }} previewSize
     * @param {Array<{ markerItem: Record<string, any>, textItem: Record<string, any> }>} markerPairs
     * @returns {boolean}
     */
    static #enforceMarkerFlowVerticalStack(items, boundsById, previewSize, markerPairs) {
        if (!Array.isArray(markerPairs) || !markerPairs.length) return false
        const textEntries = items
            .filter((item) => item?.type === 'text')
            .map((item) => ({
                item,
                bounds: boundsById.get(item.id) || null
            }))
            .filter((entry) => entry.bounds)
        if (textEntries.length < 2) return false

        const previewHeight = Math.max(1, Number(previewSize?.height || 1))
        const topMargin = Math.max(3, Math.round(previewHeight * 0.03))
        const headingMaxTop = Math.max(topMargin, Math.round(previewHeight * 0.08))
        const bottomMargin = Math.max(3, Math.round(previewHeight * 0.03))
        let didMove = false
        markerPairs.forEach(({ textItem }) => {
            const optionBounds = boundsById.get(textItem.id)
            if (!optionBounds) return

            const candidatesAbove = textEntries
                .filter((entry) => entry.item.id !== textItem.id)
                .filter((entry) => Number(entry.bounds.y || 0) <= Number(optionBounds.y || 0) + 1)
                .sort((left, right) => {
                    const leftBottom = Number(left.bounds.y || 0) + Number(left.bounds.height || 0)
                    const rightBottom = Number(right.bounds.y || 0) + Number(right.bounds.height || 0)
                    const optionTop = Number(optionBounds.y || 0)
                    const leftGap = Math.abs(optionTop - leftBottom)
                    const rightGap = Math.abs(optionTop - rightBottom)
                    if (leftGap !== rightGap) return leftGap - rightGap
                    return Number(left.bounds.x || 0) - Number(right.bounds.x || 0)
                })
            const headingEntry =
                candidatesAbove[0] ||
                textEntries
                    .filter((entry) => entry.item.id !== textItem.id)
                    .sort((left, right) => Number(left.bounds.y || 0) - Number(right.bounds.y || 0))[0] ||
                null
            if (!headingEntry) return

            const headingBounds = headingEntry.bounds
            const headingTargetY = Math.max(topMargin, Math.min(headingMaxTop, Number(headingBounds.y || 0)))
            const headingClamped = AiRebuildPostProcessUtils.clampTarget(headingBounds, previewSize, Number(headingBounds.x || 0), headingTargetY)
            if (
                Math.round(headingClamped.x) !== Math.round(Number(headingBounds.x || 0)) ||
                Math.round(headingClamped.y) !== Math.round(Number(headingBounds.y || 0))
            ) {
                AiRebuildPostProcessUtils.shiftItemTo(headingEntry.item, headingBounds, headingClamped.x, headingClamped.y)
                headingBounds.x = headingClamped.x
                headingBounds.y = headingClamped.y
                didMove = true
            }

            const headingBottom = Number(headingBounds.y || 0) + Number(headingBounds.height || 0)
            const baseFontSize = Math.max(8, Number(textItem.fontSize || headingEntry.item?.fontSize || 12))
            const minGap = Math.max(4, Math.round(previewHeight * 0.025), Math.round(baseFontSize * 0.32))
            const preferredGap = Math.max(minGap, Math.round(baseFontSize * 0.48))
            const maxGap = Math.max(preferredGap + 2, Math.round(baseFontSize * 0.7))
            const minOptionY = headingBottom + minGap
            const preferredOptionY = headingBottom + preferredGap
            const maxOptionByGap = headingBottom + maxGap
            const maxOptionByBottom = previewHeight - bottomMargin - Number(optionBounds.height || 0)
            const maxOptionY = Math.max(minOptionY, Math.min(maxOptionByGap, maxOptionByBottom))
            let targetY = Number(optionBounds.y || 0)
            if (targetY < minOptionY) targetY = minOptionY
            else if (targetY > maxOptionY) targetY = maxOptionY
            else if (targetY > preferredOptionY && maxOptionY >= preferredOptionY) targetY = preferredOptionY
            const clamped = AiRebuildPostProcessUtils.clampTarget(
                optionBounds,
                previewSize,
                Number(optionBounds.x || 0),
                Math.min(targetY, maxOptionByBottom)
            )
            if (
                Math.round(clamped.x) === Math.round(Number(optionBounds.x || 0)) &&
                Math.round(clamped.y) === Math.round(Number(optionBounds.y || 0))
            ) {
                return
            }
            AiRebuildPostProcessUtils.shiftItemTo(textItem, optionBounds, clamped.x, clamped.y)
            optionBounds.x = clamped.x
            optionBounds.y = clamped.y
            didMove = true
        })
        return didMove
    }
    /**
     * Resolves marker-to-text pairs by nearest-center distance.
     * @param {Array<Record<string, any>>} items
     * @param {Map<string, { x: number, y: number, width: number, height: number }>} boundsById
     * @returns {Array<{ markerItem: Record<string, any>, textItem: Record<string, any> }>}
     */
    static #resolveMarkerTextPairs(items, boundsById) {
        const markerItems = items.filter((item) => AiRebuildPostProcessUtils.isSquareMarkerShape(item))
        const textItems = items.filter((item) => item?.type === 'text')
        if (!markerItems.length || !textItems.length) return []
        const pairs = []
        markerItems.forEach((markerItem) => {
            const markerBounds = boundsById.get(markerItem.id)
            if (!markerBounds) return
            const markerCenterX = Number(markerBounds.x || 0) + Number(markerBounds.width || 0) / 2
            const markerCenterY = Number(markerBounds.y || 0) + Number(markerBounds.height || 0) / 2
            let best = null
            textItems.forEach((textItem) => {
                const textBounds = boundsById.get(textItem.id)
                if (!textBounds) return
                const textCenterX = Number(textBounds.x || 0) + Number(textBounds.width || 0) / 2
                const textCenterY = Number(textBounds.y || 0) + Number(textBounds.height || 0) / 2
                const distance = Math.hypot(markerCenterX - textCenterX, markerCenterY - textCenterY)
                if (!best || distance < best.distance) {
                    best = { textItem, distance }
                }
            })
            if (best?.textItem) {
                pairs.push({ markerItem, textItem: best.textItem })
            }
        })
        return pairs
    }
    /**
     * Ensures interactive bounds are available with bounded render retries.
     * @param {{ items: Array<Record<string, any>> }} state
     * @param {any} previewRenderer
     * @param {() => Promise<void>} renderAfterMutation
     * @returns {Promise<boolean>}
     */
    static async #ensureBounds(state, previewRenderer, renderAfterMutation) {
        const itemCount = Array.isArray(state?.items) ? state.items.length : 0
        const maxRenderRetries = 4
        for (let attempt = 0; attempt < maxRenderRetries; attempt += 1) {
            const entryMap = previewRenderer?._interactiveItemsById
            if (entryMap instanceof Map && entryMap.size >= itemCount) {
                return true
            }
            await renderAfterMutation()
        }
        const finalMap = previewRenderer?._interactiveItemsById
        return finalMap instanceof Map && finalMap.size > 0
    }
}
