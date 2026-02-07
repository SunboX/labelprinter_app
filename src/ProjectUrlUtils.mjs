/**
 * URL encoding helpers for project sharing.
 */
export class ProjectUrlUtils {
    static #projectParam = 'project'
    static #projectUrlParam = 'projectUrl'

    /**
     * Returns the query parameter key for embedded project payloads.
     * @returns {string}
     */
    static get PROJECT_PARAM() {
        return ProjectUrlUtils.#projectParam
    }

    /**
     * Returns the query parameter key for remote project URLs.
     * @returns {string}
     */
    static get PROJECT_URL_PARAM() {
        return ProjectUrlUtils.#projectUrlParam
    }

    /**
     * Converts bytes to a base64url string.
     * @param {Uint8Array} bytes
     * @returns {string}
     */
    static #toBase64Url(bytes) {
        let binary = ''
        const chunkSize = 0x8000
        for (let index = 0; index < bytes.length; index += chunkSize) {
            const chunk = bytes.subarray(index, index + chunkSize)
            binary += String.fromCharCode(...chunk)
        }
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    }

    /**
     * Converts a base64url string to bytes.
     * @param {string} value
     * @returns {Uint8Array}
     */
    static #fromBase64Url(value) {
        const normalized = String(value || '')
            .replace(/-/g, '+')
            .replace(/_/g, '/')
        const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
        const binary = atob(normalized + padding)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i)
        }
        return bytes
    }

    /**
     * Encodes a project payload for URL transport.
     * @param {object} payload
     * @returns {string}
     */
    static encodeProjectPayloadParam(payload) {
        const encodedText = new TextEncoder().encode(JSON.stringify(payload))
        return ProjectUrlUtils.#toBase64Url(encodedText)
    }

    /**
     * Decodes a base64url project parameter to an object.
     * @param {string} paramValue
     * @returns {object}
     */
    static decodeEmbeddedProjectParam(paramValue) {
        const bytes = ProjectUrlUtils.#fromBase64Url(paramValue)
        const jsonText = new TextDecoder().decode(bytes)
        return JSON.parse(jsonText)
    }

    /**
     * Detects whether a parameter value appears to be a URL reference.
     * @param {string} value
     * @returns {boolean}
     */
    static isLikelyProjectUrl(value) {
        if (typeof value !== 'string') return false
        const trimmed = value.trim()
        if (!trimmed) return false
        return /^(https?:\/\/|\/|\.\/|\.\.\/)/i.test(trimmed)
    }

    /**
     * Resolves project source information from URL query parameters.
     * @param {URLSearchParams} searchParams
     * @returns {{ kind: 'embedded' | 'remote' | null, value: string | null }}
     */
    static resolveProjectSource(searchParams) {
        const embedded = searchParams.get(ProjectUrlUtils.PROJECT_PARAM)
        if (embedded) {
            return { kind: 'embedded', value: embedded }
        }
        const remote = searchParams.get(ProjectUrlUtils.PROJECT_URL_PARAM)
        if (remote) {
            return { kind: 'remote', value: remote }
        }
        return { kind: null, value: null }
    }
}
