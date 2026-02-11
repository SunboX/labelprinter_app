import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

const itemsEditorSource = fs.readFileSync(path.join(process.cwd(), 'src/ui/ItemsEditor.mjs'), 'utf8')
const geometrySupportSource = fs.readFileSync(path.join(process.cwd(), 'src/ui/ItemsEditorGeometrySupport.mjs'), 'utf8')

describe('items editor shape controls', () => {
    it('exposes explicit polygon edges controls', () => {
        assert.match(itemsEditorSource, /ItemsEditorGeometrySupport\.appendShapeControls\(/)
        assert.match(geometrySupportSource, /if \(item\.shapeType === 'polygon'\)/)
        assert.match(geometrySupportSource, /const sidesCtrl = createSlider\(/)
        assert.match(geometrySupportSource, /const sidesInput = document\.createElement\('input'\)/)
        assert.match(geometrySupportSource, /sidesInput\.type = 'number'/)
        assert.match(geometrySupportSource, /sidesInput\.min = String\(minSides\)/)
        assert.match(geometrySupportSource, /sidesInput\.max = String\(maxSides\)/)
    })
})
