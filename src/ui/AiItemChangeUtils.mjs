import { QrSizeUtils } from '../QrSizeUtils.mjs'
import { RotationUtils } from '../RotationUtils.mjs'

/**
 * Normalization and mutation helpers for assistant-driven item updates.
 */
export class AiItemChangeUtils {
    /**
     * Returns true when a change payload contains explicit spatial placement.
     * @param {Record<string, any> | null} changes
     * @returns {boolean}
     */
    static changesContainExplicitPlacement(changes) {
        if (!changes || typeof changes !== 'object') return false
        const normalizedChanges = AiItemChangeUtils.#normalizeChanges(
            AiItemChangeUtils.#expandStructuredChanges(changes)
        )
        const hasSpatialKey = ['xOffset', 'yOffset', 'rotation'].some((key) =>
            Object.prototype.hasOwnProperty.call(normalizedChanges, key)
        )
        if (hasSpatialKey) return true
        if (!Object.prototype.hasOwnProperty.call(normalizedChanges, 'positionMode')) return false
        return AiItemChangeUtils.#normalizePositionMode(normalizedChanges.positionMode) === 'absolute'
    }

    /**
     * Applies property changes to one item and returns changed keys.
     * @param {object} options
     * @param {Record<string, any>} options.item
     * @param {Record<string, any>} options.rawChanges
     * @param {Record<string, any>} options.state
     * @param {string[]} [options.shapeTypeIds=[]]
     * @returns {string[]}
     */
    static applyItemChanges({ item, rawChanges, state, shapeTypeIds = [] }) {
        if (!item || typeof item !== 'object') return []
        const expandedChanges = AiItemChangeUtils.#expandStructuredChanges(rawChanges)
        const normalizedChanges = AiItemChangeUtils.#normalizeChanges(expandedChanges)
        if (item.type === 'qr') {
            const qrSizeCandidates = [normalizedChanges.size, normalizedChanges.width, normalizedChanges.height]
                .map((entry) => Number(entry))
                .filter((entry) => Number.isFinite(entry))
            if (qrSizeCandidates.length) {
                normalizedChanges.size = Math.max(...qrSizeCandidates)
            }
            delete normalizedChanges.width
            delete normalizedChanges.height
        }
        const changedKeys = []
        Object.entries(normalizedChanges).forEach(([key, value]) => {
            switch (key) {
                case 'text':
                case 'iconId':
                case 'barcodeFormat':
                case 'qrErrorCorrectionLevel':
                case 'qrEncodingMode':
                case 'imageDither':
                case 'imageSmoothing': {
                    if (typeof value !== 'string') return
                    item[key] = value
                    changedKeys.push(key)
                    return
                }
                case 'fontFamily': {
                    const normalizedFamily = AiItemChangeUtils.#normalizeFontFamily(value)
                    if (!normalizedFamily) return
                    item.fontFamily = normalizedFamily
                    changedKeys.push(key)
                    return
                }
                case 'data': {
                    if (!['qr', 'barcode'].includes(item.type)) return
                    if (typeof value !== 'string') return
                    item.data = value
                    changedKeys.push(key)
                    return
                }
                case 'shapeType': {
                    const shapeType = String(value || '')
                    if (!shapeTypeIds.includes(shapeType)) return
                    item.shapeType = shapeType
                    changedKeys.push(key)
                    return
                }
                case 'xOffset':
                case 'yOffset': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item[key] = Math.round(numberValue)
                    changedKeys.push(key)
                    return
                }
                case 'positionMode': {
                    const normalizedMode = AiItemChangeUtils.#normalizePositionMode(value)
                    if (!normalizedMode) return
                    item.positionMode = normalizedMode
                    changedKeys.push(key)
                    return
                }
                case 'width':
                case 'height': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item[key] = Math.max(1, Math.round(numberValue))
                    changedKeys.push(key)
                    return
                }
                case 'fontSize': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item.fontSize = Math.max(6, Math.round(numberValue))
                    changedKeys.push(key)
                    return
                }
                case 'barcodeModuleWidth': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item.barcodeModuleWidth = Math.max(1, Math.round(numberValue))
                    changedKeys.push(key)
                    return
                }
                case 'barcodeMargin': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item.barcodeMargin = Math.max(0, Math.round(numberValue))
                    changedKeys.push(key)
                    return
                }
                case 'imageThreshold': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item.imageThreshold = Math.max(0, Math.min(255, Math.round(numberValue)))
                    changedKeys.push(key)
                    return
                }
                case 'strokeWidth': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item.strokeWidth = Math.max(1, Math.round(numberValue))
                    changedKeys.push(key)
                    return
                }
                case 'cornerRadius': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item.cornerRadius = Math.max(0, Math.round(numberValue))
                    changedKeys.push(key)
                    return
                }
                case 'sides': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item.sides = Math.max(3, Math.min(12, Math.round(numberValue)))
                    changedKeys.push(key)
                    return
                }
                case 'rotation': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item.rotation = RotationUtils.normalizeDegrees(numberValue)
                    changedKeys.push(key)
                    return
                }
                case 'size': {
                    if (item.type !== 'qr') return
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    const requestedSize = Math.round(numberValue)
                    item.size = state
                        ? QrSizeUtils.clampQrSizeToLabel(state, requestedSize)
                        : Math.max(1, requestedSize)
                    item.height = item.size
                    changedKeys.push(key)
                    return
                }
                case 'qrVersion': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item.qrVersion = Math.max(0, Math.min(40, Math.round(numberValue)))
                    changedKeys.push(key)
                    return
                }
                case 'barcodeShowText':
                case 'imageInvert': {
                    item[key] = AiItemChangeUtils.#coerceBoolean(value)
                    changedKeys.push(key)
                    return
                }
                case 'textBold': {
                    if (item.type !== 'text') return
                    item.textBold = AiItemChangeUtils.#coerceBoolean(value)
                    changedKeys.push(key)
                    return
                }
                case 'textItalic': {
                    if (item.type !== 'text') return
                    item.textItalic = AiItemChangeUtils.#coerceBoolean(value)
                    changedKeys.push(key)
                    return
                }
                case 'textUnderline': {
                    if (item.type !== 'text') return
                    item.textUnderline = AiItemChangeUtils.#coerceTextUnderline(value)
                    changedKeys.push(key)
                    return
                }
                case 'textStrikethrough': {
                    if (item.type !== 'text') return
                    item.textStrikethrough = AiItemChangeUtils.#coerceTextStrikethrough(value)
                    changedKeys.push(key)
                    return
                }
                default:
                    return
            }
        })
        return changedKeys
    }

    /**
     * Extracts property changes from multiple supported action payload shapes.
     * @param {Record<string, any>} action
     * @returns {Record<string, any> | null}
     */
    static extractItemChangesPayload(action) {
        const directCandidates = [action?.changes, action?.properties, action?.item, action?.values]
        for (const candidate of directCandidates) {
            if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
                return { ...candidate }
            }
        }
        const reservedKeys = new Set([
            'action',
            'itemType',
            'type',
            'shapeType',
            'itemId',
            'itemIndex',
            'itemIds',
            'target',
            'settings',
            'mode',
            'reference',
            'skipBatchConfirm'
        ])
        const inferredChanges = {}
        Object.entries(action || {}).forEach(([key, value]) => {
            if (reservedKeys.has(key)) return
            inferredChanges[key] = value
        })
        return Object.keys(inferredChanges).length ? inferredChanges : null
    }

    /**
     * Infers a best-effort item type when an update target is missing in rebuild mode.
     * @param {{ itemType?: string, type?: string }} action
     * @param {Record<string, any>} changes
     * @returns {'text' | 'qr' | 'barcode' | 'image' | 'icon' | 'shape'}
     */
    static inferItemTypeForMissingUpdate(action, changes) {
        const explicitType = String(action?.itemType || action?.type || '')
            .trim()
            .toLowerCase()
        if (['text', 'qr', 'barcode', 'image', 'icon', 'shape'].includes(explicitType)) {
            return /** @type {'text' | 'qr' | 'barcode' | 'image' | 'icon' | 'shape'} */ (explicitType)
        }
        const keys = new Set(Object.keys(changes || {}))
        if (keys.has('barcodeFormat') || keys.has('barcodeModuleWidth') || keys.has('barcodeMargin') || keys.has('barcodeShowText')) {
            return 'barcode'
        }
        if (keys.has('imageData') || keys.has('imageName') || keys.has('imageDither') || keys.has('imageThreshold') || keys.has('imageSmoothing') || keys.has('imageInvert')) {
            return 'image'
        }
        if (keys.has('iconId')) {
            return 'icon'
        }
        if (keys.has('shapeType') || keys.has('strokeWidth') || keys.has('cornerRadius') || keys.has('sides')) {
            return 'shape'
        }
        if (keys.has('qrErrorCorrectionLevel') || keys.has('qrVersion') || keys.has('qrEncodingMode') || keys.has('size')) {
            return 'qr'
        }
        if (keys.has('data') && !keys.has('text')) {
            return 'qr'
        }
        return 'text'
    }

    /**
     * Expands nested structures into flat item properties.
     * @param {Record<string, any>} rawChanges
     * @returns {Record<string, any>}
     */
    static #expandStructuredChanges(rawChanges) {
        const expanded = { ...(rawChanges || {}) }
        if (expanded.style && typeof expanded.style === 'object') {
            if (!Object.prototype.hasOwnProperty.call(expanded, 'textBold')) {
                expanded.textBold = expanded.style.textBold ?? expanded.style.bold ?? expanded.style.fontWeight
            }
            if (!Object.prototype.hasOwnProperty.call(expanded, 'textItalic')) {
                expanded.textItalic = expanded.style.textItalic ?? expanded.style.italic ?? expanded.style.fontStyle
            }
            if (!Object.prototype.hasOwnProperty.call(expanded, 'textUnderline')) {
                expanded.textUnderline =
                    expanded.style.textUnderline ?? expanded.style.underline ?? expanded.style.textDecoration
            }
            if (!Object.prototype.hasOwnProperty.call(expanded, 'textStrikethrough')) {
                expanded.textStrikethrough =
                    expanded.style.textStrikethrough ??
                    expanded.style.strikethrough ??
                    expanded.style.strikeThrough ??
                    expanded.style.strike
            }
        }
        if (!Object.prototype.hasOwnProperty.call(expanded, 'textBold') && Object.prototype.hasOwnProperty.call(expanded, 'fontWeight')) {
            expanded.textBold = expanded.fontWeight
        }
        if (!Object.prototype.hasOwnProperty.call(expanded, 'textItalic') && Object.prototype.hasOwnProperty.call(expanded, 'fontStyle')) {
            expanded.textItalic = expanded.fontStyle
        }
        if (!Object.prototype.hasOwnProperty.call(expanded, 'textUnderline') && Object.prototype.hasOwnProperty.call(expanded, 'textDecoration')) {
            expanded.textUnderline = expanded.textDecoration
        }
        if (!Object.prototype.hasOwnProperty.call(expanded, 'textStrikethrough')) {
            const textDecoration = Object.prototype.hasOwnProperty.call(expanded, 'textDecoration')
                ? String(expanded.textDecoration || '')
                      .trim()
                      .toLowerCase()
                : ''
            if (textDecoration === 'line-through' || textDecoration === 'strikethrough') {
                expanded.textStrikethrough = expanded.textDecoration
            }
        }
        if (expanded.position && typeof expanded.position === 'object') {
            if (!Object.prototype.hasOwnProperty.call(expanded, 'xOffset')) expanded.xOffset = expanded.position.x
            if (!Object.prototype.hasOwnProperty.call(expanded, 'yOffset')) expanded.yOffset = expanded.position.y
            if (!Object.prototype.hasOwnProperty.call(expanded, 'positionMode')) {
                expanded.positionMode = expanded.position.mode ?? expanded.position.positionMode
            }
        }
        if (expanded.layout && typeof expanded.layout === 'object') {
            if (!Object.prototype.hasOwnProperty.call(expanded, 'positionMode')) {
                expanded.positionMode = expanded.layout.positionMode ?? expanded.layout.mode
            }
        }
        if (expanded.size && typeof expanded.size === 'object') {
            if (!Object.prototype.hasOwnProperty.call(expanded, 'width')) expanded.width = expanded.size.width
            if (!Object.prototype.hasOwnProperty.call(expanded, 'height')) expanded.height = expanded.size.height
        }
        if (expanded.dimensions && typeof expanded.dimensions === 'object') {
            if (!Object.prototype.hasOwnProperty.call(expanded, 'width')) expanded.width = expanded.dimensions.width
            if (!Object.prototype.hasOwnProperty.call(expanded, 'height')) expanded.height = expanded.dimensions.height
        }
        return expanded
    }

    /**
     * Normalizes common model key aliases to canonical editor item keys.
     * @param {Record<string, any>} rawChanges
     * @returns {Record<string, any>}
     */
    static #normalizeChanges(rawChanges) {
        const aliasMap = {
            content: 'text',
            value: 'data',
            qrData: 'data',
            qrContent: 'data',
            barcodeData: 'data',
            bold: 'textBold',
            italic: 'textItalic',
            underline: 'textUnderline',
            underlined: 'textUnderline',
            strikethrough: 'textStrikethrough',
            strikeThrough: 'textStrikethrough',
            strike: 'textStrikethrough',
            through: 'textStrikethrough',
            kursiv: 'textItalic',
            fett: 'textBold',
            icon: 'iconId',
            x: 'xOffset',
            y: 'yOffset',
            x_offset: 'xOffset',
            y_offset: 'yOffset',
            font_size: 'fontSize',
            font_family: 'fontFamily',
            text_bold: 'textBold',
            text_italic: 'textItalic',
            text_underline: 'textUnderline',
            text_strikethrough: 'textStrikethrough',
            text_strike: 'textStrikethrough',
            textUnderlin: 'textUnderline',
            textStrikeThrough: 'textStrikethrough',
            fontWeight: 'textBold',
            fontStyle: 'textItalic',
            textDecoration: 'textUnderline',
            font_weight: 'textBold',
            font_style: 'textItalic',
            text_decoration: 'textUnderline',
            strike_through: 'textStrikethrough',
            line_through: 'textStrikethrough',
            position_mode: 'positionMode',
            placement_mode: 'positionMode',
            shape_type: 'shapeType',
            stroke_width: 'strokeWidth',
            corner_radius: 'cornerRadius',
            qr_size: 'size',
            qr_error_correction_level: 'qrErrorCorrectionLevel',
            qr_encoding_mode: 'qrEncodingMode',
            qr_version: 'qrVersion',
            barcode_show_text: 'barcodeShowText',
            barcode_module_width: 'barcodeModuleWidth',
            barcode_margin: 'barcodeMargin',
            image_dither: 'imageDither',
            image_threshold: 'imageThreshold',
            image_smoothing: 'imageSmoothing',
            image_invert: 'imageInvert'
        }
        const normalized = {}
        Object.entries(rawChanges || {}).forEach(([key, value]) => {
            const mappedKey = aliasMap[key] || key
            normalized[mappedKey] = value
        })
        return normalized
    }

    /**
     * Normalizes font-family values and common aliases from assistant payloads.
     * @param {unknown} value
     * @returns {string}
     */
    static #normalizeFontFamily(value) {
        if (typeof value !== 'string') return ''
        const unquoted = value.trim().replace(/^['"]+|['"]+$/g, '')
        const compact = unquoted.replace(/\s+/g, ' ').trim()
        if (!compact) return ''
        const lower = compact.toLowerCase()
        if (['sans', 'sans serif', 'sansserif', 'sans-serif'].includes(lower)) return 'sans-serif'
        if (lower === 'serif') return 'serif'
        if (['mono', 'mono space', 'monospace'].includes(lower)) return 'monospace'
        return compact
    }

    /**
     * Coerces common truthy/falsy values to booleans.
     * @param {unknown} value
     * @returns {boolean}
     */
    static #coerceBoolean(value) {
        if (typeof value === 'boolean') return value
        if (typeof value === 'number') return value !== 0
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase()
            if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
            if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false
            if (['bold', 'italic', 'underline', 'underlined', 'strikethrough', 'line-through'].includes(normalized)) return true
            if (['normal', 'none'].includes(normalized)) return false
        }
        return Boolean(value)
    }

    /**
     * Coerces text underline values while treating line-through as false.
     * @param {unknown} value
     * @returns {boolean}
     */
    static #coerceTextUnderline(value) {
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase()
            if (['underline', 'underlined'].includes(normalized)) return true
            if (['line-through', 'strikethrough', 'strike', 'none', 'normal'].includes(normalized)) return false
        }
        return AiItemChangeUtils.#coerceBoolean(value)
    }

    /**
     * Coerces text strikethrough values while treating underline as false.
     * @param {unknown} value
     * @returns {boolean}
     */
    static #coerceTextStrikethrough(value) {
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase()
            if (['line-through', 'strikethrough', 'strike', 'strike-through'].includes(normalized)) return true
            if (['underline', 'underlined', 'none', 'normal'].includes(normalized)) return false
        }
        return AiItemChangeUtils.#coerceBoolean(value)
    }

    /**
     * Normalizes supported item position modes.
     * @param {unknown} value
     * @returns {'flow' | 'absolute' | ''}
     */
    static #normalizePositionMode(value) {
        const normalized = String(value || '')
            .trim()
            .toLowerCase()
        if (!normalized) return ''
        if (normalized === 'absolute' || normalized === 'abs') return 'absolute'
        if (normalized === 'flow' || normalized === 'inline') return 'flow'
        return ''
    }
}
