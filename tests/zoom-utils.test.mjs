import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ZoomUtils } from '../src/ZoomUtils.mjs'

describe('zoom-utils', () => {
    it('clampZoom keeps values within range', () => {
        assert.equal(ZoomUtils.clampZoom(0.1), 0.5)
        assert.equal(ZoomUtils.clampZoom(1.25), 1.25)
        assert.equal(ZoomUtils.clampZoom(8), 2.5)
    })

    it('stepZoom increments and decrements in fixed steps', () => {
        assert.equal(ZoomUtils.stepZoom(1, 1), 1.1)
        assert.equal(ZoomUtils.stepZoom(1, -1), 0.9)
    })

    it('formatZoomLabel outputs rounded percentages', () => {
        assert.equal(ZoomUtils.formatZoomLabel(1), '100%')
        assert.equal(ZoomUtils.formatZoomLabel(1.236), '124%')
    })

    it('builds a display fingerprint from screen metrics', () => {
        const fingerprint = ZoomUtils.buildDisplayFingerprint({
            devicePixelRatio: 2,
            screen: {
                width: 2560,
                height: 1440,
                availWidth: 2560,
                availHeight: 1380,
                colorDepth: 24,
                pixelDepth: 24
            }
        })
        assert.deepEqual(fingerprint, {
            screenWidth: 2560,
            screenHeight: 1440,
            availWidth: 2560,
            availHeight: 1380,
            colorDepth: 24,
            pixelDepth: 24,
            devicePixelRatio: 2
        })
    })

    it('restores persisted zoom when the display fingerprint matches', () => {
        const windowRef = {
            devicePixelRatio: 2,
            screen: {
                width: 2560,
                height: 1440,
                availWidth: 2560,
                availHeight: 1380,
                colorDepth: 24,
                pixelDepth: 24
            }
        }
        const payload = ZoomUtils.createZoomPreferencePayload(1.7, windowRef)
        const restoredZoom = ZoomUtils.resolvePersistedZoom(payload, windowRef)
        assert.equal(restoredZoom, 1.7)
    })

    it('skips persisted zoom when the display fingerprint does not match', () => {
        const savedDisplay = {
            devicePixelRatio: 2,
            screen: {
                width: 2560,
                height: 1440,
                availWidth: 2560,
                availHeight: 1380,
                colorDepth: 24,
                pixelDepth: 24
            }
        }
        const currentDisplay = {
            devicePixelRatio: 1,
            screen: {
                width: 1920,
                height: 1080,
                availWidth: 1920,
                availHeight: 1040,
                colorDepth: 24,
                pixelDepth: 24
            }
        }
        const payload = ZoomUtils.createZoomPreferencePayload(1.7, savedDisplay)
        const restoredZoom = ZoomUtils.resolvePersistedZoom(payload, currentDisplay)
        assert.equal(restoredZoom, null)
    })
})
