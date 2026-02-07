import { QrSizeUtils } from '../QrSizeUtils.mjs'

/**
 * Manages the item list UI, including drag reordering and item controls.
 */
export class ItemsEditor {
    #onChange = () => {}

    /**
     * @param {object} els
     * @param {object} state
     * @param {Array<{ id: string, label: string }>} shapeTypes
     * @param {() => void} onChange
     * @param {() => string} nextId
     */
    constructor(els, state, shapeTypes, onChange, nextId) {
        this.els = els
        this.state = state
        this.shapeTypes = shapeTypes
        this.onChange = onChange
        this.nextId = nextId
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
        const sizeLabel = this.state.orientation === 'horizontal' ? 'Length' : 'Height'
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
            text: 'New text',
            fontFamily: 'Barlow',
            fontSize: 24,
            height: 40,
            xOffset: 4
        })
        this.render()
        this.#onChange()
    }

    /**
     * Adds a new QR code item.
     */
    addQrItem() {
        const initialSize = QrSizeUtils.computeInitialQrSizeDots(this.state)
        this.state.items.push({
            id: this.nextId(),
            type: 'qr',
            data: 'https://example.com',
            size: initialSize,
            height: initialSize,
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
        const typeLabel = item.type === 'text' ? 'Text' : item.type === 'qr' ? 'QR' : 'Form'
        tag.textContent = typeLabel
        const handle = document.createElement('div')
        handle.className = 'handle'
        handle.textContent = '⇅ drag'
        handle.draggable = true
        handle.dataset.index = index.toString()
        meta.append(tag, handle)

        const contentWrap = document.createElement('div')
        contentWrap.className = 'field'
        if (item.type === 'text' || item.type === 'qr') {
            const label = document.createElement('label')
            label.textContent = item.type === 'text' ? 'Text' : 'QR content'
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
            label.textContent = 'Form'
            const select = document.createElement('select')
            this.shapeTypes.forEach((shape) => {
                const opt = document.createElement('option')
                opt.value = shape.id
                opt.textContent = shape.label
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
        remove.textContent = 'Remove'
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
        const offsetCtrl = this.#createSlider('X offset', item.xOffset ?? 0, 0, 50, 1, (v) => {
            item.xOffset = v
            this.#onChange()
        })
        const yOffsetCtrl = this.#createSlider('Y offset', item.yOffset ?? 0, -50, 50, 1, (v) => {
            item.yOffset = v
            this.#onChange()
        })

        const fontCtrl = document.createElement('div')
        fontCtrl.className = 'field'
        const fontLabel = document.createElement('label')
        fontLabel.textContent = 'Font family'
        const fontInput = document.createElement('input')
        fontInput.value = item.fontFamily
        fontInput.addEventListener('input', (e) => {
            item.fontFamily = e.target.value
            this.#onChange()
        })
        fontCtrl.append(fontLabel, fontInput)

        const sizeCtrl = this.#createSlider('Font size', item.fontSize, 10, 64, 1, (v) => {
            item.fontSize = v
            this.#onChange()
        })

        controls.append(offsetCtrl, yOffsetCtrl, fontCtrl, sizeCtrl)
    }

    /**
     * Appends QR controls to the controls container.
     * @param {object} item
     * @param {HTMLElement} controls
     * @param {string} sizeLabel
     */
    #appendQrControls(item, controls, sizeLabel) {
        const maxQrSize = QrSizeUtils.computeMaxQrSizeDots(this.state)
        const minQrSize = Math.max(1, Math.min(QrSizeUtils.MIN_QR_SIZE_DOTS, maxQrSize))
        const heightCtrl = this.#createSlider(sizeLabel, item.height, 20, 280, 1, (v) => {
            item.height = v
            this.#onChange()
        })
        const offsetCtrl = this.#createSlider('X offset', item.xOffset ?? 0, 0, 50, 1, (v) => {
            item.xOffset = v
            this.#onChange()
        })
        const yOffsetCtrl = this.#createSlider('Y offset', item.yOffset ?? 0, -50, 50, 1, (v) => {
            item.yOffset = v
            this.#onChange()
        })
        const sizeCtrl = this.#createSlider('QR size', item.size, minQrSize, maxQrSize, 1, (v) => {
            item.size = QrSizeUtils.clampQrSizeToLabel(this.state, v)
            if ((item.height || 0) < item.size) {
                item.height = item.size
            }
            item._qrCache = null
            this.#onChange()
        })
        controls.append(heightCtrl, offsetCtrl, yOffsetCtrl, sizeCtrl)
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
        const heightLabel = item.shapeType === 'line' ? 'Thickness' : 'Height'
        const heightCtrl = this.#createSlider(heightLabel, item.height || 20, 4, 240, 1, (v) => {
            item.height = v
            this.#onChange()
        })
        const strokeCtrl = this.#createSlider('Stroke', item.strokeWidth || 2, 1, 12, 1, (v) => {
            item.strokeWidth = v
            this.#onChange()
        })
        const offsetCtrl = this.#createSlider('X offset', item.xOffset ?? 0, -50, 50, 1, (v) => {
            item.xOffset = v
            this.#onChange()
        })
        const yOffsetCtrl = this.#createSlider('Y offset', item.yOffset ?? 0, -80, 80, 1, (v) => {
            item.yOffset = v
            this.#onChange()
        })
        controls.append(widthCtrl, heightCtrl, strokeCtrl, offsetCtrl, yOffsetCtrl)

        if (item.shapeType === 'roundRect') {
            const radiusCtrl = this.#createSlider('Radius', item.cornerRadius || 8, 0, 60, 1, (v) => {
                item.cornerRadius = v
                this.#onChange()
            })
            controls.append(radiusCtrl)
        }
        if (item.shapeType === 'polygon') {
            const sidesCtrl = this.#createSlider('Sides', item.sides || 6, 3, 12, 1, (v) => {
                item.sides = v
                this.#onChange()
            })
            controls.append(sidesCtrl)
        }
    }
}
