import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { I18n } from '../src/I18n.mjs'

const originalWindow = global.window
const originalDocument = global.document
const originalFetch = global.fetch

/**
 * Creates a fake DOM node for translation tests.
 * @param {Record<string, string>} attrs
 * @returns {{ textContent: string, title: string, placeholder: string, getAttribute: Function, setAttribute: Function }}
 */
function createNode(attrs) {
    const attributes = { ...attrs }
    return {
        textContent: '',
        title: '',
        placeholder: '',
        getAttribute(name) {
            return attributes[name] || null
        },
        setAttribute(name, value) {
            attributes[name] = String(value)
        }
    }
}

describe('i18n', () => {
    beforeEach(() => {
        const store = new Map()
        global.window = {
            location: { search: '' },
            navigator: { language: 'de-DE' },
            localStorage: {
                getItem(key) {
                    return store.has(key) ? store.get(key) : null
                },
                setItem(key, value) {
                    store.set(key, String(value))
                }
            }
        }
        global.document = {
            documentElement: { lang: 'en' },
            querySelectorAll() {
                return []
            }
        }
        global.fetch = async (url) => {
            const locale = String(url).includes('/de.json') ? 'de' : 'en'
            return {
                ok: true,
                async json() {
                    if (locale === 'de') {
                        return {
                            app: { title: 'Labeldrucker App' },
                            message: { hello: 'Hallo {{name}}' }
                        }
                    }
                    return {
                        app: { title: 'Labelprinter App' },
                        message: { hello: 'Hello {{name}}' }
                    }
                }
            }
        }
    })

    afterEach(() => {
        global.window = originalWindow
        global.document = originalDocument
        global.fetch = originalFetch
    })

    it('detects locale and interpolates translated messages', async () => {
        const i18n = new I18n()
        await i18n.init()

        assert.equal(i18n.locale, 'de')
        assert.equal(global.document.documentElement.lang, 'de')
        assert.equal(i18n.t('app.title'), 'Labeldrucker App')
        assert.equal(i18n.t('message.hello', { name: 'Alex' }), 'Hallo Alex')
    })

    it('applies data-i18n and attribute translations', async () => {
        const textNode = createNode({ 'data-i18n': 'app.title' })
        const titleNode = createNode({ 'data-i18n-title': 'app.title' })
        const placeholderNode = createNode({ 'data-i18n-placeholder': 'app.title' })
        const ariaNode = createNode({ 'data-i18n-aria-label': 'app.title' })

        global.document.querySelectorAll = (selector) => {
            if (selector === '[data-i18n]') return [textNode]
            if (selector === '[data-i18n-title]') return [titleNode]
            if (selector === '[data-i18n-placeholder]') return [placeholderNode]
            if (selector === '[data-i18n-aria-label]') return [ariaNode]
            return []
        }

        const i18n = new I18n()
        await i18n.init()
        i18n.setLocale('en')
        i18n.applyTranslations(global.document)

        assert.equal(textNode.textContent, 'Labelprinter App')
        assert.equal(titleNode.title, 'Labelprinter App')
        assert.equal(placeholderNode.placeholder, 'Labelprinter App')
        assert.equal(ariaNode.getAttribute('aria-label'), 'Labelprinter App')
    })
})
