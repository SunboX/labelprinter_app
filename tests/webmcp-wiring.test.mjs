import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('webmcp wiring', () => {
    it('wires WebMcpBridge import and startup initialization in main bootstrap', async () => {
        const source = await readFile('src/main.mjs', 'utf8')
        assert.match(source, /import\s+\{\s*WebMcpBridge\s*\}\s+from\s+'\.\/ui\/WebMcpBridge\.mjs'/)
        assert.match(source, /const webMcpBridge = new WebMcpBridge\(\{/)
        assert.match(source, /appController:\s*app/)
        assert.match(source, /await webMcpBridge\.init\(\)/)
    })

    it('exposes public app-control wrappers required for WebMCP extended actions', async () => {
        const source = await readFile('src/main.mjs', 'utf8')
        assert.match(source, /setZoom\(zoom\)\s*\{\s*this\.\#setZoom\(zoom\)/s)
        assert.match(source, /setLocale\(locale\)\s*\{\s*this\.\#handleLocaleChange\(locale\)/s)
        assert.match(source, /async applyProjectPayload\(rawProject, sourceLabel = 'WebMCP'\)/)
        assert.match(source, /async loadProjectFromUrl\(projectUrl\)/)
        assert.match(source, /async loadParameterDataFromUrl\(parameterDataUrl\)/)
        assert.match(source, /buildProjectPayload\(\)\s*\{\s*return ProjectIoUtils\.buildProjectPayload/s)
        assert.match(source, /buildProjectShareUrl\(\)\s*\{\s*return this\.\#buildProjectShareUrl\(\)/s)
    })
})
