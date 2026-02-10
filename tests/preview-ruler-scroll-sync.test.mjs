import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

const mainSource = fs.readFileSync(path.join(process.cwd(), 'src/main.mjs'), 'utf8')
const renderSource = fs.readFileSync(path.join(process.cwd(), 'src/ui/PreviewRendererRender.mjs'), 'utf8')
const canvasBuildSource = fs.readFileSync(path.join(process.cwd(), 'src/ui/PreviewRendererCanvasBuild.mjs'), 'utf8')

describe('preview ruler scroll sync', () => {
    it('binds canvas-wrap scroll to viewport sync scheduling', () => {
        assert.match(mainSource, /canvasWrap\.addEventListener\(\s*'scroll'/)
        assert.match(mainSource, /previewRenderer\.scheduleViewportSync\(\)/)
    })

    it('uses scroll offsets when syncing rulers to the viewport', () => {
        assert.match(renderSource, /scheduleViewportSync\(\)/)
        assert.match(renderSource, /_syncRulersFromViewport\(/)
        assert.match(renderSource, /scrollLeft/)
        assert.match(renderSource, /scrollTop/)
        assert.match(renderSource, /labelMmWidth,\s*scrollLeft/)
        assert.match(renderSource, /labelMmHeight,\s*scrollTop/)
    })

    it('supports viewport shift while drawing ruler axes', () => {
        assert.match(canvasBuildSource, /viewportShiftPx/)
        assert.match(canvasBuildSource, /safeViewportShiftPx/)
        assert.match(canvasBuildSource, /highlightStartPx - safeViewportShiftPx/)
    })
})
