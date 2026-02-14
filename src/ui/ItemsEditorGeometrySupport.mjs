import { QrSizeUtils } from '../QrSizeUtils.mjs'
import { QrCodeUtils } from '../QrCodeUtils.mjs'
import { ItemsEditorControlSupport } from './ItemsEditorControlSupport.mjs'

/**
 * Shared QR and shape control helpers for the items editor.
 */
export class ItemsEditorGeometrySupport {
    /**
     * Appends QR controls to the controls container.
     * @param {{
     *  item: object,
     *  controls: HTMLElement,
     *  state: object,
     *  translate: (key: string, params?: Record<string, string | number>) => string,
     *  onChange: () => void,
     *  createSlider: (label: string, value: number, min: number, max: number, step: number, onInput: (value: number) => void) => HTMLDivElement
     * }} options
     */
    static appendQrControls({ item, controls, state, translate, onChange, createSlider }) {
        const normalizedOptions = QrCodeUtils.normalizeItemOptions(item)
        item.qrErrorCorrectionLevel = normalizedOptions.qrErrorCorrectionLevel
        item.qrVersion = normalizedOptions.qrVersion
        item.qrEncodingMode = normalizedOptions.qrEncodingMode
        item.size = QrSizeUtils.clampQrSizeToLabel(state, item.size || QrSizeUtils.MIN_QR_SIZE_DOTS)
        item.height = item.size

        const maxQrSize = QrSizeUtils.computeMaxQrSizeDots(state)
        const minQrSize = Math.max(1, Math.min(QrSizeUtils.MIN_QR_SIZE_DOTS, maxQrSize))
        const { offsetCtrl, yOffsetCtrl, rotationCtrl } = ItemsEditorControlSupport.createOffsetAndRotationControls({
            item,
            translate,
            onChange,
            createSlider,
            xMin: 0,
            xMax: 50,
            yMin: -50,
            yMax: 50
        })
        const sizeCtrl = createSlider(translate('itemsEditor.sliderQrSize'), item.size, minQrSize, maxQrSize, 1, (value) => {
            item.size = QrSizeUtils.clampQrSizeToLabel(state, value)
            item.height = item.size
            item._qrCache = null
            onChange()
        })

        const errorCorrectionCtrl = document.createElement('div')
        errorCorrectionCtrl.className = 'field'
        const errorCorrectionLabel = document.createElement('label')
        errorCorrectionLabel.textContent = translate('itemsEditor.qrErrorCorrection')
        const errorCorrectionSelect = document.createElement('select')
        QrCodeUtils.getErrorCorrectionLevels().forEach((level) => {
            const option = document.createElement('option')
            option.value = level
            option.textContent = translate(`itemsEditor.qrErrorCorrection${level}`)
            errorCorrectionSelect.appendChild(option)
        })
        errorCorrectionSelect.value = item.qrErrorCorrectionLevel
        errorCorrectionSelect.addEventListener('change', (event) => {
            item.qrErrorCorrectionLevel = QrCodeUtils.normalizeErrorCorrectionLevel(event.target.value)
            item._qrCache = null
            onChange()
        })
        errorCorrectionCtrl.append(errorCorrectionLabel, errorCorrectionSelect)

        const versionCtrl = document.createElement('div')
        versionCtrl.className = 'field'
        const versionLabel = document.createElement('label')
        versionLabel.textContent = translate('itemsEditor.qrVersion')
        const versionSelect = document.createElement('select')
        const autoVersionOption = document.createElement('option')
        autoVersionOption.value = '0'
        autoVersionOption.textContent = translate('itemsEditor.qrVersionAuto')
        versionSelect.appendChild(autoVersionOption)
        for (let version = 1; version <= 40; version += 1) {
            const option = document.createElement('option')
            option.value = String(version)
            option.textContent = String(version)
            versionSelect.appendChild(option)
        }
        versionSelect.value = String(item.qrVersion)
        versionSelect.addEventListener('change', (event) => {
            item.qrVersion = QrCodeUtils.normalizeVersion(event.target.value)
            item._qrCache = null
            onChange()
        })
        versionCtrl.append(versionLabel, versionSelect)

        const encodingModeCtrl = document.createElement('div')
        encodingModeCtrl.className = 'field'
        const encodingModeLabel = document.createElement('label')
        encodingModeLabel.textContent = translate('itemsEditor.qrEncodingMode')
        const encodingModeSelect = document.createElement('select')
        QrCodeUtils.getEncodingModes().forEach((mode) => {
            const option = document.createElement('option')
            option.value = mode
            option.textContent = translate(`itemsEditor.qrEncoding${mode[0].toUpperCase()}${mode.slice(1)}`)
            encodingModeSelect.appendChild(option)
        })
        encodingModeSelect.value = item.qrEncodingMode
        encodingModeSelect.addEventListener('change', (event) => {
            item.qrEncodingMode = QrCodeUtils.normalizeEncodingMode(event.target.value)
            item._qrCache = null
            onChange()
        })
        encodingModeCtrl.append(encodingModeLabel, encodingModeSelect)

        controls.append(
            offsetCtrl,
            yOffsetCtrl,
            rotationCtrl,
            sizeCtrl,
            errorCorrectionCtrl,
            versionCtrl,
            encodingModeCtrl
        )
    }

    /**
     * Appends shape controls to the controls container.
     * @param {{
     *  item: object,
     *  controls: HTMLElement,
     *  sizeLabel: string,
     *  translate: (key: string, params?: Record<string, string | number>) => string,
     *  onChange: () => void,
     *  createSlider: (label: string, value: number, min: number, max: number, step: number, onInput: (value: number) => void) => HTMLDivElement
     * }} options
     */
    static appendShapeControls({ item, controls, sizeLabel, translate, onChange, createSlider }) {
        const widthCtrl = createSlider(sizeLabel, item.width || 120, 20, 420, 2, (value) => {
            item.width = value
            onChange()
        })
        const heightLabel =
            item.shapeType === 'line' ? translate('itemsEditor.sliderThickness') : translate('itemsEditor.sizeHeight')
        const heightCtrl = createSlider(heightLabel, item.height || 20, 4, 240, 1, (value) => {
            item.height = value
            onChange()
        })
        const strokeCtrl = createSlider(translate('itemsEditor.sliderStroke'), item.strokeWidth || 2, 1, 12, 1, (value) => {
            item.strokeWidth = value
            onChange()
        })
        const { offsetCtrl, yOffsetCtrl, rotationCtrl } = ItemsEditorControlSupport.createOffsetAndRotationControls({
            item,
            translate,
            onChange,
            createSlider,
            xMin: -50,
            xMax: 50,
            yMin: -80,
            yMax: 80
        })
        controls.append(widthCtrl, heightCtrl, strokeCtrl, offsetCtrl, yOffsetCtrl, rotationCtrl)

        if (item.shapeType === 'roundRect') {
            const radiusCtrl = createSlider(translate('itemsEditor.sliderRadius'), item.cornerRadius || 8, 0, 60, 1, (value) => {
                item.cornerRadius = value
                onChange()
            })
            controls.append(radiusCtrl)
        }
        if (item.shapeType === 'polygon') {
            const minSides = 3
            const maxSides = 24
            item.sides = Math.max(minSides, Math.min(maxSides, Math.round(item.sides || 6)))
            const sidesCtrl = createSlider(translate('itemsEditor.sliderSides'), item.sides, minSides, maxSides, 1, (value) => {
                item.sides = value
                if (sidesInput.value !== String(value)) {
                    sidesInput.value = String(value)
                }
                onChange()
            })
            const sidesLabelRow = sidesCtrl.querySelector('.small')
            const sidesRangeInput = sidesCtrl.querySelector('input[type="range"]')
            const sidesField = document.createElement('div')
            sidesField.className = 'field'
            const sidesFieldLabel = document.createElement('label')
            sidesFieldLabel.textContent = translate('itemsEditor.sliderSides')
            const sidesInput = document.createElement('input')
            sidesInput.type = 'number'
            sidesInput.min = String(minSides)
            sidesInput.max = String(maxSides)
            sidesInput.step = '1'
            sidesInput.value = String(item.sides)
            sidesInput.addEventListener('input', (event) => {
                const rawValue = Number(event.target.value)
                const fallback = item.sides || 6
                const clampedValue = Number.isFinite(rawValue)
                    ? Math.max(minSides, Math.min(maxSides, Math.round(rawValue)))
                    : fallback
                if (item.sides !== clampedValue) {
                    item.sides = clampedValue
                    onChange()
                }
                event.target.value = String(clampedValue)
                if (sidesRangeInput) {
                    sidesRangeInput.value = String(clampedValue)
                }
                if (sidesLabelRow) {
                    sidesLabelRow.textContent = `${translate('itemsEditor.sliderSides')}: ${clampedValue}`
                }
            })
            sidesField.append(sidesFieldLabel, sidesInput)
            controls.append(sidesCtrl, sidesField)
        }
    }
}
