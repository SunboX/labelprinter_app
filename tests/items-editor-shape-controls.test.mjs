import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/ui/ItemsEditor.mjs'), 'utf8')

describe('items editor shape controls', () => {
    it('exposes explicit polygon edges controls', () => {
        assert.match(source, /if \(item\.shapeType === 'polygon'\)/)
        assert.match(source, /const sidesCtrl = this\.\#createSlider/)
        assert.match(source, /const sidesInput = document\.createElement\('input'\)/)
        assert.match(source, /sidesInput\.type = 'number'/)
        assert.match(source, /sidesInput\.min = String\(minSides\)/)
        assert.match(source, /sidesInput\.max = String\(maxSides\)/)
    })
})
