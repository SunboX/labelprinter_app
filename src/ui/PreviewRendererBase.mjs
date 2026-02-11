import { AlignmentUtils } from '../AlignmentUtils.mjs'

/**
 * Base preview renderer state and shared callbacks.
 */
export class PreviewRendererBase {
    #onSelectionChange = null
    #onItemChange = null
    #onItemEditorRequest = null

    /**
     * @param {object} els
     * @param {object} state
     * @param {(text: string, type?: string) => void} setStatus
     * @param {(key: string, params?: Record<string, string | number>) => string} translate
     */
    constructor(els, state, setStatus, translate) {
        this.els = els
        this.state = state
        this.setStatus = setStatus
        this.translate = typeof translate === 'function' ? translate : (key) => key
        this._previewBusy = false
        this._previewQueued = false
        this._overlayCanvas = null
        this._interactionLayer = null
        this._interactiveItems = []
        this._interactiveItemsById = new Map()
        this._interactionElements = new Map()
        this._interactables = new Map()
        this._hoverItemId = null
        this._activeItemId = null
        this._selectedItemIds = new Set()
        this.onSelectionChange = null
        this.onItemChange = null
        this.onItemEditorRequest = null
        this._interaction = null
        this._interactionFrame = null
        this._viewportSyncFrame = null
        this._dotsPerPxX = 1
        this._dotsPerPxY = 1
        this._rulerContext = null
        this._templateValues = {}
        this._qrRenderCache = new Map()
        this._barcodeRenderCache = new Map()
        this._imageRenderCache = new Map()
        this._sourceImageCache = new Map()
        // Resize handles are part of the editor interaction model (drag via body, scale via dots/edges).
        this._enablePreviewResize = true
        this._handleRadius = 3
        this._overlayPadding = 0
        this._interactionsBound = false
        this._inlineTextEditor = null
        this._inlineTextItemId = null
        this._handleHitboxEnter = this._handleHitboxEnter.bind(this)
        this._handleHitboxLeave = this._handleHitboxLeave.bind(this)
        this._handleHitboxPointerDown = this._handleHitboxPointerDown.bind(this)
        this._handleHitboxDoubleClick = this._handleHitboxDoubleClick.bind(this)
        this._handleLayerPointerDown = this._handleLayerPointerDown.bind(this)
        this._handleInteractionContextMenu = this._handleInteractionContextMenu.bind(this)
        this._handleInlineTextEditorKeyDown = this._handleInlineTextEditorKeyDown.bind(this)
        this._handleInlineTextEditorBlur = this._handleInlineTextEditorBlur.bind(this)
        this._handleInteractDragStart = this._handleInteractDragStart.bind(this)
        this._handleInteractDragMove = this._handleInteractDragMove.bind(this)
        this._handleInteractDragEnd = this._handleInteractDragEnd.bind(this)
        this._handleInteractResizeStart = this._handleInteractResizeStart.bind(this)
        this._handleInteractResizeMove = this._handleInteractResizeMove.bind(this)
        this._handleInteractResizeEnd = this._handleInteractResizeEnd.bind(this)
        this._getInteractCursor = this._getInteractCursor.bind(this)
    }

    /**
     * Returns the locally loaded InteractJS runtime.
     * @returns {Function}
     */
    _requireInteract() {
        if (typeof globalThis.interact !== 'function') {
            throw new Error('interactjs is not loaded. Ensure /node_modules/interactjs/dist/interact.min.js is available.')
        }
        return globalThis.interact
    }

    /**
     * Returns the locally loaded QRCode runtime.
     * @returns {{ toCanvas: Function }}
     */
    _requireQrCode() {
        if (!globalThis.QRCode || typeof globalThis.QRCode.toCanvas !== 'function') {
            throw new Error('qrcode is not loaded. Ensure /node_modules/qrcode/build/qrcode.js is available.')
        }
        return globalThis.QRCode
    }

    /**
     * Returns the locally loaded JsBarcode runtime.
     * @returns {(canvas: HTMLCanvasElement, value: string, options?: object) => void}
     */
    _requireBarcode() {
        if (typeof globalThis.JsBarcode !== 'function') {
            throw new Error(
                'jsbarcode is not loaded. Ensure /node_modules/jsbarcode/dist/JsBarcode.all.min.js is available.'
            )
        }
        return globalThis.JsBarcode
    }

    /**
     * Binds pointer interactions for hover, drag, and resize.
     */
    bindInteractions() {
        if (this._interactionsBound) return
        this._ensureOverlayCanvas()
        this._ensureInteractionLayer()
        this._interactionsBound = true
    }

    /**
     * Returns the currently selected interactive item ids.
     * @returns {string[]}
     */
    getSelectedItemIds() {
        return Array.from(this._selectedItemIds)
    }

    /**
     * Sets template values used during preview rendering.
     * @param {Record<string, string>} values
     */
    setTemplateValues(values) {
        this._templateValues = values && typeof values === 'object' ? { ...values } : {}
    }

    /**
     * Sets the selection change callback.
     * @param {(selectedIds: string[]) => void} callback
     */
    set onSelectionChange(callback) {
        this.#onSelectionChange = typeof callback === 'function' ? callback : null
    }

    /**
     * Returns the current selection change callback.
     * @returns {((selectedIds: string[]) => void) | null}
     */
    get onSelectionChange() {
        return this.#onSelectionChange
    }

    /**
     * Sets the item change callback.
     * @param {() => void} callback
     */
    set onItemChange(callback) {
        this.#onItemChange = typeof callback === 'function' ? callback : null
    }

    /**
     * Returns the current item change callback.
     * @returns {(() => void) | null}
     */
    get onItemChange() {
        return this.#onItemChange
    }

    /**
     * Sets the item-editor request callback.
     * @param {(request: { itemId: string, type: string }) => void} callback
     */
    set onItemEditorRequest(callback) {
        this.#onItemEditorRequest = typeof callback === 'function' ? callback : null
    }

    /**
     * Returns the current item-editor request callback.
     * @returns {((request: { itemId: string, type: string }) => void) | null}
     */
    get onItemEditorRequest() {
        return this.#onItemEditorRequest
    }

    /**
     * Replaces the current interactive selection.
     * @param {string[]} itemIds
     */
    setSelectedItemIds(itemIds) {
        const nextIds = new Set(Array.isArray(itemIds) ? itemIds.filter((id) => typeof id === 'string' && id) : [])
        let changed = false
        if (nextIds.size !== this._selectedItemIds.size) {
            changed = true
        } else {
            for (const id of nextIds) {
                if (!this._selectedItemIds.has(id)) {
                    changed = true
                    break
                }
            }
        }
        if (!changed) return
        this._selectedItemIds = nextIds
        if (this._activeItemId && !this._selectedItemIds.has(this._activeItemId)) {
            this._activeItemId = null
        }
        this._emitSelectionChange()
        this._drawOverlay()
    }

    /**
     * Aligns the currently selected items.
     * @param {'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'} alignMode
     * @param {'selection' | 'largest' | 'smallest' | 'label'} [referenceMode='selection']
     * @returns {{ changed: boolean, reason?: string, count: number }}
     */
    alignSelectedItems(alignMode, referenceMode = 'selection') {
        const selectedEntries = this._interactiveItems.filter((entry) => this._selectedItemIds.has(entry.id))
        if (!selectedEntries.length) {
            return { changed: false, reason: 'no-selection', count: 0 }
        }
        if (referenceMode !== 'label' && selectedEntries.length < 2) {
            return { changed: false, reason: 'need-multiple', count: selectedEntries.length }
        }
        const labelBounds = {
            x: 0,
            y: 0,
            width: this.els.preview?.width || 0,
            height: this.els.preview?.height || 0
        }
        const referenceRect = AlignmentUtils.resolveAlignmentReferenceRect(selectedEntries, referenceMode, labelBounds)
        if (!referenceRect) {
            return { changed: false, reason: 'missing-reference', count: selectedEntries.length }
        }
        let changed = false
        selectedEntries.forEach((entry) => {
            const { deltaX, deltaY } = AlignmentUtils.computeAlignmentDelta(entry.bounds, referenceRect, alignMode)
            const nextDeltaX = Math.round(deltaX)
            const nextDeltaY = Math.round(deltaY)
            if (nextDeltaX) {
                entry.item.xOffset = Math.round((entry.item.xOffset || 0) + nextDeltaX)
                changed = true
            }
            if (nextDeltaY) {
                entry.item.yOffset = Math.round((entry.item.yOffset || 0) + nextDeltaY)
                changed = true
            }
        })
        return { changed, count: selectedEntries.length }
    }

    /**
     * Emits selection updates for external UI sync.
     */
    _emitSelectionChange() {
        if (typeof this.onSelectionChange !== 'function') return
        this.onSelectionChange(this.getSelectedItemIds())
    }

    /**
     * Emits item change updates for external UI sync.
     */
    _emitItemChange() {
        if (typeof this.onItemChange === 'function') {
            this.onItemChange()
            return
        }
        this.render()
    }

    /**
     * Emits an item-editor request (for example, opening a picker in the objects panel).
     * @param {{ itemId: string, type: string }} request
     */
    _emitItemEditorRequest(request) {
        if (typeof this.onItemEditorRequest !== 'function') return
        this.onItemEditorRequest(request)
    }

    /**
     * Queues a render on the next animation frame for interactive updates.
     */
    _queueRender() {
        if (this._interactionFrame) return
        this._interactionFrame = window.requestAnimationFrame(() => {
            this._interactionFrame = null
            this.render()
        })
    }

    /**
     * Writes preview interaction logs when debugging is enabled.
     * @param {string} event
     * @param {object} payload
     */
    _debugLog(event, payload) {
        if (!window.__LABEL_DEBUG_INTERACTIONS) return
        console.log(`[PreviewRenderer] ${event}`, payload)
    }

    /**
     * Resolves template values for the current render pass.
     * @param {Record<string, string> | undefined} values
     * @returns {Record<string, string>}
     */
    _resolveParameterValues(values) {
        if (values && typeof values === 'object') {
            return values
        }
        return this._templateValues && typeof this._templateValues === 'object' ? this._templateValues : {}
    }
}
