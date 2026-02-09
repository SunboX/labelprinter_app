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
    customFontLinks: [],
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
            customFontLinks: ['https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap'],
            items: [
                {
                    id: 'item-1',
                    type: 'qr',
                    data: 'https://example.com',
                    size: 120,
                    height: 130,
                    qrErrorCorrectionLevel: 'H',
                    qrVersion: 7,
                    qrEncodingMode: 'numeric',
                    _qrCache: { pixels: [] }
                }
            ]
        }
        const payload = ProjectIoUtils.buildProjectPayload(state)
        assert.equal(payload.items[0]._qrCache, undefined)
        assert.equal(payload.items[0].type, 'qr')
        assert.equal(payload.items[0].qrErrorCorrectionLevel, 'H')
        assert.equal(payload.items[0].qrVersion, 7)
        assert.equal(payload.items[0].qrEncodingMode, 'numeric')
        assert.equal(payload.zoom, 1.23)
        assert.deepEqual(payload.parameters, [{ name: 'host', defaultValue: 'localhost' }])
        assert.deepEqual(payload.parameterDataRows, [{ host: 'printer-1' }])
        assert.deepEqual(payload.customFontLinks, ['https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap'])
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
            customFontLinks: [
                'https://fonts.googleapis.com/css2?family=Roboto',
                'https://fonts.googleapis.com/css2?family=Roboto',
                ''
            ],
            items: [
                { id: 'item-2', type: 'text', text: 'Hello' },
                {
                    id: 'item-2',
                    type: 'qr',
                    data: 'https://example.com',
                    errorCorrectionLevel: 'q',
                    version: 2,
                    encodingMode: 'alphanumeric'
                },
                {
                    id: 'item-3',
                    type: 'image',
                    imageData: 'data:image/png;base64,AAAB',
                    imageName: 'logo.png',
                    imageDither: 'ordered',
                    imageThreshold: 140,
                    imageSmoothing: 'high',
                    imageInvert: true,
                    width: 64,
                    height: 48
                },
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
        assert.deepEqual(state.customFontLinks, ['https://fonts.googleapis.com/css2?family=Roboto'])
        const qrItem = state.items.find((item) => item.type === 'qr')
        assert.equal(qrItem?.qrErrorCorrectionLevel, 'Q')
        assert.equal(qrItem?.qrVersion, 2)
        assert.equal(qrItem?.qrEncodingMode, 'alphanumeric')
        const imageItem = state.items.find((item) => item.type === 'image')
        assert.equal(imageItem?.imageName, 'logo.png')
        assert.equal(imageItem?.imageDither, 'ordered')
        assert.equal(imageItem?.imageThreshold, 140)
        assert.equal(imageItem?.imageSmoothing, 'high')
        assert.equal(imageItem?.imageInvert, true)
        assert.equal(imageItem?.width, 64)
        assert.equal(imageItem?.height, 48)
        assert.ok(nextIdCounter > ProjectIoUtils.deriveNextIdCounter([{ id: 'item-2' }]))
    })
})
