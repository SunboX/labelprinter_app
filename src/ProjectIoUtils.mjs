import { ZoomUtils } from './ZoomUtils.mjs'

/**
 * Project serialization and normalization helpers.
 */
export class ProjectIoUtils {
    /**
     * Removes runtime-only fields from a project item.
     * @param {object} item
     * @returns {object}
     */
    static stripRuntimeFields(item) {
        const cleaned = {}
        Object.entries(item || {}).forEach(([key, value]) => {
            if (key.startsWith('_')) return
            cleaned[key] = value
        })
        return cleaned
    }

    /**
     * Creates a serializable project payload from the current state.
     * @param {object} state
     * @returns {object}
     */
    static buildProjectPayload(state) {
        return {
            media: state.media,
            mediaLengthMm: state.mediaLengthMm ?? null,
            zoom: ZoomUtils.clampZoom(state.zoom ?? 1),
            resolution: state.resolution,
            orientation: state.orientation,
            backend: state.backend,
            printer: state.printer,
            ble: { ...state.ble },
            items: (state.items || []).map((item) => ProjectIoUtils.stripRuntimeFields(item))
        }
    }

    /**
     * Coerces a value into a finite number.
     * @param {unknown} value
     * @param {number} fallback
     * @returns {number}
     */
    static #coerceNumber(value, fallback) {
        const num = Number(value)
        return Number.isFinite(num) ? num : fallback
    }

    /**
     * Coerces a value into a number or null.
     * @param {unknown} value
     * @param {number | null} fallback
     * @returns {number | null}
     */
    static #coerceNullableNumber(value, fallback) {
        if (value === null || value === undefined || value === '') return fallback ?? null
        const num = Number(value)
        return Number.isFinite(num) ? num : fallback ?? null
    }

    /**
     * Creates a default item map for normalization.
     * @returns {Record<string, object>}
     */
    static #buildItemDefaults() {
        return {
            text: {
                type: 'text',
                text: '',
                fontFamily: 'Barlow',
                fontSize: 24,
                height: 40,
                xOffset: 4,
                yOffset: 0
            },
            qr: {
                type: 'qr',
                data: '',
                size: 120,
                height: 130,
                xOffset: 4,
                yOffset: 0
            },
            shape: {
                type: 'shape',
                shapeType: 'rect',
                width: 180,
                height: 36,
                strokeWidth: 2,
                cornerRadius: 10,
                sides: 6,
                xOffset: 4,
                yOffset: 0
            }
        }
    }

    /**
     * Ensures item values are normalized for the editor.
     * @param {object} item
     * @param {string} fallbackId
     * @returns {object | null}
     */
    static #normalizeItem(item, fallbackId) {
        const cleaned = ProjectIoUtils.stripRuntimeFields(item)
        const type = cleaned.type
        if (!type || !['text', 'qr', 'shape'].includes(type)) return null

        const defaults = ProjectIoUtils.#buildItemDefaults()[type]
        const normalized = { ...defaults, ...cleaned }
        normalized.id = normalized.id || fallbackId

        if (type === 'text') {
            normalized.fontSize = ProjectIoUtils.#coerceNumber(normalized.fontSize, defaults.fontSize)
            normalized.height = ProjectIoUtils.#coerceNumber(normalized.height, defaults.height)
            normalized.xOffset = ProjectIoUtils.#coerceNumber(normalized.xOffset, defaults.xOffset)
            normalized.yOffset = ProjectIoUtils.#coerceNumber(normalized.yOffset, defaults.yOffset)
        }
        if (type === 'qr') {
            normalized.size = ProjectIoUtils.#coerceNumber(normalized.size, defaults.size)
            normalized.height = ProjectIoUtils.#coerceNumber(normalized.height, defaults.height)
            normalized.xOffset = ProjectIoUtils.#coerceNumber(normalized.xOffset, defaults.xOffset)
            normalized.yOffset = ProjectIoUtils.#coerceNumber(normalized.yOffset, defaults.yOffset)
        }
        if (type === 'shape') {
            normalized.width = ProjectIoUtils.#coerceNumber(normalized.width, defaults.width)
            normalized.height = ProjectIoUtils.#coerceNumber(normalized.height, defaults.height)
            normalized.strokeWidth = ProjectIoUtils.#coerceNumber(normalized.strokeWidth, defaults.strokeWidth)
            normalized.cornerRadius = ProjectIoUtils.#coerceNumber(normalized.cornerRadius, defaults.cornerRadius)
            normalized.sides = ProjectIoUtils.#coerceNumber(normalized.sides, defaults.sides)
            normalized.xOffset = ProjectIoUtils.#coerceNumber(normalized.xOffset, defaults.xOffset)
            normalized.yOffset = ProjectIoUtils.#coerceNumber(normalized.yOffset, defaults.yOffset)
        }

        return normalized
    }

    /**
     * Determines the next id counter based on existing item ids.
     * @param {Array<{ id?: string }>} items
     * @returns {number}
     */
    static deriveNextIdCounter(items) {
        let maxId = 0
        const pattern = /^item-(\d+)$/
        const list = items || []
        list.forEach((item) => {
            if (!item?.id) return
            const match = pattern.exec(item.id)
            if (!match) return
            const num = Number(match[1])
            if (Number.isFinite(num)) {
                maxId = Math.max(maxId, num)
            }
        })
        return Math.max(1, maxId + 1)
    }

    /**
     * Normalizes a raw project payload into an editor-friendly state.
     * @param {object} rawState
     * @param {object} defaultState
     * @returns {{ state: object, nextIdCounter: number }}
     */
    static normalizeProjectState(rawState, defaultState) {
        if (!rawState || typeof rawState !== 'object') {
            throw new Error('Invalid project file: expected a JSON object.')
        }
        if (!Array.isArray(rawState.items)) {
            throw new Error('Invalid project file: missing items array.')
        }

        const baseState = JSON.parse(JSON.stringify(defaultState))
        const rawItems = rawState.items.map((item) => ProjectIoUtils.stripRuntimeFields(item || {}))
        let nextIdCounter = ProjectIoUtils.deriveNextIdCounter(rawItems)
        const usedIds = new Set()
        const normalizedItems = []

        rawItems.forEach((item) => {
            const normalized = ProjectIoUtils.#normalizeItem(item, `item-${nextIdCounter}`)
            if (!normalized) return
            if (!normalized.id || usedIds.has(normalized.id)) {
                normalized.id = `item-${nextIdCounter++}`
            }
            usedIds.add(normalized.id)
            normalizedItems.push(normalized)
        })

        const rawBle = rawState.ble && typeof rawState.ble === 'object' ? rawState.ble : {}
        const normalizedState = {
            ...baseState,
            media: typeof rawState.media === 'string' ? rawState.media : baseState.media,
            mediaLengthMm: ProjectIoUtils.#coerceNullableNumber(rawState.mediaLengthMm, baseState.mediaLengthMm),
            zoom: ZoomUtils.clampZoom(ProjectIoUtils.#coerceNumber(rawState.zoom, baseState.zoom ?? 1)),
            resolution: typeof rawState.resolution === 'string' ? rawState.resolution : baseState.resolution,
            orientation: ['horizontal', 'vertical'].includes(rawState.orientation)
                ? rawState.orientation
                : baseState.orientation,
            backend: ['usb', 'ble'].includes(rawState.backend) ? rawState.backend : baseState.backend,
            printer: typeof rawState.printer === 'string' ? rawState.printer : baseState.printer,
            ble: {
                ...baseState.ble,
                serviceUuid:
                    typeof rawBle.serviceUuid === 'string' ? rawBle.serviceUuid : baseState.ble.serviceUuid,
                writeCharacteristicUuid:
                    typeof rawBle.writeCharacteristicUuid === 'string'
                        ? rawBle.writeCharacteristicUuid
                        : baseState.ble.writeCharacteristicUuid,
                notifyCharacteristicUuid:
                    typeof rawBle.notifyCharacteristicUuid === 'string'
                        ? rawBle.notifyCharacteristicUuid
                        : baseState.ble.notifyCharacteristicUuid,
                namePrefix: typeof rawBle.namePrefix === 'string' ? rawBle.namePrefix : baseState.ble.namePrefix
            },
            items: normalizedItems
        }

        nextIdCounter = Math.max(nextIdCounter, ProjectIoUtils.deriveNextIdCounter(normalizedItems))

        return { state: normalizedState, nextIdCounter }
    }
}
