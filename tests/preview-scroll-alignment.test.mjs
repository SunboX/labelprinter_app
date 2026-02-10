import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

const interactionsSource = fs.readFileSync(
    path.join(process.cwd(), 'src/ui/PreviewRendererInteractions.mjs'),
    'utf8'
)
const renderSource = fs.readFileSync(path.join(process.cwd(), 'src/ui/PreviewRendererRender.mjs'), 'utf8')

describe('preview scroll alignment', () => {
    it('accounts for canvas-wrap scroll offsets when positioning interaction hitboxes', () => {
        assert.match(interactionsSource, /scrollLeft/)
        assert.match(interactionsSource, /scrollTop/)
        assert.match(interactionsSource, /previewRect\.left - wrapRect\.left \+ scrollLeft/)
        assert.match(interactionsSource, /previewRect\.top - wrapRect\.top \+ scrollTop/)
    })

    it('accounts for canvas-wrap scroll offsets when positioning overlay selection canvas', () => {
        assert.match(renderSource, /scrollLeft/)
        assert.match(renderSource, /scrollTop/)
        assert.match(renderSource, /previewRect\.left - wrapRect\.left \+ scrollLeft - overlayPadding/)
        assert.match(renderSource, /previewRect\.top - wrapRect\.top \+ scrollTop - overlayPadding/)
    })
})
