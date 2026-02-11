import { IconLibraryUtils } from '../IconLibraryUtils.mjs'
import { RotationUtils } from '../RotationUtils.mjs'
import { ItemsEditorImageSupport } from './ItemsEditorImageSupport.mjs'

/**
 * Shared icon-item helpers for the items editor.
 */
export class ItemsEditorIconSupport {
    /**
     * Returns the default icon id used for new items.
     * @returns {string}
     */
    static getDefaultIconId() {
        return IconLibraryUtils.getDefaultIconId()
    }

    /**
     * Resolves default dimensions for a newly created icon item.
     * @param {object} state
     * @returns {{ width: number, height: number }}
     */
    static resolveDefaultIconDimensions(state) {
        const crossAxisLimit = ItemsEditorImageSupport.resolveImageCrossAxisLimit(state)
        const defaultSide = Math.max(8, Math.min(72, crossAxisLimit))
        return ItemsEditorImageSupport.constrainImageDimensionsForOrientation(defaultSide, defaultSide, state)
    }

    /**
     * Normalizes icon-item shape and dimensions.
     * @param {object} item
     * @param {object} state
     */
    static normalizeIconItem(item, state) {
        item.iconId = IconLibraryUtils.normalizeIconId(item.iconId)
        item.rotation = RotationUtils.normalizeDegrees(item.rotation, 0)
        const constrained = ItemsEditorImageSupport.constrainImageDimensionsForOrientation(
            item.width || 72,
            item.height || 72,
            state
        )
        item.width = constrained.width
        item.height = constrained.height
    }

    /**
     * Appends icon source controls including preview and icon picker popup.
     * @param {{
     *  item: object,
     *  contentWrap: HTMLElement,
     *  translate: (key: string, params?: Record<string, string | number>) => string,
     *  onChange: () => void
     * }} options
     */
    static appendIconSourceControls({ item, contentWrap, translate, onChange }) {
        const normalizedIconId = IconLibraryUtils.normalizeIconId(item.iconId)
        const iconEntry = IconLibraryUtils.getIconDefinition(normalizedIconId)
        item.iconId = iconEntry.id

        const previewBox = document.createElement('div')
        previewBox.className = 'image-item-preview icon-item-preview'
        const previewImage = document.createElement('img')
        previewImage.className = 'image-item-preview-image icon-item-preview-image'
        previewImage.src = IconLibraryUtils.getIconSvgDataUrl(iconEntry.id)
        previewImage.alt = iconEntry.label
        previewImage.draggable = false
        previewBox.append(previewImage)

        const label = document.createElement('label')
        label.textContent = translate('itemsEditor.fieldIcon')

        const picker = document.createElement('div')
        picker.className = 'icon-picker'
        const pickerTrigger = document.createElement('button')
        pickerTrigger.type = 'button'
        pickerTrigger.className = 'ghost icon-picker-trigger'
        pickerTrigger.setAttribute('aria-expanded', 'false')
        const triggerPreview = document.createElement('img')
        triggerPreview.className = 'icon-picker-trigger-preview'
        triggerPreview.src = IconLibraryUtils.getIconSvgDataUrl(iconEntry.id)
        triggerPreview.alt = ''
        triggerPreview.setAttribute('aria-hidden', 'true')
        triggerPreview.draggable = false
        const triggerLabel = document.createElement('span')
        triggerLabel.className = 'icon-picker-trigger-label'
        triggerLabel.textContent = `${translate('itemsEditor.chooseIcon')}: ${iconEntry.label}`
        pickerTrigger.append(triggerPreview, triggerLabel)

        const popup = document.createElement('div')
        popup.className = 'icon-picker-popup'
        popup.hidden = true
        popup.setAttribute('role', 'dialog')
        popup.setAttribute('aria-label', translate('itemsEditor.chooseIcon'))
        popup.tabIndex = -1

        const backdrop = document.createElement('div')
        backdrop.className = 'icon-picker-backdrop'
        backdrop.hidden = true
        backdrop.setAttribute('aria-hidden', 'true')
        let popupIconsHydrated = false

        /**
         * Closes the icon picker.
         * @returns {void}
         */
        const closePicker = () => {
            popup.hidden = true
            backdrop.hidden = true
            picker.classList.remove('icon-picker-open')
            pickerTrigger.setAttribute('aria-expanded', 'false')
            if (popup.parentElement !== picker) {
                picker.append(backdrop, popup)
            }
        }

        /**
         * Opens the icon picker.
         * @returns {void}
         */
        const openPicker = () => {
            if (!popupIconsHydrated) {
                popup.querySelectorAll('.icon-picker-option-preview[data-icon-id]').forEach((preview) => {
                    const iconId = preview.dataset.iconId
                    if (!iconId) return
                    preview.src = IconLibraryUtils.getIconSvgDataUrl(iconId)
                })
                popupIconsHydrated = true
            }
            if (popup.parentElement !== document.body) {
                document.body.append(backdrop, popup)
            }
            popup.hidden = false
            backdrop.hidden = false
            picker.classList.add('icon-picker-open')
            pickerTrigger.setAttribute('aria-expanded', 'true')
            popup.focus({ preventScroll: true })
        }

        IconLibraryUtils.getGroupedIconOptions().forEach((group) => {
            const section = document.createElement('section')
            section.className = 'icon-picker-section'
            const title = document.createElement('div')
            title.className = 'icon-picker-section-title'
            title.textContent = group.category
            const grid = document.createElement('div')
            grid.className = 'icon-picker-grid'
            group.items.forEach((entry) => {
                const optionButton = document.createElement('button')
                optionButton.type = 'button'
                optionButton.className = 'icon-picker-option'
                if (entry.id === iconEntry.id) {
                    optionButton.classList.add('selected')
                }
                optionButton.title = entry.label
                optionButton.setAttribute('aria-label', entry.label)
                optionButton.dataset.iconId = entry.id
                const optionPreview = document.createElement('img')
                optionPreview.className = 'icon-picker-option-preview'
                optionPreview.dataset.iconId = entry.id
                optionPreview.alt = ''
                optionPreview.setAttribute('aria-hidden', 'true')
                optionPreview.draggable = false
                optionButton.append(optionPreview)
                optionButton.addEventListener('click', async () => {
                    const nextIconId = await IconLibraryUtils.ensureIconUsable(entry.id)
                    const nextEntry = IconLibraryUtils.getIconDefinition(nextIconId)
                    item.iconId = nextEntry.id
                    previewImage.src = IconLibraryUtils.getIconSvgDataUrl(nextEntry.id)
                    previewImage.alt = nextEntry.label
                    triggerPreview.src = IconLibraryUtils.getIconSvgDataUrl(nextEntry.id)
                    triggerLabel.textContent = `${translate('itemsEditor.chooseIcon')}: ${nextEntry.label}`
                    popup.querySelectorAll('.icon-picker-option.selected').forEach((selectedOption) => {
                        selectedOption.classList.remove('selected')
                    })
                    optionButton.classList.add('selected')
                    closePicker()
                    onChange()
                })
                grid.append(optionButton)
            })
            section.append(title, grid)
            popup.append(section)
        })

        pickerTrigger.addEventListener('click', () => {
            const willOpen = popup.hidden
            if (willOpen) {
                openPicker()
                return
            }
            closePicker()
        })
        backdrop.addEventListener('click', closePicker)
        popup.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return
            closePicker()
            if (pickerTrigger.isConnected) {
                pickerTrigger.focus()
            }
        })

        picker.append(pickerTrigger, backdrop, popup)
        contentWrap.append(previewBox, label, picker)
    }

    /**
     * Appends icon controls to the controls container.
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
    static appendIconControls({ item, controls, sizeLabel, state, translate, onChange, createSlider }) {
        ItemsEditorIconSupport.normalizeIconItem(item, state)
        const crossAxisLimit = ItemsEditorImageSupport.resolveImageCrossAxisLimit(state)
        const widthMax = state.orientation === 'vertical' ? crossAxisLimit : 600
        const heightMax = state.orientation === 'horizontal' ? crossAxisLimit : 320

        const widthCtrl = createSlider(sizeLabel, item.width || 72, 8, widthMax, 1, (value) => {
            item.width = value
            const constrained = ItemsEditorImageSupport.constrainImageDimensionsForOrientation(
                item.width,
                item.height || 72,
                state
            )
            item.width = constrained.width
            item.height = constrained.height
            onChange()
        })

        const heightCtrl = createSlider(translate('itemsEditor.sizeHeight'), item.height || 72, 8, heightMax, 1, (value) => {
            item.height = value
            const constrained = ItemsEditorImageSupport.constrainImageDimensionsForOrientation(
                item.width || 72,
                item.height,
                state
            )
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
        const rotationCtrl = createSlider(translate('itemsEditor.sliderRotation'), item.rotation ?? 0, -180, 180, 1, (value) => {
            item.rotation = value
            onChange()
        })
        controls.append(widthCtrl, heightCtrl, offsetCtrl, yOffsetCtrl, rotationCtrl)
    }
}
