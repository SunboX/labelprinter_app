import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

const itemsEditorSource = fs.readFileSync(path.join(process.cwd(), 'src/ui/ItemsEditor.mjs'), 'utf8')
const imageSupportSource = fs.readFileSync(path.join(process.cwd(), 'src/ui/ItemsEditorImageSupport.mjs'), 'utf8')
const iconSupportSource = fs.readFileSync(path.join(process.cwd(), 'src/ui/ItemsEditorIconSupport.mjs'), 'utf8')
const barcodeSupportSource = fs.readFileSync(path.join(process.cwd(), 'src/ui/ItemsEditorBarcodeSupport.mjs'), 'utf8')

describe('items editor rotation controls', () => {
    it('adds rotation defaults and sliders for text, qr, barcode, and shape items', () => {
        assert.match(itemsEditorSource, /type: 'text'[\s\S]*rotation: 0/)
        assert.match(itemsEditorSource, /type: 'qr'[\s\S]*rotation: 0/)
        assert.match(itemsEditorSource, /type: 'barcode'[\s\S]*rotation: 0/)
        assert.match(itemsEditorSource, /type: 'shape'[\s\S]*rotation: 0/)
        assert.match(itemsEditorSource, /this\.translate\('itemsEditor\.sliderRotation'\)/)
    })

    it('adds rotation sliders for image, icon, and barcode items', () => {
        assert.match(imageSupportSource, /createSlider\(translate\('itemsEditor\.sliderRotation'/)
        assert.match(iconSupportSource, /createSlider\(translate\('itemsEditor\.sliderRotation'/)
        assert.match(barcodeSupportSource, /createSlider\(translate\('itemsEditor\.sliderRotation'/)
    })
})
