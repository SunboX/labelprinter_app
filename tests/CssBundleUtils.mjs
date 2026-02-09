import { readFile } from 'node:fs/promises'
import path from 'node:path'

const IMPORT_REGEX = /@import\s+(?:url\()?['"]([^'")]+)['"]\)?\s*;/g

/**
 * Reads a CSS entry file and resolves local `@import` rules recursively.
 * @param {string} entryPath
 * @returns {Promise<string>}
 */
export async function readCssBundle(entryPath) {
    const seen = new Set()
    const absoluteEntryPath = path.resolve(entryPath)
    return readCssBundleFile(absoluteEntryPath, seen)
}

/**
 * Reads a CSS file and inlines local imports.
 * @param {string} absoluteFilePath
 * @param {Set<string>} seen
 * @returns {Promise<string>}
 */
async function readCssBundleFile(absoluteFilePath, seen) {
    if (seen.has(absoluteFilePath)) {
        return ''
    }
    seen.add(absoluteFilePath)
    const css = await readFile(absoluteFilePath, 'utf8')
    let result = ''
    let lastIndex = 0
    let match
    while ((match = IMPORT_REGEX.exec(css)) !== null) {
        result += css.slice(lastIndex, match.index)
        lastIndex = match.index + match[0].length
        const importPath = match[1]
        if (!importPath.startsWith('.')) {
            continue
        }
        const resolvedImportPath = path.resolve(path.dirname(absoluteFilePath), importPath)
        result += await readCssBundleFile(resolvedImportPath, seen)
    }
    result += css.slice(lastIndex)
    return result
}
