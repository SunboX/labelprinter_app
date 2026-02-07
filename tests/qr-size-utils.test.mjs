import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { QrSizeUtils } from '../src/QrSizeUtils.mjs'

describe('qr-size-utils', () => {
    it('uses media print width as the QR max size', () => {
        const maxSize = QrSizeUtils.computeMaxQrSizeDots({
            media: 'W9',
            resolution: 'LOW',
            mediaLengthMm: null
        })
        assert.equal(maxSize, 64)
        assert.equal(QrSizeUtils.computeInitialQrSizeDots({ media: 'W9', resolution: 'LOW', mediaLengthMm: null }), 64)
    })

    it('keeps the previous default on wide labels', () => {
        const initialSize = QrSizeUtils.computeInitialQrSizeDots({
            media: 'W24',
            resolution: 'LOW',
            mediaLengthMm: null
        })
        assert.equal(initialSize, 120)
    })

    it('respects fixed media length overrides', () => {
        const maxSize = QrSizeUtils.computeMaxQrSizeDots({
            media: 'W24',
            resolution: 'LOW',
            mediaLengthMm: 5
        })
        assert.equal(maxSize, 25)
    })

    it('clamps any incoming QR size to label constraints', () => {
        const clamped = QrSizeUtils.clampQrSizeToLabel(
            {
                media: 'W6',
                resolution: 'LOW',
                mediaLengthMm: null
            },
            300
        )
        assert.equal(clamped, 43)
    })
})
