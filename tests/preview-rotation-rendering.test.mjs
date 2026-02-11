import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/ui/PreviewRendererCanvasBuild.mjs'), 'utf8')

describe('preview rotation rendering', () => {
    it('applies rotation transforms and rotated bounds for supported item types', () => {
        assert.match(source, /import \{ RotationUtils \} from '\.\.\/RotationUtils\.mjs'/)
        assert.match(source, /RotationUtils\.drawWithRotation\(ctx, textBounds, item\.rotation/)
        assert.match(source, /RotationUtils\.drawWithRotation\(ctx, qrBounds, item\.rotation/)
        assert.match(source, /RotationUtils\.drawWithRotation\(ctx, imageBounds, item\.rotation/)
        assert.match(source, /RotationUtils\.drawWithRotation\(ctx, iconBounds, item\.rotation/)
        assert.match(source, /RotationUtils\.drawWithRotation\(ctx, shapeBounds, item\.rotation/)
        assert.match(source, /RotationUtils\.computeRotatedBounds\(\s*interactionBounds, item\.rotation\s*\)/)
    })
})
