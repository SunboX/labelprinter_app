import { QrSizeUtils } from '../QrSizeUtils.mjs'
import { FontFamilyUtils } from '../FontFamilyUtils.mjs'
import { QrCodeUtils } from '../QrCodeUtils.mjs'

/**
 * Manages the item list UI, including drag reordering and item controls.
 */
export class ItemsEditor {
    #onChange = () => {}
    #translate = (key) => key
    #setStatus = () => {}
    #fontFamilies = FontFamilyUtils.getFallbackFontFamilies()

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
        this.selectedItemIds = new Set(Array.isArray(itemIds) ? itemIds : [])
        this.render()
    }

    /**
     * Renders the list of items and their controls.
     */
    render() {
        this.els.items.innerHTML = ''
        const sizeLabel =
            this.state.orientation === 'horizontal'
                ? this.translate('itemsEditor.sizeLength')
                : this.translate('itemsEditor.sizeHeight')
        this.state.items.forEach((item, index) => {
            const card = this.#createItemCard(item, index, sizeLabel)
            this.els.items.appendChild(card)
        })
    }

    /**
     * Binds drag handlers for reordering items.
     */
    bindDrag() {
        let fromIndex = null
        this.els.items.addEventListener('dragstart', (e) => {
            const handle = e.target.closest('.handle')
            if (!handle) return
            const card = handle.closest('.item-card')
            if (!card) return
            fromIndex = Number(card.dataset.index)
            e.dataTransfer.effectAllowed = 'move'
        })
        this.els.items.addEventListener('dragover', (e) => {
            if (fromIndex === null) return
            e.preventDefault()
        })
        this.els.items.addEventListener('drop', (e) => {
            e.preventDefault()
            const card = e.target.closest('.item-card')
            if (!card || fromIndex === null) return
            const toIndex = Number(card.dataset.index)
            if (toIndex === fromIndex) {
                fromIndex = null
                return
            }
            const [moved] = this.state.items.splice(fromIndex, 1)
            this.state.items.splice(toIndex, 0, moved)
            fromIndex = null
            this.render()
            this.#onChange()
        })
    }

    /**
     * Adds a new text item.
     */
    addTextItem() {
        this.state.items.push({
            id: this.nextId(),
            type: 'text',
            text: this.translate('itemsEditor.newText'),
            fontFamily: this.#resolveDefaultFontFamily(),
            fontSize: 24,
            height: 40,
            xOffset: 4
        })
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
        this.state.items.push({
            id: this.nextId(),
            type: 'qr',
            data: this.translate('itemsEditor.newQrData'),
            size: initialSize,
            height: initialSize,
            qrErrorCorrectionLevel: QrCodeUtils.getDefaultErrorCorrectionLevel(),
            qrVersion: QrCodeUtils.getDefaultVersion(),
            qrEncodingMode: QrCodeUtils.getDefaultEncodingMode(),
            xOffset: 4
        })
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
        this.state.items.push({
            id: this.nextId(),
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
        this.render()
        this.#onChange()
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
    #createItemCard(item, index, sizeLabel) {
        const card = document.createElement('div')
        card.className = 'item-card'
        card.draggable = false
        card.dataset.index = index.toString()
        card.dataset.itemId = item.id
        if (this.selectedItemIds.has(item.id)) {
            card.classList.add('selected')
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
                  : this.translate('itemsEditor.typeShape')
        tag.textContent = typeLabel
        const handle = document.createElement('div')
        handle.className = 'handle'
        handle.textContent = this.translate('itemsEditor.handleDrag')
        handle.draggable = true
        handle.dataset.index = index.toString()
        meta.append(tag, handle)

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
        }

        const controls = document.createElement('div')
        controls.className = 'controls'

        if (item.type === 'text') {
            this.#appendTextControls(item, controls)
        } else if (item.type === 'qr') {
            this.#appendQrControls(item, controls, sizeLabel)
        } else if (item.type === 'shape') {
            this.#appendShapeControls(item, controls, sizeLabel)
        }

        const remove = document.createElement('button')
        remove.textContent = this.translate('itemsEditor.remove')
        remove.addEventListener('click', () => {
            this.state.items.splice(index, 1)
            this.render()
            this.#onChange()
        })

        card.append(meta, contentWrap, controls, remove)
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
