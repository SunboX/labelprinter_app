/**
 * Converts parameter data files (JSON/CSV/XLS/XLSX/ODS) into JSON text for UI validation/preview.
 */
export class ParameterDataFileUtils {
    static #supportedExtensions = new Set(['json', 'csv', 'xls', 'xlsx', 'ods'])
    static #spreadsheetExtensions = new Set(['csv', 'xls', 'xlsx', 'ods'])
    static #jsonMimeTypes = new Set(['application/json', 'application/ld+json'])
    static #spreadsheetMimeTypes = new Set([
        'text/csv',
        'application/csv',
        'application/vnd.ms-excel',
        'application/vnd.ms-excel.sheet.macroenabled.12',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.oasis.opendocument.spreadsheet'
    ])
    static #defaultWorkerClient = null

    /**
     * Returns the file input accept value for supported parameter data formats.
     * @returns {string}
     */
    static get FILE_INPUT_ACCEPT_VALUE() {
        return [
            '.json',
            '.csv',
            '.xls',
            '.xlsx',
            '.ods',
            'application/json',
            'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.oasis.opendocument.spreadsheet'
        ].join(',')
    }

    /**
     * Returns file picker type descriptors for supported parameter data formats.
     * @param {string} description
     * @returns {Array<{ description: string, accept: Record<string, string[]> }>}
     */
    static buildPickerTypes(description) {
        return [
            {
                description,
                accept: {
                    'application/json': ['.json'],
                    'text/csv': ['.csv'],
                    'application/vnd.ms-excel': ['.xls'],
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                    'application/vnd.oasis.opendocument.spreadsheet': ['.ods']
                }
            }
        ]
    }

    /**
     * Sets the default worker client used for spreadsheet parsing acceleration.
     * @param {{ isAvailable?: () => boolean, parseSpreadsheet?: (bytes: Uint8Array, sourceName: string) => Promise<Record<string, unknown>[]> } | null} workerClient
     */
    static setDefaultWorkerClient(workerClient) {
        const hasParser = workerClient && typeof workerClient.parseSpreadsheet === 'function'
        ParameterDataFileUtils.#defaultWorkerClient = hasParser ? workerClient : null
    }

    /**
     * Converts a local file to parameter JSON text.
     * JSON files are returned as-is (to preserve parser diagnostics).
     * Spreadsheet formats are converted into pretty JSON array text.
     * @param {File} file
     * @param {{ workerClient?: { isAvailable?: () => boolean, parseSpreadsheet?: (bytes: Uint8Array, sourceName: string) => Promise<Record<string, unknown>[]> } | null }} [options={}]
     * @returns {Promise<{ jsonText: string, format: string }>}
     */
    static async convertFileToParameterJsonText(file, options = {}) {
        if (!file || typeof file.arrayBuffer !== 'function') {
            throw new Error('Invalid parameter data file.')
        }
        const bytes = new Uint8Array(await file.arrayBuffer())
        return ParameterDataFileUtils.#convertBytesToParameterJsonText(bytes, {
            sourceName: file.name || '',
            mimeType: file.type || ''
        }, options)
    }

    /**
     * Converts a fetched response body to parameter JSON text.
     * @param {Response} response
     * @param {string} sourceName
     * @param {{ workerClient?: { isAvailable?: () => boolean, parseSpreadsheet?: (bytes: Uint8Array, sourceName: string) => Promise<Record<string, unknown>[]> } | null }} [options={}]
     * @returns {Promise<{ jsonText: string, format: string }>}
     */
    static async convertResponseToParameterJsonText(response, sourceName = '', options = {}) {
        if (!response || typeof response.arrayBuffer !== 'function') {
            throw new Error('Invalid parameter data response.')
        }
        const bytes = new Uint8Array(await response.arrayBuffer())
        return ParameterDataFileUtils.#convertBytesToParameterJsonText(bytes, {
            sourceName,
            mimeType: response.headers?.get('content-type') || ''
        }, options)
    }

    /**
     * Converts a binary payload to parameter JSON text.
     * @param {Uint8Array} bytes
     * @param {{ sourceName: string, mimeType: string }} context
     * @param {{ workerClient?: { isAvailable?: () => boolean, parseSpreadsheet?: (bytes: Uint8Array, sourceName: string) => Promise<Record<string, unknown>[]> } | null }} [options={}]
     * @returns {Promise<{ jsonText: string, format: string }>}
     */
    static async #convertBytesToParameterJsonText(bytes, context, options = {}) {
        const extension = ParameterDataFileUtils.#extractExtension(context.sourceName)
        const mimeType = ParameterDataFileUtils.#normalizeMimeType(context.mimeType)
        const rawText = ParameterDataFileUtils.#decodeUtf8(bytes)
        const workerClient = options.workerClient ?? ParameterDataFileUtils.#defaultWorkerClient

        const treatAsJson =
            extension === 'json' ||
            ParameterDataFileUtils.#jsonMimeTypes.has(mimeType) ||
            ParameterDataFileUtils.#looksLikeJson(rawText)
        if (treatAsJson) {
            return {
                jsonText: rawText,
                format: 'json'
            }
        }

        const treatAsSpreadsheet =
            ParameterDataFileUtils.#spreadsheetExtensions.has(extension) ||
            ParameterDataFileUtils.#spreadsheetMimeTypes.has(mimeType)
        if (treatAsSpreadsheet) {
            const rows = await ParameterDataFileUtils.#readSpreadsheetRows(bytes, context.sourceName, workerClient)
            return {
                jsonText: JSON.stringify(rows, null, 2),
                format: extension || 'spreadsheet'
            }
        }

        // Fallback: unknown extension/content-type. Try JSON first, then spreadsheet parser.
        try {
            const parsed = JSON.parse(rawText)
            if (Array.isArray(parsed)) {
                return {
                    jsonText: rawText,
                    format: 'json'
                }
            }
        } catch (_error) {
            // Continue with spreadsheet fallback.
        }

        try {
            const rows = await ParameterDataFileUtils.#readSpreadsheetRows(bytes, context.sourceName, workerClient)
            return {
                jsonText: JSON.stringify(rows, null, 2),
                format: extension || 'spreadsheet'
            }
        } catch (_error) {
            throw new Error(
                `Unsupported parameter data format${context.sourceName ? ` (${context.sourceName})` : ''}. Use JSON, CSV, XLS, XLSX, or ODS.`
            )
        }
    }

    /**
     * Reads spreadsheet-like bytes and returns row objects.
     * @param {Uint8Array} bytes
     * @param {string} sourceName
     * @param {{ isAvailable?: () => boolean, parseSpreadsheet?: (bytes: Uint8Array, sourceName: string) => Promise<Record<string, unknown>[]> } | null} workerClient
     * @returns {Promise<Record<string, unknown>[]>}
     */
    static async #readSpreadsheetRows(bytes, sourceName, workerClient) {
        if (workerClient && typeof workerClient.parseSpreadsheet === 'function') {
            const workerAvailable =
                typeof workerClient.isAvailable === 'function' ? workerClient.isAvailable() : true
            if (workerAvailable) {
                try {
                    return await workerClient.parseSpreadsheet(bytes, sourceName)
                } catch (error) {
                    if (error?.name === 'WorkerResponseError') {
                        throw error
                    }
                    const message = error instanceof Error ? error.message : 'unknown worker error'
                    console.debug('[ParameterDataFileUtils] spreadsheet worker fallback:', message)
                }
            }
        }
        const xlsx = await ParameterDataFileUtils.#loadXlsxLibrary()
        let workbook
        try {
            workbook = xlsx.read(bytes, {
                type: 'array',
                raw: false,
                cellText: true
            })
        } catch (error) {
            const message = error?.message || 'Unable to parse spreadsheet data.'
            throw new Error(`Failed to parse parameter data file${sourceName ? ` (${sourceName})` : ''}: ${message}`)
        }
        const firstSheetName = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames[0] : ''
        if (!firstSheetName || !workbook.Sheets?.[firstSheetName]) {
            return []
        }
        const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
            defval: '',
            raw: false,
            blankrows: false
        })
        return ParameterDataFileUtils.#normalizeRows(rawRows)
    }

    /**
     * Dynamically loads the spreadsheet parser.
     * @returns {Promise<any>}
     */
    static async #loadXlsxLibrary() {
        const imported = await import('xlsx')
        const xlsx = imported?.default || imported
        if (!xlsx || typeof xlsx.read !== 'function' || !xlsx.utils || typeof xlsx.utils.sheet_to_json !== 'function') {
            throw new Error('Spreadsheet parser is unavailable.')
        }
        return xlsx
    }

    /**
     * Extracts a lowercase file extension from a file name or URL.
     * @param {string} sourceName
     * @returns {string}
     */
    static #extractExtension(sourceName) {
        const value = String(sourceName || '').trim()
        if (!value) return ''
        const withoutQuery = value.split('?')[0].split('#')[0]
        const filename = withoutQuery.split('/').pop() || withoutQuery
        const match = /\.([A-Za-z0-9]+)$/.exec(filename)
        const extension = match?.[1]?.toLowerCase() || ''
        return ParameterDataFileUtils.#supportedExtensions.has(extension) ? extension : ''
    }

    /**
     * Normalizes content-type values by removing charset and lowercasing.
     * @param {string} mimeType
     * @returns {string}
     */
    static #normalizeMimeType(mimeType) {
        return String(mimeType || '')
            .split(';')[0]
            .trim()
            .toLowerCase()
    }

    /**
     * Decodes UTF-8 bytes.
     * @param {Uint8Array} bytes
     * @returns {string}
     */
    static #decodeUtf8(bytes) {
        return new TextDecoder().decode(bytes)
    }

    /**
     * Returns whether the payload appears to be JSON text.
     * @param {string} rawText
     * @returns {boolean}
     */
    static #looksLikeJson(rawText) {
        const trimmed = String(rawText || '').trim()
        return trimmed.startsWith('{') || trimmed.startsWith('[')
    }

    /**
     * Normalizes parsed spreadsheet rows to plain key/value objects.
     * @param {unknown[]} rows
     * @returns {Record<string, unknown>[]}
     */
    static #normalizeRows(rows) {
        if (!Array.isArray(rows)) return []
        return rows
            .filter((row) => ParameterDataFileUtils.#isPlainObject(row))
            .map((row) => {
                const normalizedRow = {}
                Object.entries(row).forEach(([key, value]) => {
                    const normalizedKey = String(key || '').trim()
                    if (!normalizedKey) return
                    normalizedRow[normalizedKey] = value
                })
                return normalizedRow
            })
    }

    /**
     * Returns whether the input is a plain object.
     * @param {unknown} value
     * @returns {boolean}
     */
    static #isPlainObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    }
}
