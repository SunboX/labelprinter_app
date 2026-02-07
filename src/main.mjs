import { ItemsEditor } from './ui/ItemsEditor.mjs'
import { ParameterPanel } from './ui/ParameterPanel.mjs'
import { PreviewRenderer } from './ui/PreviewRenderer.mjs'
import { PrintController } from './ui/PrintController.mjs'
import { ProjectIoUtils } from './ProjectIoUtils.mjs'
import { ProjectUrlUtils } from './ProjectUrlUtils.mjs'
import { ShapeMenuUtils } from './ShapeMenuUtils.mjs'
import { ZoomUtils } from './ZoomUtils.mjs'
import { I18n } from './I18n.mjs'
import { Media, Resolution, P700, P750W, E500, E550W, H500 } from 'labelprinterkit-web/src/index.mjs'

const els = {
    items: document.querySelector('[data-items]'),
    addText: document.querySelector('[data-add-text]'),
    addQr: document.querySelector('[data-add-qr]'),
    addShape: document.querySelector('[data-add-shape]'),
    shapeMenu: document.querySelector('[data-shape-menu]'),
    saveProject: document.querySelector('[data-save-project]'),
    loadProject: document.querySelector('[data-load-project]'),
    shareProject: document.querySelector('[data-share-project]'),
    loadInput: document.querySelector('[data-load-input]'),
    print: document.querySelector('[data-print]'),
    status: document.querySelector('[data-status]'),
    mode: document.querySelector('[data-mode]'),
    media: document.querySelector('[data-media]'),
    orientation: document.querySelector('[data-orientation]'),
    resolution: document.querySelector('[data-resolution]'),
    mediaLength: document.querySelector('[data-media-length]'),
    printer: document.querySelector('[data-printer]'),
    preview: document.querySelector('[data-preview]'),
    dimensions: document.querySelector('[data-dimensions]'),
    zoomOut: document.querySelector('[data-zoom-out]'),
    zoomIn: document.querySelector('[data-zoom-in]'),
    zoomReset: document.querySelector('[data-zoom-reset]'),
    zoomRange: document.querySelector('[data-zoom-range]'),
    zoomLabel: document.querySelector('[data-zoom-label]'),
    localeSelect: document.querySelector('[data-locale-select]'),
    alignMenu: document.querySelector('.align-dropdown'),
    alignMenuTrigger: document.querySelector('[data-align-menu-trigger]'),
    alignReference: document.querySelector('[data-align-reference]'),
    alignLeft: document.querySelector('[data-align-left]'),
    alignCenter: document.querySelector('[data-align-center]'),
    alignRight: document.querySelector('[data-align-right]'),
    alignTop: document.querySelector('[data-align-top]'),
    alignMiddle: document.querySelector('[data-align-middle]'),
    alignBottom: document.querySelector('[data-align-bottom]'),
    rulerX: document.querySelector('[data-ruler-x]'),
    rulerY: document.querySelector('[data-ruler-y]'),
    labelWidth: document.querySelector('[data-label-width]'),
    canvasWrap: document.querySelector('.canvas-wrap'),
    labelPlate: document.querySelector('.label-plate'),
    bleFields: document.querySelector('.ble-fields'),
    bleService: document.querySelector('[data-ble-service]'),
    bleWrite: document.querySelector('[data-ble-write]'),
    bleNotify: document.querySelector('[data-ble-notify]'),
    bleFilter: document.querySelector('[data-ble-filter]'),
    parameterDefinitions: document.querySelector('[data-parameter-definitions]'),
    addParameter: document.querySelector('[data-add-parameter]'),
    loadParameterData: document.querySelector('[data-load-parameter-data]'),
    downloadParameterExample: document.querySelector('[data-download-parameter-example]'),
    parameterDataInput: document.querySelector('[data-parameter-data-input]'),
    parameterDataMeta: document.querySelector('[data-parameter-data-meta]'),
    parameterIssues: document.querySelector('[data-parameter-issues]'),
    parameterPreview: document.querySelector('[data-parameter-preview]')
}

const printerMap = { P700, P750W, E500, E550W, H500 }
const shapeTypes = [
    { id: 'rect', labelKey: 'shapes.rect' },
    { id: 'roundRect', labelKey: 'shapes.roundRect' },
    { id: 'oval', labelKey: 'shapes.oval' },
    { id: 'polygon', labelKey: 'shapes.polygon' },
    { id: 'line', labelKey: 'shapes.line' }
]

let idCounter = 1

/**
 * Generates the next item id.
 * @returns {string}
 */
function nextId() {
    return `item-${idCounter++}`
}

const defaultState = {
    media: 'W9',
    mediaLengthMm: null,
    zoom: 1,
    resolution: 'LOW',
    orientation: 'horizontal',
    backend: 'usb',
    printer: 'P700',
    ble: {
        serviceUuid: '0000xxxx-0000-1000-8000-00805f9b34fb',
        writeCharacteristicUuid: '0000yyyy-0000-1000-8000-00805f9b34fb',
        notifyCharacteristicUuid: '0000zzzz-0000-1000-8000-00805f9b34fb',
        namePrefix: 'PT-'
    },
    parameters: [],
    parameterDataRows: [],
    parameterDataRaw: '',
    parameterDataSourceName: '',
    items: [
        { id: nextId(), type: 'text', text: 'New text', fontFamily: 'Barlow', fontSize: 24, height: 40, xOffset: 4, yOffset: 0 }
    ]
}

let state = JSON.parse(JSON.stringify(defaultState))

/**
 * Updates the status banner.
 * @param {string} text
 * @param {'info' | 'success' | 'error'} [type='info']
 */
function setStatus(text, type = 'info') {
    els.status.removeAttribute('data-i18n')
    els.status.textContent = text
    els.status.dataset.type = type
}

/**
 * No-op placeholder for optional callbacks.
 */
function noop() {}

/**
 * Coordinates UI bindings and the editor lifecycle.
 */
class AppController {
    /**
     * @param {object} elsRef
     * @param {object} stateRef
     * @param {ItemsEditor} itemsEditor
     * @param {ParameterPanel} parameterPanel
     * @param {PreviewRenderer} previewRenderer
     * @param {PrintController} printController
     * @param {(text: string, type?: string) => void} setStatus
     * @param {I18n} i18n
     */
    constructor(elsRef, stateRef, itemsEditor, parameterPanel, previewRenderer, printController, setStatus, i18n) {
        this.els = elsRef
        this.state = stateRef
        this.itemsEditor = itemsEditor
        this.parameterPanel = parameterPanel
        this.previewRenderer = previewRenderer
        this.printController = printController
        this.setStatus = setStatus
        this.i18n = i18n
        this.itemsEditor.onChange = this.#handleStateChange.bind(this)
        this.parameterPanel.onChange = this.#handleParameterChange.bind(this)
        this.previewRenderer.onSelectionChange = this.#handleSelectionChange.bind(this)
    }

    /**
     * Resolves a translated string.
     * @param {string} key
     * @param {Record<string, string | number>} [params]
     * @returns {string}
     */
    #t(key, params = {}) {
        return this.i18n.t(key, params)
    }

    /**
     * Initializes the editor state and binds UI events.
     * @returns {Promise<void>}
     */
    async init() {
        this.#applyLocaleToUi()
        this.#populateSelects()
        this.#restoreBleState()
        this.els.mode.value = this.state.backend
        this.els.printer.value = this.state.printer
        this.#toggleBleFields()
        await this.#loadProjectFromUrlParameter()
        this.#syncZoomControls()
        this.parameterPanel.init()
        this.#syncPreviewTemplateValues()
        this.#handleSelectionChange([])
        // Render the list before binding drag to ensure handles exist.
        this.itemsEditor.render()
        this.itemsEditor.bindDrag()
        this.previewRenderer.bindInteractions()
        this.#bindEvents()
        this.previewRenderer.render()
    }

    /**
     * Applies locale-dependent static translations to the document.
     */
    #applyLocaleToUi() {
        this.i18n.applyTranslations(document)
        if (this.els.localeSelect) {
            this.els.localeSelect.value = this.i18n.locale
        }
    }

    /**
     * Refreshes the preview after state changes.
     */
    #handleStateChange() {
        this.parameterPanel.handleItemTemplatesChanged()
        this.#syncPreviewTemplateValues()
        this.previewRenderer.render()
    }

    /**
     * Handles parameter definition/data changes.
     */
    #handleParameterChange() {
        this.#syncPreviewTemplateValues()
        this.previewRenderer.render()
    }

    /**
     * Syncs preview template values from parameter state.
     */
    #syncPreviewTemplateValues() {
        this.previewRenderer.setTemplateValues(this.parameterPanel.getPreviewParameterValues())
    }

    /**
     * Handles selection updates from the preview overlay.
     * @param {string[]} selectedIds
     */
    #handleSelectionChange(selectedIds) {
        this.itemsEditor.setSelectedItemIds(selectedIds)
        this.#syncAlignControls()
    }

    /**
     * Enables or disables alignment controls based on selection and reference mode.
     */
    #syncAlignControls() {
        const selectedCount = this.previewRenderer.getSelectedItemIds().length
        const referenceMode = this.els.alignReference?.value || 'selection'
        const requiresMultipleItems = referenceMode !== 'label'
        const canAlign = selectedCount > 0 && (!requiresMultipleItems || selectedCount > 1)
        const alignButtons = [
            this.els.alignLeft,
            this.els.alignCenter,
            this.els.alignRight,
            this.els.alignTop,
            this.els.alignMiddle,
            this.els.alignBottom
        ]
        alignButtons.forEach((button) => {
            if (!button) return
            button.disabled = !canAlign
        })
    }

    /**
     * Aligns selected items according to the requested mode.
     * @param {'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'} mode
     */
    #alignSelection(mode) {
        const referenceMode = this.els.alignReference?.value || 'selection'
        const result = this.previewRenderer.alignSelectedItems(mode, referenceMode)
        this.#setAlignMenuOpen(false)
        if (!result.changed) {
            if (result.reason === 'no-selection') {
                this.setStatus(this.#t('messages.selectAtLeastOne'), 'info')
                return
            }
            if (result.reason === 'need-multiple') {
                this.setStatus(this.#t('messages.selectAtLeastTwo'), 'info')
                return
            }
            this.setStatus(this.#t('messages.nothingToAlign'), 'info')
            return
        }
        this.itemsEditor.render()
        this.previewRenderer.render()
        this.setStatus(
            result.count === 1
                ? this.#t('messages.alignedOne')
                : this.#t('messages.alignedMany', { count: result.count }),
            'success'
        )
    }

    /**
     * Updates the zoom state and refreshes preview controls.
     * @param {number} value
     */
    #setZoom(value) {
        this.state.zoom = ZoomUtils.clampZoom(value)
        this.#syncZoomControls()
        this.previewRenderer.render()
    }

    /**
     * Syncs zoom controls with the current zoom value.
     */
    #syncZoomControls() {
        const zoom = ZoomUtils.clampZoom(this.state.zoom)
        this.state.zoom = zoom
        if (this.els.zoomRange) {
            this.els.zoomRange.min = String(Math.round(ZoomUtils.ZOOM_MIN * 100))
            this.els.zoomRange.max = String(Math.round(ZoomUtils.ZOOM_MAX * 100))
            this.els.zoomRange.value = String(Math.round(zoom * 100))
        }
        if (this.els.zoomLabel) {
            this.els.zoomLabel.textContent = ZoomUtils.formatZoomLabel(zoom)
        }
    }

    /**
     * Builds a suggested file name for project exports.
     * @returns {string}
     */
    #buildSuggestedFileName() {
        const stamp = new Date().toISOString().slice(0, 10)
        return `label-project-${stamp}.json`
    }

    /**
     * Triggers a download for browsers without a save file picker.
     * @param {string} contents
     * @param {string} fileName
     */
    #downloadProjectFallback(contents, fileName) {
        const blob = new Blob([contents], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
    }

    /**
     * Prompts the user for a local JSON file.
     * @returns {Promise<File | null>}
     */
    async #promptForProjectFile() {
        if (window.showOpenFilePicker) {
            const [handle] = await window.showOpenFilePicker({
                multiple: false,
                types: [
                    {
                        description: this.#t('messages.projectJsonDescription'),
                        accept: { 'application/json': ['.json'] }
                    }
                ]
            })
            return handle ? handle.getFile() : null
        }

        if (!this.els.loadInput) return null

        return new Promise((resolve) => {
            const input = this.els.loadInput
            let settled = false
            const cleanup = () => {
                input.removeEventListener('change', onChange)
                window.removeEventListener('focus', onFocus)
            }
            const onChange = () => {
                settled = true
                cleanup()
                resolve(input.files?.[0] ?? null)
            }
            const onFocus = () => {
                window.setTimeout(() => {
                    if (settled) return
                    cleanup()
                    resolve(null)
                }, 0)
            }
            // Fallback to a hidden file input when the picker API is unavailable.
            input.addEventListener('change', onChange)
            window.addEventListener('focus', onFocus, { once: true })
            input.value = ''
            input.click()
        })
    }

    /**
     * Applies a raw project object to the editor state.
     * @param {object} rawState
     * @param {string} sourceLabel
     * @param {boolean} [refreshView=true]
     */
    #applyLoadedProject(rawState, sourceLabel, refreshView = true) {
        const { state: normalizedState, nextIdCounter } = ProjectIoUtils.normalizeProjectState(rawState, defaultState)
        idCounter = nextIdCounter
        this.#applyState(normalizedState)
        this.#syncFormFromState()
        this.parameterPanel.syncFromState()
        this.#syncPreviewTemplateValues()
        this.previewRenderer.setSelectedItemIds([])
        if (refreshView) {
            this.itemsEditor.render()
            this.previewRenderer.render()
        }
        this.setStatus(this.#t('messages.loaded', { sourceLabel }), 'success')
    }

    /**
     * Loads a project from URL query parameters when present.
     * Supported parameters:
     * - `project`: base64url encoded JSON payload or a JSON URL reference.
     * - `projectUrl`: explicit JSON URL reference.
     * @returns {Promise<boolean>}
     */
    async #loadProjectFromUrlParameter() {
        const source = ProjectUrlUtils.resolveProjectSource(new URLSearchParams(window.location.search))
        if (!source.kind || !source.value) {
            return false
        }
        try {
            let rawProject
            const shouldFetchRemote = source.kind === 'remote' || ProjectUrlUtils.isLikelyProjectUrl(source.value)
            if (shouldFetchRemote) {
                const projectUrl = new URL(source.value, window.location.href)
                const response = await fetch(projectUrl.toString(), { cache: 'no-store' })
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`)
                }
                rawProject = await response.json()
                this.#applyLoadedProject(rawProject, this.#t('messages.sourceUrlParameter'), false)
                return true
            }
            const rawValue = String(source.value || '').trim()
            rawProject = rawValue.startsWith('{') ? JSON.parse(rawValue) : ProjectUrlUtils.decodeEmbeddedProjectParam(rawValue)
            this.#applyLoadedProject(rawProject, this.#t('messages.sourceSharedLink'), false)
            return true
        } catch (err) {
            const message = err?.message || this.#t('messages.unknownError')
            this.setStatus(this.#t('messages.loadUrlFailed', { message }), 'error')
            return false
        }
    }

    /**
     * Builds a shareable URL containing the current project payload.
     * @returns {string}
     */
    #buildProjectShareUrl() {
        const payload = ProjectIoUtils.buildProjectPayload(this.state)
        const encodedProject = ProjectUrlUtils.encodeProjectPayloadParam(payload)
        const shareUrl = new URL(window.location.href)
        shareUrl.searchParams.set(ProjectUrlUtils.PROJECT_PARAM, encodedProject)
        shareUrl.searchParams.delete(ProjectUrlUtils.PROJECT_URL_PARAM)
        return shareUrl.toString()
    }

    /**
     * Shares or copies the current project URL.
     * @returns {Promise<void>}
     */
    async #shareProject() {
        if (!this.els.shareProject) return
        try {
            const shareUrl = this.#buildProjectShareUrl()
            if (navigator.share) {
                await navigator.share({
                    title: this.#t('app.title'),
                    url: shareUrl
                })
                this.setStatus(this.#t('messages.sharedLink'), 'success')
                return
            }
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(shareUrl)
                this.setStatus(this.#t('messages.copiedLink'), 'success')
                return
            }
            window.prompt(this.#t('messages.copyPrompt'), shareUrl)
            this.setStatus(this.#t('messages.linkReady'), 'info')
        } catch (err) {
            if (err?.name === 'AbortError') {
                this.setStatus(this.#t('messages.shareCanceled'), 'info')
                return
            }
            const message = err?.message || this.#t('messages.unknownError')
            this.setStatus(this.#t('messages.shareFailed', { message }), 'error')
        }
    }

    /**
     * Saves the current project state as a JSON file.
     * @returns {Promise<void>}
     */
    async #saveProject() {
        if (!this.els.saveProject) return
        const payload = ProjectIoUtils.buildProjectPayload(this.state)
        const contents = JSON.stringify(payload, null, 2)
        const suggestedName = this.#buildSuggestedFileName()

        try {
            if (window.showSaveFilePicker) {
                const handle = await window.showSaveFilePicker({
                    suggestedName,
                    types: [
                        {
                            description: this.#t('messages.projectJsonDescription'),
                            accept: { 'application/json': ['.json'] }
                        }
                    ]
                })
                const writable = await handle.createWritable()
                await writable.write(contents)
                await writable.close()
                this.setStatus(this.#t('messages.saved', { fileName: handle.name || suggestedName }), 'success')
                return
            }

            // Prompt for a file name when the save picker is unavailable.
            const fallbackName = window.prompt(this.#t('messages.savePrompt'), suggestedName)
            if (!fallbackName) {
                this.setStatus(this.#t('messages.saveCanceled'), 'info')
                return
            }
            const fileName = fallbackName.endsWith('.json') ? fallbackName : `${fallbackName}.json`
            this.#downloadProjectFallback(contents, fileName)
            this.setStatus(this.#t('messages.downloaded', { fileName }), 'success')
        } catch (err) {
            if (err?.name === 'AbortError') {
                this.setStatus(this.#t('messages.saveCanceled'), 'info')
                return
            }
            const message = err?.message || this.#t('messages.unknownError')
            this.setStatus(this.#t('messages.saveFailed', { message }), 'error')
        }
    }

    /**
     * Loads a project JSON file and updates the editor state.
     * @returns {Promise<void>}
     */
    async #loadProject() {
        if (!this.els.loadProject) return
        try {
            const file = await this.#promptForProjectFile()
            if (!file) {
                this.setStatus(this.#t('messages.loadCanceled'), 'info')
                return
            }
            const rawText = await file.text()
            const rawState = JSON.parse(rawText)
            this.#applyLoadedProject(rawState, file.name)
        } catch (err) {
            if (err?.name === 'AbortError') {
                this.setStatus(this.#t('messages.loadCanceled'), 'info')
                return
            }
            const message = err?.message || this.#t('messages.unknownError')
            this.setStatus(this.#t('messages.loadFailed', { message }), 'error')
        }
    }

    /**
     * Ensures a select control points to a valid option value.
     * @param {HTMLSelectElement} select
     * @param {string} value
     * @param {string} fallback
     * @returns {string}
     */
    #ensureSelectValue(select, value, fallback) {
        if (!select) return value || fallback
        const hasOption = Array.from(select.options).some((opt) => opt.value === value)
        const nextValue = hasOption ? value : fallback
        select.value = nextValue
        return nextValue
    }

    /**
     * Applies a normalized state to the live state object.
     * @param {object} nextState
     */
    #applyState(nextState) {
        this.state.media = nextState.media
        this.state.mediaLengthMm = nextState.mediaLengthMm ?? null
        this.state.zoom = ZoomUtils.clampZoom(nextState.zoom ?? defaultState.zoom)
        this.state.resolution = nextState.resolution
        this.state.orientation = nextState.orientation
        this.state.backend = nextState.backend
        this.state.printer = nextState.printer
        this.state.ble = { ...nextState.ble }
        this.state.parameters = Array.isArray(nextState.parameters)
            ? nextState.parameters.map((parameter) => ({
                  name: String(parameter?.name || '').trim(),
                  defaultValue: String(parameter?.defaultValue ?? '')
              }))
            : []
        this.state.parameterDataRows = Array.isArray(nextState.parameterDataRows)
            ? nextState.parameterDataRows
                  .filter((row) => row && typeof row === 'object' && !Array.isArray(row))
                  .map((row) => ({ ...row }))
            : []
        this.state.parameterDataRaw =
            typeof nextState.parameterDataRaw === 'string' ? nextState.parameterDataRaw : ''
        this.state.parameterDataSourceName =
            typeof nextState.parameterDataSourceName === 'string' ? nextState.parameterDataSourceName : ''
        this.state.items.splice(0, this.state.items.length, ...nextState.items)
    }

    /**
     * Syncs form controls with the current state values.
     */
    #syncFormFromState() {
        this.state.backend = this.#ensureSelectValue(this.els.mode, this.state.backend, defaultState.backend)
        this.#toggleBleFields()
        this.state.printer = this.#ensureSelectValue(this.els.printer, this.state.printer, defaultState.printer)
        this.state.media = this.#ensureSelectValue(this.els.media, this.state.media, defaultState.media)
        this.state.resolution = this.#ensureSelectValue(this.els.resolution, this.state.resolution, defaultState.resolution)
        this.state.orientation = this.#ensureSelectValue(
            this.els.orientation,
            this.state.orientation,
            defaultState.orientation
        )
        this.els.mediaLength.value = this.state.mediaLengthMm === null ? '' : this.state.mediaLengthMm
        this.#restoreBleState()
        this.#syncZoomControls()
        this.#syncAlignControls()
    }

    /**
     * Populates select elements with media and resolution options.
     */
    #populateSelects() {
        this.els.media.innerHTML = ''
        this.els.resolution.innerHTML = ''
        Object.values(Media)
            .filter((m) => m.id && m.id.startsWith('W'))
            .forEach((media) => {
                const opt = document.createElement('option')
                opt.value = media.id
                opt.textContent = this.#t('formats.mediaOption', {
                    id: media.id,
                    width: media.width,
                    printArea: media.printArea
                })
                if (media.id === this.state.media) opt.selected = true
                this.els.media.appendChild(opt)
            })

        Object.values(Resolution).forEach((res) => {
            const opt = document.createElement('option')
            opt.value = res.id
            opt.textContent = this.#t('formats.resolutionOption', {
                id: res.id,
                x: res.dots[0],
                y: res.dots[1]
            })
            if (res.id === this.state.resolution) opt.selected = true
            this.els.resolution.appendChild(opt)
        })

        if (this.state.mediaLengthMm) {
            this.els.mediaLength.value = this.state.mediaLengthMm
        }
        this.els.orientation.value = this.state.orientation
    }

    /**
     * Shows or hides BLE-specific fields based on backend selection.
     */
    #toggleBleFields() {
        const isBle = this.els.mode.value === 'ble'
        this.els.bleFields.hidden = !isBle
    }

    /**
     * Restores BLE inputs from stored state.
     */
    #restoreBleState() {
        this.els.bleService.value = this.state.ble.serviceUuid
        this.els.bleWrite.value = this.state.ble.writeCharacteristicUuid
        this.els.bleNotify.value = this.state.ble.notifyCharacteristicUuid
        this.els.bleFilter.value = this.state.ble.namePrefix
    }

    /**
     * Sets the shape menu visibility and syncs the trigger state for accessibility.
     * @param {boolean} isOpen
     */
    #setShapeMenuOpen(isOpen) {
        if (!this.els.shapeMenu || !this.els.addShape) return
        this.els.shapeMenu.hidden = !isOpen
        this.els.addShape.setAttribute('aria-expanded', isOpen ? 'true' : 'false')
    }

    /**
     * Sets the alignment dropdown visibility.
     * @param {boolean} isOpen
     */
    #setAlignMenuOpen(isOpen) {
        if (!this.els.alignMenu || !this.els.alignMenuTrigger) return
        this.els.alignMenu.open = isOpen
        this.els.alignMenuTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false')
    }

    /**
     * Applies a new locale and refreshes localized UI/state renderers.
     * @param {string} nextLocale
     */
    #handleLocaleChange(nextLocale) {
        this.i18n.setLocale(nextLocale)
        this.#applyLocaleToUi()
        this.#populateSelects()
        this.#syncFormFromState()
        this.itemsEditor.render()
        this.parameterPanel.syncFromState()
        this.previewRenderer.render()
    }

    /**
     * Handles print with parameter validation and batch confirmation.
     * @returns {Promise<void>}
     */
    async #handlePrintClick() {
        if (this.parameterPanel.hasBlockingErrors()) {
            this.setStatus(this.#t('messages.parameterFixBeforePrint'), 'error')
            return
        }
        const parameterValueMaps = this.parameterPanel.buildPrintParameterValueMaps()
        if (parameterValueMaps.length > 10) {
            const confirmed = window.confirm(this.#t('messages.printConfirmMany', { count: parameterValueMaps.length }))
            if (!confirmed) {
                this.setStatus(this.#t('messages.printCanceled'), 'info')
                return
            }
        }
        await this.printController.print(parameterValueMaps)
    }

    /**
     * Binds UI event handlers for the editor.
     */
    #bindEvents() {
        if (this.els.localeSelect) {
            this.els.localeSelect.addEventListener('change', (e) => this.#handleLocaleChange(e.target.value))
        }
        if (this.els.saveProject) {
            this.els.saveProject.addEventListener('click', () => this.#saveProject())
        }
        if (this.els.loadProject) {
            this.els.loadProject.addEventListener('click', () => this.#loadProject())
        }
        if (this.els.shareProject) {
            this.els.shareProject.addEventListener('click', () => this.#shareProject())
        }
        if (this.els.zoomOut) {
            this.els.zoomOut.addEventListener('click', () => this.#setZoom(ZoomUtils.stepZoom(this.state.zoom, -1)))
        }
        if (this.els.zoomIn) {
            this.els.zoomIn.addEventListener('click', () => this.#setZoom(ZoomUtils.stepZoom(this.state.zoom, 1)))
        }
        if (this.els.zoomReset) {
            this.els.zoomReset.addEventListener('click', () => this.#setZoom(defaultState.zoom))
        }
        if (this.els.zoomRange) {
            this.els.zoomRange.addEventListener('input', (e) => {
                const zoom = Number(e.target.value) / 100
                this.#setZoom(zoom)
            })
        }
        if (this.els.alignReference) {
            this.els.alignReference.addEventListener('change', () => this.#syncAlignControls())
        }
        if (this.els.alignMenu && this.els.alignMenuTrigger) {
            this.#setAlignMenuOpen(this.els.alignMenu.open)
            this.els.alignMenuTrigger.addEventListener('click', (e) => {
                // Drive the dropdown explicitly so behavior is stable across browsers.
                e.preventDefault()
                e.stopPropagation()
                this.#setAlignMenuOpen(!this.els.alignMenu.open)
            })
            document.addEventListener(
                'pointerdown',
                (e) => {
                    if (!this.els.alignMenu.open) return
                    if (this.els.alignMenu.contains(e.target)) return
                    this.#setAlignMenuOpen(false)
                },
                { capture: true }
            )
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.els.alignMenu.open) {
                    this.#setAlignMenuOpen(false)
                    this.els.alignMenuTrigger.focus()
                }
            })
        }
        if (this.els.alignLeft) {
            this.els.alignLeft.addEventListener('click', () => this.#alignSelection('left'))
        }
        if (this.els.alignCenter) {
            this.els.alignCenter.addEventListener('click', () => this.#alignSelection('center'))
        }
        if (this.els.alignRight) {
            this.els.alignRight.addEventListener('click', () => this.#alignSelection('right'))
        }
        if (this.els.alignTop) {
            this.els.alignTop.addEventListener('click', () => this.#alignSelection('top'))
        }
        if (this.els.alignMiddle) {
            this.els.alignMiddle.addEventListener('click', () => this.#alignSelection('middle'))
        }
        if (this.els.alignBottom) {
            this.els.alignBottom.addEventListener('click', () => this.#alignSelection('bottom'))
        }
        this.els.addText.addEventListener('click', () => this.itemsEditor.addTextItem())
        this.els.addQr.addEventListener('click', () => this.itemsEditor.addQrItem())
        if (this.els.shapeMenu && this.els.addShape) {
            if (!this.els.shapeMenu.id) {
                this.els.shapeMenu.id = 'shape-menu'
            }
            this.els.addShape.setAttribute('aria-haspopup', 'menu')
            this.els.addShape.setAttribute('aria-controls', this.els.shapeMenu.id)
            this.#setShapeMenuOpen(!this.els.shapeMenu.hidden)
            this.els.addShape.addEventListener('click', (e) => {
                e.stopPropagation()
                this.#setShapeMenuOpen(this.els.shapeMenu.hidden)
            })
            this.els.shapeMenu.querySelectorAll('[data-shape-type]').forEach((btn) =>
                btn.addEventListener('click', (ev) => {
                    ev.stopPropagation()
                    const type = btn.dataset.shapeType || 'rect'
                    this.itemsEditor.addShapeItem(type)
                    this.#setShapeMenuOpen(false)
                })
            )
            document.addEventListener(
                'pointerdown',
                (e) => {
                    // Capture so outside clicks close even if another handler stops propagation.
                    if (ShapeMenuUtils.isOutsideShapeMenuInteraction(e, this.els.shapeMenu, this.els.addShape)) {
                        this.#setShapeMenuOpen(false)
                    }
                },
                { capture: true }
            )
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !this.els.shapeMenu.hidden) {
                    this.#setShapeMenuOpen(false)
                    this.els.addShape.focus()
                }
            })
        }
        this.els.print.addEventListener('click', () => this.#handlePrintClick())

        this.els.mode.addEventListener('change', () => {
            this.state.backend = this.els.mode.value
            this.#toggleBleFields()
        })
        this.els.orientation.addEventListener('change', () => {
            this.state.orientation = this.els.orientation.value
            this.itemsEditor.render()
            this.previewRenderer.render()
        })
        this.els.media.addEventListener('change', () => {
            this.state.media = this.els.media.value
            this.previewRenderer.render()
        })
        this.els.mediaLength.addEventListener('input', (e) => {
            const val = e.target.value.trim()
            this.state.mediaLengthMm = val ? Number(val) : null
            this.previewRenderer.render()
        })
        this.els.resolution.addEventListener('change', () => {
            this.state.resolution = this.els.resolution.value
        })
        this.els.printer.addEventListener('change', () => {
            this.state.printer = this.els.printer.value
        })

        this.els.bleService.addEventListener('input', (e) => (this.state.ble.serviceUuid = e.target.value))
        this.els.bleWrite.addEventListener('input', (e) => (this.state.ble.writeCharacteristicUuid = e.target.value))
        this.els.bleNotify.addEventListener('input', (e) => (this.state.ble.notifyCharacteristicUuid = e.target.value))
        this.els.bleFilter.addEventListener('input', (e) => (this.state.ble.namePrefix = e.target.value))
    }
}

const i18n = new I18n()

/**
 * Starts the localized app bootstrap sequence.
 * @returns {Promise<void>}
 */
async function startApp() {
    await i18n.init()
    i18n.applyTranslations(document)
    if (els.localeSelect) {
        els.localeSelect.value = i18n.locale
    }

    const translate = (key, params = {}) => i18n.t(key, params)
    const previewRenderer = new PreviewRenderer(els, state, setStatus, translate)
    const itemsEditor = new ItemsEditor(els, state, shapeTypes, noop, nextId, translate)
    const parameterPanel = new ParameterPanel(els, state, setStatus, noop, translate)
    const printController = new PrintController(els, state, printerMap, previewRenderer, setStatus, translate)
    const app = new AppController(els, state, itemsEditor, parameterPanel, previewRenderer, printController, setStatus, i18n)

    await app.init()
}

startApp().catch((err) => {
    console.error(err)
    setStatus(i18n.t('messages.appInitFailed'), 'error')
})
