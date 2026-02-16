import { RotationUtils } from '../RotationUtils.mjs'

/**
 * Deterministic post-processing helpers for barcode-centric AI label rebuilds.
 */
export class AiBarcodeRebuildUtils {
    /**
     * Detects barcode + big-letter layouts and rewrites them into a stable template.
     * @param {{
     *  state: { items: Array<Record<string, any>> },
     *  previewRenderer: any,
     *  renderAfterMutation: () => Promise<void>
     * }} options
     * @returns {Promise<boolean>}
     */
    static async tryApplyBarcodeTemplate({ state, previewRenderer, renderAfterMutation }) {
        const items = Array.isArray(state?.items) ? state.items : []
        const barcodeItems = items.filter((item) => item?.type === 'barcode')
        const textItems = items.filter((item) => item?.type === 'text')
        if (barcodeItems.length < 1 || textItems.length < 1) {
            AiBarcodeRebuildUtils.#debugLog('barcode-template-skip', {
                reason: 'insufficient-items',
                barcodeItemCount: barcodeItems.length,
                textItemCount: textItems.length
            })
            return false
        }

        const extracted = AiBarcodeRebuildUtils.#extractLabelParts(textItems, barcodeItems[0])
        if (!extracted) {
            AiBarcodeRebuildUtils.#debugLog('barcode-template-skip', {
                reason: 'missing-required-parts',
                barcodeItemCount: barcodeItems.length,
                textItemCount: textItems.length
            })
            return false
        }

        const template = AiBarcodeRebuildUtils.#buildTemplateItems(extracted)
        state.items.splice(0, state.items.length, ...template.items)
        await renderAfterMutation()
        await AiBarcodeRebuildUtils.#applyTargets({
            state,
            previewRenderer,
            renderAfterMutation,
            itemIds: template.itemIds
        })
        await renderAfterMutation()
        AiBarcodeRebuildUtils.#debugLog('barcode-template-apply', {
            textCount: textItems.length,
            barcodeDataLength: extracted.barcodeData.length
        })
        return true
    }

    /**
     * Extracts semantic pieces from text/barcode items.
     * @param {Array<Record<string, any>>} textItems
     * @param {Record<string, any>} barcodeItem
     * @returns {{
     *  sideText: { text: string, fontSize: number, textBold: boolean, textItalic: boolean, textUnderline: boolean, rotation: number } | null,
     *  bigLetterText: { text: string, fontSize: number },
     *  codeText: { text: string, fontSize: number, textBold: boolean, textItalic: boolean, textUnderline: boolean },
     *  barcodeData: string,
     *  barcodeFormat: string,
     *  barcodeShowText: boolean,
     *  barcodeModuleWidth: number,
     *  barcodeMargin: number,
     *  barcodeWidth: number,
     *  barcodeHeight: number
     * } | null}
     */
    static #extractLabelParts(textItems, barcodeItem) {
        const normalizedText = AiBarcodeRebuildUtils.#buildTextEntries(textItems)
        if (!normalizedText.length) return null

        const verticalSideCandidate = normalizedText
            .filter((entry) => entry.isVertical)
            .sort((left, right) => right.text.length - left.text.length)[0]
        const sideFallbackCandidate = normalizedText
            .filter((entry) => !entry.isVertical && entry.isLikelySideText)
            .sort((left, right) => {
                const rightScore = Number(right.sideConfidence || 0) * 100 + right.text.length
                const leftScore = Number(left.sideConfidence || 0) * 100 + left.text.length
                return rightScore - leftScore
            })[0]
        const sideCandidate = verticalSideCandidate || sideFallbackCandidate || null

        const bigLetterCandidate = normalizedText
            .filter((entry) => entry.isSingleLetter && entry.entryId !== sideCandidate?.entryId)
            .sort((left, right) => right.fontSize - left.fontSize)[0]

        const contentEntries = normalizedText.filter(
            (entry) => entry.entryId !== sideCandidate?.entryId && entry.entryId !== bigLetterCandidate?.entryId
        )
        const hasExplicitCodeText = contentEntries.some((entry) => entry.isStrongCodeLike || entry.isCodeLike)
        if (!hasExplicitCodeText) {
            return null
        }

        const codeCandidate =
            contentEntries
            .sort((left, right) => {
                const rightScore =
                    (right.isStrongCodeLike ? 2000 : 0) +
                    (right.isCodeLike ? 1000 : 0) +
                    right.text.length +
                    right.fontSize
                const leftScore =
                    (left.isStrongCodeLike ? 2000 : 0) +
                    (left.isCodeLike ? 1000 : 0) +
                    left.text.length +
                    left.fontSize
                return rightScore - leftScore
            })[0] ||
            normalizedText
                .filter((entry) => entry.entryId !== sideCandidate?.entryId)
                .sort((left, right) => right.text.length - left.text.length)[0]
        if (!codeCandidate) return null

        const barcodeData = String(barcodeItem?.data || '').trim() || codeCandidate.text.replace(/\s+/g, '')
        if (!barcodeData) return null

        const fallbackCodeText = codeCandidate.text.length >= 6 ? codeCandidate.text : barcodeData
        if (!codeCandidate.isCodeLike && !codeCandidate.isStrongCodeLike && fallbackCodeText.length < 6) return null

        let bigLetterText = String(bigLetterCandidate?.text || '').trim()
        if (!bigLetterText) {
            const fallbackMatch = String(codeCandidate.text || barcodeData).match(/[A-Za-z0-9ÄÖÜ]/)
            bigLetterText = fallbackMatch ? String(fallbackMatch[0] || '').toUpperCase() : ''
        }
        if (!bigLetterText) return null

        const bigLetterFont = bigLetterCandidate
            ? Math.max(30, Math.min(120, Math.round(bigLetterCandidate.fontSize)))
            : Math.max(34, Math.min(96, Math.round(codeCandidate.fontSize * 2.3)))

        const barcodeWidth = Math.max(120, Number(barcodeItem?.width || 180))
        const barcodeHeight = Math.max(18, Number(barcodeItem?.height || 26))

        return {
            sideText: sideCandidate
                ? {
                      text: sideCandidate.text,
                      fontSize: Math.max(8, Math.min(24, Math.round(sideCandidate.fontSize))),
                      textBold: Boolean(sideCandidate.item.textBold),
                      textItalic: Boolean(sideCandidate.item.textItalic),
                      textUnderline: Boolean(sideCandidate.item.textUnderline),
                      rotation: sideCandidate.rotation < 0 ? -90 : 90
                  }
                : null,
            bigLetterText: {
                text: bigLetterText,
                fontSize: bigLetterFont
            },
            codeText: {
                text: fallbackCodeText,
                fontSize: Math.max(12, Math.min(32, Math.round(codeCandidate.fontSize))),
                textBold: Boolean(codeCandidate.item.textBold),
                textItalic: Boolean(codeCandidate.item.textItalic),
                textUnderline: true
            },
            barcodeData,
            barcodeFormat: String(barcodeItem?.barcodeFormat || 'code128'),
            barcodeShowText: false,
            barcodeModuleWidth: Math.max(1, Math.round(Number(barcodeItem?.barcodeModuleWidth || 2))),
            barcodeMargin: Math.max(0, Math.round(Number(barcodeItem?.barcodeMargin || 0))),
            barcodeWidth,
            barcodeHeight
        }
    }

    /**
     * Flattens text items into analyzable entries (line-level for multiline inputs).
     * @param {Array<Record<string, any>>} textItems
     * @returns {Array<{
     *  entryId: string,
     *  item: Record<string, any>,
     *  text: string,
     *  rotation: number,
     *  fontSize: number,
     *  isVertical: boolean,
     *  isSingleLetter: boolean,
     *  isCodeLike: boolean,
     *  isStrongCodeLike: boolean,
     *  isLikelySideText: boolean,
     *  sideConfidence: number
     * }>}
     */
    static #buildTextEntries(textItems) {
        const entries = []
        textItems.forEach((item) => {
            const sourceText = String(item?.text || '')
            const rawLines = sourceText
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
            const candidateLines = rawLines.length > 1 ? rawLines : [sourceText.trim()]
            candidateLines
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
                .forEach((line, lineIndex) => {
                    const rotation = RotationUtils.normalizeDegrees(Number(item.rotation || 0))
                    const fontSize = Math.max(6, Number(item.fontSize || 12))
                    const isVertical = Math.abs(Math.abs(rotation) - 90) <= 20
                    const isSingleLetter = /^[A-Za-z0-9ÄÖÜ]$/.test(line)
                    const isCodeLike =
                        line.length >= 8 &&
                        /[A-Za-z]/.test(line) &&
                        /\d/.test(line) &&
                        !/^artikel(name|nummer|platz)\s*:?$/i.test(line)
                    const isStrongCodeLike = /^[A-Za-z]{1,4}\s*\d{1,4}(?:\s+\d{1,4}){1,6}\s*[A-Za-z0-9]{0,4}$/i.test(line)
                    const sidePattern = /(?:^|[\s-])\d{2,4}(?:-\d{2,4}){1,3}(?:$|[\s-])/i.test(line)
                    const likelySidePrefix = /^[A-Za-z]{1,4}\s+\d{2,4}[-\s]\d{2,4}[-\s]\d{2,4}$/i.test(line)
                    const isLikelySideText = sidePattern && !isSingleLetter
                    const sideConfidence = (likelySidePrefix ? 3 : 0) + (line.includes('-') ? 2 : 0) + (/\d/.test(line) ? 1 : 0)
                    entries.push({
                        entryId: `${String(item.id || '')}::${lineIndex}`,
                        item,
                        text: line,
                        rotation,
                        fontSize,
                        isVertical,
                        isSingleLetter,
                        isCodeLike,
                        isStrongCodeLike,
                        isLikelySideText,
                        sideConfidence
                    })
                })
        })
        return entries
    }

    /**
     * Builds deterministic template items for barcode-centric labels.
     * @param {{
     *  sideText: { text: string, fontSize: number, textBold: boolean, textItalic: boolean, textUnderline: boolean, rotation: number } | null,
     *  bigLetterText: { text: string, fontSize: number },
     *  codeText: { text: string, fontSize: number, textBold: boolean, textItalic: boolean, textUnderline: boolean },
     *  barcodeData: string,
     *  barcodeFormat: string,
     *  barcodeShowText: boolean,
     *  barcodeModuleWidth: number,
     *  barcodeMargin: number,
     *  barcodeWidth: number,
     *  barcodeHeight: number
     * }} extracted
     * @returns {{
     *  items: Array<Record<string, any>>,
     *  itemIds: { side: string | null, big: string, code: string, barcode: string }
     * }}
     */
    static #buildTemplateItems(extracted) {
        const sideId = extracted.sideText ? AiBarcodeRebuildUtils.#createItemId('text') : null
        const bigId = AiBarcodeRebuildUtils.#createItemId('text')
        const codeId = AiBarcodeRebuildUtils.#createItemId('text')
        const barcodeId = AiBarcodeRebuildUtils.#createItemId('barcode')
        const items = []
        if (extracted.sideText && sideId) {
            items.push({
                id: sideId,
                type: 'text',
                text: extracted.sideText.text,
                xOffset: 0,
                yOffset: 0,
                rotation: extracted.sideText.rotation,
                fontFamily: 'Barlow',
                fontSize: extracted.sideText.fontSize,
                textBold: extracted.sideText.textBold,
                textItalic: extracted.sideText.textItalic,
                textUnderline: extracted.sideText.textUnderline,
                textStrikethrough: false
            })
        }
        items.push(
            {
                id: bigId,
                type: 'text',
                text: extracted.bigLetterText.text,
                xOffset: 0,
                yOffset: 0,
                rotation: 0,
                fontFamily: 'Barlow',
                fontSize: extracted.bigLetterText.fontSize,
                textBold: true,
                textItalic: false,
                textUnderline: false,
                textStrikethrough: false
            },
            {
                id: codeId,
                type: 'text',
                text: extracted.codeText.text,
                xOffset: 0,
                yOffset: 0,
                rotation: 0,
                fontFamily: 'Barlow',
                fontSize: extracted.codeText.fontSize,
                textBold: extracted.codeText.textBold,
                textItalic: extracted.codeText.textItalic,
                textUnderline: extracted.codeText.textUnderline,
                textStrikethrough: false
            },
            {
                id: barcodeId,
                type: 'barcode',
                data: extracted.barcodeData,
                width: extracted.barcodeWidth,
                height: extracted.barcodeHeight,
                xOffset: 0,
                yOffset: 0,
                rotation: 0,
                barcodeFormat: extracted.barcodeFormat,
                barcodeShowText: extracted.barcodeShowText,
                barcodeModuleWidth: extracted.barcodeModuleWidth,
                barcodeMargin: extracted.barcodeMargin
            }
        )
        return {
            items,
            itemIds: {
                side: sideId,
                big: bigId,
                code: codeId,
                barcode: barcodeId
            }
        }
    }

    /**
     * Applies deterministic target placement for template items.
     * @param {{
     *  state: { items: Array<Record<string, any>> },
     *  previewRenderer: any,
     *  renderAfterMutation: () => Promise<void>,
     *  itemIds: { side: string | null, big: string, code: string, barcode: string }
     * }} options
     * @returns {Promise<void>}
     */
    static async #applyTargets({ state, previewRenderer, renderAfterMutation, itemIds }) {
        const previewHeight = Math.max(64, Number(previewRenderer?.els?.preview?.height) || 128)
        const edgePadding = Math.max(1, Math.round(previewHeight * 0.015))
        const leftGutterWidth = Math.max(12, Math.round(previewHeight * 0.11))
        const rightBlockGap = Math.max(28, Math.round(previewHeight * 0.34))
        const codeTop = Math.max(edgePadding, Math.round(previewHeight * 0.16))
        const codeToBarcodeGap = Math.max(6, Math.round(previewHeight * 0.07))
        const bigBaselineInset = Math.max(1, Math.round(previewHeight * 0.03))
        const desiredBigFont = Math.max(52, Math.min(128, Math.round(previewHeight * 0.84)))
        const resolveGeometry = () => {
            const itemById = new Map(Array.isArray(state?.items) ? state.items.map((item) => [item.id, item]) : [])
            const entryMap = previewRenderer?._interactiveItemsById
            return {
                sideItem: itemById.get(itemIds.side),
                bigItem: itemById.get(itemIds.big),
                codeItem: itemById.get(itemIds.code),
                barcodeItem: itemById.get(itemIds.barcode),
                sideBounds: entryMap instanceof Map ? entryMap.get(itemIds.side)?.bounds : null,
                bigBounds: entryMap instanceof Map ? entryMap.get(itemIds.big)?.bounds : null,
                codeBounds: entryMap instanceof Map ? entryMap.get(itemIds.code)?.bounds : null,
                barcodeBounds: entryMap instanceof Map ? entryMap.get(itemIds.barcode)?.bounds : null
            }
        }

        for (let attempt = 0; attempt < 4; attempt += 1) {
            let geometry = resolveGeometry()
            const hasSideItem = Boolean(geometry.sideItem && itemIds.side)
            if (!geometry.bigItem || !geometry.codeItem || !geometry.barcodeItem) return
            if (
                !geometry.bigBounds ||
                !geometry.codeBounds ||
                !geometry.barcodeBounds ||
                (hasSideItem && !geometry.sideBounds)
            ) {
                AiBarcodeRebuildUtils.#debugLog('barcode-template-place-retry', {
                    attempt: attempt + 1,
                    reason: 'missing-bounds',
                    hasSideBounds: Boolean(geometry.sideBounds) || !hasSideItem,
                    hasBigBounds: Boolean(geometry.bigBounds),
                    hasCodeBounds: Boolean(geometry.codeBounds),
                    hasBarcodeBounds: Boolean(geometry.barcodeBounds)
                })
                await renderAfterMutation()
                continue
            }

            // Fit big letter and side text in one mutation pass to avoid iterative drift.
            const fontFitUpdates = []
            const currentBigFont = Math.max(8, Math.round(Number(geometry.bigItem.fontSize || 0)))
            if (currentBigFont !== desiredBigFont) {
                geometry.bigItem.fontSize = desiredBigFont
                fontFitUpdates.push({
                    role: 'big',
                    currentFont: currentBigFont,
                    nextFont: desiredBigFont
                })
            }
            const maxSideHeight = Math.max(1, previewHeight - edgePadding * 2)
            if (hasSideItem) {
                const sideHeight = Math.max(1, Number(geometry.sideBounds?.height || 0))
                if (sideHeight > maxSideHeight + 1) {
                    const currentSideFont = Math.max(7, Number(geometry.sideItem.fontSize || 10))
                    const fitScale = maxSideHeight / sideHeight
                    const nextSideFont = Math.max(7, Math.floor(currentSideFont * fitScale))
                    if (nextSideFont < currentSideFont) {
                        geometry.sideItem.fontSize = nextSideFont
                        fontFitUpdates.push({
                            role: 'side',
                            currentFont: currentSideFont,
                            nextFont: nextSideFont,
                            sideHeight,
                            maxSideHeight
                        })
                    }
                }
            }
            if (fontFitUpdates.length) {
                AiBarcodeRebuildUtils.#debugLog('barcode-template-font-fit', {
                    attempt: attempt + 1,
                    updates: fontFitUpdates
                })
                await renderAfterMutation()
                geometry = resolveGeometry()
                if (
                    !geometry.bigBounds ||
                    !geometry.codeBounds ||
                    !geometry.barcodeBounds ||
                    (hasSideItem && !geometry.sideBounds)
                ) {
                    continue
                }
            }

            const sideCenterY = Math.round((previewHeight - Number(geometry.sideBounds?.height || 0)) / 2)
            const sideTargetX = edgePadding
            const sideTargetY = Math.min(
                Math.max(edgePadding, previewHeight - Number(geometry.sideBounds?.height || 0) - edgePadding),
                Math.max(edgePadding, sideCenterY)
            )
            const sideReservedWidth = hasSideItem ? Math.round(Number(geometry.sideBounds?.width || 0) + edgePadding * 2) : 0
            const bigTargetX = hasSideItem
                ? Math.max(leftGutterWidth, sideReservedWidth + Math.round(previewHeight * 0.02))
                : edgePadding + Math.max(2, Math.round(previewHeight * 0.02))
            const bigTargetY = Math.max(
                edgePadding,
                Math.round(previewHeight - Number(geometry.bigBounds?.height || 0) - bigBaselineInset)
            )
            const codeTargetX = Math.max(
                Math.round(previewHeight * 0.85),
                Math.round(bigTargetX + Number(geometry.bigBounds?.width || 0) + rightBlockGap)
            )
            const codeTargetY = codeTop

            const desiredBarcodeHeight = Math.max(30, Math.min(58, Math.round(previewHeight * 0.42)))
            const desiredBarcodeWidth = Math.max(
                220,
                Math.min(420, Math.round(Math.max(Number(geometry.codeBounds?.width || 0) * 1.05, previewHeight * 2.2)))
            )
            const barcodeHeightBefore = Math.round(Number(geometry.barcodeItem.height || 0))
            const barcodeWidthBefore = Math.round(Number(geometry.barcodeItem.width || 0))
            geometry.barcodeItem.height = desiredBarcodeHeight
            geometry.barcodeItem.width = desiredBarcodeWidth
            geometry.barcodeItem.barcodeShowText = false
            geometry.barcodeItem.barcodeMargin = Math.max(0, Number(geometry.barcodeItem.barcodeMargin || 0))
            if (barcodeWidthBefore !== desiredBarcodeWidth || barcodeHeightBefore !== desiredBarcodeHeight) {
                AiBarcodeRebuildUtils.#debugLog('barcode-template-barcode-fit', {
                    attempt: attempt + 1,
                    previousWidth: barcodeWidthBefore,
                    previousHeight: barcodeHeightBefore,
                    nextWidth: desiredBarcodeWidth,
                    nextHeight: desiredBarcodeHeight
                })
            }

            if (hasSideItem) {
                AiBarcodeRebuildUtils.#shiftTo(geometry.sideItem, geometry.sideBounds, sideTargetX, sideTargetY)
            }
            AiBarcodeRebuildUtils.#shiftTo(geometry.bigItem, geometry.bigBounds, bigTargetX, bigTargetY)
            AiBarcodeRebuildUtils.#shiftTo(geometry.codeItem, geometry.codeBounds, codeTargetX, codeTargetY)
            await renderAfterMutation()

            const refreshedGeometry = resolveGeometry()
            if (!refreshedGeometry.codeBounds || !refreshedGeometry.barcodeBounds) {
                await renderAfterMutation()
                continue
            }

            const centeredBarcodeTargetX = Math.round(
                Number(refreshedGeometry.codeBounds.x || codeTargetX) +
                    Number(refreshedGeometry.codeBounds.width || 0) / 2 -
                    desiredBarcodeWidth / 2
            )
            const minBarcodeTargetX = Math.round(Number(codeTargetX) - previewHeight * 0.02)
            const barcodeTargetX = Math.max(minBarcodeTargetX, centeredBarcodeTargetX)
            const naturalBarcodeY = Math.round(
                Number(refreshedGeometry.codeBounds.y || codeTop) +
                    Number(refreshedGeometry.codeBounds.height || 0) +
                    codeToBarcodeGap
            )
            const maxBarcodeTargetY = Math.max(edgePadding, Math.round(previewHeight - desiredBarcodeHeight - edgePadding))
            const barcodeTargetY = Math.min(maxBarcodeTargetY, naturalBarcodeY)
            AiBarcodeRebuildUtils.#shiftTo(
                refreshedGeometry.barcodeItem,
                refreshedGeometry.barcodeBounds,
                barcodeTargetX,
                barcodeTargetY
            )
            await renderAfterMutation()

            const finalGeometry = resolveGeometry()
            AiBarcodeRebuildUtils.#debugLog('barcode-template-place', {
                attempt: attempt + 1,
                sideTargetX,
                sideTargetY,
                bigTargetX,
                bigTargetY,
                codeTargetX,
                codeTargetY,
                barcodeTargetX,
                barcodeTargetY,
                barcodeWidth: Number(refreshedGeometry.barcodeItem.width || 0),
                barcodeHeight: Number(refreshedGeometry.barcodeItem.height || 0)
            })
            AiBarcodeRebuildUtils.#debugLog('barcode-template-final-bounds', {
                attempt: attempt + 1,
                side: hasSideItem ? finalGeometry.sideBounds || null : null,
                big: finalGeometry.bigBounds || null,
                code: finalGeometry.codeBounds || null,
                barcode: finalGeometry.barcodeBounds || null
            })
            return
        }
    }

    /**
     * Applies a translation to move an item to target top-left coordinates.
     * @param {Record<string, any>} item
     * @param {{ x: number, y: number }} bounds
     * @param {number} targetX
     * @param {number} targetY
     */
    static #shiftTo(item, bounds, targetX, targetY) {
        const currentX = Number(bounds?.x || 0)
        const currentY = Number(bounds?.y || 0)
        item.xOffset = Math.round(Number(item.xOffset || 0) + (targetX - currentX))
        item.yOffset = Math.round(Number(item.yOffset || 0) + (targetY - currentY))
    }

    /**
     * Creates a unique id for generated template items.
     * @param {string} prefix
     * @returns {string}
     */
    static #createItemId(prefix) {
        const randomToken =
            typeof globalThis.crypto?.randomUUID === 'function'
                ? globalThis.crypto.randomUUID().slice(0, 8)
                : Math.random().toString(16).slice(2, 10)
        return `${prefix}-${randomToken}`
    }

    /**
     * Emits one debug log line when assistant debug logging is enabled.
     * @param {string} event
     * @param {Record<string, any>} context
     */
    static #debugLog(event, context = {}) {
        if (!AiBarcodeRebuildUtils.#isDebugEnabled()) return
        console.info(`[assistant-debug-template] ${event}`, context)
    }

    /**
     * Resolves whether template debug logging is enabled.
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
