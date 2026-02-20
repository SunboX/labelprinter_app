import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

const canvasBuildSource = readFileSync(path.join(process.cwd(), 'src/ui/PreviewRendererCanvasBuild.mjs'), 'utf8')
const canvasSupportSource = readFileSync(path.join(process.cwd(), 'src/ui/PreviewRendererCanvasSupport.mjs'), 'utf8')
const mainSource = readFileSync(path.join(process.cwd(), 'src/main.mjs'), 'utf8')
const parameterPanelSource = readFileSync(path.join(process.cwd(), 'src/ui/ParameterPanel.mjs'), 'utf8')
const printControllerSource = readFileSync(path.join(process.cwd(), 'src/ui/PrintController.mjs'), 'utf8')

describe('worker wiring', () => {
    it('uses raster worker for image rasterization with fallback in preview build', () => {
        assert.match(canvasBuildSource, /_rasterWorkerClient\?\.isAvailable\?\.\(\)/)
        assert.match(canvasBuildSource, /rasterizeImage\(/)
    })

    it('passes raster worker client into icon raster support', () => {
        assert.match(canvasBuildSource, /rasterWorkerClient:\s*this\._rasterWorkerClient/)
    })

    it('creates worker clients during app bootstrap', () => {
        assert.match(mainSource, /RasterWorkerClient\.createDefault\(\)/)
        assert.match(mainSource, /CodeRasterWorkerClient\.createDefault\(\)/)
        assert.match(mainSource, /ParameterDataWorkerClient\.createDefault\(\)/)
        assert.match(mainSource, /ParameterValidationWorkerClient\.createDefault\(\)/)
        assert.match(mainSource, /PrintPageWorkerPoolClient\.createDefault\(\)/)
        assert.match(mainSource, /setDefaultWorkerClient/)
    })

    it('passes parameter-data worker client through parameter panel conversion calls', () => {
        assert.match(parameterPanelSource, /parameterDataWorkerClient/)
        assert.match(parameterPanelSource, /workerClient:\s*this\.parameterDataWorkerClient/)
    })

    it('uses code-raster worker path for qr and barcode cache builders with fallback', () => {
        assert.match(canvasSupportSource, /buildQrRaster\(/)
        assert.match(canvasSupportSource, /buildBarcodeRaster\(/)
        assert.match(canvasSupportSource, /qr worker fallback/)
        assert.match(canvasSupportSource, /barcode worker fallback/)
    })

    it('uses print-page worker pool during batch print with per-page fallback', () => {
        assert.match(printControllerSource, /printPageWorkerPoolClient/)
        assert.match(printControllerSource, /renderPages\(/)
        assert.match(printControllerSource, /print-page worker fallback for page/)
    })

    it('uses worker validation thresholds and stale-response guards in parameter panel', () => {
        assert.match(parameterPanelSource, /_parameterValidationRowThreshold = 200/)
        assert.match(parameterPanelSource, /#nextValidationRequestToken\(/)
        assert.match(parameterPanelSource, /#isCurrentValidationRequest\(/)
        assert.match(parameterPanelSource, /validation worker fallback/)
    })
})
