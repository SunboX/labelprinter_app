import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FontFamilyUtils } from '../src/FontFamilyUtils.mjs'

describe('font-family-utils', () => {
    it('normalizes font names and keeps preferred family first', () => {
        const families = FontFamilyUtils.normalizeFontFamilies(
            [' Helvetica ', 'arial', 'Arial', 'Monaco'],
            'Barlow'
        )
        assert.deepEqual(families, ['Barlow', 'arial', 'Helvetica', 'Monaco'])
    })

    it('returns fallback families when local font API is unavailable', async () => {
        const families = await FontFamilyUtils.listInstalledFontFamilies({})
        assert.ok(families.includes('Barlow'))
        assert.ok(families.includes('Arial'))
    })

    it('returns detected local families when queryLocalFonts succeeds', async () => {
        const families = await FontFamilyUtils.listInstalledFontFamilies({
            async queryLocalFonts() {
                return [{ family: 'Zeta Sans' }, { family: 'Alpha Serif' }, { family: 'Zeta Sans' }]
            }
        })

        assert.deepEqual(families, ['Alpha Serif', 'Zeta Sans'])
    })

    it('extracts and resolves Google Font URLs from link markup', () => {
        const url = FontFamilyUtils.resolveGoogleFontStylesheetUrl(
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap">'
        )
        assert.equal(url, 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap')
    })

    it('parses Google Font families from css2 URL parameters', () => {
        const families = FontFamilyUtils.parseGoogleFontFamiliesFromUrl(
            'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&family=Roboto+Mono:wght@500'
        )
        assert.deepEqual(families, ['Open Sans', 'Roboto Mono'])
    })

    it('rejects non-Google stylesheet URLs', () => {
        assert.throws(
            () => FontFamilyUtils.resolveGoogleFontStylesheetUrl('https://example.com/css?family=Roboto'),
            /fonts\.googleapis\.com/i
        )
    })

    it('returns alreadyLoaded when a matching stylesheet link exists', async () => {
        const existingUrl = 'https://fonts.googleapis.com/css2?family=Roboto'
        const existingLink = {
            dataset: { googleFontUrl: existingUrl, googleFontReady: 'true' },
            sheet: {},
            addEventListener() {},
            removeEventListener() {}
        }
        const fakeDocument = {
            head: {},
            querySelectorAll() {
                return [existingLink]
            }
        }

        const result = await FontFamilyUtils.loadGoogleFontLink(existingUrl, fakeDocument, {
            href: 'http://localhost:3000/'
        })
        assert.equal(result.alreadyLoaded, true)
        assert.deepEqual(result.families, ['Roboto'])
    })

    it('parses persisted Google font links from localStorage payloads', () => {
        const parsedLinks = FontFamilyUtils.parsePersistedGoogleFontLinks(
            '["https://fonts.googleapis.com/css2?family=Roboto"," https://fonts.googleapis.com/css2?family=Roboto "]'
        )
        assert.deepEqual(parsedLinks, ['https://fonts.googleapis.com/css2?family=Roboto'])
        assert.match(FontFamilyUtils.GOOGLE_FONT_LINKS_STORAGE_KEY, /google-font-links/i)
    })

    it('returns an empty list for invalid persisted font payloads', () => {
        assert.deepEqual(FontFamilyUtils.parsePersistedGoogleFontLinks('not-json'), [])
        assert.deepEqual(FontFamilyUtils.parsePersistedGoogleFontLinks({}), [])
    })
})
