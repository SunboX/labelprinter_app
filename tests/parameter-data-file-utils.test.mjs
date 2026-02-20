import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as XLSX from 'xlsx'
import { ParameterDataFileUtils } from '../src/ParameterDataFileUtils.mjs'

/**
 * Builds a file-like object for parser tests.
 * @param {string} name
 * @param {string} type
 * @param {Uint8Array} bytes
 * @returns {{ name: string, type: string, arrayBuffer: () => Promise<ArrayBuffer> }}
 */
function createFileLike(name, type, bytes) {
    return {
        name,
        type,
        async arrayBuffer() {
            return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        }
    }
}

/**
 * Builds a response-like object for parser tests.
 * @param {string} contentType
 * @param {Uint8Array} bytes
 * @returns {{ headers: { get: (name: string) => string }, arrayBuffer: () => Promise<ArrayBuffer> }}
 */
function createResponseLike(contentType, bytes) {
    return {
        headers: {
            get(name) {
                if (String(name || '').toLowerCase() === 'content-type') return contentType
                return ''
            }
        },
        async arrayBuffer() {
            return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        }
    }
}

describe('parameter-data-file-utils', () => {
    it('passes through JSON payloads unchanged', async () => {
        const jsonText = '[\n  { "name": "alpha" }\n]'
        const bytes = new TextEncoder().encode(jsonText)
        const file = createFileLike('rows.json', 'application/json', bytes)

        const result = await ParameterDataFileUtils.convertFileToParameterJsonText(file)

        assert.equal(result.format, 'json')
        assert.equal(result.jsonText, jsonText)
    })

    it('converts CSV payloads to pretty JSON array text', async () => {
        const bytes = new TextEncoder().encode('name,value\nalpha,1\nbeta,2\n')
        const file = createFileLike('rows.csv', 'text/csv', bytes)

        const result = await ParameterDataFileUtils.convertFileToParameterJsonText(file)
        const rows = JSON.parse(result.jsonText)

        assert.equal(result.format, 'csv')
        assert.equal(Array.isArray(rows), true)
        assert.equal(rows.length, 2)
        assert.equal(rows[0].name, 'alpha')
        assert.equal(String(rows[0].value), '1')
        assert.equal(rows[1].name, 'beta')
        assert.equal(String(rows[1].value), '2')
    })

    it('converts XLSX payloads to pretty JSON array text', async () => {
        const workbook = XLSX.utils.book_new()
        const sheet = XLSX.utils.aoa_to_sheet([
            ['host', 'port'],
            ['printer-a', 9100]
        ])
        XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1')
        const bytes = new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }))
        const file = createFileLike(
            'rows.xlsx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            bytes
        )

        const result = await ParameterDataFileUtils.convertFileToParameterJsonText(file)
        const rows = JSON.parse(result.jsonText)

        assert.equal(result.format, 'xlsx')
        assert.equal(rows.length, 1)
        assert.equal(rows[0].host, 'printer-a')
        assert.equal(String(rows[0].port), '9100')
    })

    it('supports ODS payloads from URL responses', async () => {
        const workbook = XLSX.utils.book_new()
        const sheet = XLSX.utils.aoa_to_sheet([
            ['asset', 'label'],
            ['sw1', 'uplink']
        ])
        XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1')
        const bytes = new Uint8Array(XLSX.write(workbook, { bookType: 'ods', type: 'array' }))
        const response = createResponseLike('application/vnd.oasis.opendocument.spreadsheet', bytes)

        const result = await ParameterDataFileUtils.convertResponseToParameterJsonText(
            response,
            'https://example.com/parameter-data.ods'
        )
        const rows = JSON.parse(result.jsonText)

        assert.equal(result.format, 'ods')
        assert.equal(rows.length, 1)
        assert.equal(rows[0].asset, 'sw1')
        assert.equal(rows[0].label, 'uplink')
    })

    it('uses worker client for spreadsheet payloads when available', async () => {
        let parseCalls = 0
        const workerClient = {
            isAvailable() {
                return true
            },
            async parseSpreadsheet(bytes, sourceName) {
                parseCalls += 1
                assert.equal(bytes instanceof Uint8Array, true)
                assert.equal(sourceName, 'rows.csv')
                return [{ host: 'printer-a' }]
            }
        }
        const file = createFileLike('rows.csv', 'text/csv', new TextEncoder().encode('host\nprinter-a\n'))

        const result = await ParameterDataFileUtils.convertFileToParameterJsonText(file, { workerClient })
        const rows = JSON.parse(result.jsonText)

        assert.equal(parseCalls, 1)
        assert.equal(rows.length, 1)
        assert.equal(rows[0].host, 'printer-a')
    })

    it('bypasses worker client for JSON payloads', async () => {
        let parseCalls = 0
        const workerClient = {
            isAvailable() {
                return true
            },
            async parseSpreadsheet() {
                parseCalls += 1
                return []
            }
        }
        const jsonText = '[{"name":"alpha"}]'
        const file = createFileLike('rows.json', 'application/json', new TextEncoder().encode(jsonText))

        const result = await ParameterDataFileUtils.convertFileToParameterJsonText(file, { workerClient })

        assert.equal(parseCalls, 0)
        assert.equal(result.format, 'json')
        assert.equal(result.jsonText, jsonText)
    })

    it('surfaces worker parse errors for spreadsheet payloads', async () => {
        const workerClient = {
            isAvailable() {
                return true
            },
            async parseSpreadsheet() {
                const error = new Error('Failed to parse parameter data file (rows.csv): Invalid CSV payload')
                error.name = 'WorkerResponseError'
                throw error
            }
        }
        const file = createFileLike('rows.csv', 'text/csv', new TextEncoder().encode('bad'))

        await assert.rejects(
            () => ParameterDataFileUtils.convertFileToParameterJsonText(file, { workerClient }),
            /Failed to parse parameter data file \(rows\.csv\): Invalid CSV payload/
        )
    })

    it('falls back to in-thread parser when worker transport fails', async () => {
        const workerClient = {
            isAvailable() {
                return true
            },
            async parseSpreadsheet() {
                throw new Error('worker transport disconnected')
            }
        }
        const bytes = new TextEncoder().encode('name,value\nalpha,1\n')
        const file = createFileLike('rows.csv', 'text/csv', bytes)

        const result = await ParameterDataFileUtils.convertFileToParameterJsonText(file, { workerClient })
        const rows = JSON.parse(result.jsonText)

        assert.equal(rows.length, 1)
        assert.equal(rows[0].name, 'alpha')
    })
})
