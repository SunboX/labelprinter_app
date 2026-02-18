import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('app meta endpoint routing', () => {
    it('uses host-aware frontend endpoint resolution', async () => {
        const mainSource = await readFile('src/main.mjs', 'utf8')
        assert.match(mainSource, /import\s+\{\s*AppApiEndpointUtils\s*\}\s+from\s+'\.\/AppApiEndpointUtils\.mjs'/)
        assert.match(mainSource, /AppApiEndpointUtils\.resolveAppMetaEndpoint\(\)/)
        assert.match(mainSource, /fetch\(appMetaEndpoint,\s*\{\s*cache:\s*'no-store'\s*\}\)/)
    })

    it('exposes both node and php-style metadata routes in node server', async () => {
        const serverSource = await readFile('src/server.mjs', 'utf8')
        assert.match(serverSource, /app\.get\(\['\/api\/app-meta',\s*'\/api\/app-meta\.php'\],\s*async\s*\(_req,\s*res\)\s*=>/)
    })

    it('includes php metadata endpoint for live hosting', async () => {
        const phpSource = await readFile('api/app-meta.php', 'utf8')
        assert.match(phpSource, /\$_SERVER\['REQUEST_METHOD'\]\s*!==\s*'GET'/)
        assert.match(phpSource, /package\.json/)
        assert.match(phpSource, /json_encode\(\['version'\s*=>\s*\$version\]/)
    })
})
