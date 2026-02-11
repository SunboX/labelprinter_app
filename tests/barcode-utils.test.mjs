import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BarcodeUtils } from '../src/BarcodeUtils.mjs'

describe('barcode-utils', () => {
    it('normalizes supported and unsupported formats', () => {
        assert.equal(BarcodeUtils.normalizeFormat('code39'), 'CODE39')
        assert.equal(BarcodeUtils.normalizeFormat('pharmacode'), 'pharmacode')
        assert.equal(BarcodeUtils.normalizeFormat('unknown'), BarcodeUtils.getDefaultFormat())
    })

    it('normalizes barcode item options and legacy aliases', () => {
        const normalized = BarcodeUtils.normalizeItemOptions({
            format: 'ean13',
            displayValue: 'yes',
            moduleWidth: 5,
            margin: 9
        })

        assert.deepEqual(normalized, {
            barcodeFormat: 'EAN13',
            barcodeShowText: true,
            barcodeModuleWidth: 5,
            barcodeMargin: 9
        })
    })
})
