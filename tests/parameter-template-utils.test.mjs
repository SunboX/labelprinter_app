import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ParameterTemplateUtils } from '../src/ParameterTemplateUtils.mjs'

describe('parameter-template-utils', () => {
    it('collects placeholders from text, qr, and barcode items', () => {
        const placeholders = ParameterTemplateUtils.collectPlaceholdersFromItems([
            { type: 'text', text: 'Host {{host}} on {{port}}' },
            { type: 'qr', data: 'https://{{host}}/status' },
            { type: 'barcode', data: '{{host}}-{{serial}}' },
            { type: 'shape' }
        ])
        assert.deepEqual(placeholders.sort(), ['host', 'port', 'serial'])
    })

    it('resolves placeholders with defaults and row overrides', () => {
        const map = ParameterTemplateUtils.buildParameterValueMap(
            [
                { name: 'host', defaultValue: 'localhost' },
                { name: 'port', defaultValue: '8080' }
            ],
            { port: 9000 }
        )
        const missing = new Set()
        const resolved = ParameterTemplateUtils.resolveTemplateString('http://{{host}}:{{port}}/{{path}}', map, missing)
        assert.equal(resolved, 'http://localhost:9000/{{path}}')
        assert.deepEqual(Array.from(missing), ['path'])
    })

    it('parses valid and invalid parameter JSON payloads', () => {
        const valid = ParameterTemplateUtils.parseParameterDataJson('[{"host":"a"}]')
        assert.equal(valid.parseError, null)
        assert.deepEqual(valid.rows, [{ host: 'a' }])

        const invalid = ParameterTemplateUtils.parseParameterDataJson('{"host":"a"}')
        assert.equal(invalid.rows, null)
        assert.match(invalid.parseError || '', /array of objects/i)
    })

    it('validates missing, unused, and unknown parameter usage', () => {
        const result = ParameterTemplateUtils.validateParameterSetup(
            [{ name: 'host', defaultValue: '' }, { name: 'unused_param', defaultValue: 'x' }],
            [{ type: 'text', text: 'Server {{host}} {{missing}}' }],
            [{ host: 'printer-a', extra: 'value' }],
            '[{"host":"printer-a","extra":"value"}]'
        )

        assert.ok(result.errors.some((issue) => issue.code === 'undefined-placeholder'))
        assert.ok(result.warnings.some((issue) => issue.code === 'unused-definition'))
        assert.ok(result.warnings.some((issue) => issue.code === 'unknown-row-parameter'))
    })

    it('builds an example row from defined parameters', () => {
        const rows = ParameterTemplateUtils.buildExampleRows([
            { name: 'host', defaultValue: 'printer.local' },
            { name: 'port', defaultValue: '' },
            { name: '' }
        ])
        assert.deepEqual(rows, [{ host: 'printer.local', port: 'example_port' }])
    })

    it('collects unique property names from JSON rows in appearance order', () => {
        const propertyNames = ParameterTemplateUtils.collectPropertyNamesFromRows([
            { host: 'printer-a', port: 9100 },
            { host: 'printer-b', queue: 'main' },
            null
        ])
        assert.deepEqual(propertyNames, ['host', 'port', 'queue'])
    })

    it('builds parameter definitions from JSON rows', () => {
        const definitions = ParameterTemplateUtils.buildParameterDefinitionsFromRows([
            { host: 'printer-a', port: 9100 },
            { queue: 'main', host: 'printer-b' }
        ])
        assert.deepEqual(definitions, [
            { name: 'host', defaultValue: '' },
            { name: 'port', defaultValue: '' },
            { name: 'queue', defaultValue: '' }
        ])
    })
})
