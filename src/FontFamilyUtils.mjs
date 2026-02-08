/**
 * Utilities for resolving font-family options for text items.
 */
export class FontFamilyUtils {
    static #fallbackFontFamilies = [
        'Barlow',
        'Arial',
        'Verdana',
        'Tahoma',
        'Trebuchet MS',
        'Helvetica',
        'Times New Roman',
        'Georgia',
        'Courier New',
        'Consolas',
        'Monaco',
        'serif',
        'sans-serif',
        'monospace'
    ]

    /**
     * Returns default fallback font families.
     * @returns {string[]}
     */
    static getFallbackFontFamilies() {
        return [...FontFamilyUtils.#fallbackFontFamilies]
    }

    /**
     * Normalizes and de-duplicates Google Fonts URLs.
     * @param {unknown[]} urls
     * @returns {string[]}
     */
    static normalizeGoogleFontLinks(urls) {
        const links = []
        const seen = new Set()
        if (!Array.isArray(urls)) return links
        urls.forEach((url) => {
            const text = String(url || '').trim()
            if (!text || seen.has(text)) return
            seen.add(text)
            links.push(text)
        })
        return links
    }

    /**
     * Normalizes, de-duplicates, and sorts font family names.
     * @param {unknown[]} fontFamilies
     * @param {string} [preferredFamily='']
     * @returns {string[]}
     */
    static normalizeFontFamilies(fontFamilies, preferredFamily = '') {
        const unique = new Map()
        if (Array.isArray(fontFamilies)) {
            fontFamilies.forEach((family) => {
                const normalized = String(family || '').trim()
                if (!normalized) return
                const key = normalized.toLocaleLowerCase()
                if (unique.has(key)) return
                unique.set(key, normalized)
            })
        }

        const names = Array.from(unique.values()).sort((a, b) => a.localeCompare(b))
        const preferred = String(preferredFamily || '').trim()
        if (!preferred) {
            return names
        }

        const preferredKey = preferred.toLocaleLowerCase()
        const existingIndex = names.findIndex((name) => name.toLocaleLowerCase() === preferredKey)
        if (existingIndex >= 0) {
            names.splice(existingIndex, 1)
            names.unshift(preferred)
            return names
        }
        names.unshift(preferred)
        return names
    }

    /**
     * Extracts a URL-like value from a raw Google Fonts input.
     * Supports plain URLs, `<link ... href="...">`, and `@import url(...)` snippets.
     * @param {string} input
     * @returns {string}
     */
    static extractGoogleFontUrlInput(input) {
        const raw = String(input || '').trim()
        if (!raw) return ''

        const linkMatch = /href\s*=\s*['"]([^'"]+)['"]/i.exec(raw)
        if (linkMatch?.[1]) {
            return linkMatch[1].trim()
        }

        const importMatch = /@import\s+url\((['"]?)([^'")]+)\1\)/i.exec(raw)
        if (importMatch?.[2]) {
            return importMatch[2].trim()
        }

        return raw
    }

    /**
     * Validates and resolves a Google Fonts stylesheet URL.
     * @param {string} input
     * @param {{ href?: string }} [baseLocation=globalThis.location]
     * @returns {string}
     */
    static resolveGoogleFontStylesheetUrl(input, baseLocation = globalThis.location) {
        const extracted = FontFamilyUtils.extractGoogleFontUrlInput(input)
        if (!extracted) {
            throw new Error('Please provide a Google Fonts URL.')
        }

        let url
        try {
            url = new URL(extracted, baseLocation?.href)
        } catch (_err) {
            throw new Error('Invalid URL format.')
        }

        if (url.host !== 'fonts.googleapis.com') {
            throw new Error('Only fonts.googleapis.com links are supported.')
        }
        if (!url.pathname.startsWith('/css')) {
            throw new Error('Google Fonts CSS links must use /css or /css2.')
        }
        if (!url.searchParams.getAll('family').length) {
            throw new Error('Google Fonts URL must contain at least one family parameter.')
        }

        return url.toString()
    }

    /**
     * Extracts font family names from a Google Fonts stylesheet URL.
     * @param {string} urlString
     * @returns {string[]}
     */
    static parseGoogleFontFamiliesFromUrl(urlString) {
        let url
        try {
            url = new URL(String(urlString || ''))
        } catch (_err) {
            return []
        }

        const familyValues = url.searchParams.getAll('family')
        const families = []
        familyValues.forEach((value) => {
            String(value || '')
                .split('|')
                .forEach((segment) => {
                    const cleaned = segment.split(':')[0].replaceAll('+', ' ').trim()
                    if (!cleaned) return
                    families.push(cleaned)
                })
        })

        return FontFamilyUtils.normalizeFontFamilies(families)
    }

    /**
     * Returns an existing loaded Google font link if present.
     * @param {Document} targetDocument
     * @param {string} url
     * @returns {HTMLLinkElement | null}
     */
    static #findExistingGoogleFontLink(targetDocument, url) {
        if (!targetDocument) return null
        const links = Array.from(targetDocument.querySelectorAll('link[data-google-font-url]'))
        return links.find((link) => link.dataset.googleFontUrl === url) || null
    }

    /**
     * Waits for a stylesheet link to finish loading.
     * @param {HTMLLinkElement} link
     * @returns {Promise<void>}
     */
    static #waitForStylesheetLoad(link) {
        return new Promise((resolve, reject) => {
            if (link.dataset.googleFontReady === 'true' || link.sheet) {
                resolve()
                return
            }

            const cleanup = () => {
                link.removeEventListener('load', onLoad)
                link.removeEventListener('error', onError)
            }
            const onLoad = () => {
                cleanup()
                link.dataset.googleFontReady = 'true'
                resolve()
            }
            const onError = () => {
                cleanup()
                reject(new Error('Failed to load Google Font stylesheet.'))
            }

            link.addEventListener('load', onLoad)
            link.addEventListener('error', onError)
        })
    }

    /**
     * Loads a Google Fonts stylesheet into the document.
     * @param {string} input
     * @param {Document} [targetDocument=globalThis.document]
     * @param {{ href?: string }} [baseLocation=globalThis.location]
     * @returns {Promise<{ url: string, families: string[], alreadyLoaded: boolean }>}
     */
    static async loadGoogleFontLink(input, targetDocument = globalThis.document, baseLocation = globalThis.location) {
        if (!targetDocument?.head) {
            throw new Error('Document head is not available.')
        }

        const url = FontFamilyUtils.resolveGoogleFontStylesheetUrl(input, baseLocation)
        const families = FontFamilyUtils.parseGoogleFontFamiliesFromUrl(url)
        if (!families.length) {
            throw new Error('Could not read any font family from the URL.')
        }

        const existingLink = FontFamilyUtils.#findExistingGoogleFontLink(targetDocument, url)
        if (existingLink) {
            await FontFamilyUtils.#waitForStylesheetLoad(existingLink)
            return { url, families, alreadyLoaded: true }
        }

        const link = targetDocument.createElement('link')
        link.rel = 'stylesheet'
        link.href = url
        link.dataset.googleFontUrl = url
        targetDocument.head.appendChild(link)
        await FontFamilyUtils.#waitForStylesheetLoad(link)
        return { url, families, alreadyLoaded: false }
    }

    /**
     * Loads installed font families from the browser when supported.
     * Falls back to a curated list when local font access is unavailable.
     * @param {{ queryLocalFonts?: () => Promise<Array<{ family?: string }>> }} [targetWindow=globalThis]
     * @returns {Promise<string[]>}
     */
    static async listInstalledFontFamilies(targetWindow = globalThis) {
        const fallback = FontFamilyUtils.getFallbackFontFamilies()
        if (!targetWindow || typeof targetWindow.queryLocalFonts !== 'function') {
            return fallback
        }

        try {
            const localFonts = await targetWindow.queryLocalFonts()
            const families = FontFamilyUtils.normalizeFontFamilies(localFonts.map((font) => font?.family))
            return families.length ? families : fallback
        } catch (_err) {
            return fallback
        }
    }
}
