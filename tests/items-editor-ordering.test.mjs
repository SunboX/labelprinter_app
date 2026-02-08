import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('items editor panel ordering', () => {
    it('keeps a separate panel order and uses it for drag/drop', async () => {
        const source = await readFile('src/ui/ItemsEditor.mjs', 'utf8')
        assert.match(source, /#panelItemOrder/)
        assert.match(source, /#syncPanelItemOrder\(\)/)
        assert.match(source, /#movePanelItem\(/)
        assert.match(source, /this\.\#movePanelItem\(fromPanelIndex,\s*toPanelIndex\)/)
    })

    it('does not reorder state.items directly in drag/drop', async () => {
        const source = await readFile('src/ui/ItemsEditor.mjs', 'utf8')
        assert.doesNotMatch(source, /state\.items\.splice\(fromPanelIndex/)
        assert.doesNotMatch(source, /state\.items\.splice\(toPanelIndex/)
    })
})
