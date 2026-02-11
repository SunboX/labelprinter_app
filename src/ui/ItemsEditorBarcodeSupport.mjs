import { BarcodeUtils } from '../BarcodeUtils.mjs'
import { RotationUtils } from '../RotationUtils.mjs'
import { ItemsEditorImageSupport } from './ItemsEditorImageSupport.mjs'

/**
 * Shared barcode-item helpers for the items editor.
 */
export class ItemsEditorBarcodeSupport {
    /**
     * Resolves default dimensions for a newly created barcode item.
     * @param {object} state
     * @returns {{ width: number, height: number }}
     */
    static resolveDefaultBarcodeDimensions(state) {
        const crossAxisLimit = ItemsEditorImageSupport.resolveImageCrossAxisLimit(state)
        const defaultHeight = Math.max(24, Math.min(64, crossAxisLimit))
        const defaultWidth = 220
        return ItemsEditorImageSupport.constrainImageDimensionsForOrientation(defaultWidth, defaultHeight, state)
    }

    /**
     * Normalizes barcode-item dimensions and options.
     * @param {object} item
     * @param {object} state
     */
    static normalizeBarcodeItem(item, state) {
        const constrained = ItemsEditorImageSupport.constrainImageDimensionsForOrientation(
            item.width || 220,
            item.height || 64,
            state
        )
        item.width = Math.max(16, constrained.width)
        item.height = Math.max(16, constrained.height)
        item.rotation = RotationUtils.normalizeDegrees(item.rotation, 0)
        const normalizedOptions = BarcodeUtils.normalizeItemOptions(item)
        item.barcodeFormat = normalizedOptions.barcodeFormat
        item.barcodeShowText = normalizedOptions.barcodeShowText
        item.barcodeModuleWidth = normalizedOptions.barcodeModuleWidth
        item.barcodeMargin = normalizedOptions.barcodeMargin
    }

    /**
     * Appends barcode controls to the controls container.
     * @param {{
     *  item: object,
     *  controls: HTMLElement,
     *  sizeLabel: string,
     *  state: object,
     *  translate: (key: string, params?: Record<string, string | number>) => string,
     *  onChange: () => void,
     *  createSlider: (label: string, value: number, min: number, max: number, step: number, onInput: (value: number) => void) => HTMLDivElement
     * }} options
     */
    static appendBarcodeControls({ item, controls, sizeLabel, state, translate, onChange, createSlider }) {
        ItemsEditorBarcodeSupport.normalizeBarcodeItem(item, state)
        const crossAxisLimit = ItemsEditorImageSupport.resolveImageCrossAxisLimit(state)
        const widthMax = state.orientation === 'vertical' ? crossAxisLimit : 600
        const heightMax = state.orientation === 'horizontal' ? crossAxisLimit : 320

        const widthCtrl = createSlider(sizeLabel, item.width || 220, 16, widthMax, 1, (value) => {
            item.width = value
            const constrained = ItemsEditorImageSupport.constrainImageDimensionsForOrientation(
                item.width,
                item.height || 64,
                state
            )
            item.width = Math.max(16, constrained.width)
            item.height = Math.max(16, constrained.height)
            onChange()
        })
        const heightCtrl = createSlider(
            translate('itemsEditor.sizeHeight'),
            item.height || 64,
            16,
            heightMax,
            1,
            (value) => {
                item.height = value
                const constrained = ItemsEditorImageSupport.constrainImageDimensionsForOrientation(
                    item.width || 220,
                    item.height,
                    state
                )
                item.width = Math.max(16, constrained.width)
                item.height = Math.max(16, constrained.height)
                onChange()
            }
        )
        const offsetCtrl = createSlider(translate('itemsEditor.sliderXOffset'), item.xOffset ?? 0, -80, 80, 1, (value) => {
            item.xOffset = value
            onChange()
        })
        const yOffsetCtrl = createSlider(translate('itemsEditor.sliderYOffset'), item.yOffset ?? 0, -80, 80, 1, (value) => {
            item.yOffset = value
            onChange()
        })
        const rotationCtrl = createSlider(translate('itemsEditor.sliderRotation'), item.rotation ?? 0, -180, 180, 1, (value) => {
            item.rotation = value
            onChange()
        })
        const moduleWidthCtrl = createSlider(
            translate('itemsEditor.barcodeModuleWidth'),
            item.barcodeModuleWidth ?? 2,
            1,
            6,
            1,
            (value) => {
                item.barcodeModuleWidth = value
                onChange()
            }
        )
        const marginCtrl = createSlider(
            translate('itemsEditor.barcodeMargin'),
            item.barcodeMargin ?? 0,
            0,
            30,
            1,
            (value) => {
                item.barcodeMargin = value
                onChange()
            }
        )

        const formatCtrl = document.createElement('div')
        formatCtrl.className = 'field'
        const formatLabel = document.createElement('label')
        formatLabel.textContent = translate('itemsEditor.barcodeFormat')
        const formatSelect = document.createElement('select')
        BarcodeUtils.getSupportedFormats().forEach((format) => {
            const option = document.createElement('option')
            option.value = format
            option.textContent = format
            formatSelect.append(option)
        })
        formatSelect.value = item.barcodeFormat
        formatSelect.addEventListener('change', (event) => {
            item.barcodeFormat = BarcodeUtils.normalizeFormat(event.target.value)
            onChange()
        })
        formatCtrl.append(formatLabel, formatSelect)

        const showTextCtrl = document.createElement('div')
        showTextCtrl.className = 'field'
        const showTextLabel = document.createElement('label')
        showTextLabel.className = 'checkbox-row'
        const showTextInput = document.createElement('input')
        showTextInput.type = 'checkbox'
        showTextInput.checked = Boolean(item.barcodeShowText)
        showTextInput.addEventListener('change', (event) => {
            item.barcodeShowText = event.target.checked
            onChange()
        })
        const showTextText = document.createElement('span')
        showTextText.textContent = translate('itemsEditor.barcodeShowText')
        showTextLabel.append(showTextInput, showTextText)
        showTextCtrl.append(showTextLabel)

        controls.append(
            widthCtrl,
            heightCtrl,
            offsetCtrl,
            yOffsetCtrl,
            rotationCtrl,
            moduleWidthCtrl,
            marginCtrl,
            formatCtrl,
            showTextCtrl
        )
    }
}
