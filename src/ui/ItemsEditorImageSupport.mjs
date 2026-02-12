import { ImageRasterUtils } from '../ImageRasterUtils.mjs'
import { RotationUtils } from '../RotationUtils.mjs'
import { Media } from 'labelprinterkit-web/src/index.mjs'
import { ItemsEditorControlSupport } from './ItemsEditorControlSupport.mjs'

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
     * Appends image source controls including preview and upload UI.
     * @param {{
     *  item: object,
     *  contentWrap: HTMLElement,
     *  translate: (key: string, params?: Record<string, string | number>) => string,
     *  onFileSelected: (file: File, controls: { uploadButton: HTMLButtonElement, uploadInput: HTMLInputElement }) => Promise<void> | void
     * }} options
     */
    static appendImageSourceControls({ item, contentWrap, translate, onFileSelected }) {
        const previewBox = document.createElement('div')
        previewBox.className = 'image-item-preview'
        if (item.imageData) {
            const previewImage = document.createElement('img')
            previewImage.className = 'image-item-preview-image'
            previewImage.src = item.imageData
            previewImage.alt = item.imageName || translate('itemsEditor.typeImage')
            previewImage.draggable = false
            previewBox.append(previewImage)
        } else {
            const previewPlaceholder = document.createElement('div')
            previewPlaceholder.className = 'image-item-preview-placeholder'
            const previewPlaceholderIcon = document.createElement('span')
            previewPlaceholderIcon.className = 'image-item-preview-placeholder-icon'
            previewPlaceholderIcon.setAttribute('aria-hidden', 'true')
            const previewPlaceholderText = document.createElement('span')
            previewPlaceholderText.className = 'small muted image-item-preview-empty'
            previewPlaceholderText.textContent = translate('itemsEditor.imageNoFile')
            previewPlaceholder.append(previewPlaceholderIcon, previewPlaceholderText)
            previewBox.append(previewPlaceholder)
        }

        const label = document.createElement('label')
        label.textContent = translate('itemsEditor.fieldImage')
        const uploadButton = document.createElement('button')
        uploadButton.type = 'button'
        uploadButton.className = 'ghost'
        uploadButton.textContent = translate('itemsEditor.uploadImage')
        const uploadInput = document.createElement('input')
        uploadInput.type = 'file'
        uploadInput.accept = 'image/*'
        uploadInput.hidden = true
        uploadButton.addEventListener('click', () => uploadInput.click())
        uploadInput.addEventListener('change', async () => {
            const file = uploadInput.files?.[0] || null
            if (!file) return
            await onFileSelected(file, { uploadButton, uploadInput })
        })

        const fileLabel = document.createElement('p')
        fileLabel.className = 'small muted image-file-label'
        fileLabel.textContent = item.imageName
            ? translate('itemsEditor.imageFileName', { name: item.imageName })
            : translate('itemsEditor.imageNoFile')
        contentWrap.append(previewBox, label, uploadButton, fileLabel, uploadInput)
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
        item.rotation = RotationUtils.normalizeDegrees(item.rotation, 0)
        const crossAxisLimit = ItemsEditorImageSupport.resolveImageCrossAxisLimit(state)
        const { widthMax, heightMax } = ItemsEditorControlSupport.resolveDimensionMax(state, crossAxisLimit)
        const { widthCtrl, heightCtrl } = ItemsEditorControlSupport.createConstrainedDimensionControls({
            item,
            state,
            sizeLabel,
            heightLabel: translate('itemsEditor.sizeHeight'),
            minWidth: 8,
            minHeight: 8,
            widthMax,
            heightMax,
            defaultWidth: 96,
            defaultHeight: 96,
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

        const thresholdCtrl = createSlider(translate('itemsEditor.imageThreshold'), item.imageThreshold, 0, 255, 1, (value) => {
            item.imageThreshold = value
            onChange()
        })

        const { field: ditherCtrl } = ItemsEditorControlSupport.createSelectField({
            labelText: translate('itemsEditor.imageDither'),
            value: item.imageDither,
            options: ImageRasterUtils.DITHER_MODES.map((mode) => ({
                value: mode,
                label: translate(`itemsEditor.imageDither${mode.replaceAll('-', '')}`)
            })),
            onChange: (value) => {
                item.imageDither = value
                onChange()
            }
        })
        const { field: smoothingCtrl } = ItemsEditorControlSupport.createSelectField({
            labelText: translate('itemsEditor.imageSmoothing'),
            value: item.imageSmoothing,
            options: ImageRasterUtils.SMOOTHING_MODES.map((mode) => ({
                value: mode,
                label: translate(`itemsEditor.imageSmoothing${mode}`)
            })),
            onChange: (value) => {
                item.imageSmoothing = value
                onChange()
            }
        })
        const { field: invertCtrl } = ItemsEditorControlSupport.createCheckboxField({
            labelText: translate('itemsEditor.imageInvert'),
            checked: Boolean(item.imageInvert),
            onChange: (checked) => {
                item.imageInvert = checked
                onChange()
            }
        })

        controls.append(
            widthCtrl,
            heightCtrl,
            offsetCtrl,
            yOffsetCtrl,
            rotationCtrl,
            thresholdCtrl,
            ditherCtrl,
            smoothingCtrl,
            invertCtrl
        )
    }
}
