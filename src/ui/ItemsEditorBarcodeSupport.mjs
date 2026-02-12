import { BarcodeUtils } from '../BarcodeUtils.mjs'
import { RotationUtils } from '../RotationUtils.mjs'
import { ItemsEditorImageSupport } from './ItemsEditorImageSupport.mjs'
import { ItemsEditorControlSupport } from './ItemsEditorControlSupport.mjs'

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
        const { widthMax, heightMax } = ItemsEditorControlSupport.resolveDimensionMax(state, crossAxisLimit)
        const { widthCtrl, heightCtrl } = ItemsEditorControlSupport.createConstrainedDimensionControls({
            item,
            state,
            sizeLabel,
            heightLabel: translate('itemsEditor.sizeHeight'),
            minWidth: 16,
            minHeight: 16,
            widthMax,
            heightMax,
            defaultWidth: 220,
            defaultHeight: 64,
            onChange,
            constrainDimensions: ItemsEditorImageSupport.constrainImageDimensionsForOrientation,
            createSlider
        })
        const { offsetCtrl, yOffsetCtrl, rotationCtrl } = ItemsEditorControlSupport.createOffsetAndRotationControls({
            item,
            translate,
            onChange,
            createSlider
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

        const { field: formatCtrl } = ItemsEditorControlSupport.createSelectField({
            labelText: translate('itemsEditor.barcodeFormat'),
            value: item.barcodeFormat,
            options: BarcodeUtils.getSupportedFormats().map((format) => ({ value: format, label: format })),
            onChange: (value) => {
                item.barcodeFormat = BarcodeUtils.normalizeFormat(value)
                onChange()
            }
        })
        const { field: showTextCtrl } = ItemsEditorControlSupport.createCheckboxField({
            labelText: translate('itemsEditor.barcodeShowText'),
            checked: Boolean(item.barcodeShowText),
            onChange: (checked) => {
                item.barcodeShowText = checked
                onChange()
            }
        })

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
