import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ProjectUrlUtils } from '../src/ProjectUrlUtils.mjs'

describe('encode/decode project URL payload', () => {
    it('round-trips project payload data', () => {
        const payload = {
            media: 'W9',
            resolution: 'LOW',
            orientation: 'horizontal',
            items: [{ id: 'item-1', type: 'text', text: 'Network Port' }]
        }
        const encoded = ProjectUrlUtils.encodeProjectPayloadParam(payload)
        const decoded = ProjectUrlUtils.decodeEmbeddedProjectParam(encoded)
        assert.deepEqual(decoded, payload)
    })
})

describe('isLikelyProjectUrl', () => {
    it('detects absolute and relative URL references', () => {
        assert.equal(ProjectUrlUtils.isLikelyProjectUrl('https://example.com/project.json'), true)
        assert.equal(ProjectUrlUtils.isLikelyProjectUrl('/assets/project.json'), true)
        assert.equal(ProjectUrlUtils.isLikelyProjectUrl('./project.json'), true)
    })

    it('ignores embedded payload text', () => {
        assert.equal(ProjectUrlUtils.isLikelyProjectUrl('eyJmb28iOiJiYXIifQ'), false)
    })
})

describe('resolveProjectSource', () => {
    it('prefers embedded project payloads when both params are set', () => {
        const params = new URLSearchParams()
        params.set(ProjectUrlUtils.PROJECT_PARAM, 'embedded-data')
        params.set(ProjectUrlUtils.PROJECT_URL_PARAM, 'https://example.com/project.json')
        assert.deepEqual(ProjectUrlUtils.resolveProjectSource(params), {
            kind: 'embedded',
            value: 'embedded-data'
        })
    })

    it('returns remote source when only projectUrl is present', () => {
        const params = new URLSearchParams()
        params.set(ProjectUrlUtils.PROJECT_URL_PARAM, 'https://example.com/project.json')
        assert.deepEqual(ProjectUrlUtils.resolveProjectSource(params), {
            kind: 'remote',
            value: 'https://example.com/project.json'
        })
    })
})

describe('resolveParameterDataSource', () => {
    it('returns remote source when parameterDataUrl is present', () => {
        const params = new URLSearchParams()
        params.set(ProjectUrlUtils.PARAMETER_DATA_URL_PARAM, 'https://example.com/parameters.json')
        assert.deepEqual(ProjectUrlUtils.resolveParameterDataSource(params), {
            kind: 'remote',
            value: 'https://example.com/parameters.json'
        })
    })

    it('returns null source when parameterDataUrl is missing', () => {
        const params = new URLSearchParams()
        assert.deepEqual(ProjectUrlUtils.resolveParameterDataSource(params), {
            kind: null,
            value: null
        })
    })
})

describe('resolvePrintOptions', () => {
    it('parses autoPrint and skipBatchConfirm truthy values', () => {
        const params = new URLSearchParams()
        params.set(ProjectUrlUtils.AUTO_PRINT_PARAM, 'true')
        params.set(ProjectUrlUtils.SKIP_BATCH_CONFIRM_PARAM, '1')
        assert.deepEqual(ProjectUrlUtils.resolvePrintOptions(params), {
            autoPrint: true,
            skipBatchConfirm: true
        })
    })

    it('treats present empty values as true for boolean flags', () => {
        const params = new URLSearchParams(`?${ProjectUrlUtils.AUTO_PRINT_PARAM}&${ProjectUrlUtils.SKIP_BATCH_CONFIRM_PARAM}=`)
        assert.deepEqual(ProjectUrlUtils.resolvePrintOptions(params), {
            autoPrint: true,
            skipBatchConfirm: true
        })
    })

    it('returns false for missing or falsy values', () => {
        const params = new URLSearchParams()
        params.set(ProjectUrlUtils.AUTO_PRINT_PARAM, 'false')
        assert.deepEqual(ProjectUrlUtils.resolvePrintOptions(params), {
            autoPrint: false,
            skipBatchConfirm: false
        })
    })
})
