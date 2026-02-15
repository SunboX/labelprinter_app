/**
 * Utility helpers for extracting explicit media-width intent from user prompts.
 */
export class MediaIntentUtils {
    /**
     * Resolves an explicit media width mention from free-form text.
     * Accepts tokens like "W24", "24mm", "24 mm", "24-mm", "24 millimeter".
     * @param {string} rawText
     * @returns {'W3_5' | 'W6' | 'W9' | 'W12' | 'W18' | 'W24' | ''}
     */
    static resolvePreferredMedia(rawText) {
        const normalized = MediaIntentUtils.#normalizeText(rawText)
        if (!normalized) return ''
        const wCodeMatch = normalized.match(/(?:^|[^a-z0-9])w\s*(3(?:\.\d+)?|6|9|12|18|24)\b/)
        if (wCodeMatch?.[1]) {
            return MediaIntentUtils.#mapMillimeterToken(wCodeMatch[1])
        }
        const mmMatch = normalized.match(
            /(?:^|[^0-9])(3(?:\.\d+)?|6|9|12|18|24)\s*(?:mm|millimeter|millimetre|millimeters|millimetres)\b/
        )
        if (mmMatch?.[1]) {
            return MediaIntentUtils.#mapMillimeterToken(mmMatch[1])
        }
        return ''
    }

    /**
     * Maps a parsed millimeter width token to a media id.
     * @param {string} token
     * @returns {'W3_5' | 'W6' | 'W9' | 'W12' | 'W18' | 'W24' | ''}
     */
    static #mapMillimeterToken(token) {
        const value = String(token || '')
            .replace(',', '.')
            .trim()
        if (value === '3.5') return 'W3_5'
        if (value === '6') return 'W6'
        if (value === '9') return 'W9'
        if (value === '12') return 'W12'
        if (value === '18') return 'W18'
        if (value === '24') return 'W24'
        return ''
    }

    /**
     * Normalizes user text for tolerant intent matching.
     * @param {string} rawText
     * @returns {string}
     */
    static #normalizeText(rawText) {
        return String(rawText || '')
            .toLowerCase()
            .replace(/,/g, '.')
            .trim()
    }
}
