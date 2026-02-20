import * as xlsxModule from '/node_modules/xlsx/xlsx.mjs'

/**
 * Handles incoming spreadsheet parsing requests.
 * @param {MessageEvent<any>} event
 */
async function handleWorkerMessage(event) {
    const data = event?.data || {}
    if (String(data?.type || '') !== 'parseSpreadsheet') return
    const requestId = Number(data?.requestId)
    if (!Number.isInteger(requestId) || requestId < 1) return
    try {
        const rows = await parseSpreadsheetRows(data?.payload)
        postSuccess(requestId, rows)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Spreadsheet parsing failed.'
        postError(requestId, message)
    }
}

/**
 * Posts a successful parse response.
 * @param {number} requestId
 * @param {Array<Record<string, unknown>>} rows
 */
function postSuccess(requestId, rows) {
    globalThis.postMessage({
        type: 'parseSpreadsheet:ok',
        requestId,
        payload: { rows }
    })
}

/**
 * Posts an error parse response.
 * @param {number} requestId
 * @param {string} message
 */
function postError(requestId, message) {
    globalThis.postMessage({
        type: 'parseSpreadsheet:error',
        requestId,
        error: { message: String(message || 'Spreadsheet parsing failed.') }
    })
}

/**
 * Parses one spreadsheet payload into normalized rows.
 * @param {{ bytes?: unknown, sourceName?: unknown }} payload
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function parseSpreadsheetRows(payload) {
    const xlsx = resolveXlsxRuntime()
    const sourceName = String(payload?.sourceName || '')
    const bytes = normalizeBytes(payload?.bytes)
    let workbook
    try {
        workbook = xlsx.read(bytes, {
            type: 'array',
            raw: false,
            cellText: true
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to parse spreadsheet data.'
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
    return normalizeRows(rawRows)
}

/**
 * Resolves the xlsx runtime from module imports.
 * @returns {any}
 */
function resolveXlsxRuntime() {
    const xlsx = xlsxModule?.default || xlsxModule
    if (!xlsx || typeof xlsx.read !== 'function' || !xlsx.utils || typeof xlsx.utils.sheet_to_json !== 'function') {
        throw new Error('Spreadsheet parser is unavailable.')
    }
    return xlsx
}

/**
 * Normalizes unknown byte values to Uint8Array.
 * @param {unknown} value
 * @returns {Uint8Array}
 */
function normalizeBytes(value) {
    if (value instanceof Uint8Array) return value
    if (value instanceof ArrayBuffer) return new Uint8Array(value)
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    }
    return new Uint8Array(0)
}

/**
 * Normalizes row records to plain objects with trimmed string keys.
 * @param {unknown} rows
 * @returns {Array<Record<string, unknown>>}
 */
function normalizeRows(rows) {
    if (!Array.isArray(rows)) return []
    return rows
        .filter((row) => isPlainObject(row))
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
 * Returns whether value is a plain object.
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

globalThis.onmessage = (event) => {
    void handleWorkerMessage(event)
}
