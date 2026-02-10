import { InteractionUtils } from '../InteractionUtils.mjs'
import { QrSizeUtils } from '../QrSizeUtils.mjs'
import { Media } from 'labelprinterkit-web/src/index.mjs'
import { ItemsEditorImageSupport } from './ItemsEditorImageSupport.mjs'
import { PreviewRendererRender } from './PreviewRendererRender.mjs'

/**
 * Interaction layer for selection, dragging, resizing, and inline editing.
 */
export class PreviewRendererInteractions extends PreviewRendererRender {
    /**
     * Ensures the interaction layer exists for InteractJS targets.
     * @returns {HTMLDivElement}
     */
    _ensureInteractionLayer() {
        if (this._interactionLayer) return this._interactionLayer
        const layer = document.createElement('div')
        layer.className = 'preview-interaction-layer'
        layer.style.position = 'absolute'
        layer.style.left = '0'
        layer.style.top = '0'
        layer.style.pointerEvents = 'auto'
        layer.style.zIndex = '3'
        layer.addEventListener('pointerdown', this._handleLayerPointerDown)
        layer.addEventListener('contextmenu', this._handleInteractionContextMenu)
        if (this.els.canvasWrap) {
            this.els.canvasWrap.appendChild(layer)
        }
        this._interactionLayer = layer
        return layer
    }

    /**
     * Aligns the interaction layer with the preview canvas.
     * @param {DOMRect} previewRect
     * @param {DOMRect | undefined} wrapRect
     */
    _syncInteractionLayer(previewRect, wrapRect) {
        const layer = this._interactionLayer
        if (!layer || !wrapRect) return
        if (!previewRect.width || !previewRect.height) return
        const scrollLeft = Number(this.els.canvasWrap?.scrollLeft || 0)
        const scrollTop = Number(this.els.canvasWrap?.scrollTop || 0)
        const offsetLeft = previewRect.left - wrapRect.left + scrollLeft
        const offsetTop = previewRect.top - wrapRect.top + scrollTop
        layer.style.left = `${offsetLeft}px`
        layer.style.top = `${offsetTop}px`
        layer.style.width = `${previewRect.width}px`
        layer.style.height = `${previewRect.height}px`
    }

    /**
     * Syncs hitbox elements for all interactive items.
     */
    _syncHitboxes() {
        const layer = this._interactionLayer
        if (!layer) return
        const seen = new Set()
        for (const entry of this._interactiveItems) {
            const id = entry.id
            seen.add(id)
            let element = this._interactionElements.get(id)
            if (!element) {
                element = this._createHitboxElement(id)
                layer.appendChild(element)
                this._interactionElements.set(id, element)
            }
            element.style.width = `${Math.max(1, entry.boundsCss.width)}px`
            element.style.height = `${Math.max(1, entry.boundsCss.height)}px`
            element.style.left = `${entry.boundsCss.x}px`
            element.style.top = `${entry.boundsCss.y}px`
            element.dataset.itemId = id
            this._ensureInteractable(element)
        }
        for (const [id, element] of this._interactionElements.entries()) {
            if (!seen.has(id)) {
                this._destroyInteractable(id)
                element.remove()
                this._interactionElements.delete(id)
            }
        }
    }

    /**
     * Creates a hitbox element for an interactive item.
     * @param {string} itemId
     * @returns {HTMLDivElement}
     */
    _createHitboxElement(itemId) {
        const element = document.createElement('div')
        element.className = 'preview-hitbox'
        element.dataset.itemId = itemId
        element.style.position = 'absolute'
        element.style.left = '0'
        element.style.top = '0'
        element.style.pointerEvents = 'auto'
        element.style.background = 'transparent'
        element.style.touchAction = 'none'
        element.addEventListener('pointerdown', this._handleHitboxPointerDown)
        element.addEventListener('dblclick', this._handleHitboxDoubleClick)
        element.addEventListener('pointerenter', this._handleHitboxEnter)
        element.addEventListener('pointerleave', this._handleHitboxLeave)
        return element
    }

    /**
     * Ensures an InteractJS instance exists for the hitbox element.
     * @param {HTMLElement} element
     */
    _ensureInteractable(element) {
        const itemId = element.dataset.itemId
        if (!itemId || this._interactables.has(itemId)) return
        const interact = this._requireInteract()
        const interactable = interact(element).draggable({
            listeners: {
                start: this._handleInteractDragStart,
                move: this._handleInteractDragMove,
                end: this._handleInteractDragEnd
            }
        })
        if (this._enablePreviewResize) {
            interactable.resizable({
                edges: { left: true, right: true, top: true, bottom: true },
                listeners: {
                    start: this._handleInteractResizeStart,
                    move: this._handleInteractResizeMove,
                    end: this._handleInteractResizeEnd
                }
            })
        }
        if (typeof interactable.actionChecker === 'function') {
            interactable.actionChecker((pointer, event, action, _interactable, targetElement) =>
                this._resolvePointerAction(pointer, event, targetElement, action)
            )
        }
        if (typeof interactable.styleCursor === 'function') {
            interactable.styleCursor(true)
        }
        if (typeof interactable.cursorChecker === 'function') {
            interactable.cursorChecker(this._getInteractCursor)
        }
        this._interactables.set(itemId, interactable)
    }

    /**
     * Tears down the InteractJS instance for an item id.
     * @param {string} itemId
     */
    _destroyInteractable(itemId) {
        const interactable = this._interactables.get(itemId)
        if (!interactable) return
        interactable.unset()
        this._interactables.delete(itemId)
    }

    /**
     * Gets the interactive entry for an event target.
     * @param {Event} event
     * @returns {{ id: string, type: string, item: object, bounds: object, boundsCss: object } | null}
     */
    _getEntryFromEvent(event) {
        const target = event.currentTarget
        const itemId = target?.dataset?.itemId
        if (!itemId) return null
        return this._interactiveItemsById.get(itemId) || null
    }

    /**
     * Gets the interactive entry for a hitbox target element.
     * @param {HTMLElement | null | undefined} targetElement
     * @returns {{ id: string, type: string, item: object, bounds: object, boundsCss: object } | null}
     */
    _getEntryFromTargetElement(targetElement) {
        const itemId = targetElement?.dataset?.itemId
        if (!itemId) return null
        return this._interactiveItemsById.get(itemId) || null
    }

    /**
     * Returns the allowed resize handles for a specific interactive entry.
     * @param {{ item?: object } | null | undefined} entry
     * @returns {string[]}
     */
    _getAllowedResizeHandlesForEntry(entry) {
        return InteractionUtils.getAllowedResizeHandleNames(entry?.item)
    }

    /**
     * Checks whether a handle is allowed for a specific interactive entry.
     * @param {string | null | undefined} handle
     * @param {{ item?: object } | null | undefined} entry
     * @returns {boolean}
     */
    _isResizeHandleAllowed(handle, entry) {
        if (!handle || handle === 'move') return false
        return this._getAllowedResizeHandlesForEntry(entry).includes(handle)
    }

    /**
     * Handles hitbox hover entry to show resize handles.
     * @param {PointerEvent} event
     */
    _handleHitboxEnter(event) {
        const entry = this._getEntryFromEvent(event)
        if (!entry) return
        this._hoverItemId = entry.id
        this._drawOverlay()
    }

    /**
     * Handles hitbox hover leave to hide resize handles.
     * @param {PointerEvent} event
     */
    _handleHitboxLeave(event) {
        if (this._interaction) return
        const entry = this._getEntryFromEvent(event)
        if (!entry) return
        if (this._activeItemId === entry.id) return
        if (this._hoverItemId === entry.id) {
            this._hoverItemId = null
        }
        this._drawOverlay()
    }

    /**
     * Handles hitbox pointer down to update selection.
     * Ctrl/Cmd toggles additive multi-selection.
     * @param {PointerEvent} event
     */
    _handleHitboxPointerDown(event) {
        if (this._inlineTextEditor) {
            this._commitInlineTextEdit({ applyChanges: true })
        }
        const entry = this._getEntryFromEvent(event)
        if (!entry) return
        const isAdditive = InteractionUtils.isAdditiveSelectionModifier(event)
        if (isAdditive) {
            // Keep modifier-click dedicated to additive selection in the editor.
            event.preventDefault()
            event.stopImmediatePropagation()
        }
        if (!isAdditive && entry.type === 'image' && Number(event.detail) >= 2) {
            event.preventDefault()
            event.stopImmediatePropagation()
            this._activeItemId = entry.id
            this._hoverItemId = entry.id
            this._replaceImageFromPicker(entry.item)
            this._drawOverlay()
            return
        }
        if (!isAdditive && entry.type === 'icon' && Number(event.detail) >= 2) {
            event.preventDefault()
            event.stopImmediatePropagation()
            this._openIconPickerFromPreview(entry)
            return
        }
        if (!isAdditive && entry.type === 'text' && Number(event.detail) >= 2) {
            // Fallback for environments where `dblclick` may be swallowed by drag handling.
            event.preventDefault()
            event.stopImmediatePropagation()
            const nextSelection = new Set([entry.id])
            let selectionChanged = nextSelection.size !== this._selectedItemIds.size
            if (!selectionChanged) {
                for (const id of nextSelection) {
                    if (!this._selectedItemIds.has(id)) {
                        selectionChanged = true
                        break
                    }
                }
            }
            if (selectionChanged) {
                this._selectedItemIds = nextSelection
                this._emitSelectionChange()
            }
            this._activeItemId = entry.id
            this._hoverItemId = entry.id
            this._startInlineTextEdit(entry)
            this._drawOverlay()
            return
        }
        const previousIds = Array.from(this._selectedItemIds)
        const nextIds = InteractionUtils.resolveSelectionIds(entry.id, previousIds, isAdditive)
        const nextSelection = new Set(nextIds)
        let selectionChanged = nextSelection.size !== this._selectedItemIds.size
        if (!selectionChanged) {
            for (const id of nextSelection) {
                if (!this._selectedItemIds.has(id)) {
                    selectionChanged = true
                    break
                }
            }
        }
        if (selectionChanged) {
            this._selectedItemIds = nextSelection
        }
        if (this._selectedItemIds.has(entry.id)) {
            this._activeItemId = entry.id
        } else if (this._activeItemId === entry.id) {
            this._activeItemId = null
        }
        this._hoverItemId = entry.id
        if (selectionChanged) {
            this._emitSelectionChange()
        }
        this._drawOverlay()
    }

    /**
     * Handles text hitbox double click to enable inline text editing.
     * @param {MouseEvent} event
     */
    _handleHitboxDoubleClick(event) {
        const entry = this._getEntryFromEvent(event)
        if (!entry) return
        if (InteractionUtils.isAdditiveSelectionModifier(event)) return
        if (entry.type === 'image') {
            event.preventDefault()
            event.stopImmediatePropagation()
            this._activeItemId = entry.id
            this._hoverItemId = entry.id
            this._replaceImageFromPicker(entry.item)
            this._drawOverlay()
            return
        }
        if (entry.type === 'icon') {
            event.preventDefault()
            event.stopImmediatePropagation()
            this._openIconPickerFromPreview(entry)
            return
        }
        if (entry.type !== 'text') return
        event.preventDefault()
        event.stopImmediatePropagation()
        const nextSelection = new Set([entry.id])
        let selectionChanged = nextSelection.size !== this._selectedItemIds.size
        if (!selectionChanged) {
            for (const id of nextSelection) {
                if (!this._selectedItemIds.has(id)) {
                    selectionChanged = true
                    break
                }
            }
        }
        if (selectionChanged) {
            this._selectedItemIds = nextSelection
            this._emitSelectionChange()
        }
        this._activeItemId = entry.id
        this._hoverItemId = entry.id
        this._startInlineTextEdit(entry)
        this._drawOverlay()
    }

    /**
     * Selects an icon item and asks the app shell to open its icon picker in the objects panel.
     * @param {{ id: string, type: string }} entry
     */
    _openIconPickerFromPreview(entry) {
        if (!entry || entry.type !== 'icon') return
        const nextSelection = new Set([entry.id])
        let selectionChanged = nextSelection.size !== this._selectedItemIds.size
        if (!selectionChanged) {
            for (const id of nextSelection) {
                if (!this._selectedItemIds.has(id)) {
                    selectionChanged = true
                    break
                }
            }
        }
        if (selectionChanged) {
            this._selectedItemIds = nextSelection
            this._emitSelectionChange()
        }
        this._activeItemId = entry.id
        this._hoverItemId = entry.id
        this._emitItemEditorRequest({ itemId: entry.id, type: entry.type })
        this._drawOverlay()
    }

    /**
     * Handles layer pointer down to clear selection when clicking empty space.
     * @param {PointerEvent} event
     */
    _handleLayerPointerDown(event) {
        if (this._inlineTextEditor) {
            this._commitInlineTextEdit({ applyChanges: true })
        }
        if (event.target !== this._interactionLayer) return
        if (InteractionUtils.isAdditiveSelectionModifier(event)) {
            event.preventDefault()
            return
        }
        if (!this._selectedItemIds.size) return
        this._selectedItemIds.clear()
        this._activeItemId = null
        this._hoverItemId = null
        this._emitSelectionChange()
        this._drawOverlay()
    }

    /**
     * Starts inline editing for a text entry on the preview.
     * @param {{ id: string, type: string, item: object }} entry
     */
    _startInlineTextEdit(entry) {
        if (!entry || entry.type !== 'text') return
        const layer = this._interactionLayer
        if (!layer) return
        this._commitInlineTextEdit({ applyChanges: true })
        const editor = document.createElement('input')
        editor.type = 'text'
        editor.className = 'preview-inline-text-editor'
        editor.value = String(entry.item?.text || '')
        editor.dataset.itemId = entry.id
        editor.addEventListener('keydown', this._handleInlineTextEditorKeyDown)
        editor.addEventListener('blur', this._handleInlineTextEditorBlur)
        editor.addEventListener('pointerdown', (event) => event.stopPropagation())
        layer.appendChild(editor)
        this._inlineTextEditor = editor
        this._inlineTextItemId = entry.id
        this._syncInlineTextEditor()
        editor.focus()
        editor.select()
    }

    /**
     * Commits or cancels the active inline text edit.
     * @param {{ applyChanges?: boolean }} [options]
     */
    _commitInlineTextEdit(options = {}) {
        const { applyChanges = true } = options
        const editor = this._inlineTextEditor
        const itemId = this._inlineTextItemId
        if (!editor || !itemId) return
        let changed = false
        if (applyChanges) {
            const entry = this._interactiveItemsById.get(itemId)
            const item = entry?.item || this.state.items.find((candidate) => candidate.id === itemId)
            if (item && item.type === 'text') {
                const nextValue = String(editor.value ?? '')
                if (nextValue !== String(item.text ?? '')) {
                    item.text = nextValue
                    changed = true
                }
            }
        }
        editor.removeEventListener('keydown', this._handleInlineTextEditorKeyDown)
        editor.removeEventListener('blur', this._handleInlineTextEditorBlur)
        editor.remove()
        this._inlineTextEditor = null
        this._inlineTextItemId = null
        if (changed) {
            this._emitItemChange()
            return
        }
        this._drawOverlay()
    }

    /**
     * Syncs the inline text editor position with the current text item bounds.
     */
    _syncInlineTextEditor() {
        if (!this._inlineTextEditor || !this._inlineTextItemId) return
        const entry = this._interactiveItemsById.get(this._inlineTextItemId)
        if (!entry || entry.type !== 'text') {
            this._commitInlineTextEdit({ applyChanges: true })
            return
        }
        const bounds = entry.boundsCss || { x: 0, y: 0, width: 1, height: 1 }
        const width = Math.max(26, Math.round(bounds.width))
        const height = Math.max(18, Math.round(bounds.height))
        const fontSize = Math.max(9, Math.round(height * 0.85))
        this._inlineTextEditor.style.left = `${Math.round(bounds.x)}px`
        this._inlineTextEditor.style.top = `${Math.round(bounds.y)}px`
        this._inlineTextEditor.style.width = `${width}px`
        this._inlineTextEditor.style.height = `${height}px`
        this._inlineTextEditor.style.fontSize = `${fontSize}px`
        this._inlineTextEditor.style.fontFamily = entry.item?.fontFamily || 'sans-serif'
    }

    /**
     * Handles inline text editor keyboard shortcuts.
     * @param {KeyboardEvent} event
     */
    _handleInlineTextEditorKeyDown(event) {
        event.stopPropagation()
        if (event.key === 'Enter') {
            event.preventDefault()
            this._commitInlineTextEdit({ applyChanges: true })
            return
        }
        if (event.key === 'Escape') {
            event.preventDefault()
            this._commitInlineTextEdit({ applyChanges: false })
        }
    }

    /**
     * Handles inline text editor blur to commit changes.
     */
    _handleInlineTextEditorBlur() {
        this._commitInlineTextEdit({ applyChanges: true })
    }

    /**
     * Prompts the user to replace an image item source from disk.
     * @param {object} item
     */
    _replaceImageFromPicker(item) {
        if (!item || item.type !== 'image') return
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.hidden = true
        input.addEventListener('change', async () => {
            const file = input.files?.[0] || null
            if (!file) return
            await ItemsEditorImageSupport.loadImageFile({
                item,
                file,
                state: this.state,
                translate: this.translate,
                setStatus: this.setStatus,
                render: this.render.bind(this),
                onChange: () => this._emitItemChange()
            })
            input.remove()
        })
        document.body.appendChild(input)
        input.click()
    }

    /**
     * Suppresses browser context menus for modifier-click interactions.
     * @param {MouseEvent} event
     */
    _handleInteractionContextMenu(event) {
        if (InteractionUtils.isAdditiveSelectionModifier(event)) {
            event.preventDefault()
        }
    }

    /**
     * Resolves the cursor for InteractJS pointer actions.
     * @param {{ name?: string, edges?: { left?: boolean, right?: boolean, top?: boolean, bottom?: boolean } } | null} action
     * @returns {string}
     */
    _getInteractCursor(action) {
        if (!action) return ''
        if (action.name === 'resize') {
            const handle = InteractionUtils.getHandleFromEdges(action.edges)
            return InteractionUtils.getCursorForHandle(handle)
        }
        if (action.name === 'drag') {
            return InteractionUtils.getCursorForHandle('move')
        }
        return ''
    }

    /**
     * Resolves the intended InteractJS action from pointer position.
     * Resize is active only when the pointer is on a visible handle dot.
     * @param {object} pointer
     * @param {object} event
     * @param {HTMLElement | null | undefined} targetElement
     * @param {{ name?: string, edges?: { left?: boolean, right?: boolean, top?: boolean, bottom?: boolean } } | null | undefined} fallbackAction
     * @returns {{ name: 'drag' | 'resize', edges: { left?: boolean, right?: boolean, top?: boolean, bottom?: boolean } | null} | null}
     */
    _resolvePointerAction(pointer, event, targetElement, fallbackAction) {
        if (InteractionUtils.isAdditiveSelectionModifier(event) || InteractionUtils.isAdditiveSelectionModifier(pointer)) {
            return null
        }
        const entry = this._getEntryFromTargetElement(targetElement)
        const handle = this._getPointerHandle(pointer, event, targetElement, entry)
        if (this._enablePreviewResize && handle && handle !== 'move') {
            const edges = InteractionUtils.getEdgesFromHandle(handle)
            if (edges) {
                return { name: 'resize', edges }
            }
        }
        if (handle === 'move') {
            return { name: 'drag', edges: null }
        }
        if (fallbackAction?.name === 'resize' && fallbackAction.edges) {
            const fallbackHandle = InteractionUtils.getHandleFromEdges(fallbackAction.edges)
            if (this._isResizeHandleAllowed(fallbackHandle, entry)) {
                return { name: 'resize', edges: fallbackAction.edges }
            }
            return { name: 'drag', edges: null }
        }
        if (fallbackAction?.name === 'drag') {
            return { name: 'drag', edges: null }
        }
        return { name: 'drag', edges: null }
    }

    /**
     * Finds the handle under the pointer within a hitbox element.
     * @param {object} pointer
     * @param {object} event
     * @param {HTMLElement | null | undefined} targetElement
     * @param {{ item?: object } | null | undefined} [entry]
     * @returns {string | null}
     */
    _getPointerHandle(pointer, event, targetElement, entry = null) {
        if (!targetElement) return null
        const rect = targetElement.getBoundingClientRect()
        if (!rect.width || !rect.height) return null
        const clientX = Number.isFinite(event?.clientX) ? event.clientX : pointer?.clientX
        const clientY = Number.isFinite(event?.clientY) ? event.clientY : pointer?.clientY
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null
        const point = { x: clientX - rect.left, y: clientY - rect.top }
        const bounds = { x: 0, y: 0, width: rect.width, height: rect.height }
        // Resize should trigger only on the visible dots, not broad edge zones.
        const hitRadius = Math.max(1, this._handleRadius || 3)
        const allowedHandles = this._getAllowedResizeHandlesForEntry(entry)
        return InteractionUtils.getHandleAtPoint(point, bounds, hitRadius, allowedHandles)
    }

    /**
     * Handles InteractJS drag start.
     * @param {object} event
     */
    _handleInteractDragStart(event) {
        if (InteractionUtils.isAdditiveSelectionModifier(event)) return
        const entry = this._getEntryFromEvent(event)
        if (!entry) return
        if (!this._selectedItemIds.has(entry.id)) {
            this._selectedItemIds.clear()
            this._selectedItemIds.add(entry.id)
            this._emitSelectionChange()
        }
        this._activeItemId = entry.id
        this._hoverItemId = entry.id
        const dragItemIds = InteractionUtils.resolveDragItemIds(entry.id, this._selectedItemIds)
        const dragEntries = dragItemIds
            .map((id) => this._interactiveItemsById.get(id) || null)
            .filter((candidate) => !!candidate)
        this._interaction = {
            type: 'drag',
            entries: dragEntries
        }
        this._debugLog('drag:start', {
            id: entry.id,
            count: dragEntries.length,
            xOffset: entry.item.xOffset || 0,
            yOffset: entry.item.yOffset || 0
        })
        this._drawOverlay()
    }

    /**
     * Handles InteractJS drag move.
     * @param {object} event
     */
    _handleInteractDragMove(event) {
        if (!this._interaction || this._interaction.type !== 'drag') return
        const entry = this._getEntryFromEvent(event)
        if (!entry) return
        const dxDots = (event.dx || 0) * this._dotsPerPxX
        const dyDots = (event.dy || 0) * this._dotsPerPxY
        const dragEntries = this._interaction.entries || []
        dragEntries.forEach((dragEntry) => {
            const item = dragEntry.item
            item.xOffset = Math.round((item.xOffset || 0) + dxDots)
            item.yOffset = Math.round((item.yOffset || 0) + dyDots)
        })
        this._debugLog('drag:move', {
            id: entry.id,
            count: dragEntries.length,
            dxDots,
            dyDots,
            xOffset: entry.item.xOffset || 0,
            yOffset: entry.item.yOffset || 0
        })
        this._queueRender()
    }

    /**
     * Handles InteractJS drag end.
     * @param {object} event
     */
    _handleInteractDragEnd(event) {
        if (!this._interaction || this._interaction.type !== 'drag') return
        const entry = this._getEntryFromEvent(event)
        if (entry) {
            this._hoverItemId = entry.id
            this._debugLog('drag:end', {
                id: entry.id,
                count: this._interaction?.entries?.length || 0,
                xOffset: entry.item.xOffset || 0,
                yOffset: entry.item.yOffset || 0
            })
        }
        this._interaction = null
        this._activeItemId = null
        this._drawOverlay()
    }

    /**
     * Handles InteractJS resize start.
     * @param {object} event
     */
    _handleInteractResizeStart(event) {
        if (!this._enablePreviewResize) return
        if (InteractionUtils.isAdditiveSelectionModifier(event)) return
        const entry = this._getEntryFromEvent(event)
        if (!entry) return
        if (!this._selectedItemIds.has(entry.id)) {
            this._selectedItemIds.clear()
            this._selectedItemIds.add(entry.id)
            this._emitSelectionChange()
        }
        const item = entry.item
        this._activeItemId = entry.id
        this._hoverItemId = entry.id
        this._interaction = {
            type: 'resize',
            handle: InteractionUtils.getHandleFromEdges(event.edges),
            item,
            startRect: {
                width: event.rect?.width || entry.boundsCss.width,
                height: event.rect?.height || entry.boundsCss.height
            },
            startItem: {
                xOffset: item.xOffset || 0,
                yOffset: item.yOffset || 0,
                width: item.width || 0,
                height: item.height || 0,
                fontSize: item.fontSize || 16
            }
        }
        this._debugLog('resize:start', {
            id: entry.id,
            edges: event.edges || null,
            shiftKey: !!event.shiftKey
        })
        this._drawOverlay()
    }

    /**
     * Handles InteractJS resize move.
     * @param {object} event
     */
    _handleInteractResizeMove(event) {
        if (!this._interaction || this._interaction.type !== 'resize') return
        const entry = this._getEntryFromEvent(event)
        if (!entry) return
        const item = entry.item
        const deltaLeft = (event.deltaRect?.left || 0) * this._dotsPerPxX
        const deltaTop = (event.deltaRect?.top || 0) * this._dotsPerPxY
        if (item.type === 'shape') {
            const widthDots = Math.max(4, Math.round((event.rect?.width || 0) * this._dotsPerPxX))
            const heightDots = Math.max(2, Math.round((event.rect?.height || 0) * this._dotsPerPxY))
            item.width = widthDots
            item.height = heightDots
            if (deltaLeft) {
                item.xOffset = Math.round((item.xOffset || 0) + deltaLeft)
            }
            if (deltaTop) {
                item.yOffset = Math.round((item.yOffset || 0) + deltaTop)
            }
        } else if (item.type === 'image') {
            const widthDots = Math.max(8, Math.round((event.rect?.width || 0) * this._dotsPerPxX))
            const heightDots = Math.max(8, Math.round((event.rect?.height || 0) * this._dotsPerPxY))
            const media = Media[this.state.media] || Media.W24
            const printWidth = Math.max(8, media?.printArea || 128)
            const constrained = this._constrainImageDimensionsToPrintWidth(
                widthDots,
                heightDots,
                printWidth,
                this.state.orientation === 'horizontal'
            )
            item.width = constrained.width
            item.height = constrained.height
            if (deltaLeft) {
                item.xOffset = Math.round((item.xOffset || 0) + deltaLeft)
            }
            if (deltaTop) {
                item.yOffset = Math.round((item.yOffset || 0) + deltaTop)
            }
        } else if (item.type === 'icon') {
            const widthDots = Math.max(8, Math.round((event.rect?.width || 0) * this._dotsPerPxX))
            const heightDots = Math.max(8, Math.round((event.rect?.height || 0) * this._dotsPerPxY))
            const media = Media[this.state.media] || Media.W24
            const printWidth = Math.max(8, media?.printArea || 128)
            const constrained = this._constrainImageDimensionsToPrintWidth(
                widthDots,
                heightDots,
                printWidth,
                this.state.orientation === 'horizontal'
            )
            item.width = constrained.width
            item.height = constrained.height
            if (deltaLeft) {
                item.xOffset = Math.round((item.xOffset || 0) + deltaLeft)
            }
            if (deltaTop) {
                item.yOffset = Math.round((item.yOffset || 0) + deltaTop)
            }
        } else if (item.type === 'qr') {
            const widthDots = Math.max(1, Math.round((event.rect?.width || 0) * this._dotsPerPxX))
            const heightDots = Math.max(1, Math.round((event.rect?.height || 0) * this._dotsPerPxY))
            const sizeDots = QrSizeUtils.clampQrSizeToLabel(this.state, Math.max(widthDots, heightDots))
            item.size = sizeDots
            item.height = sizeDots
            if (deltaLeft) {
                item.xOffset = Math.round((item.xOffset || 0) + deltaLeft)
            }
            if (deltaTop) {
                item.yOffset = Math.round((item.yOffset || 0) + deltaTop)
            }
        } else if (item.type === 'text') {
            const startRect = this._interaction.startRect
            const scaleX = startRect.width ? (event.rect?.width || startRect.width) / startRect.width : 1
            const scaleY = startRect.height ? (event.rect?.height || startRect.height) / startRect.height : 1
            const scale = Math.max(scaleX, scaleY)
            item.fontSize = Math.max(8, Math.round((this._interaction.startItem.fontSize || 16) * scale))
            if (deltaLeft) {
                item.xOffset = Math.round((item.xOffset || 0) + deltaLeft)
            }
            if (deltaTop) {
                item.yOffset = Math.round((item.yOffset || 0) + deltaTop)
            }
        }
        this._debugLog('resize:move', {
            id: entry.id,
            type: item.type,
            rectWidth: event.rect?.width || 0,
            rectHeight: event.rect?.height || 0,
            deltaLeft,
            deltaTop
        })
        this._queueRender()
    }

    /**
     * Handles InteractJS resize end.
     * @param {object} event
     */
    _handleInteractResizeEnd(event) {
        if (!this._interaction || this._interaction.type !== 'resize') return
        const entry = this._getEntryFromEvent(event)
        if (entry) {
            this._hoverItemId = entry.id
            this._debugLog('resize:end', {
                id: entry.id
            })
        }
        this._interaction = null
        this._activeItemId = null
        this._drawOverlay()
    }
}
