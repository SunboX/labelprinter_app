/**
 * Shared utilities for assistant rebuild post-processing and normalization.
 */
export class AiRebuildPostProcessUtils {
    /**
     * Detects an aggregated multiline text item duplicated by split text lines.
     * @param {Array<Record<string, any>>} items
     * @returns {Record<string, any> | null}
     */
    static findDuplicatedAggregateTextItem(items) {
        const textItems = Array.isArray(items) ? items.filter((item) => item?.type === 'text') : []
        if (textItems.length < 2) return null
        const normalizedRows = textItems.map((item) => {
            const text = String(item?.text || '')
            const normalized = AiRebuildPostProcessUtils.normalizeText(text)
            const nonEmptyLineCount = text
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean).length
            return { item, normalized, nonEmptyLineCount }
        })
        const aggregateCandidates = normalizedRows
            .filter((row) => row.nonEmptyLineCount >= 4 && row.normalized.length >= 24)
            .sort((left, right) => right.nonEmptyLineCount - left.nonEmptyLineCount)
        for (const candidate of aggregateCandidates) {
            const overlapCount = normalizedRows
                .filter((row) => row.item.id !== candidate.item.id && row.normalized.length >= 4)
                .reduce((count, row) => count + (candidate.normalized.includes(row.normalized) ? 1 : 0), 0)
            if (overlapCount >= 2) return candidate.item
        }
        return null
    }

    /**
     * Normalizes free text for structural matching.
     * @param {string} text
     * @returns {string}
     */
    static normalizeText(text) {
        return String(text || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim()
    }

    /**
     * Returns true when one line starts with a marker-like prefix.
     * @param {string} line
     * @returns {boolean}
     */
    static hasLeadingMarker(line) {
        return /^(?:\s*(?:☐|□|▢|◻|\[\s*\])\s*|\s*[\-*•]\s+)/u.test(String(line || ''))
    }

    /**
     * Removes generic leading marker/bullet prefixes from one line.
     * @param {string} line
     * @returns {{ text: string, removedMarker: boolean }}
     */
    static stripLeadingMarker(line) {
        const source = String(line || '')
        const markerPattern = /^(?:\s*(?:☐|□|▢|◻|\[\s*\])\s*|\s*[\-*•]\s+)/u
        const removedMarker = markerPattern.test(source)
        const cleaned = source.replace(markerPattern, '').replace(/\s{2,}/g, ' ').trimEnd()
        return {
            text: cleaned,
            removedMarker
        }
    }

    /**
     * Applies marker stripping to all text items in place.
     * @param {Array<Record<string, any>>} items
     * @returns {{ changedCount: number, removedMarkerCount: number }}
     */
    static stripLeadingMarkersFromTextItems(items) {
        const textItems = Array.isArray(items) ? items.filter((item) => item?.type === 'text') : []
        let changedCount = 0
        let removedMarkerCount = 0
        textItems.forEach((item) => {
            const original = String(item?.text || '')
            const lines = original.replace(/\r/g, '').split('\n')
            let itemChanged = false
            const nextLines = lines.map((line) => {
                const stripped = AiRebuildPostProcessUtils.stripLeadingMarker(line)
                if (stripped.removedMarker) {
                    removedMarkerCount += 1
                    if (stripped.text !== line) itemChanged = true
                }
                return stripped.text
            })
            const nextText = nextLines.join('\n')
            if (itemChanged && nextText !== original) {
                item.text = nextText
                changedCount += 1
            }
        })
        return { changedCount, removedMarkerCount }
    }

    /**
     * Collects text lines with source references and optional layout bounds.
     * @param {Array<Record<string, any>>} items
     * @param {Map<string, { bounds?: { x: number, y: number, width: number, height: number } }>} [entryMap]
     * @returns {Array<{
     *  line: string,
     *  item: Record<string, any>,
     *  itemIndex: number,
     *  lineIndex: number,
     *  globalIndex: number,
     *  hasMarker: boolean,
     *  bounds: { x: number, y: number, width: number, height: number } | null
     * }>}
     */
    static collectTextLineEntries(items, entryMap) {
        const entries = []
        const textItems = Array.isArray(items) ? items.filter((item) => item?.type === 'text') : []
        textItems.forEach((item, itemIndex) => {
            const text = String(item?.text || '').replace(/\r/g, '')
            const lines = text.split('\n')
            const itemBounds = entryMap instanceof Map ? entryMap.get(item.id)?.bounds || null : null
            let lineCursorY = Number(itemBounds?.y || 0)
            lines.forEach((line, lineIndex) => {
                const rawLine = String(line || '')
                const trimmed = rawLine.trim()
                if (!trimmed) {
                    const estimatedLineHeight = Math.max(8, Math.round(Number(item?.fontSize || 12) * 1.15))
                    lineCursorY += estimatedLineHeight
                    return
                }
                const estimatedLineHeight = Math.max(8, Math.round(Number(item?.fontSize || 12) * 1.15))
                const lineBounds = itemBounds
                    ? {
                          x: Number(itemBounds.x || 0),
                          y: lineCursorY,
                          width: Number(itemBounds.width || 1),
                          height: estimatedLineHeight
                      }
                    : null
                entries.push({
                    line: trimmed,
                    item,
                    itemIndex,
                    lineIndex,
                    globalIndex: entries.length,
                    hasMarker: AiRebuildPostProcessUtils.hasLeadingMarker(trimmed),
                    bounds: lineBounds
                })
                lineCursorY += estimatedLineHeight
            })
        })
        return entries
    }

    /**
     * Resolves visual top position for one item using rendered bounds when available.
     * @param {Record<string, any> | null} item
     * @param {Map<string, { bounds?: { x: number, y: number, width: number, height: number } }>} [entryMap]
     * @returns {number}
     */
    static resolveItemTop(item, entryMap) {
        if (!item) return Number.POSITIVE_INFINITY
        if (entryMap instanceof Map) {
            const bounds = entryMap.get(item.id)?.bounds || null
            if (bounds) return Number(bounds.y || 0)
        }
        return Number(item?.yOffset || 0)
    }

    /**
     * Finds the text item nearest to any marker shape by center distance.
     * @param {Array<Record<string, any>>} textItems
     * @param {Array<Record<string, any>>} markerShapes
     * @param {Map<string, { bounds?: { x: number, y: number, width: number, height: number } }>} [entryMap]
     * @returns {Record<string, any> | null}
     */
    static findNearestTextItemToMarkers(textItems, markerShapes, entryMap) {
        const safeTextItems = Array.isArray(textItems) ? textItems : []
        const safeMarkerShapes = Array.isArray(markerShapes) ? markerShapes : []
        if (!safeTextItems.length) return null
        if (!(entryMap instanceof Map) || !safeMarkerShapes.length) {
            return (
                [...safeTextItems].sort((left, right) => Number(right?.yOffset || 0) - Number(left?.yOffset || 0))[0] ||
                null
            )
        }

        const markerBounds = safeMarkerShapes
            .map((shape) => entryMap.get(shape.id)?.bounds || null)
            .filter(Boolean)
        if (!markerBounds.length) {
            return (
                [...safeTextItems].sort((left, right) => Number(right?.yOffset || 0) - Number(left?.yOffset || 0))[0] ||
                null
            )
        }

        let best = null
        safeTextItems.forEach((textItem) => {
            const bounds = entryMap.get(textItem.id)?.bounds || {
                x: Number(textItem?.xOffset || 0),
                y: Number(textItem?.yOffset || 0),
                width: 1,
                height: 1
            }
            const distance = markerBounds.reduce((minimum, marker) => {
                const textCenterX = Number(bounds.x || 0) + Number(bounds.width || 0) / 2
                const textCenterY = Number(bounds.y || 0) + Number(bounds.height || 0) / 2
                const markerCenterX = Number(marker.x || 0) + Number(marker.width || 0) / 2
                const markerCenterY = Number(marker.y || 0) + Number(marker.height || 0) / 2
                return Math.min(minimum, Math.hypot(textCenterX - markerCenterX, textCenterY - markerCenterY))
            }, Number.POSITIVE_INFINITY)
            if (!best || distance < best.distance) {
                best = { textItem, distance }
            }
        })
        return best?.textItem || null
    }

    /**
     * Returns whether an item looks like a small square marker shape.
     * @param {Record<string, any>} item
     * @returns {boolean}
     */
    static isSquareMarkerShape(item) {
        if (!item || item.type !== 'shape') return false
        const shapeType = String(item.shapeType || '')
            .trim()
            .toLowerCase()
        if (shapeType && !['rect', 'roundrect', 'square'].includes(shapeType)) return false
        const width = Math.max(0, Number(item.width || 0))
        const height = Math.max(0, Number(item.height || 0))
        if (!Number.isFinite(width) || !Number.isFinite(height)) return false
        if (width < 4 || height < 4) return false
        const maxSide = Math.max(width, height)
        const minSide = Math.max(1, Math.min(width, height))
        return maxSide <= 36 && maxSide / minSide <= 1.65
    }

    /**
     * Creates a generated item id.
     * @param {string} prefix
     * @returns {string}
     */
    static createGeneratedItemId(prefix) {
        const randomToken =
            typeof globalThis.crypto?.randomUUID === 'function'
                ? globalThis.crypto.randomUUID().slice(0, 8)
                : Math.random().toString(16).slice(2, 10)
        return `${String(prefix || 'item')}-${randomToken}`
    }

    /**
     * Returns a preview-space clamp target for one bounds rect.
     * @param {{ x: number, y: number, width: number, height: number }} bounds
     * @param {{ width: number, height: number }} previewSize
     * @param {number} targetX
     * @param {number} targetY
     * @returns {{ x: number, y: number }}
     */
    static clampTarget(bounds, previewSize, targetX, targetY) {
        const width = Math.max(1, Number(bounds?.width || 1))
        const height = Math.max(1, Number(bounds?.height || 1))
        const previewWidth = Math.max(1, Number(previewSize?.width || 1))
        const previewHeight = Math.max(1, Number(previewSize?.height || 1))
        const x = Math.max(0, Math.min(previewWidth - width, Number(targetX || 0)))
        const y = Math.max(0, Math.min(previewHeight - height, Number(targetY || 0)))
        return { x, y }
    }

    /**
     * Returns overlap metrics for two axis-aligned bounds.
     * @param {{ x: number, y: number, width: number, height: number }} left
     * @param {{ x: number, y: number, width: number, height: number }} right
     * @returns {{ overlapX: number, overlapY: number, area: number }}
     */
    static computeBoundsOverlap(left, right) {
        const leftRight = Number(left?.x || 0) + Number(left?.width || 0)
        const leftBottom = Number(left?.y || 0) + Number(left?.height || 0)
        const rightRight = Number(right?.x || 0) + Number(right?.width || 0)
        const rightBottom = Number(right?.y || 0) + Number(right?.height || 0)
        const overlapX = Math.min(leftRight, rightRight) - Math.max(Number(left?.x || 0), Number(right?.x || 0))
        const overlapY = Math.min(leftBottom, rightBottom) - Math.max(Number(left?.y || 0), Number(right?.y || 0))
        if (overlapX <= 0 || overlapY <= 0) {
            return { overlapX: 0, overlapY: 0, area: 0 }
        }
        return {
            overlapX,
            overlapY,
            area: overlapX * overlapY
        }
    }

    /**
     * Applies a target top-left shift through item offsets.
     * @param {Record<string, any>} item
     * @param {{ x: number, y: number }} bounds
     * @param {number} targetX
     * @param {number} targetY
     */
    static shiftItemTo(item, bounds, targetX, targetY) {
        const currentX = Number(bounds?.x || 0)
        const currentY = Number(bounds?.y || 0)
        item.xOffset = Math.round(Number(item?.xOffset || 0) + (Number(targetX || 0) - currentX))
        item.yOffset = Math.round(Number(item?.yOffset || 0) + (Number(targetY || 0) - currentY))
    }

    /**
     * Returns preview dimensions in renderer dot-space.
     * @param {any} previewRenderer
     * @returns {{ width: number, height: number }}
     */
    static resolvePreviewSize(previewRenderer) {
        return {
            width: Math.max(64, Number(previewRenderer?.els?.preview?.width) || 220),
            height: Math.max(48, Number(previewRenderer?.els?.preview?.height) || 128)
        }
    }

    /**
     * Harmonizes checkbox marker section typography and spacing to avoid overlap on narrow tape heights.
     * @param {{
     *  state?: { media?: string },
     *  headingItem?: Record<string, any> | null,
     *  optionItem?: Record<string, any> | null
     * }} options
     * @returns {boolean}
     */
    static harmonizeMarkerSectionSizing({ state, headingItem, optionItem } = {}) {
        if (!headingItem || !optionItem) return false
        const orientation = String(state?.orientation || 'horizontal')
            .trim()
            .toLowerCase()
        const mediaWidthMm = AiRebuildPostProcessUtils.#resolveMediaWidthMm(state)
        const availableBandDots = Math.max(48, Math.round((mediaWidthMm * 180 * 0.75) / 25.4))
        const headingLines = AiRebuildPostProcessUtils.#countNonEmptyLines(headingItem.text)
        const optionLines = AiRebuildPostProcessUtils.#countNonEmptyLines(optionItem.text)

        let headingSize = Math.max(8, Math.round(Number(headingItem.fontSize || 12)))
        let optionSize = Math.max(8, Math.round(Number(optionItem.fontSize || 12)))
        const headingMax = Math.max(12, Math.round(mediaWidthMm * 0.72))
        const optionMax = Math.max(10, Math.round(mediaWidthMm * 0.62))
        headingSize = Math.min(headingSize, headingMax)
        optionSize = Math.min(optionSize, optionMax, Math.max(8, headingSize - 1))

        const measureHeight = (hSize, oSize) => {
            const headingLineHeight = Math.max(8, Math.round(hSize * 1.22))
            const optionLineHeight = Math.max(8, Math.round(oSize * 1.18))
            const sectionGap = Math.max(4, Math.round(headingLineHeight * 0.5))
            return headingLines * headingLineHeight + sectionGap + optionLines * optionLineHeight
        }

        const targetHeight = Math.max(40, Math.round(availableBandDots * 0.9))
        let requiredHeight = measureHeight(headingSize, optionSize)
        if (requiredHeight > targetHeight) {
            const scale = Math.max(0.65, targetHeight / requiredHeight)
            headingSize = Math.max(8, Math.round(headingSize * scale))
            optionSize = Math.max(8, Math.round(optionSize * scale))
            if (optionSize >= headingSize) {
                optionSize = Math.max(8, headingSize - 1)
            }
            requiredHeight = measureHeight(headingSize, optionSize)
            if (requiredHeight > targetHeight && headingSize > 8) {
                headingSize = Math.max(8, headingSize - 1)
                if (optionSize >= headingSize) {
                    optionSize = Math.max(8, headingSize - 1)
                }
            }
        }

        let didMutate = false
        if (Math.round(Number(headingItem.fontSize || 0)) !== headingSize) {
            headingItem.fontSize = headingSize
            didMutate = true
        }
        if (Math.round(Number(optionItem.fontSize || 0)) !== optionSize) {
            optionItem.fontSize = optionSize
            didMutate = true
        }

        const headingLineHeight = Math.max(8, Math.round(headingSize * 1.22))
        const optionLineHeight = Math.max(8, Math.round(optionSize * 1.18))
        if (orientation === 'vertical') {
            const sectionGap = Math.max(4, Math.round(headingLineHeight * 0.42))
            const minimumOptionY = Number(headingItem.yOffset || 0) + headingLines * headingLineHeight + sectionGap
            if (Number(optionItem.yOffset || 0) < minimumOptionY) {
                optionItem.yOffset = minimumOptionY
                didMutate = true
            }
        }

        const minimumHeadingX = 11
        if (Number(headingItem.xOffset || 0) < minimumHeadingX) {
            headingItem.xOffset = minimumHeadingX
            didMutate = true
        }
        const minimumOptionX = Number(headingItem.xOffset || 0) + Math.max(12, Math.round(optionSize * 1.2))
        if (Number(optionItem.xOffset || 0) < minimumOptionX) {
            optionItem.xOffset = minimumOptionX
            didMutate = true
        }
        return didMutate
    }

    /**
     * Resolves a readable square marker size for checkbox-like option blocks.
     * @param {{
     *  source?: Record<string, any> | null,
     *  optionItem?: Record<string, any> | null
     * }} options
     * @returns {number}
     */
    static resolveMarkerSquareSize({ source, optionItem } = {}) {
        const optionFontSize = Math.max(8, Math.round(Number(optionItem?.fontSize || 12)))
        const optionLineCount = AiRebuildPostProcessUtils.#countNonEmptyLines(optionItem?.text || '')
        const optionLineHeight = Math.max(8, Math.round(optionFontSize * 1.18))
        const optionBlockHeight = optionLineCount * optionLineHeight
        const preferredSize = Math.round(optionBlockHeight * (optionLineCount > 1 ? 0.8 : 0.95))
        const minMarkerSize = Math.max(14, Math.round(optionFontSize * 1.2))
        const maxMarkerSize = Math.max(28, Math.round(optionFontSize * 2.2))
        const sourceWidth = Math.max(0, Number(source?.width || 0))
        const sourceHeight = Math.max(0, Number(source?.height || 0))
        const modeledSize = Math.max(minMarkerSize, Math.min(maxMarkerSize, preferredSize))
        return Math.max(8, Math.round(Math.max(modeledSize, sourceWidth, sourceHeight)))
    }

    /**
     * Enforces a readable left-side marker position relative to paired option text blocks.
     * @param {{
     *  markerPairs?: Array<{ markerItem: Record<string, any>, textItem: Record<string, any> }>,
     *  boundsById?: Map<string, { x: number, y: number, width: number, height: number }>,
     *  previewSize?: { width: number, height: number }
     * }} options
     * @returns {boolean}
     */
    static enforceMarkerLeftOfText({ markerPairs, boundsById, previewSize } = {}) {
        if (!Array.isArray(markerPairs) || !markerPairs.length) return false
        if (!(boundsById instanceof Map)) return false
        let didMove = false
        markerPairs.forEach(({ markerItem, textItem }) => {
            const markerBounds = boundsById.get(markerItem?.id)
            const textBounds = boundsById.get(textItem?.id)
            if (!markerBounds || !textBounds) return
            const minLeftMargin = 11
            const minimumGap = Math.max(8, Math.round(Math.max(8, Number(textItem?.fontSize || 12)) * 0.7))
            const maxMarkerRight = Number(textBounds.x || 0) - minimumGap
            const markerRight = Number(markerBounds.x || 0) + Number(markerBounds.width || 0)
            const markerWidth = Number(markerBounds.width || 0)
            const needsLeftMargin = Number(markerBounds.x || 0) < minLeftMargin
            const needsGapAdjustment = markerRight > maxMarkerRight
            if (!needsLeftMargin && !needsGapAdjustment) return
            const targetXByGap = maxMarkerRight - markerWidth
            let targetX = Number(markerBounds.x || 0)
            if (needsLeftMargin) {
                targetX = Math.max(targetX, minLeftMargin)
            }
            if (needsGapAdjustment) {
                targetX = Math.min(targetX, targetXByGap)
            }
            const clamped = AiRebuildPostProcessUtils.clampTarget(
                markerBounds,
                previewSize || { width: 1, height: 1 },
                targetX,
                Number(markerBounds.y || 0)
            )
            const previewWidth = Math.max(1, Number(previewSize?.width || 1))
            const maxMarkerX = Math.max(0, previewWidth - Number(markerBounds.width || 0))
            const markerTargetX = Math.max(minLeftMargin, Math.min(maxMarkerX, Number(clamped.x || 0)))
            if (Math.round(markerTargetX) !== Math.round(Number(markerBounds.x || 0))) {
                AiRebuildPostProcessUtils.shiftItemTo(markerItem, markerBounds, markerTargetX, clamped.y)
                markerBounds.x = markerTargetX
                markerBounds.y = clamped.y
                didMove = true
            }
            const adjustedMarkerRight = Number(markerBounds.x || 0) + Number(markerBounds.width || 0)
            if (adjustedMarkerRight <= maxMarkerRight) return
            const textTargetX = adjustedMarkerRight + minimumGap
            const textClamped = AiRebuildPostProcessUtils.clampTarget(
                textBounds,
                previewSize || { width: 1, height: 1 },
                textTargetX,
                Number(textBounds.y || 0)
            )
            if (Math.round(textClamped.x) === Math.round(Number(textBounds.x || 0))) return
            AiRebuildPostProcessUtils.shiftItemTo(textItem, textBounds, textClamped.x, textClamped.y)
            textBounds.x = textClamped.x
            textBounds.y = textClamped.y
            didMove = true
        })
        return didMove
    }

    /**
     * Emits a debug line for assistant rebuild flows when debug mode is enabled.
     * @param {string} namespace
     * @param {string} event
     * @param {Record<string, any>} [context={}]
     */
    static debugLog(namespace, event, context = {}) {
        if (!AiRebuildPostProcessUtils.#isDebugEnabled()) return
        console.info(`[${String(namespace || 'assistant-debug')}] ${String(event || 'event')}`, context)
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
     * Resolves tape width in millimeters from state media code.
     * @param {{ media?: string } | undefined} state
     * @returns {number}
     */
    static #resolveMediaWidthMm(state) {
        const mediaCode = String(state?.media || '')
            .trim()
            .toUpperCase()
        const widthMatch = mediaCode.match(/^W(\d{1,2})$/)
        const width = widthMatch ? Number(widthMatch[1]) : Number.NaN
        if (Number.isFinite(width) && width >= 3 && width <= 62) return width
        return 24
    }

    /**
     * Resolves whether assistant debug logs are enabled.
     * @returns {boolean}
     */
    static #isDebugEnabled() {
        const parseFlag = (value) => {
            const normalized = String(value || '')
                .trim()
                .toLowerCase()
            if (!normalized) return null
            if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
            if (['0', 'false', 'no', 'off'].includes(normalized)) return false
            return null
        }
        try {
            const queryFlag = parseFlag(new URLSearchParams(globalThis?.window?.location?.search || '').get('aiDebug'))
            if (typeof queryFlag === 'boolean') return queryFlag
            const storageFlag = parseFlag(globalThis?.window?.localStorage?.getItem('AI_DEBUG_LOGS'))
            if (typeof storageFlag === 'boolean') return storageFlag
            const host = String(globalThis?.window?.location?.hostname || '').toLowerCase()
            return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost')
        } catch (_error) {
            return false
        }
    }
}
