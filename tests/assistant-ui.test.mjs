import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

const html = fs.readFileSync(path.join(process.cwd(), 'src/index.html'), 'utf8')

describe('assistant UI wiring', () => {
    it('renders toolbar toggle and assistant overlay controls', () => {
        assert.match(html, /data-ai-toggle/)
        assert.match(html, /data-ai-overlay/)
        assert.match(html, /data-ai-close/)
        assert.match(html, /data-ai-messages/)
        assert.match(html, /data-ai-input/)
        assert.match(html, /data-ai-send/)
        assert.match(html, /data-ai-working/)
        assert.match(html, /data-ai-attach-sketch/)
        assert.match(html, /data-ai-image-input/)
        assert.doesNotMatch(html, /data-ai-attach-preview/)
        assert.doesNotMatch(html, /data-ai-endpoint/)
        assert.doesNotMatch(html, /data-ai-save-endpoint/)
    })
})
