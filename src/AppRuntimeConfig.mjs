import { P700, P750W, E500, E550W, H500 } from 'labelprinterkit-web/src/index.mjs'

/**
 * Runtime configuration helpers for app defaults, shape catalog, and printer map.
 */
export class AppRuntimeConfig {
    /**
     * Returns printer constructor map used by the print controller.
     * @returns {Record<string, any>}
     */
    static createPrinterMap() {
        return { P700, P750W, E500, E550W, H500 }
    }

    /**
     * Returns available shape type definitions.
     * @returns {Array<{ id: string, labelKey: string }>}
     */
    static createShapeTypes() {
        return [
            { id: 'rect', labelKey: 'shapes.rect' },
            { id: 'roundRect', labelKey: 'shapes.roundRect' },
            { id: 'oval', labelKey: 'shapes.oval' },
            { id: 'polygon', labelKey: 'shapes.polygon' },
            { id: 'line', labelKey: 'shapes.line' },
            { id: 'triangle', labelKey: 'shapes.triangle' },
            { id: 'diamond', labelKey: 'shapes.diamond' },
            { id: 'arrowRight', labelKey: 'shapes.arrowRight' },
            { id: 'arrowLeft', labelKey: 'shapes.arrowLeft' },
            { id: 'plus', labelKey: 'shapes.plus' },
            { id: 'dot', labelKey: 'shapes.dot' }
        ]
    }

    /**
     * Returns the initial app state.
     * @param {() => string} nextId
     * @returns {Record<string, any>}
     */
    static createDefaultState(nextId) {
        return {
            media: 'W9',
            mediaLengthMm: null,
            zoom: 1,
            resolution: 'LOW',
            orientation: 'horizontal',
            backend: 'usb',
            printer: 'P700',
            ble: {
                serviceUuid: '0000xxxx-0000-1000-8000-00805f9b34fb',
                writeCharacteristicUuid: '0000yyyy-0000-1000-8000-00805f9b34fb',
                notifyCharacteristicUuid: '0000zzzz-0000-1000-8000-00805f9b34fb',
                namePrefix: 'PT-'
            },
            parameters: [],
            parameterDataRows: [],
            parameterDataRaw: '',
            parameterDataSourceName: '',
            customFontLinks: [],
            items: [
                {
                    id: nextId(),
                    type: 'text',
                    text: 'New text',
                    fontFamily: 'Barlow',
                    fontSize: 24,
                    textBold: false,
                    textItalic: false,
                    textUnderline: false,
                    height: 40,
                    xOffset: 4,
                    yOffset: 0,
                    rotation: 0
                }
            ]
        }
    }
}
