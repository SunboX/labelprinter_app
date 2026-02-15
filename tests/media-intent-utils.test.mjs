import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MediaIntentUtils } from '../src/MediaIntentUtils.mjs'

describe('media-intent-utils', () => {
    it('parses W-code intent', () => {
        assert.equal(MediaIntentUtils.resolvePreferredMedia('please use W24 tape'), 'W24')
        assert.equal(MediaIntentUtils.resolvePreferredMedia('switch to w18'), 'W18')
    })

    it('parses millimeter intent', () => {
        assert.equal(MediaIntentUtils.resolvePreferredMedia('use a 24mm tape'), 'W24')
        assert.equal(MediaIntentUtils.resolvePreferredMedia('use 24 mm tape'), 'W24')
        assert.equal(MediaIntentUtils.resolvePreferredMedia('bitte 3,5 millimeter'), 'W3_5')
    })

    it('returns empty string when no explicit media is present', () => {
        assert.equal(MediaIntentUtils.resolvePreferredMedia('match this look'), '')
    })
})
