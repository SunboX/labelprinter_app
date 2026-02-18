import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AppApiEndpointUtils } from '../src/AppApiEndpointUtils.mjs'

describe('app api endpoint utils', () => {
    it('detects localhost variants', () => {
        assert.equal(AppApiEndpointUtils.isLocalHost('localhost'), true)
        assert.equal(AppApiEndpointUtils.isLocalHost('127.0.0.1'), true)
        assert.equal(AppApiEndpointUtils.isLocalHost('demo.localhost'), true)
        assert.equal(AppApiEndpointUtils.isLocalHost('example.com'), false)
    })

    it('resolves assistant endpoint by host', () => {
        assert.equal(AppApiEndpointUtils.resolveAssistantEndpoint('localhost'), '/api/chat')
        assert.equal(AppApiEndpointUtils.resolveAssistantEndpoint('example.com'), '/api/chat.php')
    })

    it('resolves app meta endpoint by host', () => {
        assert.equal(AppApiEndpointUtils.resolveAppMetaEndpoint('localhost'), '/api/app-meta')
        assert.equal(AppApiEndpointUtils.resolveAppMetaEndpoint('example.com'), '/api/app-meta.php')
    })
})
