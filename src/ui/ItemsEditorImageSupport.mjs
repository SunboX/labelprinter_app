import { ImageRasterUtils } from '../ImageRasterUtils.mjs'
import { Media } from 'labelprinterkit-web/src/index.mjs'

/**
 * Shared image-item helpers for the items editor.
 */
export class ItemsEditorImageSupport {
    /**
     * Resolves the maximum drawable size on the fixed label axis in dots.
     * @param {object} state
     * @param {object} [mediaOverride]
     * @returns {number}
     */
    static resolveImageCrossAxisLimit(state, mediaOverride = null) {
        const media = mediaOverride || Media[state.media] || Media.W24
        return Math.max(8, Math.round((media?.printArea || 128) - 4))
    }

    /**
     * Constrains image dimensions to the printable cross-axis for the current orientation.
     * @param {number} width
     * @param {number} height
     * @param {object} state
     * @returns {{ width: number, height: number }}
     */
    static constrainImageDimensionsForOrientation(width, height, state) {
        const safeWidth = Math.max(8, Math.round(Number(width) || 8))
        const safeHeight = Math.max(8, Math.round(Number(height) || 8))
        const crossAxisLimit = ItemsEditorImageSupport.resolveImageCrossAxisLimit(state)
        if (state.orientation === 'horizontal' && safeHeight > crossAxisLimit) {
            const scale = crossAxisLimit / safeHeight
            return {
                width: Math.max(8, Math.round(safeWidth * scale)),
                height: crossAxisLimit
            }
        }
        if (state.orientation === 'vertical' && safeWidth > crossAxisLimit) {
            const scale = crossAxisLimit / safeWidth
            return {
                width: crossAxisLimit,
                height: Math.max(8, Math.round(safeHeight * scale))
            }
        }
        return { width: safeWidth, height: safeHeight }
    }

    /**
     * Resolves initial image dimensions so the first render fits the label width.
     * @param {number} naturalWidth
     * @param {number} naturalHeight
     * @param {object} state
     * @returns {{ width: number, height: number }}
     */
    static resolveInitialImageDimensions(naturalWidth, naturalHeight, state) {
        const safeNaturalWidth = Math.max(1, Math.round(Number(naturalWidth) || 1))
        const safeNaturalHeight = Math.max(1, Math.round(Number(naturalHeight) || 1))
        const media = Media[state.media] || Media.W24
        const maxLabelHeight = ItemsEditorImageSupport.resolveImageCrossAxisLimit(state, media)
        const maxInitialWidth = 220
        const widthScale = maxInitialWidth / safeNaturalWidth
        const heightScale = maxLabelHeight / safeNaturalHeight
        const scale = Math.min(widthScale, heightScale, 1)
        const scaledDimensions = {
            width: Math.max(8, Math.round(safeNaturalWidth * scale)),
            height: Math.max(8, Math.round(safeNaturalHeight * scale))
        }
        return ItemsEditorImageSupport.constrainImageDimensionsForOrientation(
            scaledDimensions.width,
            scaledDimensions.height,
            state
        )
    }

    /**
     * Reads a file as a data URL.
     * @param {File} file
     * @param {(key: string, params?: Record<string, string | number>) => string} translate
     * @returns {Promise<string>}
     */
    static async readFileAsDataUrl(file, translate) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result || ''))
            reader.onerror = () => reject(new Error(translate('itemsEditor.imageLoadFailedRead')))
            reader.readAsDataURL(file)
        })
    }

    /**
     * Loads an image element from a data URL.
     * @param {string} dataUrl
     * @returns {Promise<HTMLImageElement | null>}
     */
    static async loadImageFromDataUrl(dataUrl) {
        return new Promise((resolve) => {
            const imageElement = new Image()
            imageElement.onload = () => resolve(imageElement)
            imageElement.onerror = () => resolve(null)
            imageElement.src = dataUrl
        })
    }

    /**
     * Loads an uploaded image file into an image item.
     * @param {{
     *  item: object,
     *  file: File,
     *  state: object,
     *  translate: (key: string, params?: Record<string, string | number>) => string,
     *  setStatus: (text: string, type?: string) => void,
     *  render: () => void,
     *  onChange: () => void
     * }} options
     * @returns {Promise<void>}
     */
    static async loadImageFile({ item, file, state, translate, setStatus, render, onChange }) {
        if (!file || !String(file.type || '').startsWith('image/')) {
            setStatus(translate('itemsEditor.imageLoadFailedType'), 'error')
            return
        }
        try {
            const dataUrl = await ItemsEditorImageSupport.readFileAsDataUrl(file, translate)
            const imageElement = await ItemsEditorImageSupport.loadImageFromDataUrl(dataUrl)
            if (!imageElement) {
                throw new Error(translate('itemsEditor.imageLoadFailedDecode'))
            }
            const dimensions = ItemsEditorImageSupport.resolveInitialImageDimensions(
                imageElement.naturalWidth,
                imageElement.naturalHeight,
                state
            )
            item.imageData = dataUrl
            item.imageName = file.name || ''
            item.width = dimensions.width
            item.height = dimensions.height
            const normalizedOptions = ImageRasterUtils.normalizeItemOptions(item)
            item.imageDither = normalizedOptions.imageDither
            item.imageThreshold = normalizedOptions.imageThreshold
            item.imageSmoothing = normalizedOptions.imageSmoothing
            item.imageInvert = normalizedOptions.imageInvert
            render()
            onChange()
            setStatus(translate('itemsEditor.imageLoaded', { name: item.imageName || 'image' }), 'success')
        } catch (err) {
            const message = err?.message || translate('messages.unknownError')
            setStatus(translate('itemsEditor.imageLoadFailed', { message }), 'error')
        }
    }

    /**
     * Appends image controls to the controls container.
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
    static appendImageControls({ item, controls, sizeLabel, state, translate, onChange, createSlider }) {
        const normalizedOptions = ImageRasterUtils.normalizeItemOptions(item)
        item.imageDither = normalizedOptions.imageDither
        item.imageThreshold = normalizedOptions.imageThreshold
        item.imageSmoothing = normalizedOptions.imageSmoothing
        item.imageInvert = normalizedOptions.imageInvert

        const constrainedDimensions = ItemsEditorImageSupport.constrainImageDimensionsForOrientation(
            item.width || 96,
            item.height || 96,
            state
        )
        item.width = constrainedDimensions.width
        item.height = constrainedDimensions.height

        const crossAxisLimit = ItemsEditorImageSupport.resolveImageCrossAxisLimit(state)
        const widthMax = state.orientation === 'vertical' ? crossAxisLimit : 600
        const heightMax = state.orientation === 'horizontal' ? crossAxisLimit : 320

        const widthCtrl = createSlider(sizeLabel, item.width || 96, 8, widthMax, 1, (value) => {
            item.width = value
            const constrained = ItemsEditorImageSupport.constrainImageDimensionsForOrientation(item.width, item.height || 96, state)
            item.width = constrained.width
            item.height = constrained.height
            onChange()
        })

        const heightCtrl = createSlider(translate('itemsEditor.sizeHeight'), item.height || 96, 8, heightMax, 1, (value) => {
            item.height = value
            const constrained = ItemsEditorImageSupport.constrainImageDimensionsForOrientation(item.width || 96, item.height, state)
            item.width = constrained.width
            item.height = constrained.height
            onChange()
        })

        const offsetCtrl = createSlider(translate('itemsEditor.sliderXOffset'), item.xOffset ?? 0, -80, 80, 1, (value) => {
            item.xOffset = value
            onChange()
        })

        const yOffsetCtrl = createSlider(translate('itemsEditor.sliderYOffset'), item.yOffset ?? 0, -80, 80, 1, (value) => {
            item.yOffset = value
            onChange()
        })

        const thresholdCtrl = createSlider(translate('itemsEditor.imageThreshold'), item.imageThreshold, 0, 255, 1, (value) => {
            item.imageThreshold = value
            onChange()
        })

        const ditherCtrl = document.createElement('div')
        ditherCtrl.className = 'field'
        const ditherLabel = document.createElement('label')
        ditherLabel.textContent = translate('itemsEditor.imageDither')
        const ditherSelect = document.createElement('select')
        ImageRasterUtils.DITHER_MODES.forEach((mode) => {
            const option = document.createElement('option')
            option.value = mode
            option.textContent = translate(`itemsEditor.imageDither${mode.replaceAll('-', '')}`)
            ditherSelect.appendChild(option)
        })
        ditherSelect.value = item.imageDither
        ditherSelect.addEventListener('change', (event) => {
            item.imageDither = event.target.value
            onChange()
        })
        ditherCtrl.append(ditherLabel, ditherSelect)

        const smoothingCtrl = document.createElement('div')
        smoothingCtrl.className = 'field'
        const smoothingLabel = document.createElement('label')
        smoothingLabel.textContent = translate('itemsEditor.imageSmoothing')
        const smoothingSelect = document.createElement('select')
        ImageRasterUtils.SMOOTHING_MODES.forEach((mode) => {
            const option = document.createElement('option')
            option.value = mode
            option.textContent = translate(`itemsEditor.imageSmoothing${mode}`)
            smoothingSelect.appendChild(option)
        })
        smoothingSelect.value = item.imageSmoothing
        smoothingSelect.addEventListener('change', (event) => {
            item.imageSmoothing = event.target.value
            onChange()
        })
        smoothingCtrl.append(smoothingLabel, smoothingSelect)

        const invertCtrl = document.createElement('div')
        invertCtrl.className = 'field'
        const invertLabel = document.createElement('label')
        invertLabel.className = 'checkbox-row'
        const invertInput = document.createElement('input')
        invertInput.type = 'checkbox'
        invertInput.checked = Boolean(item.imageInvert)
        invertInput.addEventListener('change', (event) => {
            item.imageInvert = event.target.checked
            onChange()
        })
        const invertText = document.createElement('span')
        invertText.textContent = translate('itemsEditor.imageInvert')
        invertLabel.append(invertInput, invertText)
        invertCtrl.append(invertLabel)

        controls.append(widthCtrl, heightCtrl, offsetCtrl, yOffsetCtrl, thresholdCtrl, ditherCtrl, smoothingCtrl, invertCtrl)
    }
}
