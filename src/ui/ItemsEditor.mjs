import { FontFamilyUtils } from '../FontFamilyUtils.mjs'
import { BarcodeUtils } from '../BarcodeUtils.mjs'
import { QrSizeUtils } from '../QrSizeUtils.mjs'
import { QrCodeUtils } from '../QrCodeUtils.mjs'
import { ItemsEditorImageSupport } from './ItemsEditorImageSupport.mjs'
import { ItemsEditorIconSupport } from './ItemsEditorIconSupport.mjs'
import { ItemsEditorBarcodeSupport } from './ItemsEditorBarcodeSupport.mjs'
import { ItemsEditorGeometrySupport } from './ItemsEditorGeometrySupport.mjs'
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
     * Selects an icon item and opens its icon chooser in the objects panel.
     * @param {string} itemId
     * @returns {boolean}
     */
    openIconPickerForItem(itemId) {
        const normalizedItemId = String(itemId || '').trim()
        if (!normalizedItemId) return false
        const item = this.state.items.find((candidate) => candidate.id === normalizedItemId)
        if (!item || item.type !== 'icon') return false
        this.setSelectedItemIds([normalizedItemId])
        const trigger = this.#findIconPickerTrigger(normalizedItemId)
        if (!trigger) return false
        const card = trigger.closest('.item-card')
        if (card && typeof card.scrollIntoView === 'function') {
            card.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
        trigger.click()
        return true
    }

    /**
     * Returns the icon picker trigger element for a specific item card.
     * @param {string} itemId
     * @returns {HTMLButtonElement | null}
     */
    #findIconPickerTrigger(itemId) {
        if (!this.els.items) return null
        const card = Array.from(this.els.items.querySelectorAll('.item-card')).find((candidate) => {
            return candidate.dataset.itemId === itemId
        })
        if (!card) return null
        const trigger = card.querySelector('.icon-picker-trigger')
        return trigger instanceof HTMLButtonElement ? trigger : null
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
            xOffset: 4,
            rotation: 0
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
            xOffset: 4,
            rotation: 0
        })
        this.#panelItemOrder.push(id)
        this.#collapsedItemIds.delete(id)
        this.render()
        this.#onChange()
    }
    /**
     * Adds a new barcode item.
     */
    addBarcodeItem() {
        const dimensions = ItemsEditorBarcodeSupport.resolveDefaultBarcodeDimensions(this.state)
        const id = this.nextId()
        this.state.items.push({
            id,
            type: 'barcode',
            data: '1234567890',
            width: dimensions.width,
            height: dimensions.height,
            barcodeFormat: BarcodeUtils.getDefaultFormat(),
            barcodeShowText: false,
            barcodeModuleWidth: 2,
            barcodeMargin: 0,
            xOffset: 4,
            yOffset: 0,
            rotation: 0
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
        const crossAxisLimit = ItemsEditorImageSupport.resolveImageCrossAxisLimit(this.state)
        const defaultSide = Math.max(8, Math.min(96, crossAxisLimit))
        const defaultDimensions = ItemsEditorImageSupport.constrainImageDimensionsForOrientation(
            defaultSide,
            defaultSide,
            this.state
        )
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
            yOffset: 0,
            rotation: 0
        })
        this.#panelItemOrder.push(id)
        this.#collapsedItemIds.delete(id)
        this.render()
        this.#onChange()
    }
    /**
     * Adds a new icon item.
     */
    addIconItem() {
        const defaultDimensions = ItemsEditorIconSupport.resolveDefaultIconDimensions(this.state)
        const id = this.nextId()
        this.state.items.push({
            id,
            type: 'icon',
            iconId: ItemsEditorIconSupport.getDefaultIconId(),
            width: defaultDimensions.width,
            height: defaultDimensions.height,
            xOffset: 4,
            yOffset: 0,
            rotation: 0
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
        const dimensions = {
            ...(shapeType === 'line'
                ? { width: 180, height: 6 }
                : shapeType === 'oval'
                  ? { width: 180, height: 44 }
                  : shapeType === 'polygon'
                    ? { width: 180, height: 52 }
                    : shapeType === 'triangle'
                      ? { width: 120, height: 72 }
                      : shapeType === 'diamond'
                        ? { width: 120, height: 72 }
                        : shapeType === 'arrowRight' || shapeType === 'arrowLeft'
                          ? { width: 180, height: 48 }
                          : shapeType === 'plus'
                            ? { width: 84, height: 84 }
                            : shapeType === 'dot'
                              ? { width: 42, height: 42 }
                              : shapeType === 'warningTriangle'
                                ? { width: 120, height: 84 }
                                : { width: 180, height: 36 })
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
            yOffset: 0,
            rotation: 0
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
                  : item.type === 'barcode'
                    ? this.translate('itemsEditor.typeBarcode')
                  : item.type === 'image'
                    ? this.translate('itemsEditor.typeImage')
                    : item.type === 'icon'
                      ? this.translate('itemsEditor.typeIcon')
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
        if (item.type === 'text' || item.type === 'qr' || item.type === 'barcode') {
            const label = document.createElement('label')
            label.textContent =
                item.type === 'text'
                    ? this.translate('itemsEditor.fieldText')
                    : item.type === 'qr'
                      ? this.translate('itemsEditor.fieldQrContent')
                      : this.translate('itemsEditor.fieldBarcodeContent')
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
            ItemsEditorImageSupport.appendImageSourceControls({
                item,
                contentWrap,
                translate: this.translate,
                onFileSelected: async (file, controls) => {
                    controls.uploadButton.disabled = true
                    await this.#loadImageFile(item, file)
                    controls.uploadButton.disabled = false
                    controls.uploadInput.value = ''
                }
            })
        } else if (item.type === 'icon') {
            ItemsEditorIconSupport.appendIconSourceControls({
                item,
                contentWrap,
                translate: this.translate,
                onChange: this.#onChange
            })
        }

        const controls = document.createElement('div')
        controls.className = 'controls'

        if (item.type === 'text') {
            this.#appendTextControls(item, controls)
        } else if (item.type === 'qr') {
            this.#appendQrControls(item, controls, sizeLabel)
        } else if (item.type === 'barcode') {
            this.#appendBarcodeControls(item, controls, sizeLabel)
        } else if (item.type === 'image') {
            this.#appendImageControls(item, controls, sizeLabel)
        } else if (item.type === 'icon') {
            this.#appendIconControls(item, controls, sizeLabel)
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
        const rotationCtrl = this.#createSlider(
            this.translate('itemsEditor.sliderRotation'),
            item.rotation ?? 0,
            -180,
            180,
            1,
            (v) => {
                item.rotation = v
                this.#onChange()
            }
        )

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

        controls.append(offsetCtrl, yOffsetCtrl, rotationCtrl, fontCtrl, sizeCtrl, googleFontCtrl)
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
        await ItemsEditorImageSupport.loadImageFile({
            item,
            file,
            state: this.state,
            translate: this.translate,
            setStatus: this.setStatus,
            render: this.render.bind(this),
            onChange: this.#onChange
        })
    }
    /**
     * Appends image controls to the controls container.
     * @param {object} item
     * @param {HTMLElement} controls
     * @param {string} sizeLabel
     */
    #appendImageControls(item, controls, sizeLabel) {
        ItemsEditorImageSupport.appendImageControls({
            item,
            controls,
            sizeLabel,
            state: this.state,
            translate: this.translate,
            onChange: this.#onChange,
            createSlider: this.#createSlider.bind(this)
        })
    }
    /**
     * Appends icon controls to the controls container.
     * @param {object} item
     * @param {HTMLElement} controls
     * @param {string} sizeLabel
     */
    #appendIconControls(item, controls, sizeLabel) {
        ItemsEditorIconSupport.appendIconControls({
            item,
            controls,
            sizeLabel,
            state: this.state,
            translate: this.translate,
            onChange: this.#onChange,
            createSlider: this.#createSlider.bind(this)
        })
    }
    /**
     * Appends barcode controls to the controls container.
     * @param {object} item
     * @param {HTMLElement} controls
     * @param {string} sizeLabel
     */
    #appendBarcodeControls(item, controls, sizeLabel) {
        ItemsEditorBarcodeSupport.appendBarcodeControls({
            item,
            controls,
            sizeLabel,
            state: this.state,
            translate: this.translate,
            onChange: this.#onChange,
            createSlider: this.#createSlider.bind(this)
        })
    }
    /**
     * Appends QR controls to the controls container.
     * @param {object} item
     * @param {HTMLElement} controls
     * @param {string} sizeLabel
     */
    #appendQrControls(item, controls, sizeLabel) {
        ItemsEditorGeometrySupport.appendQrControls({
            item,
            controls,
            sizeLabel,
            state: this.state,
            translate: this.translate,
            onChange: this.#onChange,
            createSlider: this.#createSlider.bind(this)
        })
    }
    /**
     * Appends shape controls to the controls container.
     * @param {object} item
     * @param {HTMLElement} controls
     * @param {string} sizeLabel
     */
    #appendShapeControls(item, controls, sizeLabel) {
        ItemsEditorGeometrySupport.appendShapeControls({
            item,
            controls,
            sizeLabel,
            translate: this.translate,
            onChange: this.#onChange,
            createSlider: this.#createSlider.bind(this)
        })
    }
}
