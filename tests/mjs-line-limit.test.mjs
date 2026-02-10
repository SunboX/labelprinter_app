import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'

const LINE_LIMIT = 1000

/**
 * Recursively collects .mjs files.
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
async function collectMjsFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    const files = await Promise.all(
        entries.map(async (entry) => {
            const fullPath = path.join(directory, entry.name)
            if (entry.isDirectory()) {
                return collectMjsFiles(fullPath)
            }
            return entry.isFile() && entry.name.endsWith('.mjs') ? [fullPath] : []
        })
    )
    return files.flat()
}

describe('mjs line limits', () => {
    it('keeps every source .mjs file below the project line limit', async () => {
        const sourceFiles = await collectMjsFiles('src')
        const oversizedFiles = []

        for (const sourceFile of sourceFiles) {
            const source = await readFile(sourceFile, 'utf8')
            const lineCount = source.split('\\n').length
            if (lineCount >= LINE_LIMIT) {
                oversizedFiles.push(`${sourceFile} (${lineCount} lines)`)
            }
        }

        assert.deepEqual(
            oversizedFiles,
            [],
            `Found source modules at or above ${LINE_LIMIT} lines:\\n${oversizedFiles.join('\\n')}`
        )
    })
})
