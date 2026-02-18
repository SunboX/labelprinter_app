import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('app version sync', () => {
    it('keeps deployed api fallback version aligned with package version', async () => {
        const packageSource = await readFile('package.json', 'utf8')
        const apiVersionSource = await readFile('api/app-version.json', 'utf8')
        const packageVersion = String(JSON.parse(packageSource)?.version || '').trim()
        const apiVersion = String(JSON.parse(apiVersionSource)?.version || '').trim()
        assert.ok(packageVersion)
        assert.equal(apiVersion, packageVersion)
    })
})
