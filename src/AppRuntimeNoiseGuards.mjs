const EXTENSION_ASYNC_CHANNEL_CLOSED_MESSAGE =
    'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received'

/**
 * Installs runtime guards that suppress known browser-extension noise.
 */
export class AppRuntimeNoiseGuards {
    /**
     * Installs a narrow unhandled-rejection filter for extension message-channel noise.
     * This prevents extension-originated promise rejections from surfacing as app errors.
     */
    static install() {
        window.addEventListener('unhandledrejection', (event) => {
            const message = AppRuntimeNoiseGuards.#extractErrorLikeMessage(event?.reason)
            if (!AppRuntimeNoiseGuards.#isExtensionMessageChannelNoise(message)) return
            event.preventDefault()
            console.info('Ignored browser-extension runtime message-channel rejection:', message)
        })
    }

    /**
     * Extracts a normalized message string from unknown error-like values.
     * @param {unknown} errorLike
     * @returns {string}
     */
    static #extractErrorLikeMessage(errorLike) {
        if (!errorLike || typeof errorLike !== 'object') {
            return String(errorLike || '').trim()
        }
        if ('message' in errorLike) {
            return String(/** @type {{ message?: unknown }} */ (errorLike).message || '').trim()
        }
        return String(errorLike).trim()
    }

    /**
     * Returns true when a message matches the known extension channel-close noise.
     * @param {string} message
     * @returns {boolean}
     */
    static #isExtensionMessageChannelNoise(message) {
        return String(message || '').includes(EXTENSION_ASYNC_CHANNEL_CLOSED_MESSAGE)
    }
}
