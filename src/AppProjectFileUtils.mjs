/**
 * Helpers for project import/export file-picker flows.
 */
export class AppProjectFileUtils {
    /**
     * Builds a suggested file name for project exports.
     * @param {Date} [now]
     * @returns {string}
     */
    static buildSuggestedFileName(now = new Date()) {
        const stamp = now.toISOString().slice(0, 10)
        return `label-project-${stamp}.json`
    }

    /**
     * Triggers a download for browsers without a save file picker.
     * @param {string} contents
     * @param {string} fileName
     * @param {Document} [documentRef]
     */
    static downloadProjectFallback(contents, fileName, documentRef = document) {
        const blob = new Blob([contents], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = documentRef.createElement('a')
        link.href = url
        link.download = fileName
        documentRef.body.appendChild(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
    }

    /**
     * Prompts the user for one local JSON file.
     * @param {{
     *   translate: (key: string) => string,
     *   inputElement: HTMLInputElement | null,
     *   windowRef?: Window
     * }} options
     * @returns {Promise<File | null>}
     */
    static async promptForProjectFile(options) {
        const translate = typeof options?.translate === 'function' ? options.translate : (key) => key
        const inputElement = options?.inputElement || null
        const windowRef = options?.windowRef || window
        if (typeof windowRef?.showOpenFilePicker === 'function') {
            const [handle] = await windowRef.showOpenFilePicker({
                multiple: false,
                types: [
                    {
                        description: translate('messages.projectJsonDescription'),
                        accept: { 'application/json': ['.json'] }
                    }
                ]
            })
            return handle ? handle.getFile() : null
        }

        if (!inputElement) return null

        return new Promise((resolve) => {
            let settled = false
            const cleanup = () => {
                inputElement.removeEventListener('change', onChange)
                windowRef.removeEventListener('focus', onFocus)
            }
            const onChange = () => {
                settled = true
                cleanup()
                resolve(inputElement.files?.[0] ?? null)
            }
            const onFocus = () => {
                windowRef.setTimeout(() => {
                    if (settled) return
                    cleanup()
                    resolve(null)
                }, 0)
            }
            // Fallback to a hidden file input when the picker API is unavailable.
            inputElement.addEventListener('change', onChange)
            windowRef.addEventListener('focus', onFocus, { once: true })
            inputElement.value = ''
            inputElement.click()
        })
    }
}
