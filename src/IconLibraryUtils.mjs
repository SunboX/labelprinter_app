import { ICON_MANIFEST } from './assets/icons/icon-manifest.mjs'

/**
 * Catalog and helper methods for monochrome SVG icon items loaded from assets.
 */
export class IconLibraryUtils {
    static #ICON_BASE_PATH = 'assets/icons'
    static #warningMessages = new Set()
    static #invalidIconIds = new Set()
    static #validatedIconIds = new Set()
    static #validationPromises = new Map()
    static #ICONS = Object.freeze(IconLibraryUtils.#buildIconDefinitions())
    static #ICON_BY_ID = new Map(IconLibraryUtils.#ICONS.map((entry) => [entry.id, entry]))
    static #DEFAULT_ICON_ID = IconLibraryUtils.#ICONS[0]?.id || ''

    /**
     * Returns all icon definitions.
     * @returns {Array<{ id: string, category: string, label: string, file: string, svgPath: string }>}
     */
    static getIconDefinitions() {
        return IconLibraryUtils.#ICONS
    }

    /**
     * Returns the default icon id.
     * @returns {string}
     */
    static getDefaultIconId() {
        return IconLibraryUtils.#DEFAULT_ICON_ID
    }

    /**
     * Normalizes an icon id to a known catalog entry.
     * @param {string} iconId
     * @returns {string}
     */
    static normalizeIconId(iconId) {
        const normalized = String(iconId || '').trim()
        const fallbackId = IconLibraryUtils.#resolveFallbackIconId()
        if (!normalized) return fallbackId
        if (IconLibraryUtils.#invalidIconIds.has(normalized)) return fallbackId
        return IconLibraryUtils.#ICON_BY_ID.has(normalized) ? normalized : fallbackId
    }

    /**
     * Resolves a catalog entry for an icon id.
     * @param {string} iconId
     * @returns {{ id: string, category: string, label: string, file: string, svgPath: string }}
     */
    static getIconDefinition(iconId) {
        const normalized = IconLibraryUtils.normalizeIconId(iconId)
        return IconLibraryUtils.#ICON_BY_ID.get(normalized) || IconLibraryUtils.#ICONS[0]
    }

    /**
     * Returns a static icon URL path. SVG metadata validation is lazy and runs on first use.
     * @param {string} iconId
     * @param {{ validate?: boolean }} [options={}]
     * @returns {string}
     */
    static getIconSvgDataUrl(iconId, options = {}) {
        const entry = IconLibraryUtils.getIconDefinition(iconId)
        if (!entry?.svgPath) return ''
        if (options.validate !== false) {
            void IconLibraryUtils.ensureIconUsable(entry.id)
        }
        return entry.svgPath
    }

    /**
     * Ensures an icon can be used by validating its SVG metadata on demand.
     * Falls back to the default icon when validation fails.
     * @param {string} iconId
     * @returns {Promise<string>}
     */
    static async ensureIconUsable(iconId) {
        const normalized = IconLibraryUtils.normalizeIconId(iconId)
        if (!normalized) return ''
        const entry = IconLibraryUtils.#ICON_BY_ID.get(normalized)
        if (!entry) return IconLibraryUtils.#resolveFallbackIconId()
        await IconLibraryUtils.#validateIconEntry(entry)
        return IconLibraryUtils.normalizeIconId(entry.id)
    }

    /**
     * Groups icon definitions by category for popup sections.
     * @returns {Array<{ category: string, items: Array<{ id: string, label: string }> }>}
     */
    static getGroupedIconOptions() {
        /** @type {Map<string, Array<{ id: string, label: string }>>} */
        const grouped = new Map()
        IconLibraryUtils.#ICONS.forEach((entry) => {
            if (IconLibraryUtils.#invalidIconIds.has(entry.id)) return
            if (!grouped.has(entry.category)) {
                grouped.set(entry.category, [])
            }
            grouped.get(entry.category).push({ id: entry.id, label: entry.label })
        })
        return Array.from(grouped.entries()).map(([category, items]) => ({ category, items }))
    }

    /**
     * Builds icon definitions from the generated icon manifest.
     * @returns {Array<{ id: string, category: string, label: string, file: string, svgPath: string }>}
     */
    static #buildIconDefinitions() {
        /** @type {Array<{ id: string, category: string, label: string, file: string, svgPath: string }>} */
        const definitions = []
        const seenIds = new Set()

        ICON_MANIFEST.forEach((entry, index) => {
            const file = String(entry?.file || '').trim()
            const id = String(entry?.id || '').trim()
            const category = String(entry?.category || '').trim()
            const label = String(entry?.label || '').trim()

            if (!file || !id || !category || !label) {
                IconLibraryUtils.#warn(
                    `Skipping icon manifest entry at index ${index}: missing required fields (file/id/category/label).`
                )
                return
            }
            if (seenIds.has(id)) {
                IconLibraryUtils.#warn(`Skipping duplicate icon id "${id}" in manifest.`)
                return
            }
            seenIds.add(id)
            definitions.push(
                Object.freeze({
                    id,
                    category,
                    label,
                    file,
                    svgPath: `${IconLibraryUtils.#ICON_BASE_PATH}/${file}`
                })
            )
        })

        if (definitions.length === 0) {
            IconLibraryUtils.#warn('No valid icon definitions found in icon manifest.')
        }

        return definitions
    }

    /**
     * Resolves the current fallback icon id.
     * @returns {string}
     */
    static #resolveFallbackIconId() {
        const firstValid = IconLibraryUtils.#ICONS.find((entry) => !IconLibraryUtils.#invalidIconIds.has(entry.id))
        return firstValid?.id || IconLibraryUtils.#DEFAULT_ICON_ID
    }

    /**
     * Validates one icon entry and caches the result.
     * @param {{ id: string, category: string, label: string, svgPath: string }} entry
     * @returns {Promise<void>}
     */
    static async #validateIconEntry(entry) {
        if (!IconLibraryUtils.#isBrowserRuntime()) return
        if (IconLibraryUtils.#validatedIconIds.has(entry.id)) return
        if (IconLibraryUtils.#invalidIconIds.has(entry.id)) return
        if (IconLibraryUtils.#validationPromises.has(entry.id)) {
            await IconLibraryUtils.#validationPromises.get(entry.id)
            return
        }

        const validationPromise = fetch(entry.svgPath, { cache: 'force-cache' })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`)
                }
                const svgContent = await response.text()
                const attributes = IconLibraryUtils.#extractSvgRootAttributes(svgContent)
                const missingAttributes = ['id', 'category', 'label'].filter((key) => !attributes[key])
                if (missingAttributes.length > 0) {
                    IconLibraryUtils.#invalidIconIds.add(entry.id)
                    IconLibraryUtils.#warn(
                        `Icon "${entry.id}" cannot be used: missing SVG attributes ${missingAttributes.join(', ')}.`
                    )
                    return
                }

                const mismatches = []
                if (attributes.id !== entry.id) mismatches.push(`id="${attributes.id}" expected "${entry.id}"`)
                if (attributes.category !== entry.category) {
                    mismatches.push(`category="${attributes.category}" expected "${entry.category}"`)
                }
                if (attributes.label !== entry.label) {
                    mismatches.push(`label="${attributes.label}" expected "${entry.label}"`)
                }

                if (mismatches.length > 0) {
                    IconLibraryUtils.#invalidIconIds.add(entry.id)
                    IconLibraryUtils.#warn(`Icon "${entry.id}" cannot be used: ${mismatches.join('; ')}.`)
                    return
                }

                IconLibraryUtils.#validatedIconIds.add(entry.id)
            })
            .catch((error) => {
                IconLibraryUtils.#invalidIconIds.add(entry.id)
                IconLibraryUtils.#warn(`Icon "${entry.id}" cannot be used: failed to load SVG (${error.message}).`)
            })
            .finally(() => {
                IconLibraryUtils.#validationPromises.delete(entry.id)
            })

        IconLibraryUtils.#validationPromises.set(entry.id, validationPromise)
        await validationPromise
    }

    /**
     * Extracts root SVG attributes for metadata validation.
     * @param {string} svgContent
     * @returns {{ id: string, category: string, label: string }}
     */
    static #extractSvgRootAttributes(svgContent) {
        const rootMatch = String(svgContent || '').match(/<svg\b([^>]*)>/i)
        if (!rootMatch) return { id: '', category: '', label: '' }
        const rawAttributes = rootMatch[1]
        const read = (name) => {
            const match = rawAttributes.match(new RegExp(`\\b${name}=\"([^\"]*)\"`, 'i'))
            return match ? match[1].trim() : ''
        }
        return {
            id: read('id'),
            category: read('category'),
            label: read('label')
        }
    }

    /**
     * Determines if runtime environment supports browser-side icon validation.
     * @returns {boolean}
     */
    static #isBrowserRuntime() {
        return typeof window !== 'undefined' && typeof fetch === 'function'
    }

    /**
     * Prints a warning once per unique message.
     * @param {string} message
     * @returns {void}
     */
    static #warn(message) {
        if (IconLibraryUtils.#warningMessages.has(message)) return
        IconLibraryUtils.#warningMessages.add(message)
        console.warn(`[IconLibraryUtils] ${message}`)
    }
}
