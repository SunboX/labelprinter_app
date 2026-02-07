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
