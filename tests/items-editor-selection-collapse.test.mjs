import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('items editor selection collapse restore', () => {
    it('tracks auto-expanded cards and restores collapsed state on deselect', async () => {
        const source = await readFile('src/ui/ItemsEditor.mjs', 'utf8')
        assert.match(source, /#autoExpandedItemIds\s*=\s*new Set\(\)/)
        assert.match(source, /#restoreAutoCollapsedItems\(nextSelectedItemIds\)/)
        assert.match(source, /#expandSelectedCollapsedItems\(nextSelectedItemIds\)/)
        assert.match(source, /#autoExpandedItemIds\.add\(itemId\)/)
        assert.match(source, /#collapsedItemIds\.add\(itemId\)/)
        assert.match(source, /#autoExpandedItemIds\.delete\(itemId\)/)
    })
})
