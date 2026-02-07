/**
 * Parameter and template helpers for placeholder-driven label rendering.
 */
export class ParameterTemplateUtils {
    static #placeholderPattern = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g
    static #parameterNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/

    /**
     * Returns whether a value is a plain object.
     * @param {unknown} value
     * @returns {boolean}
     */
    static #isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value)
    }

    /**
     * Escapes HTML special characters.
     * @param {string} text
     * @returns {string}
     */
    static escapeHtml(text) {
        return String(text || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;')
    }

    /**
     * Resolves a value to a printable string.
     * @param {unknown} value
     * @returns {string}
     */
    static #stringifyValue(value) {
        if (value === null || value === undefined) return ''
        if (typeof value === 'string') return value
        if (typeof value === 'number' || typeof value === 'boolean') return String(value)
        try {
            return JSON.stringify(value)
        } catch (_err) {
            return String(value)
        }
    }

    /**
     * Returns whether a parameter name is valid.
     * @param {string} name
     * @returns {boolean}
     */
    static isValidParameterName(name) {
        return ParameterTemplateUtils.#parameterNamePattern.test(String(name || '').trim())
    }

    /**
     * Normalizes a parameter definition array.
     * @param {Array<{ name?: string, defaultValue?: unknown }>} definitions
     * @returns {Array<{ name: string, defaultValue: string }>}
     */
    static normalizeParameterDefinitions(definitions) {
        if (!Array.isArray(definitions)) return []
        return definitions.map((definition) => ({
            name: String(definition?.name || '').trim(),
            defaultValue: ParameterTemplateUtils.#stringifyValue(definition?.defaultValue ?? '')
        }))
    }

    /**
     * Builds a parameter value map from defaults and a row object.
     * Row values override defaults.
     * @param {Array<{ name: string, defaultValue?: unknown }>} definitions
     * @param {Record<string, unknown>} [rowValues={}]
     * @returns {Record<string, string>}
     */
    static buildParameterValueMap(definitions, rowValues = {}) {
        const values = {}
        ParameterTemplateUtils.normalizeParameterDefinitions(definitions).forEach((definition) => {
            if (!definition.name) return
            values[definition.name] = ParameterTemplateUtils.#stringifyValue(definition.defaultValue)
        })
        if (ParameterTemplateUtils.#isPlainObject(rowValues)) {
            Object.entries(rowValues).forEach(([key, value]) => {
                values[key] = ParameterTemplateUtils.#stringifyValue(value)
            })
        }
        return values
    }

    /**
     * Extracts unique parameter placeholders from a template string.
     * Placeholder format: `{{parameter_name}}`.
     * @param {string} template
     * @returns {string[]}
     */
    static extractPlaceholders(template) {
        const text = String(template || '')
        const names = new Set()
        const matcher = new RegExp(ParameterTemplateUtils.#placeholderPattern)
        let match = matcher.exec(text)
        while (match) {
            names.add(match[1])
            match = matcher.exec(text)
        }
        return Array.from(names)
    }

    /**
     * Collects placeholders from text and QR items.
     * @param {Array<{ type?: string, text?: string, data?: string }>} items
     * @returns {string[]}
     */
    static collectPlaceholdersFromItems(items) {
        const names = new Set()
        if (!Array.isArray(items)) return []
        items.forEach((item) => {
            if (item?.type === 'text') {
                ParameterTemplateUtils.extractPlaceholders(item.text).forEach((name) => names.add(name))
            } else if (item?.type === 'qr') {
                ParameterTemplateUtils.extractPlaceholders(item.data).forEach((name) => names.add(name))
            }
        })
        return Array.from(names)
    }

    /**
     * Resolves placeholders in a template string from a value map.
     * Missing placeholders remain unchanged.
     * @param {string} template
     * @param {Record<string, unknown>} values
     * @param {Set<string>} [missingNames]
     * @returns {string}
     */
    static resolveTemplateString(template, values, missingNames = new Set()) {
        const text = String(template || '')
        return text.replace(ParameterTemplateUtils.#placeholderPattern, (_full, placeholderName) => {
            if (Object.hasOwn(values || {}, placeholderName)) {
                return ParameterTemplateUtils.#stringifyValue(values[placeholderName])
            }
            missingNames.add(placeholderName)
            return `{{${placeholderName}}}`
        })
    }

    /**
     * Parses a JSON payload expected to contain an array of row objects.
     * @param {string} rawJson
     * @returns {{
     *  rows: Record<string, unknown>[] | null,
     *  prettyText: string,
     *  parseError: string | null,
     *  parseErrorLine: number | null,
     *  parseErrorColumn: number | null
     * }}
     */
    static parseParameterDataJson(rawJson) {
        const rawText = String(rawJson || '')
        if (!rawText.trim()) {
            return {
                rows: [],
                prettyText: '[]',
                parseError: null,
                parseErrorLine: null,
                parseErrorColumn: null
            }
        }
        try {
            const parsed = JSON.parse(rawText)
            if (!Array.isArray(parsed)) {
                return {
                    rows: null,
                    prettyText: rawText,
                    parseError: 'JSON root must be an array of objects.',
                    parseErrorLine: null,
                    parseErrorColumn: null
                }
            }
            const invalidEntry = parsed.findIndex((entry) => !ParameterTemplateUtils.#isPlainObject(entry))
            if (invalidEntry >= 0) {
                return {
                    rows: null,
                    prettyText: rawText,
                    parseError: `Entry at index ${invalidEntry} must be an object.`,
                    parseErrorLine: null,
                    parseErrorColumn: null
                }
            }
            return {
                rows: parsed,
                prettyText: JSON.stringify(parsed, null, 2),
                parseError: null,
                parseErrorLine: null,
                parseErrorColumn: null
            }
        } catch (err) {
            const message = err?.message || 'Invalid JSON.'
            const { line, column } = ParameterTemplateUtils.#extractJsonParseLineColumn(rawText, message)
            return {
                rows: null,
                prettyText: rawText,
                parseError: message,
                parseErrorLine: line,
                parseErrorColumn: column
            }
        }
    }

    /**
     * Extracts parse line/column from a JSON parser message.
     * @param {string} sourceText
     * @param {string} parseMessage
     * @returns {{ line: number | null, column: number | null }}
     */
    static #extractJsonParseLineColumn(sourceText, parseMessage) {
        const positionMatch = /position\s+(\d+)/i.exec(String(parseMessage || ''))
        if (!positionMatch) {
            return { line: null, column: null }
        }
        const position = Number(positionMatch[1])
        if (!Number.isFinite(position) || position < 0) {
            return { line: null, column: null }
        }
        const prefix = sourceText.slice(0, position)
        const lines = prefix.split('\n')
        return {
            line: lines.length,
            column: lines[lines.length - 1].length + 1
        }
    }

    /**
     * Builds a pretty-printed array JSON string with row-to-line mapping.
     * @param {Record<string, unknown>[]} rows
     * @returns {{ prettyText: string, rowLineRanges: Array<{ start: number, end: number }> }}
     */
    static buildPrettyArrayPreview(rows) {
        const safeRows = Array.isArray(rows) ? rows : []
        const lines = ['[']
        const rowLineRanges = []
        safeRows.forEach((row, index) => {
            const serialized = JSON.stringify(row, null, 2).split('\n').map((line) => `  ${line}`)
            if (index < safeRows.length - 1) {
                serialized[serialized.length - 1] += ','
            }
            const start = lines.length + 1
            lines.push(...serialized)
            const end = lines.length
            rowLineRanges.push({ start, end })
        })
        lines.push(']')
        return {
            prettyText: lines.join('\n'),
            rowLineRanges
        }
    }

    /**
     * Builds example parameter rows from the current definitions.
     * @param {Array<{ name?: string, defaultValue?: unknown }>} definitions
     * @returns {Array<Record<string, string>>}
     */
    static buildExampleRows(definitions) {
        const row = {}
        ParameterTemplateUtils.normalizeParameterDefinitions(definitions).forEach((definition) => {
            const name = String(definition?.name || '').trim()
            if (!name) return
            const defaultValue = String(definition.defaultValue ?? '')
            row[name] = defaultValue.length ? defaultValue : `example_${name}`
        })
        return [row]
    }

    /**
     * Validates parameter setup against templates and uploaded rows.
     * @param {Array<{ name?: string, defaultValue?: unknown }>} definitions
     * @param {Array<{ type?: string, text?: string, data?: string }>} items
     * @param {Record<string, unknown>[]} rows
     * @param {string} [rawJson='']
     * @returns {{ errors: Array<object>, warnings: Array<object>, placeholders: string[] }}
     */
    static validateParameterSetup(definitions, items, rows, rawJson = '') {
        const errors = []
        const warnings = []
        const normalizedDefinitions = ParameterTemplateUtils.normalizeParameterDefinitions(definitions)
        const placeholders = ParameterTemplateUtils.collectPlaceholdersFromItems(items)
        const placeholderSet = new Set(placeholders)
        const nameCounts = new Map()
        const definitionMap = new Map()

        normalizedDefinitions.forEach((definition, index) => {
            const name = definition.name
            if (!name) {
                warnings.push({
                    level: 'warning',
                    code: 'empty-definition-name',
                    definitionIndex: index + 1,
                    message: `Parameter definition ${index + 1} has an empty name.`
                })
                return
            }
            if (!ParameterTemplateUtils.isValidParameterName(name)) {
                errors.push({
                    level: 'error',
                    code: 'invalid-definition-name',
                    parameterName: name,
                    message: `Parameter "${name}" has an invalid name. Use letters, digits and underscore only.`
                })
            }
            nameCounts.set(name, (nameCounts.get(name) || 0) + 1)
            definitionMap.set(name, definition.defaultValue ?? '')
        })

        nameCounts.forEach((count, name) => {
            if (count > 1) {
                errors.push({
                    level: 'error',
                    code: 'duplicate-definition-name',
                    parameterName: name,
                    count,
                    message: `Parameter "${name}" is defined ${count} times.`
                })
            }
        })

        placeholderSet.forEach((placeholder) => {
            if (!definitionMap.has(placeholder)) {
                errors.push({
                    level: 'error',
                    code: 'undefined-placeholder',
                    placeholder,
                    message: `Placeholder "{{${placeholder}}}" is used but no parameter is defined for it.`
                })
            }
        })

        definitionMap.forEach((_defaultValue, parameterName) => {
            if (!placeholderSet.has(parameterName)) {
                warnings.push({
                    level: 'warning',
                    code: 'unused-definition',
                    parameterName,
                    message: `Parameter "${parameterName}" is defined but not used in any text or QR template.`
                })
            }
        })

        if (Array.isArray(rows)) {
            rows.forEach((row, rowIndex) => {
                if (!ParameterTemplateUtils.#isPlainObject(row)) {
                    errors.push({
                        level: 'error',
                        code: 'invalid-row-type',
                        rowIndex,
                        rowNumber: rowIndex + 1,
                        message: `Row ${rowIndex + 1} is not a JSON object.`
                    })
                    return
                }
                Object.keys(row).forEach((key) => {
                    if (!definitionMap.has(key)) {
                        warnings.push({
                            level: 'warning',
                            code: 'unknown-row-parameter',
                            rowIndex,
                            rowNumber: rowIndex + 1,
                            parameterName: key,
                            message: `Row ${rowIndex + 1} contains "${key}" which is not defined as a parameter.`
                        })
                    }
                })
                placeholderSet.forEach((placeholder) => {
                    const hasRowValue = Object.hasOwn(row, placeholder)
                    const hasDefault = String(definitionMap.get(placeholder) ?? '').length > 0
                    if (!hasRowValue && !hasDefault) {
                        errors.push({
                            level: 'error',
                            code: 'missing-row-parameter',
                            rowIndex,
                            rowNumber: rowIndex + 1,
                            parameterName: placeholder,
                            message: `Row ${rowIndex + 1} is missing "${placeholder}" and no default is set.`
                        })
                    } else if (!hasRowValue && hasDefault) {
                        warnings.push({
                            level: 'warning',
                            code: 'fallback-default-parameter',
                            rowIndex,
                            rowNumber: rowIndex + 1,
                            parameterName: placeholder,
                            message: `Row ${rowIndex + 1} uses default value for "${placeholder}".`
                        })
                    }
                })
            })
        }

        if (String(rawJson || '').trim() && Array.isArray(rows)) {
            const pretty = JSON.stringify(rows, null, 2).trim()
            if (pretty !== String(rawJson).trim()) {
                warnings.push({
                    level: 'warning',
                    code: 'json-formatting',
                    message: 'Uploaded JSON is valid but not pretty-formatted (2-space indentation).'
                })
            }
        }

        return { errors, warnings, placeholders }
    }
}
