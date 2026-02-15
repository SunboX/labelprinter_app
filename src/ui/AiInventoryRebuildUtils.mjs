import { QrSizeUtils } from '../QrSizeUtils.mjs'

/**
 * Deterministic post-processing helpers for inventory-style AI label rebuilds.
 */
export class AiInventoryRebuildUtils {
    /**
     * Detects inventory label content and rewrites it into a stable structured template.
     * @param {{
     *  state: { items: Array<Record<string, any>> },
     *  previewRenderer: any,
     *  renderAfterMutation: () => Promise<void>
     * }} options
     * @returns {Promise<boolean>}
     */
    static async tryApplyInventoryTemplate({ state, previewRenderer, renderAfterMutation }) {
        const items = Array.isArray(state?.items) ? state.items : []
        const textItemCount = items.filter((item) => item?.type === 'text').length
        const qrItemCount = items.filter((item) => item?.type === 'qr').length
        if (textItemCount < 1 || qrItemCount < 1) {
            AiInventoryRebuildUtils.#debugLog('template-skip', {
                reason: 'insufficient-structured-items',
                textItemCount,
                qrItemCount
            })
            return false
        }
        const fields = AiInventoryRebuildUtils.#extractInventoryFields(items)
        if (!fields) return false
        const qrData = AiInventoryRebuildUtils.#resolveQrData(items, fields.articleNumber)
        const templateItems = AiInventoryRebuildUtils.#buildTemplateItems(state, fields, qrData)
        AiInventoryRebuildUtils.#debugLog('template-apply', {
            textItemCount,
            qrItemCount,
            articleNameLength: fields.articleName.length,
            articleNumberLength: fields.articleNumber.length,
            storageLength: fields.storage.length,
            qrDataLength: qrData.length
        })
        state.items.splice(0, state.items.length, ...templateItems)
        await renderAfterMutation()
        let textPlacement = AiInventoryRebuildUtils.#applyTextTargets(state.items, previewRenderer)
        for (let attempt = 0; attempt < 2 && !textPlacement.applied; attempt += 1) {
            AiInventoryRebuildUtils.#debugLog('template-text-retry', {
                attempt: attempt + 1,
                missingCount: textPlacement.missingCount
            })
            await renderAfterMutation()
            textPlacement = AiInventoryRebuildUtils.#applyTextTargets(state.items, previewRenderer)
        }
        await renderAfterMutation()
        let qrPlacement = AiInventoryRebuildUtils.#applyQrTarget(state, state.items, previewRenderer)
        for (let attempt = 0; attempt < 2 && !qrPlacement.applied; attempt += 1) {
            AiInventoryRebuildUtils.#debugLog('template-qr-retry', {
                attempt: attempt + 1,
                reason: qrPlacement.reason
            })
            await renderAfterMutation()
            qrPlacement = AiInventoryRebuildUtils.#applyQrTarget(state, state.items, previewRenderer)
        }
        await renderAfterMutation()
        return true
    }

    /**
     * Parses key inventory fields from current text items.
     * @param {Array<Record<string, any>>} items
     * @returns {{ articleName: string, articleNumber: string, storage: string } | null}
     */
    static #extractInventoryFields(items) {
        const text = items
            .filter((item) => item?.type === 'text')
            .map((item) => String(item.text || ''))
            .join('\n')
        if (!text.trim()) return null
        const lines = text
            .replace(/\r/g, '')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
        const articleName = AiInventoryRebuildUtils.#extractField(lines, 'artikelname')
        const articleNumber = AiInventoryRebuildUtils.#extractField(lines, 'artikelnummer')
        const storage = AiInventoryRebuildUtils.#extractField(lines, 'lagerplatz')
        if (!articleName || !articleNumber || !storage) {
            AiInventoryRebuildUtils.#debugLog('template-skip', {
                reason: 'missing-required-fields',
                articleNameFound: Boolean(articleName),
                articleNumberFound: Boolean(articleNumber),
                storageFound: Boolean(storage),
                lineCount: lines.length
            })
            return null
        }
        return { articleName, articleNumber, storage }
    }

    /**
     * Extracts a labeled value from line-based text.
     * @param {string[]} lines
     * @param {string} label
     * @returns {string}
     */
    static #extractField(lines, label) {
        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index]
            const match = line.match(new RegExp(`^${label}\\s*:\\s*(.*)$`, 'i'))
            if (!match) continue
            const sameLineValue = String(match[1] || '').trim()
            if (sameLineValue) return sameLineValue
            const nextLine = String(lines[index + 1] || '').trim()
            if (nextLine) return nextLine
        }
        return ''
    }

    /**
     * Chooses QR payload from existing QR data or article number fallback.
     * @param {Array<Record<string, any>>} items
     * @param {string} articleNumber
     * @returns {string}
     */
    static #resolveQrData(items, articleNumber) {
        const existingQr = items.find((item) => item?.type === 'qr' && String(item.data || '').trim())
        return String(existingQr?.data || articleNumber || '').trim()
    }

    /**
     * Builds structured text + QR template items.
     * @param {{ media?: string, resolution?: string, mediaLengthMm?: number | null }} state
     * @param {{ articleName: string, articleNumber: string, storage: string }} fields
     * @param {string} qrData
     * @returns {Array<Record<string, any>>}
     */
    static #buildTemplateItems(state, fields, qrData) {
        const qrSize = Math.max(
            QrSizeUtils.MIN_QR_SIZE_DOTS,
            Math.round(QrSizeUtils.computeMaxQrSizeDots(state || {}) * 0.62)
        )
        return [
            AiInventoryRebuildUtils.#createTextItem('Artikelname:', { fontSize: 12, textUnderline: true }),
            AiInventoryRebuildUtils.#createTextItem(fields.articleName, { fontSize: 20, textBold: true }),
            AiInventoryRebuildUtils.#createTextItem('Artikelnummer:', { fontSize: 11 }),
            AiInventoryRebuildUtils.#createTextItem(fields.articleNumber, { fontSize: 18, textBold: true }),
            AiInventoryRebuildUtils.#createTextItem('Lagerplatz:', { fontSize: 11 }),
            AiInventoryRebuildUtils.#createTextItem(fields.storage, { fontSize: 18, textBold: true }),
            {
                id: AiInventoryRebuildUtils.#createItemId('qr'),
                type: 'qr',
                data: qrData,
                size: qrSize,
                width: qrSize,
                height: qrSize,
                xOffset: 0,
                yOffset: 0,
                rotation: 0,
                qrErrorCorrectionLevel: 'M',
                qrVersion: 0,
                qrEncodingMode: 'auto'
            }
        ]
    }

    /**
     * Creates one styled text item.
     * @param {string} text
     * @param {{ fontSize: number, textBold?: boolean, textItalic?: boolean, textUnderline?: boolean }} style
     * @returns {Record<string, any>}
     */
    static #createTextItem(text, style) {
        return {
            id: AiInventoryRebuildUtils.#createItemId('text'),
            type: 'text',
            text,
            xOffset: 0,
            yOffset: 0,
            rotation: 0,
            fontFamily: 'Barlow',
            fontSize: Number(style?.fontSize || 12),
            textBold: Boolean(style?.textBold),
            textItalic: Boolean(style?.textItalic),
            textUnderline: Boolean(style?.textUnderline)
        }
    }

    /**
     * Moves text template items to deterministic top-left targets.
     * @param {Array<Record<string, any>>} items
     * @param {any} previewRenderer
     * @returns {{ applied: boolean, missingCount: number }}
     */
    static #applyTextTargets(items, previewRenderer) {
        const entryMap = previewRenderer?._interactiveItemsById
        const previewHeight = Math.max(64, Number(previewRenderer?.els?.preview?.height) || 128)
        if (!(entryMap instanceof Map)) {
            AiInventoryRebuildUtils.#debugLog('template-text-skip', { reason: 'missing-interactive-map' })
            return { applied: false, missingCount: 6 }
        }
        const textItems = items.filter((item) => item.type === 'text')
        if (textItems.length < 6) {
            AiInventoryRebuildUtils.#debugLog('template-text-skip', {
                reason: 'insufficient-text-items',
                textItemCount: textItems.length
            })
            return { applied: false, missingCount: 6 - textItems.length }
        }
        const x = Math.round(previewHeight * 0.045)
        const yTargets = [
            Math.round(previewHeight * 0.05),
            Math.round(previewHeight * 0.205),
            Math.round(previewHeight * 0.41),
            Math.round(previewHeight * 0.54),
            Math.round(previewHeight * 0.71),
            Math.round(previewHeight * 0.84)
        ]
        let movedCount = 0
        const missingIds = []
        textItems.slice(0, 6).forEach((item, index) => {
            const entry = entryMap.get(item.id)
            if (!entry?.bounds) {
                missingIds.push(item.id)
                return
            }
            AiInventoryRebuildUtils.#shiftTo(item, entry.bounds, x, yTargets[index])
            movedCount += 1
        })
        AiInventoryRebuildUtils.#debugLog('template-text-shift', {
            movedCount,
            missingIds,
            offsets: textItems.slice(0, 6).map((item) => ({
                id: item.id,
                xOffset: Number(item.xOffset || 0),
                yOffset: Number(item.yOffset || 0)
            }))
        })
        return { applied: movedCount > 0, missingCount: missingIds.length }
    }

    /**
     * Moves the QR item to the right of the text stack and keeps it vertically centered.
     * @param {{ media?: string, resolution?: string, mediaLengthMm?: number | null }} state
     * @param {Array<Record<string, any>>} items
     * @param {any} previewRenderer
     * @returns {{ applied: boolean, reason: string }}
     */
    static #applyQrTarget(state, items, previewRenderer) {
        const entryMap = previewRenderer?._interactiveItemsById
        if (!(entryMap instanceof Map)) {
            AiInventoryRebuildUtils.#debugLog('template-qr-skip', { reason: 'missing-interactive-map' })
            return { applied: false, reason: 'missing-interactive-map' }
        }
        const qrItem = items.find((item) => item.type === 'qr')
        const qrEntry = qrItem ? entryMap.get(qrItem.id) : null
        if (!qrItem || !qrEntry?.bounds) {
            AiInventoryRebuildUtils.#debugLog('template-qr-skip', {
                reason: 'missing-qr-entry',
                hasQrItem: Boolean(qrItem),
                hasQrBounds: Boolean(qrEntry?.bounds)
            })
            return { applied: false, reason: 'missing-qr-entry' }
        }
        const previewWidth = Math.max(80, Number(previewRenderer?.els?.preview?.width) || 0)
        const previewHeight = Math.max(64, Number(previewRenderer?.els?.preview?.height) || 128)
        const textEntries = items
            .filter((item) => item.type === 'text')
            .map((item) => entryMap.get(item.id))
            .filter((entry) => entry?.bounds)
        const textRight = textEntries.reduce((max, entry) => Math.max(max, Number(entry.bounds.x) + Number(entry.bounds.width)), 0)
        const size = Math.max(1, Number(qrItem.size || qrEntry.bounds.width || 1))
        const gap = Math.max(6, Math.round(previewHeight * 0.03))
        const targetX = Math.max(textRight + gap, previewWidth - size - gap)
        const targetY = Math.max(0, Math.round((previewHeight - size) / 2))
        AiInventoryRebuildUtils.#shiftTo(qrItem, qrEntry.bounds, targetX, targetY)
        qrItem.size = QrSizeUtils.clampQrSizeToLabel(state || {}, size)
        qrItem.width = qrItem.size
        qrItem.height = qrItem.size
        AiInventoryRebuildUtils.#debugLog('template-qr-shift', {
            qrItemId: qrItem.id,
            xOffset: Number(qrItem.xOffset || 0),
            yOffset: Number(qrItem.yOffset || 0),
            size: Number(qrItem.size || 0),
            targetX,
            targetY
        })
        return { applied: true, reason: '' }
    }

    /**
     * Applies a dot-space translation to reach a target top-left position.
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
     * Creates a unique item id.
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
     * Emits one debug log line when AI debug logging is enabled.
     * @param {string} event
     * @param {Record<string, any>} context
     */
    static #debugLog(event, context = {}) {
        if (!AiInventoryRebuildUtils.#isDebugEnabled()) return
        console.info(`[assistant-debug-template] ${event}`, context)
    }

    /**
     * Resolves if template debug logs are enabled.
     * @returns {boolean}
     */
    static #isDebugEnabled() {
        try {
            const queryValue = new URLSearchParams(globalThis?.window?.location?.search || '').get('aiDebug')
            const localValue = globalThis?.window?.localStorage?.getItem('AI_DEBUG_LOGS')
            const raw = String(queryValue || localValue || '')
                .trim()
                .toLowerCase()
            return ['1', 'true', 'yes', 'on'].includes(raw)
        } catch (_error) {
            return false
        }
    }
}
