// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { after, before, describe, it } from 'node:test'

let serverProcess
let baseUrl

describe('SEO route serving', () => {
    before(async () => {
        const port = await findFreePort()
        baseUrl = `http://127.0.0.1:${port}`
        serverProcess = spawn(process.execPath, ['src/server.mjs'], {
            env: { ...process.env, PORT: String(port) },
            stdio: ['ignore', 'pipe', 'pipe']
        })
        await waitForServerReady(serverProcess, baseUrl)
    })

    after(async () => {
        if (!serverProcess || serverProcess.killed) return
        serverProcess.kill()
        await once(serverProcess, 'exit')
    })

    it('serves important application routes with 200 status codes', async () => {
        const paths = ['/', '/src', '/src/']

        for (const path of paths) {
            const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' })
            assert.equal(response.status, 200, `${path} should return 200`)
            assert.match(await response.text(), /<title[^>]*>\s*Labelprinter App\s*<\/title>/)
        }
    })

    it('serves crawler files and app assets without blocking aliases', async () => {
        const paths = [
            '/robots.txt',
            '/sitemap.xml',
            '/assets/labelprinter-icon.svg',
            '/src/assets/labelprinter-icon.svg'
        ]

        for (const path of paths) {
            const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' })
            assert.equal(response.status, 200, `${path} should return 200`)
        }
    })
})

/**
 * Finds one currently unused local TCP port.
 * @returns {Promise<number>}
 */
async function findFreePort() {
    const probe = createServer()
    probe.listen(0, '127.0.0.1')
    await once(probe, 'listening')
    const address = probe.address()
    await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())))
    assert.ok(address && typeof address === 'object')
    return address.port
}

/**
 * Waits until the app server responds or the child exits.
 * @param {import('node:child_process').ChildProcess} child
 * @param {string} url
 * @returns {Promise<void>}
 */
async function waitForServerReady(child, url) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 4000) {
        assert.equal(child.exitCode, null, 'server exited before becoming ready')
        try {
            const response = await fetch(url)
            if (response.status === 200) return
        } catch (_error) {
            await delay(80)
        }
    }
    throw new Error('server did not become ready')
}

/**
 * Delays test polling.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
