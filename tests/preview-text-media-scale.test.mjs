import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

const canvasBuildSource = fs.readFileSync(
    path.join(process.cwd(), 'src/ui/PreviewRendererCanvasBuild.mjs'),
    'utf8'
)

describe('preview text media scale', () => {
    it('uses horizontal-only vertical compensation while keeping feed-axis text sizing stable', () => {
        assert.match(canvasBuildSource, /const isHorizontal = this\.state\.orientation === 'horizontal'/)
        assert.match(canvasBuildSource, /const baseDotScale =/)
        assert.match(canvasBuildSource, /const mediaCompensatedDotScale = TextSizingUtils\.computeMediaCompensatedDotScale\(/)
        assert.match(canvasBuildSource, /const textVerticalScale = isHorizontal \? mediaCompensatedDotScale \/ baseDotScale : 1/)
        assert.match(canvasBuildSource, /const textDotScale = baseDotScale/)
        assert.match(canvasBuildSource, /ctx\.scale\(1, verticalScale\)/)
    })
})
