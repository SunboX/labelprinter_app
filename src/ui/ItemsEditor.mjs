import { QrSizeUtils } from '../QrSizeUtils.mjs'
import { FontFamilyUtils } from '../FontFamilyUtils.mjs'
import { QrCodeUtils } from '../QrCodeUtils.mjs'
import { ImageRasterUtils } from '../ImageRasterUtils.mjs'
import { Media } from 'labelprinterkit-web/src/index.mjs'

/**
 * Manages the item list UI, including drag reordering and item controls.
 */
export class ItemsEditor {
    #onChange = () => {}
    #translate = (key) => key
    #setStatus = () => {}
    #fontFamilies = FontFamilyUtils.getFallbackFontFamilies()
    #itemsScrollIndicatorsBound = false
    #collapsedItemIds = new Set()
    #autoExpandedItemIds = new Set()
    #panelItemOrder = []

    /**
     * @param {object} els
     * @param {object} state
     * @param {Array<{ id: string, labelKey: string }>} shapeTypes
     * @param {() => void} onChange
     * @param {() => string} nextId
     * @param {(key: string, params?: Record<string, string | number>) => string} translate
     * @param {(text: string, type?: string) => void} setStatus
     */
    constructor(els, state, shapeTypes, onChange, nextId, translate, setStatus) {
        this.els = els
        this.state = state
        this.shapeTypes = shapeTypes
        this.onChange = onChange
        this.nextId = nextId
        this.translate = translate
        this.setStatus = setStatus
        this.selectedItemIds = new Set()
    }

    /**
     * Sets the item change callback.
     * @param {() => void} callback
     */
    set onChange(callback) {
        this.#onChange = typeof callback === 'function' ? callback : () => {}
    }

    /**
     * Returns the current item change callback.
     * @returns {() => void}
     */
    get onChange() {
        return this.#onChange
    }

    /**
     * Sets the translation callback.
     * @param {(key: string, params?: Record<string, string | number>) => string} callback
     */
    set translate(callback) {
        this.#translate = typeof callback === 'function' ? callback : (key) => key
    }

    /**
     * Returns the translation callback.
     * @returns {(key: string, params?: Record<string, string | number>) => string}
     */
    get translate() {
        return this.#translate
    }

    /**
     * Sets the status callback.
     * @param {(text: string, type?: string) => void} callback
     */
    set setStatus(callback) {
        this.#setStatus = typeof callback === 'function' ? callback : () => {}
    }

    /**
     * Returns the status callback.
     * @returns {(text: string, type?: string) => void}
     */
    get setStatus() {
        return this.#setStatus
    }

    /**
     * Sets available font families for dropdown controls.
     * @param {string[]} value
     */
    set fontFamilies(value) {
        this.#fontFamilies = FontFamilyUtils.normalizeFontFamilies(value, 'Barlow')
    }

    /**
     * Returns available font families for dropdown controls.
     * @returns {string[]}
     */
    get fontFamilies() {
        return [...this.#fontFamilies]
    }

    /**
     * Loads available local font families once from the browser.
     * @returns {Promise<void>}
     */
    async loadInstalledFontFamilies() {
        this.fontFamilies = await FontFamilyUtils.listInstalledFontFamilies(window)
    }

    /**
     * Loads and tracks previously saved Google Font links.
     * @param {string[]} fontLinks
     * @returns {Promise<void>}
     */
    async loadGoogleFontLinks(fontLinks) {
        this.#ensureCustomFontLinksState()
        const normalizedLinks = FontFamilyUtils.normalizeGoogleFontLinks(fontLinks)
        if (!normalizedLinks.length) return

        const loadedFamilies = []
        const loadedLinks = []
        for (const link of normalizedLinks) {
            try {
                const result = await FontFamilyUtils.loadGoogleFontLink(link, document, window.location)
                loadedFamilies.push(...result.families)
                loadedLinks.push(result.url)
            } catch (_err) {
                continue
            }
        }

        if (loadedLinks.length) {
            this.state.customFontLinks = FontFamilyUtils.normalizeGoogleFontLinks(
                this.state.customFontLinks.concat(loadedLinks)
            )
        }
        if (loadedFamilies.length) {
            this.fontFamilies = FontFamilyUtils.normalizeFontFamilies(this.fontFamilies.concat(loadedFamilies), 'Barlow')
        }
    }

    /**
     * Syncs selected item ids from preview interactions.
     * @param {string[]} itemIds
     */
    setSelectedItemIds(itemIds) {
        const nextSelectedItemIds = new Set(Array.isArray(itemIds) ? itemIds : [])
        this.#restoreAutoCollapsedItems(nextSelectedItemIds)
        this.#expandSelectedCollapsedItems(nextSelectedItemIds)
        this.selectedItemIds = nextSelectedItemIds
        this.render()
    }

    /**
     * Expands selected cards that were previously collapsed.
     * Tracks ids so the original collapsed state can be restored on deselect.
     * @param {Set<string>} selectedItemIds
     */
    #expandSelectedCollapsedItems(selectedItemIds) {
        selectedItemIds.forEach((itemId) => {
            if (!this.#collapsedItemIds.has(itemId)) return
            this.#collapsedItemIds.delete(itemId)
            this.#autoExpandedItemIds.add(itemId)
        })
    }

    /**
     * Restores collapsed state for cards that were auto-expanded by selection.
     * @param {Set<string>} selectedItemIds
     */
    #restoreAutoCollapsedItems(selectedItemIds) {
        Array.from(this.#autoExpandedItemIds).forEach((itemId) => {
            if (selectedItemIds.has(itemId)) return
            this.#collapsedItemIds.add(itemId)
            this.#autoExpandedItemIds.delete(itemId)
        })
    }

    /**
     * Renders the list of items and their controls.
     */
    render() {
        this.#syncPanelItemOrder()
        this.#pruneCollapsedItemIds()
        this.els.items.innerHTML = ''
        const sizeLabel =
            this.state.orientation === 'horizontal'
                ? this.translate('itemsEditor.sizeLength')
                : this.translate('itemsEditor.sizeHeight')
        const panelItems = this.#panelItemOrder
            .map((itemId) => this.state.items.find((item) => item.id === itemId))
            .filter(Boolean)
        panelItems.forEach((item, panelIndex) => {
            const card = this.#createItemCard(item, panelIndex, sizeLabel)
            this.els.items.appendChild(card)
        })
        this.#ensureItemsScrollIndicators()
        this.#updateItemsScrollIndicators()
    }

    /**
     * Binds drag handlers for reordering items.
     */
    bindDrag() {
        let fromPanelIndex = null
        this.els.items.addEventListener('dragstart', (e) => {
            const handle = e.target.closest('.handle')
            if (!handle) return
            const card = handle.closest('.item-card')
            if (!card) return
            fromPanelIndex = Number(card.dataset.panelIndex)
            e.dataTransfer.effectAllowed = 'move'
        })
        this.els.items.addEventListener('dragover', (e) => {
            if (fromPanelIndex === null) return
            e.preventDefault()
        })
        this.els.items.addEventListener('drop', (e) => {
            e.preventDefault()
            const card = e.target.closest('.item-card')
            if (!card || fromPanelIndex === null) return
            const toPanelIndex = Number(card.dataset.panelIndex)
            if (toPanelIndex === fromPanelIndex) {
                fromPanelIndex = null
                return
            }
            this.#movePanelItem(fromPanelIndex, toPanelIndex)
            fromPanelIndex = null
            this.render()
        })
    }

    /**
     * Attaches one-time listeners that keep objects-panel scroll indicators in sync.
     */
    #ensureItemsScrollIndicators() {
        if (this.#itemsScrollIndicatorsBound) return
        if (!this.els.items) return
        this.#itemsScrollIndicatorsBound = true
        this.els.items.addEventListener(
            'scroll',
            () => {
                this.#updateItemsScrollIndicators()
            },
            { passive: true }
        )
        window.addEventListener('resize', () => this.#updateItemsScrollIndicators())
    }

    /**
     * Updates scroll indicator attributes for the objects-panel list.
     */
    #updateItemsScrollIndicators() {
        if (!this.els.items) return
        const overflowThreshold = 2
        const hasOverflow = this.els.items.scrollHeight - this.els.items.clientHeight > overflowThreshold
        const hasHiddenTop = hasOverflow && this.els.items.scrollTop > 1
        const hasHiddenBottom =
            hasOverflow &&
            this.els.items.scrollTop + this.els.items.clientHeight < this.els.items.scrollHeight - 1
        this.els.items.dataset.overflow = hasOverflow ? 'true' : 'false'
        this.els.items.dataset.scrollTop = hasHiddenTop ? 'true' : 'false'
        this.els.items.dataset.scrollBottom = hasHiddenBottom ? 'true' : 'false'
        if (!this.els.objectsScrollIndicator) return
        const indicatorDirection =
            hasHiddenTop && hasHiddenBottom ? 'both' : hasHiddenTop ? 'up' : hasHiddenBottom ? 'down' : 'down'
        this.els.objectsScrollIndicator.dataset.direction = indicatorDirection
        this.els.objectsScrollIndicator.hidden = !hasOverflow
        if (!hasOverflow) return
        const hintKey =
            hasHiddenTop && hasHiddenBottom
                ? 'objects.scrollHintBoth'
                : hasHiddenTop
                  ? 'objects.scrollHintUp'
                  : 'objects.scrollHintDown'
        this.els.objectsScrollIndicator.textContent = this.translate(hintKey)
    }

    /**
     * Adds a new text item.
     */
    addTextItem() {
        const id = this.nextId()
        this.state.items.push({
            id,
            type: 'text',
            text: this.translate('itemsEditor.newText'),
            fontFamily: this.#resolveDefaultFontFamily(),
            fontSize: 24,
            height: 40,
            xOffset: 4
        })
        this.#panelItemOrder.push(id)
        this.#collapsedItemIds.delete(id)
        this.render()
        this.#onChange()
    }

    /**
     * Ensures custom Google font links state is present.
     */
    #ensureCustomFontLinksState() {
        if (!Array.isArray(this.state.customFontLinks)) {
            this.state.customFontLinks = []
        }
    }

    /**
     * Adds a new QR code item.
     */
    addQrItem() {
        const initialSize = QrSizeUtils.computeInitialQrSizeDots(this.state)
        const id = this.nextId()
        this.state.items.push({
            id,
            type: 'qr',
            data: this.translate('itemsEditor.newQrData'),
            size: initialSize,
            height: initialSize,
            qrErrorCorrectionLevel: QrCodeUtils.getDefaultErrorCorrectionLevel(),
            qrVersion: QrCodeUtils.getDefaultVersion(),
            qrEncodingMode: QrCodeUtils.getDefaultEncodingMode(),
            xOffset: 4
        })
        this.#panelItemOrder.push(id)
        this.#collapsedItemIds.delete(id)
        this.render()
        this.#onChange()
    }

    /**
     * Adds a new image item.
     */
    addImageItem() {
        const crossAxisLimit = this.#resolveImageCrossAxisLimit()
        const defaultSide = Math.max(8, Math.min(96, crossAxisLimit))
        const defaultDimensions = this.#constrainImageDimensionsForOrientation(defaultSide, defaultSide)
        const id = this.nextId()
        this.state.items.push({
            id,
            type: 'image',
            imageData: '',
            imageName: '',
            imageDither: 'floyd-steinberg',
            imageThreshold: 128,
            imageSmoothing: 'medium',
            imageInvert: false,
            width: defaultDimensions.width,
            height: defaultDimensions.height,
            xOffset: 4,
            yOffset: 0
        })
        this.#panelItemOrder.push(id)
        this.#collapsedItemIds.delete(id)
        this.render()
        this.#onChange()
    }

    /**
     * Adds a new shape item.
     * @param {string} [shapeType='rect']
     */
    addShapeItem(shapeType = 'rect') {
        const dimensions = { width: 180, height: 36 }
        if (shapeType === 'line') {
            dimensions.height = 6
        } else if (shapeType === 'oval') {
            dimensions.height = 44
        } else if (shapeType === 'polygon') {
            dimensions.height = 52
        }
        const id = this.nextId()
        this.state.items.push({
            id,
            type: 'shape',
            shapeType,
            width: dimensions.width,
            height: dimensions.height,
            strokeWidth: 2,
            cornerRadius: 10,
            sides: 6,
            xOffset: 4,
            yOffset: 0
        })
        this.#panelItemOrder.push(id)
        this.#collapsedItemIds.delete(id)
        this.render()
        this.#onChange()
    }

    /**
     * Synchronizes panel item order with the current state item ids.
     * New items are appended to the end while deleted ids are removed.
     */
    #syncPanelItemOrder() {
        const stateItemIds = this.state.items.map((item) => item.id)
        const stateIdSet = new Set(stateItemIds)
        this.#panelItemOrder = this.#panelItemOrder.filter((itemId) => stateIdSet.has(itemId))
        stateItemIds.forEach((itemId) => {
            if (!this.#panelItemOrder.includes(itemId)) {
                this.#panelItemOrder.push(itemId)
            }
        })
    }

    /**
     * Moves one panel item from a source index to a destination index.
     * @param {number} fromPanelIndex
     * @param {number} toPanelIndex
     */
    #movePanelItem(fromPanelIndex, toPanelIndex) {
        if (!Number.isInteger(fromPanelIndex) || !Number.isInteger(toPanelIndex)) return
        if (fromPanelIndex < 0 || toPanelIndex < 0) return
        if (fromPanelIndex >= this.#panelItemOrder.length || toPanelIndex >= this.#panelItemOrder.length) return
        const [movedItemId] = this.#panelItemOrder.splice(fromPanelIndex, 1)
        this.#panelItemOrder.splice(toPanelIndex, 0, movedItemId)
    }

    /**
     * Removes stale collapsed ids for deleted items.
     */
    #pruneCollapsedItemIds() {
        const validItemIds = new Set(this.state.items.map((item) => item.id))
        Array.from(this.#collapsedItemIds).forEach((itemId) => {
            if (!validItemIds.has(itemId)) {
                this.#collapsedItemIds.delete(itemId)
            }
        })
        Array.from(this.#autoExpandedItemIds).forEach((itemId) => {
            if (!validItemIds.has(itemId)) {
                this.#autoExpandedItemIds.delete(itemId)
            }
        })
    }

    /**
     * Toggles collapsed state for one item card.
     * @param {string} itemId
     */
    #toggleItemCollapsed(itemId) {
        if (!itemId) return
        if (this.#collapsedItemIds.has(itemId)) {
            this.#collapsedItemIds.delete(itemId)
        } else {
            this.#collapsedItemIds.add(itemId)
        }
        this.#autoExpandedItemIds.delete(itemId)
        this.render()
    }

    /**
     * Creates a slider control for item adjustments.
     * @param {string} label
     * @param {number} value
     * @param {number} min
     * @param {number} max
     * @param {number} step
     * @param {(value: number) => void} onInput
     * @returns {HTMLDivElement}
     */
    #createSlider(label, value, min, max, step, onInput) {
        const wrap = document.createElement('div')
        wrap.className = 'slider'
        const top = document.createElement('div')
        top.className = 'small'
        top.textContent = `${label}: ${value}`
        const input = document.createElement('input')
        input.type = 'range'
        input.min = min
        input.max = max
        input.step = step
        input.value = value
        input.addEventListener('input', (e) => {
            const v = Number(e.target.value)
            top.textContent = `${label}: ${v}`
            onInput(v)
        })
        wrap.append(top, input)
        return wrap
    }

    /**
     * Creates a single item card with controls.
     * @param {object} item
     * @param {number} index
     * @param {string} sizeLabel
     * @returns {HTMLDivElement}
     */
    #createItemCard(item, panelIndex, sizeLabel) {
        const card = document.createElement('div')
        card.className = 'item-card'
        card.draggable = false
        card.dataset.panelIndex = panelIndex.toString()
        card.dataset.itemId = item.id
        const isCollapsed = this.#collapsedItemIds.has(item.id)
        if (this.selectedItemIds.has(item.id)) {
            card.classList.add('selected')
        }
        if (isCollapsed) {
            card.classList.add('collapsed')
        }

        const meta = document.createElement('div')
        meta.className = 'item-meta'
        const tag = document.createElement('div')
        tag.className = 'tag'
        const typeLabel =
            item.type === 'text'
                ? this.translate('itemsEditor.typeText')
                : item.type === 'qr'
                  ? this.translate('itemsEditor.typeQr')
                  : item.type === 'image'
                    ? this.translate('itemsEditor.typeImage')
                  : this.translate('itemsEditor.typeShape')
        tag.textContent = typeLabel
        const handle = document.createElement('div')
        handle.className = 'handle'
        handle.textContent = this.translate('itemsEditor.handleDrag')
        handle.draggable = true
        handle.dataset.panelIndex = panelIndex.toString()
        const toggleSettings = document.createElement('button')
        toggleSettings.type = 'button'
        toggleSettings.className = 'ghost item-toggle'
        toggleSettings.textContent = isCollapsed ? '▸' : '▾'
        toggleSettings.title = this.translate(
            isCollapsed ? 'itemsEditor.expandSettings' : 'itemsEditor.collapseSettings'
        )
        toggleSettings.setAttribute('aria-label', toggleSettings.title)
        toggleSettings.setAttribute('aria-expanded', String(!isCollapsed))
        toggleSettings.addEventListener('click', () => this.#toggleItemCollapsed(item.id))
        const headerActions = document.createElement('div')
        headerActions.className = 'item-header-actions'
        headerActions.append(handle, toggleSettings)
        meta.append(tag, headerActions)

        const body = document.createElement('div')
        body.className = 'item-body'
        body.hidden = isCollapsed

        const contentWrap = document.createElement('div')
        contentWrap.className = 'field'
        if (item.type === 'text' || item.type === 'qr') {
            const label = document.createElement('label')
            label.textContent =
                item.type === 'text'
                    ? this.translate('itemsEditor.fieldText')
                    : this.translate('itemsEditor.fieldQrContent')
            const input = item.type === 'text' ? document.createElement('textarea') : document.createElement('input')
            input.value = item.type === 'text' ? item.text : item.data
            input.rows = 2
            input.addEventListener('input', (e) => {
                if (item.type === 'text') {
                    item.text = e.target.value
                } else {
                    item.data = e.target.value
                    item._qrCache = null
                }
                this.#onChange()
            })
            contentWrap.append(label, input)
        } else if (item.type === 'shape') {
            const label = document.createElement('label')
            label.textContent = this.translate('itemsEditor.fieldShape')
            const select = document.createElement('select')
            this.shapeTypes.forEach((shape) => {
                const opt = document.createElement('option')
                opt.value = shape.id
                opt.textContent = this.translate(shape.labelKey)
                if (shape.id === item.shapeType) opt.selected = true
                select.appendChild(opt)
            })
            select.addEventListener('change', (e) => {
                item.shapeType = e.target.value
                this.render()
                this.#onChange()
            })
            contentWrap.append(label, select)
        } else if (item.type === 'image') {
            const previewBox = document.createElement('div')
            previewBox.className = 'image-item-preview'
            if (item.imageData) {
                const previewImage = document.createElement('img')
                previewImage.className = 'image-item-preview-image'
                previewImage.src = item.imageData
                previewImage.alt = item.imageName || this.translate('itemsEditor.typeImage')
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
                previewPlaceholderText.textContent = this.translate('itemsEditor.imageNoFile')
                previewPlaceholder.append(previewPlaceholderIcon, previewPlaceholderText)
                previewBox.append(previewPlaceholder)
            }
            const label = document.createElement('label')
            label.textContent = this.translate('itemsEditor.fieldImage')
            const uploadButton = document.createElement('button')
            uploadButton.type = 'button'
            uploadButton.className = 'ghost'
            uploadButton.textContent = this.translate('itemsEditor.uploadImage')
            const uploadInput = document.createElement('input')
            uploadInput.type = 'file'
            uploadInput.accept = 'image/*'
            uploadInput.hidden = true
            uploadButton.addEventListener('click', () => uploadInput.click())
            uploadInput.addEventListener('change', async () => {
                const file = uploadInput.files?.[0] || null
                if (!file) return
                uploadButton.disabled = true
                await this.#loadImageFile(item, file)
                uploadButton.disabled = false
                uploadInput.value = ''
            })
            const fileLabel = document.createElement('p')
            fileLabel.className = 'small muted image-file-label'
            fileLabel.textContent = item.imageName
                ? this.translate('itemsEditor.imageFileName', { name: item.imageName })
                : this.translate('itemsEditor.imageNoFile')
            contentWrap.append(previewBox, label, uploadButton, fileLabel, uploadInput)
        }

        const controls = document.createElement('div')
        controls.className = 'controls'

        if (item.type === 'text') {
            this.#appendTextControls(item, controls)
        } else if (item.type === 'qr') {
            this.#appendQrControls(item, controls, sizeLabel)
        } else if (item.type === 'image') {
            this.#appendImageControls(item, controls, sizeLabel)
        } else if (item.type === 'shape') {
            this.#appendShapeControls(item, controls, sizeLabel)
        }

        const remove = document.createElement('button')
        remove.textContent = this.translate('itemsEditor.remove')
        remove.addEventListener('click', () => {
            const stateIndex = this.state.items.findIndex((entry) => entry.id === item.id)
            if (stateIndex >= 0) {
                this.state.items.splice(stateIndex, 1)
            }
            this.#panelItemOrder = this.#panelItemOrder.filter((itemId) => itemId !== item.id)
            this.#collapsedItemIds.delete(item.id)
            this.#autoExpandedItemIds.delete(item.id)
            this.render()
            this.#onChange()
        })

        body.append(contentWrap, controls, remove)
        card.append(meta, body)
        card.querySelectorAll('input, textarea, select').forEach((el) =>
            el.addEventListener('dragstart', (ev) => {
                ev.stopPropagation()
                ev.preventDefault()
            })
        )
        return card
    }

    /**
     * Appends text controls to the controls container.
     * @param {object} item
     * @param {HTMLElement} controls
     */
    #appendTextControls(item, controls) {
        const offsetCtrl = this.#createSlider(this.translate('itemsEditor.sliderXOffset'), item.xOffset ?? 0, 0, 50, 1, (v) => {
            item.xOffset = v
            this.#onChange()
        })
        const yOffsetCtrl = this.#createSlider(this.translate('itemsEditor.sliderYOffset'), item.yOffset ?? 0, -50, 50, 1, (v) => {
            item.yOffset = v
            this.#onChange()
        })

        const fontCtrl = document.createElement('div')
        fontCtrl.className = 'field'
        const fontLabel = document.createElement('label')
        fontLabel.textContent = this.translate('itemsEditor.fontFamily')
        const fontSelect = document.createElement('select')
        const availableFamilies = this.#buildItemFontFamilyOptions(item.fontFamily)
        if (!item.fontFamily && availableFamilies.length) {
            item.fontFamily = availableFamilies[0]
        }
        availableFamilies.forEach((family) => {
            const option = document.createElement('option')
            option.value = family
            option.textContent = family
            option.style.fontFamily = `"${family}", sans-serif`
            fontSelect.appendChild(option)
        })
        fontSelect.value = item.fontFamily
        fontSelect.addEventListener('change', (e) => {
            item.fontFamily = e.target.value
            this.#onChange()
        })
        fontCtrl.append(fontLabel, fontSelect)

        const googleFontCtrl = document.createElement('div')
        googleFontCtrl.className = 'field google-font-field'
        const googleFontLabel = document.createElement('label')
        googleFontLabel.textContent = this.translate('itemsEditor.googleFontUrl')
        const googleFontRow = document.createElement('div')
        googleFontRow.className = 'google-font-row'
        const googleFontInput = document.createElement('input')
        googleFontInput.type = 'url'
        googleFontInput.placeholder = this.translate('itemsEditor.googleFontUrlPlaceholder')
        const googleFontButton = document.createElement('button')
        googleFontButton.type = 'button'
        googleFontButton.className = 'ghost'
        googleFontButton.textContent = this.translate('itemsEditor.addGoogleFont')
        googleFontButton.addEventListener('click', async () => {
            if (googleFontButton.disabled) return
            googleFontButton.disabled = true
            await this.#importGoogleFontFromInput(googleFontInput, item)
            googleFontButton.disabled = false
        })
        googleFontRow.append(googleFontInput, googleFontButton)
        const googleFontHint = document.createElement('p')
        googleFontHint.className = 'small muted'
        googleFontHint.textContent = this.translate('itemsEditor.googleFontHint')
        googleFontCtrl.append(googleFontLabel, googleFontRow, googleFontHint)

        const sizeCtrl = this.#createSlider(this.translate('itemsEditor.sliderFontSize'), item.fontSize, 10, 64, 1, (v) => {
            item.fontSize = v
            this.#onChange()
        })

        controls.append(offsetCtrl, yOffsetCtrl, fontCtrl, sizeCtrl, googleFontCtrl)
    }

    /**
     * Returns font-family options for the current item.
     * @param {string} activeFontFamily
     * @returns {string[]}
     */
    #buildItemFontFamilyOptions(activeFontFamily) {
        return FontFamilyUtils.normalizeFontFamilies(this.fontFamilies.concat([activeFontFamily]), 'Barlow')
    }

    /**
     * Resolves a default font family for new text items.
     * @returns {string}
     */
    #resolveDefaultFontFamily() {
        return this.fontFamilies[0] || 'Barlow'
    }

    /**
     * Imports a Google Font stylesheet URL and refreshes available font options.
     * @param {HTMLInputElement} input
     * @param {object} item
     * @returns {Promise<void>}
     */
    async #importGoogleFontFromInput(input, item) {
        const rawValue = String(input?.value || '').trim()
        if (!rawValue) {
            this.setStatus(this.translate('itemsEditor.googleFontUrlRequired'), 'info')
            return
        }

        try {
            const result = await FontFamilyUtils.loadGoogleFontLink(rawValue, document, window.location)
            this.#ensureCustomFontLinksState()
            this.state.customFontLinks = FontFamilyUtils.normalizeGoogleFontLinks(
                this.state.customFontLinks.concat([result.url])
            )
            this.fontFamilies = FontFamilyUtils.normalizeFontFamilies(this.fontFamilies.concat(result.families), 'Barlow')
            if (result.families.length) {
                item.fontFamily = result.families[0]
            }
            if (input) {
                input.value = ''
            }
            this.render()
            this.#onChange()

            if (result.alreadyLoaded) {
                this.setStatus(this.translate('itemsEditor.googleFontAlreadyLoaded'), 'info')
                return
            }
            if (result.families.length === 1) {
                this.setStatus(this.translate('itemsEditor.googleFontAdded', { family: result.families[0] }), 'success')
                return
            }
            this.setStatus(this.translate('itemsEditor.googleFontAddedMany', { count: result.families.length }), 'success')
        } catch (err) {
            const message = err?.message || this.translate('messages.unknownError')
            this.setStatus(this.translate('itemsEditor.googleFontLoadFailed', { message }), 'error')
        }
    }

    /**
     * Loads an uploaded image file into an image item.
     * @param {object} item
     * @param {File} file
     * @returns {Promise<void>}
     */
    async #loadImageFile(item, file) {
        if (!file || !String(file.type || '').startsWith('image/')) {
            this.setStatus(this.translate('itemsEditor.imageLoadFailedType'), 'error')
            return
        }
        try {
            const dataUrl = await this.#readFileAsDataUrl(file)
            const imageElement = await this.#loadImageFromDataUrl(dataUrl)
            if (!imageElement) {
                throw new Error(this.translate('itemsEditor.imageLoadFailedDecode'))
            }
            const dimensions = this.#resolveInitialImageDimensions(imageElement.naturalWidth, imageElement.naturalHeight)
            item.imageData = dataUrl
            item.imageName = file.name || ''
            item.width = dimensions.width
            item.height = dimensions.height
            const normalizedOptions = ImageRasterUtils.normalizeItemOptions(item)
            item.imageDither = normalizedOptions.imageDither
            item.imageThreshold = normalizedOptions.imageThreshold
            item.imageSmoothing = normalizedOptions.imageSmoothing
            item.imageInvert = normalizedOptions.imageInvert
            this.render()
            this.#onChange()
            this.setStatus(this.translate('itemsEditor.imageLoaded', { name: item.imageName || 'image' }), 'success')
        } catch (err) {
            const message = err?.message || this.translate('messages.unknownError')
            this.setStatus(this.translate('itemsEditor.imageLoadFailed', { message }), 'error')
        }
    }

    /**
     * Reads a file as a data URL.
     * @param {File} file
     * @returns {Promise<string>}
     */
    async #readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result || ''))
            reader.onerror = () => reject(new Error(this.translate('itemsEditor.imageLoadFailedRead')))
            reader.readAsDataURL(file)
        })
    }

    /**
     * Loads an image element from a data URL.
     * @param {string} dataUrl
     * @returns {Promise<HTMLImageElement | null>}
     */
    async #loadImageFromDataUrl(dataUrl) {
        return new Promise((resolve) => {
            const imageElement = new Image()
            imageElement.onload = () => resolve(imageElement)
            imageElement.onerror = () => resolve(null)
            imageElement.src = dataUrl
        })
    }

    /**
     * Resolves initial image dimensions so the first render fits the label width.
     * @param {number} naturalWidth
     * @param {number} naturalHeight
     * @returns {{ width: number, height: number }}
     */
    #resolveInitialImageDimensions(naturalWidth, naturalHeight) {
        const safeNaturalWidth = Math.max(1, Math.round(Number(naturalWidth) || 1))
        const safeNaturalHeight = Math.max(1, Math.round(Number(naturalHeight) || 1))
        const media = Media[this.state.media] || Media.W24
        const maxLabelHeight = this.#resolveImageCrossAxisLimit(media)
        const maxInitialWidth = 220
        const widthScale = maxInitialWidth / safeNaturalWidth
        const heightScale = maxLabelHeight / safeNaturalHeight
        const scale = Math.min(widthScale, heightScale, 1)
        const scaledDimensions = {
            width: Math.max(8, Math.round(safeNaturalWidth * scale)),
            height: Math.max(8, Math.round(safeNaturalHeight * scale))
        }
        return this.#constrainImageDimensionsForOrientation(scaledDimensions.width, scaledDimensions.height)
    }

    /**
     * Resolves the maximum drawable size on the fixed label axis in dots.
     * @param {object} [mediaOverride]
     * @returns {number}
     */
    #resolveImageCrossAxisLimit(mediaOverride = null) {
        const media = mediaOverride || Media[this.state.media] || Media.W24
        return Math.max(8, Math.round((media?.printArea || 128) - 4))
    }

    /**
     * Constrains image dimensions to the printable cross-axis for the current orientation.
     * @param {number} width
     * @param {number} height
     * @returns {{ width: number, height: number }}
     */
    #constrainImageDimensionsForOrientation(width, height) {
        const safeWidth = Math.max(8, Math.round(Number(width) || 8))
        const safeHeight = Math.max(8, Math.round(Number(height) || 8))
        const crossAxisLimit = this.#resolveImageCrossAxisLimit()
        if (this.state.orientation === 'horizontal' && safeHeight > crossAxisLimit) {
            const scale = crossAxisLimit / safeHeight
            return {
                width: Math.max(8, Math.round(safeWidth * scale)),
                height: crossAxisLimit
            }
        }
        if (this.state.orientation === 'vertical' && safeWidth > crossAxisLimit) {
            const scale = crossAxisLimit / safeWidth
            return {
                width: crossAxisLimit,
                height: Math.max(8, Math.round(safeHeight * scale))
            }
        }
        return { width: safeWidth, height: safeHeight }
    }

    /**
     * Appends image controls to the controls container.
     * @param {object} item
     * @param {HTMLElement} controls
     * @param {string} sizeLabel
     */
    #appendImageControls(item, controls, sizeLabel) {
        const normalizedOptions = ImageRasterUtils.normalizeItemOptions(item)
        item.imageDither = normalizedOptions.imageDither
        item.imageThreshold = normalizedOptions.imageThreshold
        item.imageSmoothing = normalizedOptions.imageSmoothing
        item.imageInvert = normalizedOptions.imageInvert
        const constrainedDimensions = this.#constrainImageDimensionsForOrientation(item.width || 96, item.height || 96)
        item.width = constrainedDimensions.width
        item.height = constrainedDimensions.height
        const crossAxisLimit = this.#resolveImageCrossAxisLimit()
        const widthMax = this.state.orientation === 'vertical' ? crossAxisLimit : 600
        const heightMax = this.state.orientation === 'horizontal' ? crossAxisLimit : 320

        const widthCtrl = this.#createSlider(sizeLabel, item.width || 96, 8, widthMax, 1, (v) => {
            item.width = v
            const constrained = this.#constrainImageDimensionsForOrientation(item.width, item.height || 96)
            item.width = constrained.width
            item.height = constrained.height
            this.#onChange()
        })
        const heightCtrl = this.#createSlider(this.translate('itemsEditor.sizeHeight'), item.height || 96, 8, heightMax, 1, (v) => {
            item.height = v
            const constrained = this.#constrainImageDimensionsForOrientation(item.width || 96, item.height)
            item.width = constrained.width
            item.height = constrained.height
            this.#onChange()
        })
        const offsetCtrl = this.#createSlider(this.translate('itemsEditor.sliderXOffset'), item.xOffset ?? 0, -80, 80, 1, (v) => {
            item.xOffset = v
            this.#onChange()
        })
        const yOffsetCtrl = this.#createSlider(this.translate('itemsEditor.sliderYOffset'), item.yOffset ?? 0, -80, 80, 1, (v) => {
            item.yOffset = v
            this.#onChange()
        })
        const thresholdCtrl = this.#createSlider(
            this.translate('itemsEditor.imageThreshold'),
            item.imageThreshold,
            0,
            255,
            1,
            (v) => {
                item.imageThreshold = v
                this.#onChange()
            }
        )

        const ditherCtrl = document.createElement('div')
        ditherCtrl.className = 'field'
        const ditherLabel = document.createElement('label')
        ditherLabel.textContent = this.translate('itemsEditor.imageDither')
        const ditherSelect = document.createElement('select')
        ImageRasterUtils.DITHER_MODES.forEach((mode) => {
            const option = document.createElement('option')
            option.value = mode
            option.textContent = this.translate(`itemsEditor.imageDither${mode.replaceAll('-', '')}`)
            ditherSelect.appendChild(option)
        })
        ditherSelect.value = item.imageDither
        ditherSelect.addEventListener('change', (e) => {
            item.imageDither = e.target.value
            this.#onChange()
        })
        ditherCtrl.append(ditherLabel, ditherSelect)

        const smoothingCtrl = document.createElement('div')
        smoothingCtrl.className = 'field'
        const smoothingLabel = document.createElement('label')
        smoothingLabel.textContent = this.translate('itemsEditor.imageSmoothing')
        const smoothingSelect = document.createElement('select')
        ImageRasterUtils.SMOOTHING_MODES.forEach((mode) => {
            const option = document.createElement('option')
            option.value = mode
            option.textContent = this.translate(`itemsEditor.imageSmoothing${mode}`)
            smoothingSelect.appendChild(option)
        })
        smoothingSelect.value = item.imageSmoothing
        smoothingSelect.addEventListener('change', (e) => {
            item.imageSmoothing = e.target.value
            this.#onChange()
        })
        smoothingCtrl.append(smoothingLabel, smoothingSelect)

        const invertCtrl = document.createElement('div')
        invertCtrl.className = 'field'
        const invertLabel = document.createElement('label')
        invertLabel.className = 'checkbox-row'
        const invertInput = document.createElement('input')
        invertInput.type = 'checkbox'
        invertInput.checked = Boolean(item.imageInvert)
        invertInput.addEventListener('change', (e) => {
            item.imageInvert = e.target.checked
            this.#onChange()
        })
        const invertText = document.createElement('span')
        invertText.textContent = this.translate('itemsEditor.imageInvert')
        invertLabel.append(invertInput, invertText)
        invertCtrl.append(invertLabel)

        controls.append(widthCtrl, heightCtrl, offsetCtrl, yOffsetCtrl, thresholdCtrl, ditherCtrl, smoothingCtrl, invertCtrl)
    }

    /**
     * Appends QR controls to the controls container.
     * @param {object} item
     * @param {HTMLElement} controls
     * @param {string} sizeLabel
     */
    #appendQrControls(item, controls, sizeLabel) {
        const normalizedOptions = QrCodeUtils.normalizeItemOptions(item)
        item.qrErrorCorrectionLevel = normalizedOptions.qrErrorCorrectionLevel
        item.qrVersion = normalizedOptions.qrVersion
        item.qrEncodingMode = normalizedOptions.qrEncodingMode

        const maxQrSize = QrSizeUtils.computeMaxQrSizeDots(this.state)
        const minQrSize = Math.max(1, Math.min(QrSizeUtils.MIN_QR_SIZE_DOTS, maxQrSize))
        const heightCtrl = this.#createSlider(sizeLabel, item.height, 20, 280, 1, (v) => {
            item.height = v
            this.#onChange()
        })
        const offsetCtrl = this.#createSlider(this.translate('itemsEditor.sliderXOffset'), item.xOffset ?? 0, 0, 50, 1, (v) => {
            item.xOffset = v
            this.#onChange()
        })
        const yOffsetCtrl = this.#createSlider(this.translate('itemsEditor.sliderYOffset'), item.yOffset ?? 0, -50, 50, 1, (v) => {
            item.yOffset = v
            this.#onChange()
        })
        const sizeCtrl = this.#createSlider(this.translate('itemsEditor.sliderQrSize'), item.size, minQrSize, maxQrSize, 1, (v) => {
            item.size = QrSizeUtils.clampQrSizeToLabel(this.state, v)
            if ((item.height || 0) < item.size) {
                item.height = item.size
            }
            item._qrCache = null
            this.#onChange()
        })

        const errorCorrectionCtrl = document.createElement('div')
        errorCorrectionCtrl.className = 'field'
        const errorCorrectionLabel = document.createElement('label')
        errorCorrectionLabel.textContent = this.translate('itemsEditor.qrErrorCorrection')
        const errorCorrectionSelect = document.createElement('select')
        QrCodeUtils.getErrorCorrectionLevels().forEach((level) => {
            const option = document.createElement('option')
            option.value = level
            option.textContent = this.translate(`itemsEditor.qrErrorCorrection${level}`)
            errorCorrectionSelect.appendChild(option)
        })
        errorCorrectionSelect.value = item.qrErrorCorrectionLevel
        errorCorrectionSelect.addEventListener('change', (e) => {
            item.qrErrorCorrectionLevel = QrCodeUtils.normalizeErrorCorrectionLevel(e.target.value)
            item._qrCache = null
            this.#onChange()
        })
        errorCorrectionCtrl.append(errorCorrectionLabel, errorCorrectionSelect)

        const versionCtrl = document.createElement('div')
        versionCtrl.className = 'field'
        const versionLabel = document.createElement('label')
        versionLabel.textContent = this.translate('itemsEditor.qrVersion')
        const versionSelect = document.createElement('select')
        const autoVersionOption = document.createElement('option')
        autoVersionOption.value = '0'
        autoVersionOption.textContent = this.translate('itemsEditor.qrVersionAuto')
        versionSelect.appendChild(autoVersionOption)
        for (let version = 1; version <= 40; version += 1) {
            const option = document.createElement('option')
            option.value = String(version)
            option.textContent = String(version)
            versionSelect.appendChild(option)
        }
        versionSelect.value = String(item.qrVersion)
        versionSelect.addEventListener('change', (e) => {
            item.qrVersion = QrCodeUtils.normalizeVersion(e.target.value)
            item._qrCache = null
            this.#onChange()
        })
        versionCtrl.append(versionLabel, versionSelect)

        const encodingModeCtrl = document.createElement('div')
        encodingModeCtrl.className = 'field'
        const encodingModeLabel = document.createElement('label')
        encodingModeLabel.textContent = this.translate('itemsEditor.qrEncodingMode')
        const encodingModeSelect = document.createElement('select')
        QrCodeUtils.getEncodingModes().forEach((mode) => {
            const option = document.createElement('option')
            option.value = mode
            option.textContent = this.translate(`itemsEditor.qrEncoding${mode[0].toUpperCase()}${mode.slice(1)}`)
            encodingModeSelect.appendChild(option)
        })
        encodingModeSelect.value = item.qrEncodingMode
        encodingModeSelect.addEventListener('change', (e) => {
            item.qrEncodingMode = QrCodeUtils.normalizeEncodingMode(e.target.value)
            item._qrCache = null
            this.#onChange()
        })
        encodingModeCtrl.append(encodingModeLabel, encodingModeSelect)

        controls.append(heightCtrl, offsetCtrl, yOffsetCtrl, sizeCtrl, errorCorrectionCtrl, versionCtrl, encodingModeCtrl)
    }

    /**
     * Appends shape controls to the controls container.
     * @param {object} item
     * @param {HTMLElement} controls
     * @param {string} sizeLabel
     */
    #appendShapeControls(item, controls, sizeLabel) {
        const widthCtrl = this.#createSlider(sizeLabel, item.width || 120, 20, 420, 2, (v) => {
            item.width = v
            this.#onChange()
        })
        const heightLabel =
            item.shapeType === 'line'
                ? this.translate('itemsEditor.sliderThickness')
                : this.translate('itemsEditor.sizeHeight')
        const heightCtrl = this.#createSlider(heightLabel, item.height || 20, 4, 240, 1, (v) => {
            item.height = v
            this.#onChange()
        })
        const strokeCtrl = this.#createSlider(this.translate('itemsEditor.sliderStroke'), item.strokeWidth || 2, 1, 12, 1, (v) => {
            item.strokeWidth = v
            this.#onChange()
        })
        const offsetCtrl = this.#createSlider(this.translate('itemsEditor.sliderXOffset'), item.xOffset ?? 0, -50, 50, 1, (v) => {
            item.xOffset = v
            this.#onChange()
        })
        const yOffsetCtrl = this.#createSlider(this.translate('itemsEditor.sliderYOffset'), item.yOffset ?? 0, -80, 80, 1, (v) => {
            item.yOffset = v
            this.#onChange()
        })
        controls.append(widthCtrl, heightCtrl, strokeCtrl, offsetCtrl, yOffsetCtrl)

        if (item.shapeType === 'roundRect') {
            const radiusCtrl = this.#createSlider(this.translate('itemsEditor.sliderRadius'), item.cornerRadius || 8, 0, 60, 1, (v) => {
                item.cornerRadius = v
                this.#onChange()
            })
            controls.append(radiusCtrl)
        }
        if (item.shapeType === 'polygon') {
            const sidesCtrl = this.#createSlider(this.translate('itemsEditor.sliderSides'), item.sides || 6, 3, 12, 1, (v) => {
                item.sides = v
                this.#onChange()
            })
            controls.append(sidesCtrl)
        }
    }
}
