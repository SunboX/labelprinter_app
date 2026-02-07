import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ProjectIoUtils } from '../src/ProjectIoUtils.mjs'

const defaultState = {
    media: 'W9',
    mediaLengthMm: null,
    zoom: 1,
    resolution: 'LOW',
    orientation: 'horizontal',
    backend: 'usb',
    printer: 'P700',
    ble: {
        serviceUuid: 'service',
        writeCharacteristicUuid: 'write',
        notifyCharacteristicUuid: 'notify',
        namePrefix: 'PT-'
    },
    parameters: [],
    parameterDataRows: [],
    parameterDataRaw: '',
    parameterDataSourceName: '',
    items: []
}

describe('project-io-utils', () => {
    it('stripRuntimeFields removes underscored keys', () => {
        const input = { id: 'item-1', type: 'qr', _qrCache: {}, _qrCacheKey: 'x' }
        assert.deepEqual(ProjectIoUtils.stripRuntimeFields(input), { id: 'item-1', type: 'qr' })
    })

    it('buildProjectPayload omits runtime fields', () => {
        const state = {
            ...defaultState,
            zoom: 1.23,
            parameters: [{ name: 'host', defaultValue: 'localhost' }],
            parameterDataRows: [{ host: 'printer-1' }],
            items: [
                {
                    id: 'item-1',
                    type: 'qr',
                    data: 'https://example.com',
                    size: 120,
                    height: 130,
                    _qrCache: { pixels: [] }
                }
            ]
        }
        const payload = ProjectIoUtils.buildProjectPayload(state)
        assert.equal(payload.items[0]._qrCache, undefined)
        assert.equal(payload.items[0].type, 'qr')
        assert.equal(payload.zoom, 1.23)
        assert.deepEqual(payload.parameters, [{ name: 'host', defaultValue: 'localhost' }])
        assert.deepEqual(payload.parameterDataRows, [{ host: 'printer-1' }])
    })

    it('normalizeProjectState throws when items are missing', () => {
        assert.throws(() => ProjectIoUtils.normalizeProjectState({ media: 'W9' }, defaultState), /items array/)
    })

    it('normalizeProjectState normalizes ids and filters unknown types', () => {
        const raw = {
            media: 'W9',
            zoom: 10,
            parameters: [{ name: 'host', defaultValue: 'fallback' }],
            parameterDataRows: [{ host: 'printer-a' }, 'invalid-row'],
            items: [
                { id: 'item-2', type: 'text', text: 'Hello' },
                { id: 'item-2', type: 'qr', data: 'https://example.com' },
                { type: 'shape' },
                { type: 'unsupported', id: 'item-9' }
            ]
        }
        const { state, nextIdCounter } = ProjectIoUtils.normalizeProjectState(raw, defaultState)
        const ids = state.items.map((item) => item.id)
        assert.equal(ids.length, new Set(ids).size)
        assert.equal(state.items.some((item) => item.type === 'unsupported'), false)
        assert.equal(state.zoom, 2.5)
        assert.deepEqual(state.parameters, [{ name: 'host', defaultValue: 'fallback' }])
        assert.deepEqual(state.parameterDataRows, [{ host: 'printer-a' }])
        assert.ok(nextIdCounter > ProjectIoUtils.deriveNextIdCounter([{ id: 'item-2' }]))
    })
})
