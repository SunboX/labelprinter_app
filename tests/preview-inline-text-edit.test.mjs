import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('preview inline text editing', () => {
    it('wires text double-click editing on hitboxes', async () => {
        const source = await readFile('src/ui/PreviewRendererInteractions.mjs', 'utf8')
        assert.match(source, /element\.addEventListener\('dblclick',\s*this\._handleHitboxDoubleClick\)/)
        assert.match(source, /_handleHitboxDoubleClick\(event\)\s*{[\s\S]*entry\.type !== 'text'/)
        assert.match(source, /entry\.type === 'text' && Number\(event\.detail\) >= 2/)
    })

    it('supports image replacement from preview double-click', async () => {
        const source = await readFile('src/ui/PreviewRendererInteractions.mjs', 'utf8')
        assert.match(source, /entry\.type === 'image'/)
        assert.match(source, /_replaceImageFromPicker\(item\)/)
        assert.match(source, /ItemsEditorImageSupport\.loadImageFile\(/)
        assert.match(source, /input\.type = 'file'/)
    })

    it('creates a dedicated inline editor and commit/cancel handlers', async () => {
        const source = await readFile('src/ui/PreviewRendererInteractions.mjs', 'utf8')
        assert.match(source, /preview-inline-text-editor/)
        assert.match(source, /_startInlineTextEdit\(entry\)/)
        assert.match(source, /_commitInlineTextEdit\(options = \{\}\)/)
        assert.match(source, /event\.key === 'Enter'/)
        assert.match(source, /event\.key === 'Escape'/)
    })

    it('exposes an item change callback for app-level rerender sync', async () => {
        const source = await readFile('src/ui/PreviewRendererBase.mjs', 'utf8')
        assert.match(source, /set onItemChange\(callback\)/)
        assert.match(source, /_emitItemChange\(\)/)
    })

    it('refreshes objects panel after preview inline edits', async () => {
        const source = await readFile('src/main.mjs', 'utf8')
        assert.match(source, /previewRenderer\.onItemChange = this\.\#handlePreviewItemChange\.bind\(this\)/)
        assert.match(source, /\#handlePreviewItemChange\(\)\s*{[\s\S]*this\.itemsEditor\.render\(\)/)
    })
})
