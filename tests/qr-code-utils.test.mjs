import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { QrCodeUtils } from '../src/QrCodeUtils.mjs'

describe('qr-code-utils', () => {
    it('normalizes QR item options with defaults', () => {
        const normalized = QrCodeUtils.normalizeItemOptions({
            qrErrorCorrectionLevel: 'x',
            qrVersion: 999,
            qrEncodingMode: 'unsupported'
        })
        assert.deepEqual(normalized, {
            qrErrorCorrectionLevel: 'M',
            qrVersion: 40,
            qrEncodingMode: 'auto'
        })
    })

    it('supports legacy non-prefixed option names during normalization', () => {
        const normalized = QrCodeUtils.normalizeItemOptions({
            errorCorrectionLevel: 'q',
            version: '3',
            encodingMode: 'numeric'
        })
        assert.deepEqual(normalized, {
            qrErrorCorrectionLevel: 'Q',
            qrVersion: 3,
            qrEncodingMode: 'numeric'
        })
    })

    it('builds string payload for auto mode', () => {
        const payload = QrCodeUtils.buildQrPayload('ABC123', 'auto')
        assert.equal(payload, 'ABC123')
    })

    it('builds segment payload for manual encoding mode', () => {
        const payload = QrCodeUtils.buildQrPayload('12345', 'numeric')
        assert.deepEqual(payload, [{ data: '12345', mode: 'numeric' }])
    })
})
