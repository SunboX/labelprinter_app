/**
 * Shared helpers for deciding when assistant requests should force tool output.
 */
export class AssistantToolChoiceUtils {
    /**
     * Returns true for short "continue" confirmations.
     * @param {string} message
     * @returns {boolean}
     */
    static isShortConfirmation(message) {
        const normalized = String(message || '')
            .trim()
            .toLowerCase()
        if (!normalized) return false
        return /^(?:y|yes|yeah|yep|ok|okay|sure|go|go ahead|proceed|continue|do it|ja|jep|klar|mach|weiter|passt)$/.test(
            normalized
        )
    }

    /**
     * Returns true when the message likely asks for a sketch/image rebuild.
     * @param {string} message
     * @returns {boolean}
     */
    static isLikelyRebuildIntentMessage(message) {
        const normalized = String(message || '')
            .trim()
            .toLowerCase()
        if (!normalized) return false
        return /(?:create|recreate|rebuild|match|copy|like this|such kind|from (?:photo|image|sketch)|nachbau|nachbild|erstell|neu aufbauen|wie auf dem bild)/.test(
            normalized
        )
    }

    /**
     * Returns true when at least one image attachment is present.
     * @param {Array<Record<string, any>>} attachments
     * @returns {boolean}
     */
    static hasImageAttachment(attachments) {
        if (!Array.isArray(attachments)) return false
        return attachments.some((attachment) => {
            const dataUrl = String(attachment?.data_url || attachment?.dataUrl || '')
            return dataUrl.startsWith('data:image/')
        })
    }

    /**
     * Returns true when assistant output should be forced to editor_action tool usage.
     * @param {{ message: string, attachments: Array<Record<string, any>>, previousResponseId: string }} options
     * @returns {boolean}
     */
    static shouldForceEditorToolChoice({ message, attachments, previousResponseId }) {
        const normalized = String(message || '')
            .trim()
            .toLowerCase()
        if (this.isShortConfirmation(normalized) && String(previousResponseId || '').trim()) {
            return true
        }
        const hasImageAttachment = this.hasImageAttachment(attachments)
        if (!hasImageAttachment) return false
        if (!normalized) return true
        if (this.isLikelyRebuildIntentMessage(normalized)) return true
        return !normalized.endsWith('?')
    }
}
