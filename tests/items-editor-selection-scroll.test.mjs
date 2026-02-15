import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/ui/ItemsEditor.mjs'), 'utf8')

describe('items editor selection syncing', () => {
    it('scrolls the selected item card into view when selection changes from preview', () => {
        assert.match(source, /setSelectedItemIds\(itemIds\)/)
        assert.match(source, /querySelectorAll\('\.item-card'\)/)
        assert.match(source, /candidate\.dataset\.itemId === firstSelectedItemId/)
        assert.match(source, /card\.scrollIntoView\(\{ block: 'nearest', behavior: 'smooth' \}\)/)
    })
})
