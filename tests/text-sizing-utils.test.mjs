import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TextSizingUtils } from '../src/TextSizingUtils.mjs'

describe('text-sizing-utils', () => {
    it('keeps W9 conversion at the baseline dot scale', () => {
        const scale = TextSizingUtils.computeMediaCompensatedDotScale({
            resolutionDpi: 180,
            printAreaDots: 64,
            mediaWidthMm: 9
        })
        assert.equal(scale, 180 / 96)
    })

    it('reduces scale on W24 to match W9 perceived text height', () => {
        const scale = TextSizingUtils.computeMediaCompensatedDotScale({
            resolutionDpi: 180,
            printAreaDots: 128,
            mediaWidthMm: 24,
            referencePrintAreaDots: 64,
            referenceWidthMm: 9
        })
        assert.equal(scale, (180 / 96) * 0.75)
    })

    it('falls back to safe defaults for invalid inputs', () => {
        const scale = TextSizingUtils.computeMediaCompensatedDotScale({
            resolutionDpi: 0,
            printAreaDots: 0,
            mediaWidthMm: 0
        })
        assert.ok(Number.isFinite(scale))
        assert.ok(scale > 0)
    })
})
