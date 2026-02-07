import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('shape menu hidden styling', () => {
    it('keeps [hidden] elements from rendering', async () => {
        const css = await readFile('src/style.css', 'utf8')
        assert.match(css, /\[hidden\]\s*{[^}]*display:\s*none/i)
    })
})
