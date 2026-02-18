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
                    positionMode: 'absolute',
                    data: 'https://example.com',
                    size: 120,
                    height: 130,
                    qrErrorCorrectionLevel: 'H',
                    qrVersion: 7,
                    qrEncodingMode: 'numeric',
                    rotation: 22,
                    _qrCache: { pixels: [] }
                }
            ]
        }
        const payload = ProjectIoUtils.buildProjectPayload(state, { appVersion: '1.2.3' })
        assert.equal(payload.appVersion, '1.2.3')
        assert.equal(payload.items[0]._qrCache, undefined)
        assert.equal(payload.items[0].type, 'qr')
        assert.equal(payload.items[0].positionMode, 'absolute')
        assert.equal(payload.items[0].qrErrorCorrectionLevel, 'H')
        assert.equal(payload.items[0].qrVersion, 7)
        assert.equal(payload.items[0].qrEncodingMode, 'numeric')
        assert.equal(payload.items[0].rotation, 22)
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
                    encodingMode: 'alphanumeric',
                    rotation: 450
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
                    height: 48,
                    rotation: -40
                },
                {
                    type: 'icon',
                    iconId: 'icon-printer',
                    width: 60,
                    height: 40,
                    xOffset: -6,
                    yOffset: 3,
                    rotation: -721
                },
                {
                    type: 'barcode',
                    data: 'ABC-123',
                    width: 180,
                    height: 52,
                    format: 'code39',
                    displayValue: 'true',
                    moduleWidth: 3,
                    margin: 7,
                    rotation: 721
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
        assert.equal(qrItem?.height, qrItem?.size)
        assert.equal(qrItem?.rotation, 90)
        const imageItem = state.items.find((item) => item.type === 'image')
        assert.equal(imageItem?.imageName, 'logo.png')
        assert.equal(imageItem?.imageDither, 'ordered')
        assert.equal(imageItem?.imageThreshold, 140)
        assert.equal(imageItem?.imageSmoothing, 'high')
        assert.equal(imageItem?.imageInvert, true)
        assert.equal(imageItem?.width, 64)
        assert.equal(imageItem?.height, 48)
        assert.equal(imageItem?.rotation, -40)
        const iconItem = state.items.find((item) => item.type === 'icon')
        assert.equal(iconItem?.iconId, 'icon-printer')
        assert.equal(iconItem?.width, 60)
        assert.equal(iconItem?.height, 40)
        assert.equal(iconItem?.xOffset, -6)
        assert.equal(iconItem?.yOffset, 3)
        assert.equal(iconItem?.rotation, -1)
        const barcodeItem = state.items.find((item) => item.type === 'barcode')
        assert.equal(barcodeItem?.data, 'ABC-123')
        assert.equal(barcodeItem?.width, 180)
        assert.equal(barcodeItem?.height, 52)
        assert.equal(barcodeItem?.barcodeFormat, 'CODE39')
        assert.equal(barcodeItem?.barcodeShowText, true)
        assert.equal(barcodeItem?.barcodeModuleWidth, 3)
        assert.equal(barcodeItem?.barcodeMargin, 7)
        assert.equal(barcodeItem?.rotation, 1)
        const textItem = state.items.find((item) => item.type === 'text')
        assert.equal(textItem?.textBold, false)
        assert.equal(textItem?.textItalic, false)
        assert.equal(textItem?.textUnderline, false)
        assert.equal(textItem?.textStrikethrough, false)
        assert.equal(textItem?.rotation, 0)
        const shapeItem = state.items.find((item) => item.type === 'shape')
        assert.equal(shapeItem?.rotation, 0)
        assert.equal(textItem?.positionMode, 'flow')
        assert.equal(shapeItem?.positionMode, 'flow')
        assert.ok(nextIdCounter > ProjectIoUtils.deriveNextIdCounter([{ id: 'item-2' }]))
    })

    it('normalizes text style aliases and keeps qr square on load', () => {
        const raw = {
            items: [
                {
                    id: 'item-1',
                    type: 'text',
                    text: 'Styled',
                    bold: 'true',
                    kursiv: '1',
                    underline: 'yes',
                    textDecoration: 'line-through'
                },
                {
                    id: 'item-2',
                    type: 'qr',
                    data: 'https://example.com',
                    width: 98,
                    height: 120
                }
            ]
        }
        const { state } = ProjectIoUtils.normalizeProjectState(raw, defaultState)
        const textItem = state.items.find((item) => item.id === 'item-1')
        assert.equal(textItem?.textBold, true)
        assert.equal(textItem?.textItalic, true)
        assert.equal(textItem?.textUnderline, true)
        assert.equal(textItem?.textStrikethrough, true)
        const qrItem = state.items.find((item) => item.id === 'item-2')
        assert.equal(qrItem?.size, 98)
        assert.equal(qrItem?.height, 98)
        assert.equal(Object.prototype.hasOwnProperty.call(qrItem || {}, 'width'), false)
    })

    it('normalizes position mode to flow when missing or invalid', () => {
        const raw = {
            items: [
                { id: 'item-1', type: 'text', text: 'Default flow' },
                { id: 'item-2', type: 'shape', positionMode: 'ABSOLUTE', width: 20, height: 20 },
                { id: 'item-3', type: 'barcode', positionMode: 'floating', data: '1234' }
            ]
        }

        const { state } = ProjectIoUtils.normalizeProjectState(raw, defaultState)
        const textItem = state.items.find((item) => item.id === 'item-1')
        const shapeItem = state.items.find((item) => item.id === 'item-2')
        const barcodeItem = state.items.find((item) => item.id === 'item-3')
        assert.equal(textItem?.positionMode, 'flow')
        assert.equal(shapeItem?.positionMode, 'absolute')
        assert.equal(barcodeItem?.positionMode, 'flow')
    })
})
