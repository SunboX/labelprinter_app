import { AiResponseUtils } from '../AiResponseUtils.mjs'
import { AssistantErrorUtils } from '../AssistantErrorUtils.mjs'
import { AssistantToolChoiceUtils } from '../AssistantToolChoiceUtils.mjs'
import { AppApiEndpointUtils } from '../AppApiEndpointUtils.mjs'
import { MediaIntentUtils } from '../MediaIntentUtils.mjs'

/**
 * In-app assistant chat panel with optional sketch attachments and action execution.
 */
export class AiAssistantPanel {
    #translate = (key) => key
    #onRunActions = async () => ({ executed: [], errors: [], warnings: [] })
    #getUiState = () => ({})
    #getActionCapabilities = () => ({})
    #getRenderedLabelAttachment = async () => null
    #messages = []
    #attachments = []
    #previousResponseId = null
    #pendingRebuildContext = null
    #busy = false
    #bound = false
    #endpoint = ''
    #debugEnabled = false
    #overlayBackdropElements = null
    #overlayBackdropSyncFrame = null
    #overlayResizeObserver = null
    #handleOverlayViewportChange = () => this.#scheduleOverlayBackdropSync()
    #handleOverlayCanvasWrapScroll = () => this.#scheduleOverlayBackdropSync()

    /**
     * @param {object} els
     * @param {HTMLElement | null} els.overlay
     * @param {HTMLButtonElement | null} els.toggle
     * @param {HTMLButtonElement | null} els.close
     * @param {HTMLDivElement | null} els.messages
     * @param {HTMLTextAreaElement | null} els.input
     * @param {HTMLButtonElement | null} els.send
     * @param {HTMLDivElement | null} els.working
     * @param {HTMLButtonElement | null} els.attachSketch
     * @param {HTMLInputElement | null} els.imageInput
     * @param {HTMLDivElement | null} els.attachments
     * @param {HTMLCanvasElement | null} [els.preview]
     * @param {HTMLDivElement | null} [els.canvasWrap]
     * @param {(text: string, type?: 'info' | 'success' | 'error') => void} setStatus
     * @param {(key: string, params?: Record<string, string | number>) => string} translate
     */
    constructor(els, setStatus, translate) {
        this.els = els
        this.setStatus = typeof setStatus === 'function' ? setStatus : () => {}
        this.translate = translate
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
     * Sets action execution callback.
     * @param {(actions: Array<Record<string, any>>) => Promise<{ executed: string[], errors: string[], warnings?: string[] }>} callback
     */
    set onRunActions(callback) {
        this.#onRunActions =
            typeof callback === 'function' ? callback : async () => ({ executed: [], errors: [], warnings: [] })
    }

    /**
     * Sets UI state snapshot callback.
     * @param {() => Record<string, any>} callback
     */
    set getUiState(callback) {
        this.#getUiState = typeof callback === 'function' ? callback : () => ({})
    }

    /**
     * Sets assistant capability snapshot callback.
     * @param {() => Record<string, any>} callback
     */
    set getActionCapabilities(callback) {
        this.#getActionCapabilities = typeof callback === 'function' ? callback : () => ({})
    }

    /**
     * Sets rendered-label snapshot callback.
     * @param {() => Promise<{name?: string, mime_type?: string, data_url?: string} | null> | {name?: string, mime_type?: string, data_url?: string} | null} callback
     */
    set getRenderedLabelAttachment(callback) {
        this.#getRenderedLabelAttachment = typeof callback === 'function' ? callback : async () => null
    }

    /**
     * Initializes panel events and welcome message.
     */
    async init() {
        this.#endpoint = this.#resolveEndpoint()
        this.#debugEnabled = this.#resolveDebugEnabled()
        this.#debugLog('panel-init', { endpoint: this.#endpoint, debugEnabled: this.#debugEnabled })
        this.#bindEvents()
        this.#setBusyState(false)
        this.#appendMessage('assistant', this.translate('assistant.welcome'))
    }

    /**
     * Toggles panel visibility.
     * @param {boolean} [forceOpen]
     */
    toggle(forceOpen) {
        const overlay = this.els.overlay
        if (!overlay) return
        const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : overlay.hidden
        overlay.hidden = !shouldOpen
        if (this.els.toggle) {
            this.els.toggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false')
        }
        if (shouldOpen && this.els.input) {
            this.els.input.focus()
        }
        if (shouldOpen) {
            this.#scheduleOverlayBackdropSync()
        } else {
            this.#cancelOverlayBackdropSync()
        }
    }

    /**
     * Resolves the backend endpoint for the current host.
     * Local development uses the Node server route. Live hosting uses PHP.
     * @returns {string}
     */
    #resolveEndpoint() {
        return AppApiEndpointUtils.resolveAssistantEndpoint()
    }

    /**
     * Resolves whether client-side assistant debug logs are enabled.
     * Priority: URL query `aiDebug`, then localStorage key `AI_DEBUG_LOGS`.
     * @returns {boolean}
     */
    #resolveDebugEnabled() {
        const parseFlag = (value) => {
            const normalized = String(value || '')
                .trim()
                .toLowerCase()
            if (!normalized) return null
            if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
            if (['0', 'false', 'no', 'off'].includes(normalized)) return false
            return null
        }
        const queryFlag = parseFlag(new URLSearchParams(window.location.search).get('aiDebug'))
        if (typeof queryFlag === 'boolean') return queryFlag
        try {
            const storageFlag = parseFlag(window.localStorage.getItem('AI_DEBUG_LOGS'))
            if (typeof storageFlag === 'boolean') return storageFlag
        } catch (_error) {
            return AppApiEndpointUtils.isLocalHost()
        }
        return AppApiEndpointUtils.isLocalHost()
    }

    /**
     * Emits one client-side assistant debug log entry when enabled.
     * @param {string} event
     * @param {Record<string, any>} [context]
     */
    #debugLog(event, context = {}) {
        if (!this.#debugEnabled) return
        console.info(`[assistant-debug-ui] ${event}`, context)
    }

    /**
     * Binds panel event handlers once.
     */
    #bindEvents() {
        if (this.#bound) return
        this.#bound = true
        if (this.els.toggle) {
            this.els.toggle.addEventListener('click', () => this.toggle())
        }
        if (this.els.close) {
            this.els.close.addEventListener('click', () => this.toggle(false))
        }
        if (this.els.send) {
            this.els.send.addEventListener('click', () => this.#sendCurrentMessage())
        }
        if (this.els.input) {
            this.els.input.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' || event.shiftKey) return
                event.preventDefault()
                this.#sendCurrentMessage()
            })
        }
        if (this.els.attachSketch) {
            this.els.attachSketch.addEventListener('click', () => {
                if (!this.els.imageInput) return
                this.els.imageInput.value = ''
                this.els.imageInput.click()
            })
        }
        if (this.els.imageInput) {
            this.els.imageInput.addEventListener('change', () => this.#loadFileAttachments())
        }
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.els.overlay && !this.els.overlay.hidden) {
                this.toggle(false)
            }
        })
        this.#bindOverlayBackdropTracking()
    }

    /**
     * Binds viewport and preview listeners used for assistant overlay cutout sync.
     */
    #bindOverlayBackdropTracking() {
        const overlay = this.els.overlay
        if (!overlay) return
        const backdrop = this.#ensureOverlayBackdropPanes()
        if (!backdrop) return
        window.addEventListener('resize', this.#handleOverlayViewportChange, { passive: true })
        window.addEventListener('scroll', this.#handleOverlayViewportChange, { capture: true, passive: true })
        if (this.els.canvasWrap) {
            this.els.canvasWrap.addEventListener('scroll', this.#handleOverlayCanvasWrapScroll, { passive: true })
        }
        if (typeof ResizeObserver === 'function' && this.els.preview) {
            this.#overlayResizeObserver = new ResizeObserver(() => {
                this.#scheduleOverlayBackdropSync()
            })
            this.#overlayResizeObserver.observe(this.els.preview)
        }
    }

    /**
     * Ensures assistant overlay blur panes exist.
     * @returns {{ scrim: HTMLDivElement, top: HTMLDivElement, left: HTMLDivElement, right: HTMLDivElement, bottom: HTMLDivElement } | null}
     */
    #ensureOverlayBackdropPanes() {
        const overlay = this.els.overlay
        if (!overlay) return null
        if (this.#overlayBackdropElements) return this.#overlayBackdropElements
        const scrim = document.createElement('div')
        scrim.className = 'assistant-overlay-scrim'
        const top = document.createElement('div')
        top.className = 'assistant-overlay-pane assistant-overlay-pane-top'
        const left = document.createElement('div')
        left.className = 'assistant-overlay-pane assistant-overlay-pane-left'
        const right = document.createElement('div')
        right.className = 'assistant-overlay-pane assistant-overlay-pane-right'
        const bottom = document.createElement('div')
        bottom.className = 'assistant-overlay-pane assistant-overlay-pane-bottom'
        scrim.append(top, left, right, bottom)
        overlay.prepend(scrim)
        overlay.classList.add('assistant-overlay-cutout')
        this.#overlayBackdropElements = { scrim, top, left, right, bottom }
        return this.#overlayBackdropElements
    }

    /**
     * Resolves viewport dimensions used for cutout geometry.
     * @returns {{ width: number, height: number } | null}
     */
    #resolveViewportBounds() {
        const width = Math.max(0, Number(window.innerWidth || document.documentElement?.clientWidth || 0))
        const height = Math.max(0, Number(window.innerHeight || document.documentElement?.clientHeight || 0))
        if (!width || !height) return null
        return { width, height }
    }

    /**
     * Resolves a viewport-clamped cutout rectangle for the preview canvas.
     * @param {{ width: number, height: number }} viewport
     * @returns {{ left: number, top: number, right: number, bottom: number } | null}
     */
    #resolvePreviewHoleRect(viewport) {
        const preview = this.els.preview
        if (!preview || typeof preview.getBoundingClientRect !== 'function') return null
        const rect = preview.getBoundingClientRect()
        const leftRaw = Math.max(0, Math.min(viewport.width, Number(rect.left) || 0))
        const topRaw = Math.max(0, Math.min(viewport.height, Number(rect.top) || 0))
        const rightRaw = Math.max(leftRaw, Math.min(viewport.width, Number(rect.right) || 0))
        const bottomRaw = Math.max(topRaw, Math.min(viewport.height, Number(rect.bottom) || 0))
        if (rightRaw - leftRaw < 1 || bottomRaw - topRaw < 1) return null
        const left = Math.floor(leftRaw)
        const top = Math.floor(topRaw)
        const right = Math.ceil(rightRaw)
        const bottom = Math.ceil(bottomRaw)
        return { left, top, right, bottom }
    }

    /**
     * Schedules one animation-frame sync for the assistant overlay cutout panes.
     */
    #scheduleOverlayBackdropSync() {
        if (this.#overlayBackdropSyncFrame) return
        this.#overlayBackdropSyncFrame = window.requestAnimationFrame(() => {
            this.#overlayBackdropSyncFrame = null
            this.#syncOverlayBackdropPanes()
        })
    }

    /**
     * Cancels a queued animation-frame sync for the assistant overlay cutout panes.
     */
    #cancelOverlayBackdropSync() {
        if (!this.#overlayBackdropSyncFrame) return
        window.cancelAnimationFrame(this.#overlayBackdropSyncFrame)
        this.#overlayBackdropSyncFrame = null
    }

    /**
     * Updates blur pane geometry so the preview canvas remains unblurred.
     */
    #syncOverlayBackdropPanes() {
        const overlay = this.els.overlay
        if (!overlay || overlay.hidden) return
        const backdrop = this.#ensureOverlayBackdropPanes()
        if (!backdrop) return
        const viewport = this.#resolveViewportBounds()
        if (!viewport) return
        const holeRect = this.#resolvePreviewHoleRect(viewport)
        if (!holeRect) {
            this.#setBackdropPaneRect(backdrop.top, 0, 0, viewport.width, viewport.height)
            this.#setBackdropPaneRect(backdrop.left, 0, 0, 0, 0)
            this.#setBackdropPaneRect(backdrop.right, 0, 0, 0, 0)
            this.#setBackdropPaneRect(backdrop.bottom, 0, 0, 0, 0)
            return
        }
        const middleHeight = Math.max(0, holeRect.bottom - holeRect.top)
        this.#setBackdropPaneRect(backdrop.top, 0, 0, viewport.width, holeRect.top)
        this.#setBackdropPaneRect(backdrop.left, 0, holeRect.top, holeRect.left, middleHeight)
        this.#setBackdropPaneRect(backdrop.right, holeRect.right, holeRect.top, viewport.width - holeRect.right, middleHeight)
        this.#setBackdropPaneRect(backdrop.bottom, 0, holeRect.bottom, viewport.width, viewport.height - holeRect.bottom)
    }

    /**
     * Applies one absolute rectangle to a blur pane.
     * @param {HTMLDivElement} pane
     * @param {number} left
     * @param {number} top
     * @param {number} width
     * @param {number} height
     */
    #setBackdropPaneRect(pane, left, top, width, height) {
        const safeWidth = Math.max(0, Math.round(Number(width) || 0))
        const safeHeight = Math.max(0, Math.round(Number(height) || 0))
        pane.style.display = safeWidth > 0 && safeHeight > 0 ? 'block' : 'none'
        pane.style.left = `${Math.round(Number(left) || 0)}px`
        pane.style.top = `${Math.round(Number(top) || 0)}px`
        pane.style.width = `${safeWidth}px`
        pane.style.height = `${safeHeight}px`
    }

    /**
     * Loads selected sketch files and stages them as chat attachments.
     * @returns {Promise<void>}
     */
    async #loadFileAttachments() {
        const files = Array.from(this.els.imageInput?.files || [])
        for (const file of files) {
            if (!String(file.type || '').startsWith('image/')) continue
            const dataUrl = await this.#readFileAsDataUrl(file)
            if (!dataUrl) continue
            this.#attachments.push({
                id: crypto.randomUUID(),
                name: file.name || this.translate('assistant.attachmentUnnamed'),
                mimeType: file.type || 'image/png',
                dataUrl,
                source: 'file'
            })
        }
        this.#renderAttachments()
    }

    /**
     * Reads a file as data URL.
     * @param {File} file
     * @returns {Promise<string | null>}
     */
    #readFileAsDataUrl(file) {
        return new Promise((resolve) => {
            const reader = new FileReader()
            reader.onload = () => {
                resolve(typeof reader.result === 'string' ? reader.result : null)
            }
            reader.onerror = () => resolve(null)
            reader.readAsDataURL(file)
        })
    }

    /**
     * Resolves an automatic rendered-label attachment for assistant context.
     * @returns {Promise<{name: string, mime_type: string, data_url: string} | null>}
     */
    async #resolveRenderedLabelAttachment() {
        try {
            const attachment = await this.#getRenderedLabelAttachment()
            if (!attachment || typeof attachment !== 'object') return null
            const dataUrl = String(attachment.data_url || '')
            if (!dataUrl.startsWith('data:image/')) return null
            const mimeType = String(attachment.mime_type || 'image/png')
            const name = String(attachment.name || 'rendered-label.png')
            return {
                name,
                mime_type: mimeType,
                data_url: dataUrl
            }
        } catch (_error) {
            return null
        }
    }

    /**
     * Sends the current user message to the backend endpoint.
     * @returns {Promise<void>}
     */
    async #sendCurrentMessage() {
        if (this.#busy) return
        const rawText = String(this.els.input?.value || '').trim()
        if (!rawText && !this.#attachments.length) return
        this.#busy = true
        this.#setBusyState(true)
        this.#appendMessage('user', rawText || this.translate('assistant.sketchOnlyMessage'), this.#attachments)
        if (this.els.input) this.els.input.value = ''
        const userAttachmentCount = this.#attachments.length
        const actionContext = this.#buildActionRunContext({
            userText: rawText,
            hasUserAttachments: userAttachmentCount > 0
        })
        this.#debugLog('request-start', {
            textLength: rawText.length,
            userTextPreview: rawText.slice(0, 120),
            userAttachmentCount,
            forceRebuild: actionContext.forceRebuild,
            allowCreateIfMissing: actionContext.allowCreateIfMissing,
            preferredMedia: String(actionContext.preferredMedia || ''),
            hasPreviousResponseId: Boolean(this.#previousResponseId)
        })
        const outgoingAttachments = this.#attachments.map((attachment) => ({
            name: attachment.name,
            mime_type: attachment.mimeType,
            data_url: attachment.dataUrl
        }))
        const skipRenderedLabelForRebuild = actionContext.forceRebuild && userAttachmentCount > 0
        if (!skipRenderedLabelForRebuild) {
            const renderedLabelAttachment = await this.#resolveRenderedLabelAttachment()
            if (renderedLabelAttachment) {
                outgoingAttachments.unshift(renderedLabelAttachment)
            }
        }
        this.#debugLog('request-attachments', {
            outgoingAttachmentCount: outgoingAttachments.length,
            outgoingAttachmentNames: outgoingAttachments.map((attachment) => String(attachment?.name || 'unnamed')),
            skippedRenderedLabelForRebuild: skipRenderedLabelForRebuild
        })
        this.#attachments = []
        this.#renderAttachments()
        try {
            let response
            try {
                response = await this.#requestAssistant(rawText, outgoingAttachments, {
                    startFresh: actionContext.forceRebuild
                })
            } catch (error) {
                if (!AssistantErrorUtils.isMissingToolOutputErrorFromThrowable(error)) {
                    throw error
                }
                // Recover from stale thread chaining by retrying without previous_response_id.
                this.#debugLog('request-retry-start-fresh', {
                    reason: 'missing-tool-output',
                    previousResponseId: String(this.#previousResponseId || '')
                })
                this.#previousResponseId = null
                response = await this.#requestAssistant(rawText, outgoingAttachments, { startFresh: true })
            }
            const assistantText = AiResponseUtils.extractOutputText(response)
            const extractedActions = AiResponseUtils.extractActions(response)
            const functionCallCount = AiResponseUtils.countFunctionCalls(response)
            this.#debugLog('response-received', {
                requestId: String(response?._requestId || ''),
                status: String(response?.status || ''),
                incompleteReason: AiResponseUtils.extractIncompleteReason(response),
                functionCallCount,
                outputTextLength: assistantText.length,
                extractedActionCount: extractedActions.length
            })
            this.#debugLog('response-actions', {
                actions: extractedActions.map((entry, index) => ({
                    index,
                    action: String(entry?.action || ''),
                    itemId: String(entry?.itemId || entry?.target || ''),
                    keys: Object.keys(entry || {}).slice(0, 20)
                }))
            })
            if (assistantText) {
                this.#appendMessage('assistant', assistantText)
            }
            const actions = extractedActions
            if (actions.length) {
                const uiStateBeforeActions = this.#summarizeUiStateForDebug(this.#getUiState())
                const actionResult = await this.#onRunActions(actions, actionContext)
                const warnings = Array.isArray(actionResult?.warnings) ? actionResult.warnings : []
                const uiStateAfterActions = this.#summarizeUiStateForDebug(this.#getUiState())
                this.#debugLog('action-run-complete', {
                    requestId: String(response?._requestId || ''),
                    executedCount: actionResult.executed.length,
                    errorCount: actionResult.errors.length,
                    warningCount: warnings.length,
                    forceRebuild: actionContext.forceRebuild,
                    preferredMedia: String(actionContext.preferredMedia || ''),
                    executed: actionResult.executed,
                    errors: actionResult.errors,
                    warnings,
                    uiStateBeforeActions,
                    uiStateAfterActions
                })
                if (actionResult.executed.length) {
                    this.#appendMessage(
                        'system',
                        this.translate('assistant.actionsApplied', { count: actionResult.executed.length })
                    )
                }
                if (actionResult.errors.length) {
                    this.#appendMessage(
                        'system',
                        this.translate('assistant.actionsFailed', { count: actionResult.errors.length })
                    )
                    const detailPreview = actionResult.errors
                        .slice(0, 3)
                        .map((entry) => String(entry || '').trim())
                        .filter(Boolean)
                        .join(' | ')
                    if (detailPreview) {
                        this.#appendMessage(
                            'system',
                            this.translate('assistant.actionsFailedDetails', { details: detailPreview })
                        )
                    }
                }
                if (warnings.length) {
                    this.#appendMessage(
                        'system',
                        this.translate('assistant.actionsWarnings', { count: warnings.length })
                    )
                    const warningPreview = warnings
                        .slice(0, 3)
                        .map((entry) => String(entry || '').trim())
                        .filter(Boolean)
                        .join(' | ')
                    if (warningPreview) {
                        this.#appendMessage(
                            'system',
                            this.translate('assistant.actionsWarningsDetails', { details: warningPreview })
                        )
                    }
                }
                this.#pendingRebuildContext = null
            }
            if (!assistantText && !actions.length) {
                if (functionCallCount > 0) {
                    this.#appendMessage('assistant', this.translate('assistant.unhandledFunctionCall'))
                    return
                }
                const incompleteReason = AiResponseUtils.extractIncompleteReason(response)
                if (incompleteReason === 'max_output_tokens') {
                    this.#appendMessage('assistant', this.translate('assistant.incompleteMaxTokens'))
                } else {
                    this.#appendMessage('assistant', this.translate('assistant.emptyReply'))
                }
            }
            if (functionCallCount > 0) {
                // Function-call responses require explicit tool outputs before they can be chained.
                this.#previousResponseId = null
            } else if (typeof response?.id === 'string' && response.id.trim()) {
                this.#previousResponseId = response.id
            }
        } catch (error) {
            const message = AssistantErrorUtils.buildRuntimeErrorMessage(error, this.translate)
            this.#debugLog('request-error', {
                message,
                rawError: String(error?.message || error || '')
            })
            this.#appendMessage('system', this.translate('assistant.requestFailed', { message }))
            this.setStatus(this.translate('assistant.requestFailed', { message }), 'error')
        } finally {
            this.#busy = false
            this.#setBusyState(false)
        }
    }

    /**
     * Builds action runtime hints used to execute assistant tool calls safely.
     * @param {{ userText: string, hasUserAttachments: boolean }} options
     * @returns {{ forceRebuild: boolean, allowCreateIfMissing: boolean, preferredMedia: 'W3_5' | 'W6' | 'W9' | 'W12' | 'W18' | 'W24' | '' }}
     */
    #buildActionRunContext(options) {
        const userText = String(options?.userText || '')
        const hasUserAttachments = Boolean(options?.hasUserAttachments)
        const directRebuildIntent = this.#isRebuildIntent(userText, hasUserAttachments)
        const confirmationFollowUp =
            !directRebuildIntent &&
            !hasUserAttachments &&
            Boolean(this.#pendingRebuildContext) &&
            this.#isRebuildConfirmationReply(userText)
        const forceRebuild = directRebuildIntent || confirmationFollowUp
        let preferredMedia = this.#resolvePreferredMediaFromText(userText)
        if (!preferredMedia && confirmationFollowUp) {
            preferredMedia = String(this.#pendingRebuildContext?.preferredMedia || '')
        }
        if (directRebuildIntent) {
            this.#pendingRebuildContext = {
                preferredMedia: preferredMedia || String(this.#pendingRebuildContext?.preferredMedia || '')
            }
        } else if (!confirmationFollowUp && String(userText || '').trim()) {
            this.#pendingRebuildContext = null
        }
        return {
            forceRebuild,
            allowCreateIfMissing: forceRebuild,
            preferredMedia
        }
    }

    /**
     * Extracts an explicit media width intent from user text (e.g. "24mm" or "W24").
     * @param {string} userText
     * @returns {'W3_5' | 'W6' | 'W9' | 'W12' | 'W18' | 'W24' | ''}
     */
    #resolvePreferredMediaFromText(userText) {
        return MediaIntentUtils.resolvePreferredMedia(String(userText || ''))
    }

    /**
     * Builds a compact UI-state summary for debug logs.
     * @param {Record<string, any>} rawUiState
     * @returns {{ media: string, orientation: string, selectedItemIds: string[], itemCount: number, items: Array<Record<string, any>> }}
     */
    #summarizeUiStateForDebug(rawUiState) {
        const uiState = rawUiState && typeof rawUiState === 'object' ? rawUiState : {}
        const items = Array.isArray(uiState.items) ? uiState.items : []
        return {
            media: String(uiState.media || ''),
            orientation: String(uiState.orientation || ''),
            selectedItemIds: Array.isArray(uiState.selectedItemIds)
                ? uiState.selectedItemIds.map((entry) => String(entry || '')).filter(Boolean)
                : [],
            itemCount: items.length,
            items: items.slice(0, 12).map((item) => ({
                id: String(item?.id || ''),
                type: String(item?.type || ''),
                xOffset: Number(item?.xOffset || 0),
                yOffset: Number(item?.yOffset || 0),
                width: Number(item?.width || 0),
                height: Number(item?.height || 0),
                textPreview: typeof item?.textPreview === 'string' ? item.textPreview : undefined,
                dataPreview: typeof item?.dataPreview === 'string' ? item.dataPreview : undefined
            }))
        }
    }

    /**
     * Detects "build from sketch/photo" intents where a clean rebuild is expected.
     * @param {string} userText
     * @param {boolean} hasUserAttachments
     * @returns {boolean}
     */
    #isRebuildIntent(userText, hasUserAttachments) {
        if (!hasUserAttachments) return false
        const normalizedText = String(userText || '')
        if (!normalizedText.trim()) return true
        return AssistantToolChoiceUtils.isLikelyRebuildIntentMessage(normalizedText)
    }

    /**
     * Detects short confirmation replies that should continue a pending rebuild.
     * @param {string} userText
     * @returns {boolean}
     */
    #isRebuildConfirmationReply(userText) {
        return AssistantToolChoiceUtils.isShortConfirmation(userText)
    }

    /**
     * Updates assistant controls and activity indicator while a request is in-flight.
     * @param {boolean} busy
     */
    #setBusyState(busy) {
        const isBusy = Boolean(busy)
        if (this.els.send) this.els.send.disabled = isBusy
        if (this.els.attachSketch) this.els.attachSketch.disabled = isBusy
        if (this.els.input) this.els.input.disabled = isBusy
        if (this.els.working) this.els.working.hidden = !isBusy
        this.#renderMessages()
    }

    /**
     * Requests one assistant turn from the backend endpoint.
     * @param {string} userText
     * @param {Array<{name: string, mime_type: string, data_url: string}>} attachments
     * @param {{ startFresh?: boolean }} [options]
     * @returns {Promise<any>}
     */
    async #requestAssistant(userText, attachments, options = {}) {
        const shouldStartFresh = Boolean(options.startFresh)
        const payload = {
            message: userText || this.translate('assistant.sketchOnlyMessage'),
            previous_response_id: shouldStartFresh ? undefined : this.#previousResponseId || undefined,
            ui_state: this.#getUiState(),
            ui_capabilities: this.#getActionCapabilities(),
            attachments
        }
        this.#debugLog('request-payload', {
            endpoint: this.#endpoint,
            startFresh: shouldStartFresh,
            previousResponseId: payload.previous_response_id ? String(payload.previous_response_id) : '',
            uiItemCount: Array.isArray(payload.ui_state?.items) ? payload.ui_state.items.length : 0
        })
        const response = await fetch(this.#endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        const requestId = String(response.headers.get('X-AI-Request-Id') || '')
        if (!response.ok) {
            const parsedError = await this.#parseErrorResponse(response)
            const status = Number(response.status || 0)
            this.#debugLog('request-http-error', {
                requestId,
                status,
                parsedErrorPayload: parsedError.payload,
                parsedErrorText: parsedError.text
            })
            const missingToolOutput = AssistantErrorUtils.isMissingToolOutputError({
                status,
                payload: parsedError.payload,
                fallbackText: parsedError.text
            })
            const detail = AssistantErrorUtils.buildRequestErrorMessage({
                status,
                payload: parsedError.payload,
                fallbackText: parsedError.text,
                translate: this.translate
            })
            const requestError = new Error(detail || this.translate('assistant.errorHttp', { status: response.status || '?' }))
            if (missingToolOutput) {
                requestError.code = 'assistant_missing_tool_output'
            }
            throw requestError
        }
        const parsedResponse = await response.json()
        if (parsedResponse && typeof parsedResponse === 'object') {
            parsedResponse._requestId = requestId
        }
        return parsedResponse
    }

    /**
     * Parses a failed backend response body as both JSON and text.
     * @param {Response} response
     * @returns {Promise<{ payload: unknown, text: string }>}
     */
    async #parseErrorResponse(response) {
        const [payload, rawText] = await Promise.all([
            response
                .clone()
                .json()
                .catch(() => null),
            response
                .clone()
                .text()
                .catch(() => '')
        ])
        return {
            payload,
            text: String(rawText || '').trim()
        }
    }

    /**
     * Appends one message bubble to the chat transcript.
     * @param {'user' | 'assistant' | 'system'} role
     * @param {string} text
     * @param {Array<{name: string}>} [attachments]
     */
    #appendMessage(role, text, attachments = []) {
        const entry = {
            id: crypto.randomUUID(),
            role,
            text: String(text || ''),
            attachments: Array.isArray(attachments) ? attachments.map((item) => ({ name: item.name })) : []
        }
        this.#messages.push(entry)
        this.#renderMessages()
    }

    /**
     * Renders chat transcript.
     */
    #renderMessages() {
        if (!this.els.messages) return
        this.els.messages.innerHTML = ''
        this.#messages.forEach((entry) => {
            const bubble = document.createElement('article')
            bubble.className = `assistant-message ${entry.role}`
            const roleLabel = document.createElement('div')
            roleLabel.className = 'assistant-message-role'
            roleLabel.textContent =
                entry.role === 'user'
                    ? this.translate('assistant.roleUser')
                    : entry.role === 'assistant'
                      ? this.translate('assistant.roleAssistant')
                      : this.translate('assistant.roleSystem')
            bubble.appendChild(roleLabel)
            const textNode = document.createElement('pre')
            textNode.className = 'assistant-message-text'
            textNode.textContent = entry.text
            bubble.appendChild(textNode)
            if (entry.attachments.length) {
                const attachmentNode = document.createElement('div')
                attachmentNode.className = 'assistant-message-attachments'
                attachmentNode.textContent = entry.attachments
                    .map((attachment) => attachment.name || this.translate('assistant.attachmentUnnamed'))
                    .join(', ')
                bubble.appendChild(attachmentNode)
            }
            this.els.messages.appendChild(bubble)
        })
        if (this.#busy) {
            const bubble = document.createElement('article')
            bubble.className = 'assistant-message assistant-working-message'
            const roleLabel = document.createElement('div')
            roleLabel.className = 'assistant-message-role'
            roleLabel.textContent = this.translate('assistant.roleAssistant')
            bubble.appendChild(roleLabel)
            const textNode = document.createElement('pre')
            textNode.className = 'assistant-message-text'
            textNode.textContent = this.translate('assistant.working')
            bubble.appendChild(textNode)
            this.els.messages.appendChild(bubble)
        }
        this.els.messages.scrollTop = this.els.messages.scrollHeight
    }

    /**
     * Renders staged attachments before sending.
     */
    #renderAttachments() {
        if (!this.els.attachments) return
        this.els.attachments.innerHTML = ''
        this.#attachments.forEach((attachment) => {
            const item = document.createElement('div')
            item.className = 'assistant-attachment'
            const label = document.createElement('span')
            label.className = 'assistant-attachment-label'
            label.textContent = attachment.name
            item.appendChild(label)
            const remove = document.createElement('button')
            remove.type = 'button'
            remove.className = 'ghost assistant-attachment-remove'
            remove.textContent = this.translate('assistant.removeAttachment')
            remove.addEventListener('click', () => {
                this.#attachments = this.#attachments.filter((entry) => entry.id !== attachment.id)
                this.#renderAttachments()
            })
            item.appendChild(remove)
            this.els.attachments.appendChild(item)
        })
        this.els.attachments.hidden = this.#attachments.length === 0
    }
}
