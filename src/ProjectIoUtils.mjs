import { ZoomUtils } from './ZoomUtils.mjs'
import { QrCodeUtils } from './QrCodeUtils.mjs'
import { ImageRasterUtils } from './ImageRasterUtils.mjs'
import { IconLibraryUtils } from './IconLibraryUtils.mjs'
import { BarcodeUtils } from './BarcodeUtils.mjs'
import { RotationUtils } from './RotationUtils.mjs'

/**
 * Project serialization and normalization helpers.
 */
export class ProjectIoUtils {
    /**
     * Returns true when the value is a plain object.
     * @param {unknown} value
     * @returns {boolean}
     */
    static #isPlainObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    }

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
        const normalizedParameters = ProjectIoUtils.#normalizeParameterDefinitions(state.parameters)
        const normalizedParameterDataRows = ProjectIoUtils.#normalizeParameterDataRows(state.parameterDataRows)
        const normalizedCustomFontLinks = ProjectIoUtils.#normalizeCustomFontLinks(state.customFontLinks)
        return {
            media: state.media,
            mediaLengthMm: state.mediaLengthMm ?? null,
            zoom: ZoomUtils.clampZoom(state.zoom ?? 1),
            resolution: state.resolution,
            orientation: state.orientation,
            backend: state.backend,
            printer: state.printer,
            ble: { ...state.ble },
            parameters: normalizedParameters,
            parameterDataRows: normalizedParameterDataRows,
            parameterDataSourceName: typeof state.parameterDataSourceName === 'string' ? state.parameterDataSourceName : '',
            customFontLinks: normalizedCustomFontLinks,
            items: (state.items || []).map((item) => ProjectIoUtils.stripRuntimeFields(item))
        }
    }

    /**
     * Normalizes parameter definitions for serialization.
     * @param {Array<{ name?: unknown, defaultValue?: unknown }>} definitions
     * @returns {Array<{ name: string, defaultValue: string }>}
     */
    static #normalizeParameterDefinitions(definitions) {
        if (!Array.isArray(definitions)) return []
        return definitions.map((definition) => ({
            name: String(definition?.name || '').trim(),
            defaultValue: String(definition?.defaultValue ?? '')
        }))
    }

    /**
     * Normalizes parameter data rows for serialization.
     * @param {Array<unknown>} rows
     * @returns {Array<Record<string, unknown>>}
     */
    static #normalizeParameterDataRows(rows) {
        if (!Array.isArray(rows)) return []
        return rows
            .filter((row) => ProjectIoUtils.#isPlainObject(row))
            .map((row) => ({ ...row }))
    }

    /**
     * Normalizes custom font links for serialization.
     * @param {Array<unknown>} links
     * @returns {string[]}
     */
    static #normalizeCustomFontLinks(links) {
        if (!Array.isArray(links)) return []
        const seen = new Set()
        const normalized = []
        links.forEach((link) => {
            const value = String(link || '').trim()
            if (!value || seen.has(value)) return
            seen.add(value)
            normalized.push(value)
        })
        return normalized
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
     * Coerces a value into a boolean.
     * Accepts common string variants.
     * @param {unknown} value
     * @param {boolean} fallback
     * @returns {boolean}
     */
    static #coerceBoolean(value, fallback) {
        if (typeof value === 'boolean') return value
        if (typeof value === 'number') return value !== 0
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase()
            if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
            if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false
        }
        return fallback
    }

    /**
     * Normalizes persisted item position mode values.
     * @param {unknown} value
     * @returns {'flow' | 'absolute'}
     */
    static #normalizePositionMode(value) {
        const normalized = String(value || '')
            .trim()
            .toLowerCase()
        return normalized === 'absolute' ? 'absolute' : 'flow'
    }

    /**
     * Creates a default item map for normalization.
     * @returns {Record<string, object>}
     */
    static #buildItemDefaults() {
        return {
            text: {
                type: 'text',
                positionMode: 'flow',
                text: '',
                fontFamily: 'Barlow',
                fontSize: 24,
                textBold: false,
                textItalic: false,
                textUnderline: false,
                textStrikethrough: false,
                height: 40,
                xOffset: 4,
                yOffset: 0,
                rotation: 0
            },
            qr: {
                type: 'qr',
                positionMode: 'flow',
                data: '',
                size: 120,
                height: 120,
                qrErrorCorrectionLevel: QrCodeUtils.getDefaultErrorCorrectionLevel(),
                qrVersion: QrCodeUtils.getDefaultVersion(),
                qrEncodingMode: QrCodeUtils.getDefaultEncodingMode(),
                xOffset: 4,
                yOffset: 0,
                rotation: 0
            },
            shape: {
                type: 'shape',
                positionMode: 'flow',
                shapeType: 'rect',
                width: 180,
                height: 36,
                strokeWidth: 2,
                cornerRadius: 10,
                sides: 6,
                xOffset: 4,
                yOffset: 0,
                rotation: 0
            },
            image: {
                type: 'image',
                positionMode: 'flow',
                imageData: '',
                imageName: '',
                imageDither: 'floyd-steinberg',
                imageThreshold: 128,
                imageSmoothing: 'medium',
                imageInvert: false,
                width: 96,
                height: 96,
                xOffset: 4,
                yOffset: 0,
                rotation: 0
            },
            icon: {
                type: 'icon',
                positionMode: 'flow',
                iconId: IconLibraryUtils.getDefaultIconId(),
                width: 72,
                height: 72,
                xOffset: 4,
                yOffset: 0,
                rotation: 0
            },
            barcode: {
                type: 'barcode',
                positionMode: 'flow',
                data: '1234567890',
                width: 220,
                height: 64,
                barcodeFormat: BarcodeUtils.getDefaultFormat(),
                barcodeShowText: false,
                barcodeModuleWidth: 2,
                barcodeMargin: 0,
                xOffset: 4,
                yOffset: 0,
                rotation: 0
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
        if (!type || !['text', 'qr', 'shape', 'image', 'icon', 'barcode'].includes(type)) return null

        const defaults = ProjectIoUtils.#buildItemDefaults()[type]
        const normalized = { ...defaults, ...cleaned }
        normalized.id = normalized.id || fallbackId
        normalized.positionMode = ProjectIoUtils.#normalizePositionMode(cleaned.positionMode ?? defaults.positionMode)

        if (type === 'text') {
            normalized.fontSize = ProjectIoUtils.#coerceNumber(normalized.fontSize, defaults.fontSize)
            normalized.height = ProjectIoUtils.#coerceNumber(normalized.height, defaults.height)
            normalized.xOffset = ProjectIoUtils.#coerceNumber(normalized.xOffset, defaults.xOffset)
            normalized.yOffset = ProjectIoUtils.#coerceNumber(normalized.yOffset, defaults.yOffset)
            const normalizedFontWeight = String(cleaned.fontWeight || '').toLowerCase()
            const normalizedFontStyle = String(cleaned.fontStyle || '').toLowerCase()
            const normalizedTextDecoration = String(cleaned.textDecoration || '').toLowerCase()
            normalized.textBold = ProjectIoUtils.#coerceBoolean(
                cleaned.textBold ?? cleaned.bold ?? (normalizedFontWeight === 'bold'),
                defaults.textBold
            )
            normalized.textItalic = ProjectIoUtils.#coerceBoolean(
                cleaned.textItalic ?? cleaned.italic ?? cleaned.kursiv ?? (normalizedFontStyle === 'italic'),
                defaults.textItalic
            )
            normalized.textUnderline = ProjectIoUtils.#coerceBoolean(
                cleaned.textUnderline ?? cleaned.underline ?? cleaned.underlined ?? (normalizedTextDecoration === 'underline'),
                defaults.textUnderline
            )
            normalized.textStrikethrough = ProjectIoUtils.#coerceBoolean(
                cleaned.textStrikethrough ??
                    cleaned.strikethrough ??
                    cleaned.strikeThrough ??
                    cleaned.strike ??
                    (normalizedTextDecoration === 'line-through' || normalizedTextDecoration === 'strikethrough'),
                defaults.textStrikethrough
            )
            delete normalized.bold
            delete normalized.italic
            delete normalized.kursiv
            delete normalized.underline
            delete normalized.underlined
            delete normalized.strikethrough
            delete normalized.strikeThrough
            delete normalized.strike
            delete normalized.fontWeight
            delete normalized.fontStyle
            delete normalized.textDecoration
            normalized.rotation = RotationUtils.normalizeDegrees(normalized.rotation, defaults.rotation)
        }
        if (type === 'qr') {
            const qrSizeSource = cleaned.size ?? cleaned.width ?? cleaned.height ?? defaults.size
            normalized.size = Math.max(1, ProjectIoUtils.#coerceNumber(qrSizeSource, defaults.size))
            normalized.height = normalized.size
            normalized.xOffset = ProjectIoUtils.#coerceNumber(normalized.xOffset, defaults.xOffset)
            normalized.yOffset = ProjectIoUtils.#coerceNumber(normalized.yOffset, defaults.yOffset)
            normalized.rotation = RotationUtils.normalizeDegrees(normalized.rotation, defaults.rotation)
            const normalizedQrOptions = QrCodeUtils.normalizeItemOptions({
                qrErrorCorrectionLevel:
                    cleaned.qrErrorCorrectionLevel ?? cleaned.errorCorrectionLevel ?? normalized.qrErrorCorrectionLevel,
                qrVersion: cleaned.qrVersion ?? cleaned.version ?? normalized.qrVersion,
                qrEncodingMode: cleaned.qrEncodingMode ?? cleaned.encodingMode ?? normalized.qrEncodingMode
            })
            normalized.qrErrorCorrectionLevel = normalizedQrOptions.qrErrorCorrectionLevel
            normalized.qrVersion = normalizedQrOptions.qrVersion
            normalized.qrEncodingMode = normalizedQrOptions.qrEncodingMode
            delete normalized.errorCorrectionLevel
            delete normalized.version
            delete normalized.encodingMode
            delete normalized.width
        }
        if (type === 'shape') {
            normalized.width = ProjectIoUtils.#coerceNumber(normalized.width, defaults.width)
            normalized.height = ProjectIoUtils.#coerceNumber(normalized.height, defaults.height)
            normalized.strokeWidth = ProjectIoUtils.#coerceNumber(normalized.strokeWidth, defaults.strokeWidth)
            normalized.cornerRadius = ProjectIoUtils.#coerceNumber(normalized.cornerRadius, defaults.cornerRadius)
            normalized.sides = ProjectIoUtils.#coerceNumber(normalized.sides, defaults.sides)
            normalized.xOffset = ProjectIoUtils.#coerceNumber(normalized.xOffset, defaults.xOffset)
            normalized.yOffset = ProjectIoUtils.#coerceNumber(normalized.yOffset, defaults.yOffset)
            normalized.rotation = RotationUtils.normalizeDegrees(normalized.rotation, defaults.rotation)
        }
        if (type === 'image') {
            normalized.width = Math.max(8, ProjectIoUtils.#coerceNumber(normalized.width, defaults.width))
            normalized.height = Math.max(8, ProjectIoUtils.#coerceNumber(normalized.height, defaults.height))
            normalized.xOffset = ProjectIoUtils.#coerceNumber(normalized.xOffset, defaults.xOffset)
            normalized.yOffset = ProjectIoUtils.#coerceNumber(normalized.yOffset, defaults.yOffset)
            normalized.rotation = RotationUtils.normalizeDegrees(normalized.rotation, defaults.rotation)
            normalized.imageData = typeof normalized.imageData === 'string' ? normalized.imageData : defaults.imageData
            normalized.imageName = typeof normalized.imageName === 'string' ? normalized.imageName : defaults.imageName
            const normalizedImageOptions = ImageRasterUtils.normalizeItemOptions(normalized)
            normalized.imageDither = normalizedImageOptions.imageDither
            normalized.imageThreshold = normalizedImageOptions.imageThreshold
            normalized.imageSmoothing = normalizedImageOptions.imageSmoothing
            normalized.imageInvert = normalizedImageOptions.imageInvert
        }
        if (type === 'icon') {
            normalized.width = Math.max(8, ProjectIoUtils.#coerceNumber(normalized.width, defaults.width))
            normalized.height = Math.max(8, ProjectIoUtils.#coerceNumber(normalized.height, defaults.height))
            normalized.xOffset = ProjectIoUtils.#coerceNumber(normalized.xOffset, defaults.xOffset)
            normalized.yOffset = ProjectIoUtils.#coerceNumber(normalized.yOffset, defaults.yOffset)
            normalized.rotation = RotationUtils.normalizeDegrees(normalized.rotation, defaults.rotation)
            normalized.iconId = IconLibraryUtils.normalizeIconId(normalized.iconId)
        }
        if (type === 'barcode') {
            normalized.data = typeof normalized.data === 'string' ? normalized.data : defaults.data
            normalized.width = Math.max(16, ProjectIoUtils.#coerceNumber(normalized.width, defaults.width))
            normalized.height = Math.max(16, ProjectIoUtils.#coerceNumber(normalized.height, defaults.height))
            normalized.xOffset = ProjectIoUtils.#coerceNumber(normalized.xOffset, defaults.xOffset)
            normalized.yOffset = ProjectIoUtils.#coerceNumber(normalized.yOffset, defaults.yOffset)
            normalized.rotation = RotationUtils.normalizeDegrees(normalized.rotation, defaults.rotation)
            const normalizedBarcodeOptions = BarcodeUtils.normalizeItemOptions({
                barcodeFormat: cleaned.barcodeFormat ?? cleaned.format ?? normalized.barcodeFormat,
                barcodeShowText: cleaned.barcodeShowText ?? cleaned.displayValue ?? normalized.barcodeShowText,
                barcodeModuleWidth: cleaned.barcodeModuleWidth ?? cleaned.moduleWidth ?? normalized.barcodeModuleWidth,
                barcodeMargin: cleaned.barcodeMargin ?? cleaned.margin ?? normalized.barcodeMargin
            })
            normalized.barcodeFormat = normalizedBarcodeOptions.barcodeFormat
            normalized.barcodeShowText = normalizedBarcodeOptions.barcodeShowText
            normalized.barcodeModuleWidth = normalizedBarcodeOptions.barcodeModuleWidth
            normalized.barcodeMargin = normalizedBarcodeOptions.barcodeMargin
            delete normalized.format
            delete normalized.displayValue
            delete normalized.moduleWidth
            delete normalized.margin
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
            while (!normalized.id || usedIds.has(normalized.id)) {
                normalized.id = `item-${nextIdCounter++}`
            }
            usedIds.add(normalized.id)
            normalizedItems.push(normalized)
        })

        const rawBle = rawState.ble && typeof rawState.ble === 'object' ? rawState.ble : {}
        const rawParameters = ProjectIoUtils.#normalizeParameterDefinitions(rawState.parameters)
        const rawParameterDataRows = ProjectIoUtils.#normalizeParameterDataRows(rawState.parameterDataRows)
        const rawCustomFontLinks = ProjectIoUtils.#normalizeCustomFontLinks(rawState.customFontLinks)
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
            parameters: rawParameters,
            parameterDataRows: rawParameterDataRows,
            customFontLinks: rawCustomFontLinks,
            parameterDataRaw: typeof rawState.parameterDataRaw === 'string' ? rawState.parameterDataRaw : '',
            parameterDataSourceName:
                typeof rawState.parameterDataSourceName === 'string' ? rawState.parameterDataSourceName : '',
            items: normalizedItems
        }

        nextIdCounter = Math.max(nextIdCounter, ProjectIoUtils.deriveNextIdCounter(normalizedItems))

        return { state: normalizedState, nextIdCounter }
    }
}
