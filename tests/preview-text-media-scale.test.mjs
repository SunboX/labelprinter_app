import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

const canvasBuildSource = fs.readFileSync(
    path.join(process.cwd(), 'src/ui/PreviewRendererCanvasBuild.mjs'),
    'utf8'
)

describe('preview text media scale', () => {
    it('uses media compensation only in horizontal orientation', () => {
        assert.match(canvasBuildSource, /const isHorizontal = this\.state\.orientation === 'horizontal'/)
        assert.match(canvasBuildSource, /const baseDotScale =/)
        assert.match(canvasBuildSource, /const mediaCompensatedDotScale = TextSizingUtils\.computeMediaCompensatedDotScale\(/)
        assert.match(canvasBuildSource, /const dotScale = isHorizontal \? mediaCompensatedDotScale : baseDotScale/)
    })
})
