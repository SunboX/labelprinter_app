import { QrSizeUtils } from '../QrSizeUtils.mjs'
import { RotationUtils } from '../RotationUtils.mjs'
import { AiInventoryRebuildUtils } from './AiInventoryRebuildUtils.mjs'
import { AiRebuildPostProcessUtils } from './AiRebuildPostProcessUtils.mjs'
/** Allowlisted action runtime used by the in-app assistant. */
export class AiActionBridge {
    #translate = (key) => key
    #shapeTypeIds = []
    #debugEnabled = false
    /**
     * @param {object} context
     * @param {object} context.els
     * @param {object} context.state
     * @param {import('./ItemsEditor.mjs').ItemsEditor} context.itemsEditor
     * @param {import('./ParameterPanel.mjs').ParameterPanel} context.parameterPanel
     * @param {import('./PreviewRenderer.mjs').PreviewRenderer} context.previewRenderer
     * @param {import('./PrintController.mjs').PrintController} context.printController
     * @param {(key: string, params?: Record<string, string | number>) => string} context.translate
     * @param {Array<{ id: string }>} context.shapeTypes
     */
    constructor(context) {
        this.els = context.els
        this.state = context.state
        this.itemsEditor = context.itemsEditor
        this.parameterPanel = context.parameterPanel
        this.previewRenderer = context.previewRenderer
        this.printController = context.printController
        this.translate = context.translate
        this.#shapeTypeIds = Array.isArray(context.shapeTypes)
            ? context.shapeTypes.map((shape) => String(shape?.id || '')).filter(Boolean)
            : []
        this.#debugEnabled = this.#resolveDebugEnabled()
    }
    /**
     * Sets translation callback.
     * @param {(key: string, params?: Record<string, string | number>) => string} callback
     */
    set translate(callback) {
        this.#translate = typeof callback === 'function' ? callback : (key) => key
    }
    /**
     * Returns translation callback.
     * @returns {(key: string, params?: Record<string, string | number>) => string}
     */
    get translate() {
        return this.#translate
    }
    /**
     * Returns a compact UI state snapshot used as model context.
     * @returns {Record<string, any>}
     */
    getUiStateSnapshot() {
        const selectedIds = this.previewRenderer.getSelectedItemIds()
        const items = this.state.items.map((item, index) => ({
            index,
            id: item.id,
            type: item.type,
            xOffset: Number(item.xOffset || 0),
            yOffset: Number(item.yOffset || 0),
            rotation: Number(item.rotation || 0),
            width: Number(item.width || item.size || 0),
            height: Number(item.height || item.size || 0),
            textPreview: typeof item.text === 'string' ? item.text.slice(0, 120) : undefined,
            dataPreview: typeof item.data === 'string' ? item.data.slice(0, 120) : undefined,
            textBold: Boolean(item.textBold),
            textItalic: Boolean(item.textItalic),
            textUnderline: Boolean(item.textUnderline)
        }))
        return {
            backend: this.state.backend,
            printer: this.state.printer,
            media: this.state.media,
            mediaLengthMm: this.state.mediaLengthMm,
            resolution: this.state.resolution,
            orientation: this.state.orientation,
            selectedItemIds: selectedIds,
            parameters: Array.isArray(this.state.parameters) ? this.state.parameters : [],
            parameterDataRows: Array.isArray(this.state.parameterDataRows) ? this.state.parameterDataRows.length : 0,
            items
        }
    }
    /**
     * Returns assistant action capabilities for backend prompts.
     * @returns {Record<string, any>}
     */
    getActionCapabilities() {
        return {
            actions: [
                'add_item',
                'update_item',
                'remove_item',
                'clear_items',
                'set_label',
                'select_items',
                'align_selected',
                'print',
                'save_project',
                'share_project'
            ],
            itemTypes: ['text', 'qr', 'barcode', 'image', 'icon', 'shape'],
            shapeTypes: this.#shapeTypeIds,
            alignModes: ['left', 'center', 'right', 'top', 'middle', 'bottom'],
            alignReferences: ['selection', 'largest', 'smallest', 'label'],
            itemProperties: {
                text: ['text', 'fontFamily', 'fontSize', 'textBold', 'textItalic', 'textUnderline', 'xOffset', 'yOffset', 'rotation'],
                qr: ['data', 'size', 'xOffset', 'yOffset', 'rotation', 'qrErrorCorrectionLevel', 'qrVersion', 'qrEncodingMode'],
                barcode: [
                    'data',
                    'width',
                    'height',
                    'xOffset',
                    'yOffset',
                    'rotation',
                    'barcodeFormat',
                    'barcodeShowText',
                    'barcodeModuleWidth',
                    'barcodeMargin'
                ],
                image: ['imageData', 'imageName', 'width', 'height', 'xOffset', 'yOffset', 'rotation', 'imageDither', 'imageThreshold', 'imageSmoothing', 'imageInvert'],
                icon: ['iconId', 'width', 'height', 'xOffset', 'yOffset', 'rotation'],
                shape: ['shapeType', 'width', 'height', 'strokeWidth', 'cornerRadius', 'sides', 'xOffset', 'yOffset', 'rotation']
            },
            notes: [
                'Text styling supports textBold, textItalic, textUnderline.',
                'QR codes are always square. Use the size property. Width/height map to size for QR items.'
            ]
        }
    }
    /**
     * Executes a list of model-requested editor actions.
     * @param {Array<Record<string, any>>} actions
     * @param {{ forceRebuild?: boolean, allowCreateIfMissing?: boolean, preferredMedia?: string }} [options]
     * @returns {Promise<{ executed: string[], errors: string[] }>}
     */
    async runActions(actions, options = {}) {
        const executed = []
        const errors = []
        const normalizedActions = []
        const safeActions = Array.isArray(actions) ? actions : []
        for (const rawAction of safeActions) {
            try {
                normalizedActions.push(this.#normalizeAction(rawAction))
            } catch (error) {
                errors.push(error?.message || this.translate('assistant.actionUnknownError'))
            }
        }
        const forceRebuild = Boolean(options.forceRebuild)
        if (forceRebuild && !normalizedActions.some((action) => action.action === 'clear_items')) {
            normalizedActions.unshift({ action: 'clear_items' })
        }
        const runContext = {
            touchedItemIds: new Set(),
            allowCreateIfMissing: forceRebuild || Boolean(options.allowCreateIfMissing),
            itemRefs: new Map(),
            itemCounter: 0
        }
        for (const action of normalizedActions) {
            try {
                const summary = await this.#runAction(action, runContext)
                if (summary) executed.push(summary)
            } catch (error) {
                errors.push(error?.message || this.translate('assistant.actionUnknownError'))
            }
        }
        if (forceRebuild) {
            await this.#postProcessRebuildArtifacts(options)
        }
        return { executed, errors }
    }
    /**
     * Normalizes one action payload.
     * @param {Record<string, any>} rawAction
     * @returns {{ action: string, [key: string]: any }}
     */
    #normalizeAction(rawAction) {
        if (!rawAction || typeof rawAction !== 'object') {
            throw new Error(this.translate('assistant.actionInvalid'))
        }
        const rawActionName = String(rawAction.action || '').trim()
        const actionAliases = {
            clear: 'clear_items',
            clear_all: 'clear_items',
            reset_items: 'clear_items',
            reset_canvas: 'clear_items'
        }
        const actionName = actionAliases[rawActionName] || rawActionName
        if (!actionName) {
            throw new Error(this.translate('assistant.actionMissing'))
        }
        return { ...rawAction, action: actionName }
    }
    /**
     * Routes one normalized action to the corresponding allowlisted handler.
     * @param {{ action: string, [key: string]: any }} action
     * @param {{ touchedItemIds: Set<string>, allowCreateIfMissing: boolean }} runContext
     * @returns {Promise<string>}
     */
    async #runAction(action, runContext) {
        switch (action.action) {
            case 'add_item':
                return this.#addItem(action, runContext)
            case 'update_item':
                return this.#updateItem(action, runContext)
            case 'remove_item':
                return this.#removeItem(action)
            case 'clear_items':
                return this.#clearItems()
            case 'set_label':
                return this.#setLabel(action)
            case 'select_items':
                return this.#selectItems(action, runContext)
            case 'align_selected':
                return this.#alignSelected(action, runContext)
            case 'print':
                return this.#printLabels(action)
            case 'save_project':
                return this.#saveProject()
            case 'share_project':
                return this.#shareProject()
            default:
                throw new Error(this.translate('assistant.actionUnsupported', { action: action.action }))
        }
    }
    /**
     * Adds a new item using existing editor add flows.
     * @param {{ itemType?: string, type?: string, shapeType?: string, properties?: Record<string, any> }} action
     * @param {{ touchedItemIds: Set<string> }} runContext
     * @returns {string}
     */
    #addItem(action, runContext) {
        const itemType = String(action.itemType || action.type || '').trim().toLowerCase()
        if (itemType === 'text') this.itemsEditor.addTextItem()
        else if (itemType === 'qr') this.itemsEditor.addQrItem()
        else if (itemType === 'barcode') this.itemsEditor.addBarcodeItem()
        else if (itemType === 'image') this.itemsEditor.addImageItem()
        else if (itemType === 'icon') this.itemsEditor.addIconItem()
        else if (itemType === 'shape') {
            const requestedShapeType = String(action.shapeType || 'rect')
            const shapeType = this.#shapeTypeIds.includes(requestedShapeType) ? requestedShapeType : 'rect'
            this.itemsEditor.addShapeItem(shapeType)
        }
        else throw new Error(this.translate('assistant.actionUnsupportedItemType', { itemType }))

        const createdItem = this.state.items[this.state.items.length - 1]
        if (!createdItem) {
            throw new Error(this.translate('assistant.actionAddFailed'))
        }
        const changes = this.#extractItemChangesPayload(action)
        if (changes && typeof changes === 'object') {
            this.#applyItemChanges(createdItem, changes)
        }
        if (runContext?.itemRefs instanceof Map) {
            const nextIndex = Number(runContext.itemCounter || 0) + 1
            runContext.itemCounter = nextIndex
            runContext.itemRefs.set(`item-${nextIndex}`, createdItem.id)
            const explicitRef = String(action?.itemId || action?.id || action?.ref || '')
                .trim()
                .toLowerCase()
            if (explicitRef && !['selected', 'current', 'first', 'last', 'latest', 'newest', 'recent'].includes(explicitRef)) {
                runContext.itemRefs.set(explicitRef, createdItem.id)
            }
        }
        this.#rememberTouchedItem(runContext, createdItem.id)
        this.previewRenderer.setSelectedItemIds([createdItem.id])
        this.itemsEditor.setSelectedItemIds([createdItem.id])
        this.#renderAfterMutation()
        return this.translate('assistant.actionAddedItem', { type: createdItem.type, id: createdItem.id })
    }
    /**
     * Updates properties of one item.
     * @param {{ itemId?: string, itemIndex?: number, target?: string, changes?: Record<string, any>, properties?: Record<string, any>, itemType?: string, type?: string, shapeType?: string }} action
     * @param {{ touchedItemIds: Set<string>, allowCreateIfMissing: boolean }} runContext
     * @returns {string}
     */
    #updateItem(action, runContext) {
        const workingAction = { ...action }
        const explicitItemId = String(workingAction.itemId || '')
            .trim()
            .toLowerCase()
        const isSemanticPointer = ['selected', 'current', 'first', 'last', 'latest', 'newest', 'recent'].includes(
            explicitItemId
        )
        if (explicitItemId && !isSemanticPointer && runContext?.itemRefs instanceof Map) {
            const mappedId = runContext.itemRefs.get(explicitItemId)
            if (mappedId) {
                workingAction.itemId = mappedId
            }
        }
        const changes = this.#extractItemChangesPayload(action)
        if (!changes || typeof changes !== 'object') {
            throw new Error(this.translate('assistant.actionNoChanges'))
        }
        const item = this.#resolveTargetItem(workingAction)
        if (!item) {
            const hasExplicitPointer = this.#hasExplicitItemPointer(workingAction)
            const pointerToken = String(workingAction.target || workingAction.itemId || '')
                .trim()
                .toLowerCase()
            const isSelectionPointer = pointerToken === 'selected' || pointerToken === 'current'
            if (runContext?.allowCreateIfMissing && (!hasExplicitPointer || !isSelectionPointer)) {
                const fallbackType = this.#inferItemTypeForMissingUpdate(workingAction, changes)
                const summary = this.#addItem(
                    {
                        action: 'add_item',
                        itemType: fallbackType,
                        shapeType: String(workingAction.shapeType || changes.shapeType || 'rect'),
                        properties: changes
                    },
                    runContext
                )
                const createdItem = this.state.items[this.state.items.length - 1]
                if (createdItem?.id && explicitItemId && runContext?.itemRefs instanceof Map) {
                    runContext.itemRefs.set(explicitItemId, createdItem.id)
                }
                return summary
            }
            throw new Error(this.translate('assistant.actionItemNotFound'))
        }
        if (explicitItemId && !isSemanticPointer && runContext?.itemRefs instanceof Map) {
            runContext.itemRefs.set(explicitItemId, item.id)
        }
        const changedKeys = this.#applyItemChanges(item, changes)
        if (!changedKeys.length) {
            throw new Error(this.translate('assistant.actionNoApplicableChanges'))
        }
        this.#rememberTouchedItem(runContext, item.id)
        this.previewRenderer.setSelectedItemIds([item.id])
        this.itemsEditor.setSelectedItemIds([item.id])
        this.#renderAfterMutation()
        return this.translate('assistant.actionUpdatedItem', { id: item.id, keys: changedKeys.join(', ') })
    }
    /**
     * Removes one or multiple items.
     * @param {{ itemId?: string, itemIds?: string[], itemIndex?: number, target?: string }} action
     * @returns {string}
     */
    #removeItem(action) {
        const ids = new Set()
        if (Array.isArray(action.itemIds)) {
            action.itemIds.forEach((rawId) => {
                const normalized = String(rawId || '').trim()
                if (!normalized) return
                const aliasedItem = this.#resolveTargetAlias(normalized)
                ids.add(aliasedItem ? aliasedItem.id : normalized)
            })
        }
        if (!ids.size) {
            const item = this.#resolveTargetItem(action)
            if (item) ids.add(item.id)
        }
        if (!ids.size) {
            throw new Error(this.translate('assistant.actionItemNotFound'))
        }
        const beforeCount = this.state.items.length
        const remainingItems = this.state.items.filter((item) => !ids.has(item.id))
        this.state.items.splice(0, this.state.items.length, ...remainingItems)
        const removedCount = beforeCount - remainingItems.length
        if (!removedCount) {
            throw new Error(this.translate('assistant.actionItemNotFound'))
        }
        const nextSelectedIds = this.previewRenderer.getSelectedItemIds().filter((id) => !ids.has(id))
        this.previewRenderer.setSelectedItemIds(nextSelectedIds)
        this.itemsEditor.setSelectedItemIds(nextSelectedIds)
        this.#renderAfterMutation()
        return this.translate('assistant.actionRemovedItems', { count: removedCount })
    }
    /**
     * Removes all current items and clears selection.
     * @returns {string}
     */
    #clearItems() {
        const removedCount = this.state.items.length
        this.state.items.splice(0, this.state.items.length)
        this.previewRenderer.setSelectedItemIds([])
        this.itemsEditor.setSelectedItemIds([])
        this.#renderAfterMutation()
        return this.translate('assistant.actionRemovedItems', { count: removedCount })
    }
    /**
     * Applies label settings changes via existing form controls.
     * @param {{ settings?: Record<string, any>, backend?: string, printer?: string, media?: string, resolution?: string, orientation?: string, mediaLengthMm?: number | null }} action
     * @returns {string}
     */
    #setLabel(action) {
        const settings = action.settings && typeof action.settings === 'object' ? action.settings : action
        const changed = []
        changed.push(...this.#setSelectValue(this.els.mode, settings.backend, 'backend', 'change'))
        changed.push(...this.#setSelectValue(this.els.printer, settings.printer, 'printer', 'change'))
        changed.push(...this.#setSelectValue(this.els.media, settings.media, 'media', 'change'))
        changed.push(...this.#setSelectValue(this.els.resolution, settings.resolution, 'resolution', 'change'))
        changed.push(...this.#setSelectValue(this.els.orientation, settings.orientation, 'orientation', 'change'))
        if (Object.prototype.hasOwnProperty.call(settings, 'mediaLengthMm') && this.els.mediaLength) {
            const nextValue = settings.mediaLengthMm
            const inputValue = nextValue === null || nextValue === '' ? '' : String(Number(nextValue))
            if (this.els.mediaLength.value !== inputValue) {
                this.els.mediaLength.value = inputValue
                this.els.mediaLength.dispatchEvent(new Event('input', { bubbles: true }))
                changed.push('mediaLengthMm')
            }
        }
        if (!changed.length) {
            throw new Error(this.translate('assistant.actionNoLabelChanges'))
        }
        this.#renderAfterMutation()
        return this.translate('assistant.actionUpdatedLabel', { keys: changed.join(', ') })
    }
    /**
     * Selects items by id.
     * @param {{ itemIds?: string[] }} action
     * @param {{ touchedItemIds: Set<string> }} runContext
     * @returns {string}
     */
    #selectItems(action, runContext) {
        const ids = Array.isArray(action.itemIds)
            ? action.itemIds.map((id) => String(id || '').trim()).filter(Boolean)
            : []
        const resolvedIds = ids.map((id) => {
            const lowered = id.toLowerCase()
            if (runContext?.itemRefs instanceof Map && runContext.itemRefs.has(lowered)) {
                return String(runContext.itemRefs.get(lowered) || '')
            }
            return this.#resolveTargetAlias(id)?.id || id
        })
        const validIds = ids
            .map((_, index) => resolvedIds[index])
            .filter((id, index, entries) => entries.indexOf(id) === index)
            .filter((id) => this.state.items.some((item) => item.id === id))
        this.previewRenderer.setSelectedItemIds(validIds)
        this.itemsEditor.setSelectedItemIds(validIds)
        validIds.forEach((id) => this.#rememberTouchedItem(runContext, id))
        return this.translate('assistant.actionSelectedItems', { count: validIds.length })
    }
    /**
     * Aligns currently selected items.
     * @param {{ mode?: string, reference?: string }} action
     * @param {{ touchedItemIds: Set<string> }} runContext
     * @returns {string}
     */
    #alignSelected(action, runContext) {
        const explicitIds = Array.isArray(action.itemIds)
            ? action.itemIds.map((id) => String(id || '').trim()).filter(Boolean)
            : []
        const validExplicitIds = explicitIds
            .map((id) => {
                const lowered = id.toLowerCase()
                if (runContext?.itemRefs instanceof Map && runContext.itemRefs.has(lowered)) {
                    return String(runContext.itemRefs.get(lowered) || '')
                }
                return this.#resolveTargetAlias(id)?.id || id
            })
            .filter((id) => this.state.items.some((item) => item.id === id))
        if (validExplicitIds.length) {
            this.previewRenderer.setSelectedItemIds(validExplicitIds)
            this.itemsEditor.setSelectedItemIds(validExplicitIds)
        } else if (!explicitIds.length && !this.previewRenderer.getSelectedItemIds().length) {
            const touchedIds = Array.from(runContext.touchedItemIds).filter((id) =>
                this.state.items.some((item) => item.id === id)
            )
            if (touchedIds.length >= 2) {
                this.previewRenderer.setSelectedItemIds(touchedIds)
                this.itemsEditor.setSelectedItemIds(touchedIds)
            }
        }
        const mode = String(action.mode || '').trim()
        const reference = String(action.reference || 'selection').trim()
        const result = this.previewRenderer.alignSelectedItems(mode, reference)
        if (!result.changed) {
            if (result.reason === 'no-selection') {
                throw new Error(this.translate('messages.selectAtLeastOne'))
            }
            if (result.reason === 'need-multiple') {
                throw new Error(this.translate('messages.selectAtLeastTwo'))
            }
            throw new Error(this.translate('messages.nothingToAlign'))
        }
        this.#renderAfterMutation()
        this.previewRenderer.getSelectedItemIds().forEach((id) => this.#rememberTouchedItem(runContext, id))
        return this.translate('assistant.actionAlignedItems', { count: result.count, mode, reference })
    }
    /**
     * Starts printing through the same validation flow as the print button.
     * @param {{ skipBatchConfirm?: boolean }} action
     * @returns {Promise<string>}
     */
    async #printLabels(action) {
        if (this.parameterPanel.hasBlockingErrors()) {
            throw new Error(this.translate('messages.parameterFixBeforePrint'))
        }
        const maps = this.parameterPanel.buildPrintParameterValueMaps()
        const skipBatchConfirm = Boolean(action.skipBatchConfirm)
        if (maps.length > 10 && !skipBatchConfirm) {
            const confirmed = window.confirm(this.translate('messages.printConfirmMany', { count: maps.length }))
            if (!confirmed) {
                throw new Error(this.translate('messages.printCanceled'))
            }
        }
        await this.printController.print(maps)
        return this.translate('assistant.actionPrintStarted', { count: maps.length })
    }
    /**
     * Delegates to the save project button flow.
     * @returns {string}
     */
    #saveProject() {
        if (!this.els.saveProject) {
            throw new Error(this.translate('assistant.actionSaveUnavailable'))
        }
        this.els.saveProject.click()
        return this.translate('assistant.actionSaveTriggered')
    }
    /**
     * Delegates to the share project button flow.
     * @returns {string}
     */
    #shareProject() {
        if (!this.els.shareProject) {
            throw new Error(this.translate('assistant.actionShareUnavailable'))
        }
        this.els.shareProject.click()
        return this.translate('assistant.actionShareTriggered')
    }
    /**
     * Returns one target item resolved from id/index/selection shortcuts.
     * @param {{ itemId?: string, itemIndex?: number, target?: string }} action
     * @returns {Record<string, any> | null}
     */
    #resolveTargetItem(action) {
        if (!Array.isArray(this.state.items) || !this.state.items.length) return null
        const byId = String(action.itemId || '').trim()
        if (byId) {
            const aliasedItem = this.#resolveTargetAlias(byId)
            if (aliasedItem) return aliasedItem
            if (/^\d+$/.test(byId)) {
                const index = Number(byId)
                if (Number.isInteger(index) && index >= 0 && index < this.state.items.length) {
                    return this.state.items[index]
                }
            }
            return this.state.items.find((item) => item.id === byId) || null
        }
        if (Number.isInteger(action.itemIndex)) {
            const index = Number(action.itemIndex)
            if (index >= 0 && index < this.state.items.length) {
                return this.state.items[index]
            }
        }
        const target = String(action.target || 'selected').trim()
        const targetItem = this.#resolveTargetAlias(target)
        if (targetItem) return targetItem
        return null
    }
    /**
     * Resolves semantic target aliases to concrete items.
     * @param {string} rawToken
     * @returns {Record<string, any> | null}
     */
    #resolveTargetAlias(rawToken) {
        const token = String(rawToken || '').trim().toLowerCase()
        if (!token) return null
        if (token === 'selected' || token === 'current') {
            const selectedId = this.previewRenderer.getSelectedItemIds()[0]
            if (!selectedId) return null
            return this.state.items.find((item) => item.id === selectedId) || null
        }
        if (token === 'first') {
            return this.state.items[0] || null
        }
        if (token === 'last' || token === 'latest' || token === 'newest' || token === 'recent') {
            return this.state.items[this.state.items.length - 1] || null
        }
        return null
    }
    /**
     * Returns true when the action explicitly points to a target item.
     * @param {{ itemId?: string, itemIndex?: number, target?: string }} action
     * @returns {boolean}
     */
    #hasExplicitItemPointer(action) {
        if (String(action?.itemId || '').trim()) return true
        if (Number.isInteger(action?.itemIndex)) return true
        if (String(action?.target || '').trim()) return true
        return false
    }
    /**
     * Applies property changes to one item and returns changed keys.
     * @param {Record<string, any>} item
     * @param {Record<string, any>} rawChanges
     * @returns {string[]}
     */
    #applyItemChanges(item, rawChanges) {
        const expandedChanges = this.#expandStructuredChanges(rawChanges)
        const normalizedChanges = this.#normalizeChanges(expandedChanges)
        if (item.type === 'qr') {
            const qrSizeCandidates = [normalizedChanges.size, normalizedChanges.width, normalizedChanges.height]
                .map((entry) => Number(entry))
                .filter((entry) => Number.isFinite(entry))
            if (qrSizeCandidates.length) {
                normalizedChanges.size = Math.max(...qrSizeCandidates)
            }
            delete normalizedChanges.width
            delete normalizedChanges.height
        }
        const changedKeys = []
        Object.entries(normalizedChanges).forEach(([key, value]) => {
            switch (key) {
                case 'text':
                case 'fontFamily':
                case 'iconId':
                case 'barcodeFormat':
                case 'qrErrorCorrectionLevel':
                case 'qrEncodingMode':
                case 'imageDither':
                case 'imageSmoothing': {
                    if (typeof value !== 'string') return
                    item[key] = value
                    changedKeys.push(key)
                    return
                }
                case 'data': {
                    if (!['qr', 'barcode'].includes(item.type)) return
                    if (typeof value !== 'string') return
                    item.data = value
                    changedKeys.push(key)
                    return
                }
                case 'shapeType': {
                    const shapeType = String(value || '')
                    if (!this.#shapeTypeIds.includes(shapeType)) return
                    item.shapeType = shapeType
                    changedKeys.push(key)
                    return
                }
                case 'xOffset':
                case 'yOffset': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item[key] = Math.round(numberValue)
                    changedKeys.push(key)
                    return
                }
                case 'width':
                case 'height': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item[key] = Math.max(1, Math.round(numberValue))
                    changedKeys.push(key)
                    return
                }
                case 'fontSize': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item.fontSize = Math.max(6, Math.round(numberValue))
                    changedKeys.push(key)
                    return
                }
                case 'barcodeModuleWidth': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item.barcodeModuleWidth = Math.max(1, Math.round(numberValue))
                    changedKeys.push(key)
                    return
                }
                case 'barcodeMargin': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item.barcodeMargin = Math.max(0, Math.round(numberValue))
                    changedKeys.push(key)
                    return
                }
                case 'imageThreshold': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item.imageThreshold = Math.max(0, Math.min(255, Math.round(numberValue)))
                    changedKeys.push(key)
                    return
                }
                case 'strokeWidth': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item.strokeWidth = Math.max(1, Math.round(numberValue))
                    changedKeys.push(key)
                    return
                }
                case 'cornerRadius': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item.cornerRadius = Math.max(0, Math.round(numberValue))
                    changedKeys.push(key)
                    return
                }
                case 'sides': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item.sides = Math.max(3, Math.min(12, Math.round(numberValue)))
                    changedKeys.push(key)
                    return
                }
                case 'rotation': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item.rotation = RotationUtils.normalizeDegrees(numberValue)
                    changedKeys.push(key)
                    return
                }
                case 'size': {
                    if (item.type !== 'qr') return
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item.size = QrSizeUtils.clampQrSizeToLabel(this.state, Math.round(numberValue))
                    item.height = item.size
                    changedKeys.push(key)
                    return
                }
                case 'qrVersion': {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return
                    item.qrVersion = Math.max(0, Math.min(40, Math.round(numberValue)))
                    changedKeys.push(key)
                    return
                }
                case 'barcodeShowText':
                case 'imageInvert': {
                    item[key] = this.#coerceBoolean(value)
                    changedKeys.push(key)
                    return
                }
                case 'textBold':
                case 'textItalic':
                case 'textUnderline': {
                    if (item.type !== 'text') return
                    item[key] = this.#coerceBoolean(value)
                    changedKeys.push(key)
                    return
                }
                default:
                    return
            }
        })
        return changedKeys
    }
    /**
     * Expands nested structures into flat item properties.
     * @param {Record<string, any>} rawChanges
     * @returns {Record<string, any>}
     */
    #expandStructuredChanges(rawChanges) {
        const expanded = { ...(rawChanges || {}) }
        if (expanded.style && typeof expanded.style === 'object') {
            if (!Object.prototype.hasOwnProperty.call(expanded, 'textBold')) {
                expanded.textBold = expanded.style.textBold ?? expanded.style.bold ?? expanded.style.fontWeight
            }
            if (!Object.prototype.hasOwnProperty.call(expanded, 'textItalic')) {
                expanded.textItalic = expanded.style.textItalic ?? expanded.style.italic ?? expanded.style.fontStyle
            }
            if (!Object.prototype.hasOwnProperty.call(expanded, 'textUnderline')) {
                expanded.textUnderline =
                    expanded.style.textUnderline ?? expanded.style.underline ?? expanded.style.textDecoration
            }
        }
        if (!Object.prototype.hasOwnProperty.call(expanded, 'textBold') && Object.prototype.hasOwnProperty.call(expanded, 'fontWeight')) {
            expanded.textBold = expanded.fontWeight
        }
        if (!Object.prototype.hasOwnProperty.call(expanded, 'textItalic') && Object.prototype.hasOwnProperty.call(expanded, 'fontStyle')) {
            expanded.textItalic = expanded.fontStyle
        }
        if (!Object.prototype.hasOwnProperty.call(expanded, 'textUnderline') && Object.prototype.hasOwnProperty.call(expanded, 'textDecoration')) {
            expanded.textUnderline = expanded.textDecoration
        }
        if (expanded.position && typeof expanded.position === 'object') {
            if (!Object.prototype.hasOwnProperty.call(expanded, 'xOffset')) expanded.xOffset = expanded.position.x
            if (!Object.prototype.hasOwnProperty.call(expanded, 'yOffset')) expanded.yOffset = expanded.position.y
        }
        if (expanded.size && typeof expanded.size === 'object') {
            if (!Object.prototype.hasOwnProperty.call(expanded, 'width')) expanded.width = expanded.size.width
            if (!Object.prototype.hasOwnProperty.call(expanded, 'height')) expanded.height = expanded.size.height
        }
        if (expanded.dimensions && typeof expanded.dimensions === 'object') {
            if (!Object.prototype.hasOwnProperty.call(expanded, 'width')) expanded.width = expanded.dimensions.width
            if (!Object.prototype.hasOwnProperty.call(expanded, 'height')) expanded.height = expanded.dimensions.height
        }
        return expanded
    }
    /**
     * Normalizes common model key aliases to canonical editor item keys.
     * @param {Record<string, any>} rawChanges
     * @returns {Record<string, any>}
     */
    #normalizeChanges(rawChanges) {
        const aliasMap = {
            content: 'text',
            value: 'data',
            qrData: 'data',
            qrContent: 'data',
            barcodeData: 'data',
            bold: 'textBold',
            italic: 'textItalic',
            underline: 'textUnderline',
            underlined: 'textUnderline',
            kursiv: 'textItalic',
            fett: 'textBold',
            icon: 'iconId',
            x: 'xOffset',
            y: 'yOffset',
            x_offset: 'xOffset',
            y_offset: 'yOffset',
            font_size: 'fontSize',
            font_family: 'fontFamily',
            text_bold: 'textBold',
            text_italic: 'textItalic',
            text_underline: 'textUnderline',
            textUnderlin: 'textUnderline',
            fontWeight: 'textBold',
            fontStyle: 'textItalic',
            textDecoration: 'textUnderline',
            font_weight: 'textBold',
            font_style: 'textItalic',
            text_decoration: 'textUnderline',
            shape_type: 'shapeType',
            stroke_width: 'strokeWidth',
            corner_radius: 'cornerRadius',
            qr_size: 'size',
            qr_error_correction_level: 'qrErrorCorrectionLevel',
            qr_encoding_mode: 'qrEncodingMode',
            qr_version: 'qrVersion',
            barcode_show_text: 'barcodeShowText',
            barcode_module_width: 'barcodeModuleWidth',
            barcode_margin: 'barcodeMargin',
            image_dither: 'imageDither',
            image_threshold: 'imageThreshold',
            image_smoothing: 'imageSmoothing',
            image_invert: 'imageInvert'
        }
        const normalized = {}
        Object.entries(rawChanges || {}).forEach(([key, value]) => {
            const mappedKey = aliasMap[key] || key
            normalized[mappedKey] = value
        })
        return normalized
    }
    /**
     * Coerces common truthy/falsy values to booleans.
     * @param {unknown} value
     * @returns {boolean}
     */
    #coerceBoolean(value) {
        if (typeof value === 'boolean') return value
        if (typeof value === 'number') return value !== 0
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase()
            if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
            if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false
            if (['bold', 'italic', 'underline', 'underlined'].includes(normalized)) return true
            if (['normal', 'none'].includes(normalized)) return false
        }
        return Boolean(value)
    }
    /**
     * Extracts property changes from multiple supported action payload shapes.
     * @param {Record<string, any>} action
     * @returns {Record<string, any> | null}
     */
    #extractItemChangesPayload(action) {
        const directCandidates = [action.changes, action.properties, action.item, action.values]
        for (const candidate of directCandidates) {
            if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
                return { ...candidate }
            }
        }
        const reservedKeys = new Set([
            'action',
            'itemType',
            'type',
            'shapeType',
            'itemId',
            'itemIndex',
            'itemIds',
            'target',
            'settings',
            'mode',
            'reference',
            'skipBatchConfirm'
        ])
        const inferredChanges = {}
        Object.entries(action).forEach(([key, value]) => {
            if (reservedKeys.has(key)) return
            inferredChanges[key] = value
        })
        return Object.keys(inferredChanges).length ? inferredChanges : null
    }
    /**
     * Infers a best-effort item type when an update target is missing in rebuild mode.
     * @param {{ itemType?: string, type?: string, shapeType?: string }} action
     * @param {Record<string, any>} changes
     * @returns {'text' | 'qr' | 'barcode' | 'image' | 'icon' | 'shape'}
     */
    #inferItemTypeForMissingUpdate(action, changes) {
        const explicitType = String(action.itemType || action.type || '').trim().toLowerCase()
        if (['text', 'qr', 'barcode', 'image', 'icon', 'shape'].includes(explicitType)) {
            return explicitType
        }
        const keys = new Set(Object.keys(changes || {}))
        if (keys.has('barcodeFormat') || keys.has('barcodeModuleWidth') || keys.has('barcodeMargin') || keys.has('barcodeShowText')) {
            return 'barcode'
        }
        if (keys.has('imageData') || keys.has('imageName') || keys.has('imageDither') || keys.has('imageThreshold') || keys.has('imageSmoothing') || keys.has('imageInvert')) {
            return 'image'
        }
        if (keys.has('iconId')) {
            return 'icon'
        }
        if (keys.has('shapeType') || keys.has('strokeWidth') || keys.has('cornerRadius') || keys.has('sides')) {
            return 'shape'
        }
        if (keys.has('qrErrorCorrectionLevel') || keys.has('qrVersion') || keys.has('qrEncodingMode') || keys.has('size')) {
            return 'qr'
        }
        if (keys.has('data') && !keys.has('text')) {
            return 'qr'
        }
        return 'text'
    }
    /**
     * Adds an item id to this action-run context.
     * @param {{ touchedItemIds: Set<string> }} runContext
     * @param {string} itemId
     */
    #rememberTouchedItem(runContext, itemId) {
        if (!runContext || !(runContext.touchedItemIds instanceof Set)) return
        const normalizedId = String(itemId || '').trim()
        if (!normalizedId) return
        runContext.touchedItemIds.add(normalizedId)
    }
    /**
     * Sets a select value when the option exists and dispatches an event.
     * @param {HTMLSelectElement | null | undefined} select
     * @param {unknown} value
     * @param {string} keyName
     * @param {'change' | 'input'} eventName
     * @returns {string[]}
     */
    #setSelectValue(select, value, keyName, eventName) {
        if (!select || value === undefined || value === null) return []
        const nextValue = String(value)
        const hasOption = Array.from(select.options).some((option) => option.value === nextValue)
        if (!hasOption) return []
        if (select.value === nextValue) return []
        select.value = nextValue
        select.dispatchEvent(new Event(eventName, { bubbles: true }))
        return [keyName]
    }
    /**
     * Re-renders editor and preview after action-based state mutation.
     */
    #renderAfterMutation() {
        this.parameterPanel.handleItemTemplatesChanged()
        this.itemsEditor.render()
        void this.previewRenderer.render()
    }
    /**
     * Re-renders editor and preview after mutation and waits until preview bounds are up to date.
     * @returns {Promise<void>}
     */
    async #renderAfterMutationAsync() {
        this.parameterPanel.handleItemTemplatesChanged()
        this.itemsEditor.render()
        const renderResult = this.previewRenderer.render()
        if (renderResult && typeof renderResult.then === 'function') {
            await renderResult
        }
        await this.#waitForPreviewIdle()
    }

    /**
     * Waits until the preview renderer is not busy and has no queued rerender.
     * Needed because render() can return early while a frame is still in progress.
     * @param {number} [timeoutMs=1200]
     * @returns {Promise<void>}
     */
    async #waitForPreviewIdle(timeoutMs = 1200) {
        const startedAt = Date.now()
        while (Boolean(this.previewRenderer?._previewBusy) || Boolean(this.previewRenderer?._previewQueued)) {
            if (Date.now() - startedAt >= timeoutMs) {
                this.#debugLog('render-wait-timeout', {
                    timeoutMs,
                    previewBusy: Boolean(this.previewRenderer?._previewBusy),
                    previewQueued: Boolean(this.previewRenderer?._previewQueued),
                    interactiveItemCount: this.previewRenderer?._interactiveItemsById?.size || 0
                })
                break
            }
            await new Promise((resolve) => setTimeout(resolve, 8))
        }
    }
    /**
     * Applies deterministic cleanup for sketch-rebuild runs.
     * Removes duplicated aggregate text blocks and enforces a visible QR size floor.
     * @param {{ preferredMedia?: string }} [options]
     * @returns {Promise<void>}
     */
    async #postProcessRebuildArtifacts(options = {}) {
        this.#debugLog('postprocess:start', {
            itemCountBefore: Array.isArray(this.state.items) ? this.state.items.length : 0,
            preferredMedia: String(options.preferredMedia || '').trim()
        })
        const preferredMedia = String(options.preferredMedia || '').trim()
        if (preferredMedia) {
            const changed = this.#setSelectValue(this.els.media, preferredMedia, 'media', 'change')
            if (changed.length) {
                await this.#renderAfterMutationAsync()
            }
        }
        const appliedInventoryTemplate = await AiInventoryRebuildUtils.tryApplyInventoryTemplate({
            state: this.state,
            previewRenderer: this.previewRenderer,
            renderAfterMutation: () => this.#renderAfterMutationAsync()
        })
        this.#debugLog('postprocess:template', {
            appliedInventoryTemplate,
            itemCountAfterTemplate: Array.isArray(this.state.items) ? this.state.items.length : 0
        })
        if (appliedInventoryTemplate) {
            return
        }
        const aggregateTextItem = AiRebuildPostProcessUtils.findDuplicatedAggregateTextItem(this.state.items)
        let didMutate = false
        if (aggregateTextItem) {
            const aggregateId = aggregateTextItem.id
            const filteredItems = this.state.items.filter((item) => item.id !== aggregateId)
            if (filteredItems.length !== this.state.items.length) {
                this.state.items.splice(0, this.state.items.length, ...filteredItems)
                const selectedIds = this.previewRenderer.getSelectedItemIds().filter((id) => id !== aggregateId)
                this.previewRenderer.setSelectedItemIds(selectedIds)
                this.itemsEditor.setSelectedItemIds(selectedIds)
                didMutate = true
            }
        }

        const prominentQrFloor = Math.max(
            QrSizeUtils.MIN_QR_SIZE_DOTS,
            Math.round(QrSizeUtils.computeMaxQrSizeDots(this.state) * 0.6)
        )
        this.state.items.forEach((item) => {
            if (item.type !== 'qr') return
            const nextSize = QrSizeUtils.clampQrSizeToLabel(
                this.state,
                Math.max(Number(item.size) || 0, Number(item.width) || 0, Number(item.height) || 0, prominentQrFloor)
            )
            if (nextSize === Number(item.size || 0)) return
            item.size = nextSize
            item.height = nextSize
            item.width = nextSize
            didMutate = true
        })

        if (didMutate) {
            await this.#renderAfterMutationAsync()
        }
        this.#debugLog('postprocess:finish', {
            didMutate,
            itemCountAfter: Array.isArray(this.state.items) ? this.state.items.length : 0
        })
    }
    /**
     * Resolves whether assistant debug logs are enabled.
     * @returns {boolean}
     */
    #resolveDebugEnabled() {
        try {
            const queryValue = new URLSearchParams(globalThis?.window?.location?.search || '').get('aiDebug')
            const localValue = globalThis?.window?.localStorage?.getItem('AI_DEBUG_LOGS')
            const raw = String(queryValue || localValue || '')
                .trim()
                .toLowerCase()
            return ['1', 'true', 'yes', 'on'].includes(raw)
        } catch (_error) {
            return false
        }
    }
    /**
     * Emits one assistant runtime debug event.
     * @param {string} event
     * @param {Record<string, any>} [context]
     */
    #debugLog(event, context = {}) {
        if (!this.#debugEnabled) return
        console.info(`[assistant-debug-bridge] ${event}`, context)
    }
}
