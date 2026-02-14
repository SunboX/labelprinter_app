import { AiResponseUtils } from '../AiResponseUtils.mjs'
import { AssistantErrorUtils } from '../AssistantErrorUtils.mjs'

/**
 * In-app assistant chat panel with optional sketch attachments and action execution.
 */
export class AiAssistantPanel {
    #translate = (key) => key
    #onRunActions = async () => ({ executed: [], errors: [] })
    #getUiState = () => ({})
    #getActionCapabilities = () => ({})
    #getRenderedLabelAttachment = async () => null
    #messages = []
    #attachments = []
    #previousResponseId = null
    #busy = false
    #bound = false
    #endpoint = ''

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
     * @param {(actions: Array<Record<string, any>>) => Promise<{ executed: string[], errors: string[] }>} callback
     */
    set onRunActions(callback) {
        this.#onRunActions = typeof callback === 'function' ? callback : async () => ({ executed: [], errors: [] })
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
    }

    /**
     * Resolves the backend endpoint for the current host.
     * Local development uses the Node server route. Live hosting uses PHP.
     * @returns {string}
     */
    #resolveEndpoint() {
        const host = String(window.location.hostname || '').toLowerCase()
        const isLocalHost =
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host === '::1' ||
            host.endsWith('.localhost')
        return isLocalHost ? '/api/chat' : '/api/chat.php'
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
        const outgoingAttachments = this.#attachments.map((attachment) => ({
            name: attachment.name,
            mime_type: attachment.mimeType,
            data_url: attachment.dataUrl
        }))
        const renderedLabelAttachment = await this.#resolveRenderedLabelAttachment()
        if (renderedLabelAttachment) {
            outgoingAttachments.unshift(renderedLabelAttachment)
        }
        this.#attachments = []
        this.#renderAttachments()
        try {
            const response = await this.#requestAssistant(rawText, outgoingAttachments, {
                startFresh: actionContext.forceRebuild
            })
            const assistantText = AiResponseUtils.extractOutputText(response)
            if (assistantText) {
                this.#appendMessage('assistant', assistantText)
            }
            const actions = AiResponseUtils.extractActions(response)
            if (actions.length) {
                const actionResult = await this.#onRunActions(actions, actionContext)
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
            }
            if (!assistantText && !actions.length) {
                const functionCallCount = AiResponseUtils.countFunctionCalls(response)
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
            this.#previousResponseId = typeof response?.id === 'string' ? response.id : this.#previousResponseId
        } catch (error) {
            const message = AssistantErrorUtils.buildRuntimeErrorMessage(error, this.translate)
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
     * @returns {{ forceRebuild: boolean, allowCreateIfMissing: boolean }}
     */
    #buildActionRunContext(options) {
        const userText = String(options?.userText || '')
        const hasUserAttachments = Boolean(options?.hasUserAttachments)
        const forceRebuild = this.#isRebuildIntent(userText, hasUserAttachments)
        return {
            forceRebuild,
            allowCreateIfMissing: forceRebuild
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
        const normalizedText = String(userText || '').toLowerCase()
        if (!normalizedText) return true
        return /(?:create|recreate|rebuild|match|copy|like this|such kind|from (?:photo|image|sketch)|nachbau|nachbild|erstell|neu aufbauen|wie auf dem bild)/.test(
            normalizedText
        )
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
        const response = await fetch(this.#endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        if (!response.ok) {
            const parsedError = await this.#parseErrorResponse(response)
            const detail = AssistantErrorUtils.buildRequestErrorMessage({
                status: Number(response.status || 0),
                payload: parsedError.payload,
                fallbackText: parsedError.text,
                translate: this.translate
            })
            throw new Error(detail || this.translate('assistant.errorHttp', { status: response.status || '?' }))
        }
        return response.json()
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
