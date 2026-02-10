import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { createCanvas, registerFont } from 'canvas'
import { PreviewRenderer } from '../src/ui/PreviewRenderer.mjs'

const NORMALIZED_WIDTH = 320
const NORMALIZED_HEIGHT = 120
const THRESHOLD = 200
const CROP_PADDING_PX = 4
const PHYSICAL_PX_PER_MM = 16
const W9_SNAPSHOT_HASH = '45ae66de70fe637aeb7e4cee6f865b4dbc189fa0b1174577c2ddbb8e42a2f666'
const W24_SNAPSHOT_HASH = '322676bdab0b52b0cb1e3564b960583c225f1d75e47323ed7f86dad4d764bc57'

const barlowRegularPath = path.join(process.cwd(), 'src/assets/fonts/Barlow-Regular.ttf')
registerFont(barlowRegularPath, { family: 'Barlow' })

const originalDocument = globalThis.document

/**
 * Creates a minimal document shim for node-canvas based rendering.
 * @returns {{ createElement: (tagName: string) => import('canvas').Canvas }}
 */
function createDocumentShim() {
    return {
        createElement(tagName) {
            if (String(tagName).toLowerCase() !== 'canvas') {
                throw new Error(`Unsupported element requested in visual regression test: ${tagName}`)
            }
            const canvas = createCanvas(1, 1)
            canvas.style = {}
            return canvas
        }
    }
}

/**
 * Renders a single text preview in physical millimeter scale and returns a normalized monochrome bitmap.
 * @param {'W9' | 'W24'} mediaId
 * @returns {Promise<Uint8Array>}
 */
async function renderNormalizedTextBitmap(mediaId) {
    const state = {
        media: mediaId,
        resolution: 'LOW',
        orientation: 'horizontal',
        mediaLengthMm: null,
        items: [{ id: 'text-1', type: 'text', text: 'New text', fontFamily: 'Barlow', fontSize: 24, xOffset: 4, yOffset: 0 }]
    }
    const renderer = new PreviewRenderer({}, state, () => {}, (key) => key)
    const renderResult = await renderer.buildCanvasFromState()
    const textEntry = renderResult.layoutItems.find((entry) => entry.type === 'text')
    assert.ok(textEntry, `Missing text layout entry for ${mediaId}`)

    const previewCanvas = renderResult.preview
    const dotsPerMmX = (renderResult.res?.dots?.[0] || 180) / 25.4
    const dotsPerMmY = (renderResult.res?.dots?.[1] || renderResult.res?.dots?.[0] || 180) / 25.4
    const physicalWidth = Math.max(1, Math.round((previewCanvas.width / dotsPerMmX) * PHYSICAL_PX_PER_MM))
    const physicalHeight = Math.max(1, Math.round((previewCanvas.height / dotsPerMmY) * PHYSICAL_PX_PER_MM))
    const physicalCanvas = createCanvas(physicalWidth, physicalHeight)
    const physicalCtx = physicalCanvas.getContext('2d')
    physicalCtx.fillStyle = '#fff'
    physicalCtx.fillRect(0, 0, physicalWidth, physicalHeight)
    physicalCtx.imageSmoothingEnabled = true
    physicalCtx.imageSmoothingQuality = 'high'
    physicalCtx.drawImage(previewCanvas, 0, 0, physicalWidth, physicalHeight)

    const textBounds = textEntry.bounds
    const cropX = Math.max(0, Math.floor((textBounds.x / dotsPerMmX) * PHYSICAL_PX_PER_MM) - CROP_PADDING_PX)
    const cropY = Math.max(0, Math.floor((textBounds.y / dotsPerMmY) * PHYSICAL_PX_PER_MM) - CROP_PADDING_PX)
    const cropW = Math.max(
        1,
        Math.ceil((textBounds.width / dotsPerMmX) * PHYSICAL_PX_PER_MM) + CROP_PADDING_PX * 2
    )
    const cropH = Math.max(
        1,
        Math.ceil((textBounds.height / dotsPerMmY) * PHYSICAL_PX_PER_MM) + CROP_PADDING_PX * 2
    )
    const safeCropW = Math.min(cropW, Math.max(1, physicalWidth - cropX))
    const safeCropH = Math.min(cropH, Math.max(1, physicalHeight - cropY))
    const croppedCanvas = createCanvas(safeCropW, safeCropH)
    const croppedCtx = croppedCanvas.getContext('2d')
    croppedCtx.fillStyle = '#fff'
    croppedCtx.fillRect(0, 0, safeCropW, safeCropH)
    croppedCtx.drawImage(physicalCanvas, cropX, cropY, safeCropW, safeCropH, 0, 0, safeCropW, safeCropH)

    const normalizedCanvas = createCanvas(NORMALIZED_WIDTH, NORMALIZED_HEIGHT)
    const normalizedCtx = normalizedCanvas.getContext('2d')
    normalizedCtx.fillStyle = '#fff'
    normalizedCtx.fillRect(0, 0, NORMALIZED_WIDTH, NORMALIZED_HEIGHT)
    normalizedCtx.imageSmoothingEnabled = true
    normalizedCtx.imageSmoothingQuality = 'high'
    normalizedCtx.drawImage(croppedCanvas, 0, 0, NORMALIZED_WIDTH, NORMALIZED_HEIGHT)

    const imageData = normalizedCtx.getImageData(0, 0, NORMALIZED_WIDTH, NORMALIZED_HEIGHT).data
    const bitmap = new Uint8Array(NORMALIZED_WIDTH * NORMALIZED_HEIGHT)
    for (let index = 0; index < bitmap.length; index += 1) {
        const offset = index * 4
        const luminance = Math.round((imageData[offset] + imageData[offset + 1] + imageData[offset + 2]) / 3)
        bitmap[index] = luminance < THRESHOLD ? 1 : 0
    }
    return bitmap
}

describe('preview text visual regression', () => {
    before(() => {
        globalThis.document = createDocumentShim()
    })

    after(() => {
        globalThis.document = originalDocument
    })

    it('matches the locked snapshot for W9 and W24 text preview bitmaps', async () => {
        const w9Bitmap = await renderNormalizedTextBitmap('W9')
        const w24Bitmap = await renderNormalizedTextBitmap('W24')
        const w9Hash = createHash('sha256').update(w9Bitmap).digest('hex')
        const w24Hash = createHash('sha256').update(w24Bitmap).digest('hex')
        assert.equal(w9Hash, W9_SNAPSHOT_HASH, 'W9 text preview snapshot changed')
        assert.equal(w24Hash, W24_SNAPSHOT_HASH, 'W24 text preview snapshot changed')
    })
})
