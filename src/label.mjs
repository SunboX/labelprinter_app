import { Resolution } from './constants.mjs'
import { BasePage, imageDataToBitmap } from './page.mjs'

export class Padding {
    constructor(left = 0, top = 0, bottom = 0, right = 0) {
        this.left = left
        this.top = top
        this.bottom = bottom
        this.right = right
    }
}

function createCanvas(width, height) {
    if (typeof OffscreenCanvas !== 'undefined') {
        return new OffscreenCanvas(width, height)
    }
    if (typeof document === 'undefined') {
        throw new Error('Canvas rendering is only supported in a browser or worker with OffscreenCanvas')
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
}

function getContext2d(canvas) {
    const ctx = canvas.getContext('2d')
    if (!ctx) {
        throw new Error('2D canvas context not available')
    }
    return ctx
}

export class TextItem {
    constructor(height, text, font = '16px sans-serif', padding = new Padding(), fontSize = null) {
        this.height = height
        this.text = text
        this.font = font
        this.fontSize = fontSize
        this.padding = padding
    }

    _fitFontSize(targetHeight) {
        const probe = createCanvas(1, 1)
        const ctx = getContext2d(probe)
        let size = this.fontSize || targetHeight
        for (; size > 1; size -= 1) {
            ctx.font = `${size}px ${this.font.replace(/\d+px /, '')}`
            const metrics = ctx.measureText(this.text)
            const height = (metrics.actualBoundingBoxAscent || size) + (metrics.actualBoundingBoxDescent || 0)
            if (height <= targetHeight) {
                break
            }
        }
        return size
    }

    render() {
        const innerHeight = this.height - this.padding.top - this.padding.bottom
        const fontSize = this._fitFontSize(innerHeight)
        const family = this.font.replace(/\d+px /, '')
        const probe = createCanvas(1, 1)
        const probeCtx = getContext2d(probe)
        probeCtx.font = `${fontSize}px ${family}`
        const metrics = probeCtx.measureText(this.text)
        const textWidth = Math.ceil(metrics.width)

        const canvas = createCanvas(this.padding.left + textWidth + this.padding.right, this.height)
        const ctx = getContext2d(canvas)
        ctx.font = `${fontSize}px ${family}`
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#000'
        const baseline = this.padding.top + (metrics.actualBoundingBoxAscent || fontSize)
        ctx.fillText(this.text, this.padding.left, baseline)
        return canvas
    }
}

export class BoxItem {
    constructor(height, items, { vertical = false, leftPadding = 0 } = {}) {
        this.height = height
        this.items = items
        this.vertical = vertical
        this.leftPadding = leftPadding
    }

    render() {
        const rendered = this.items.map(renderItem)
        if (this.vertical) {
            const length = rendered.reduce((acc, item) => acc + item.height, 0)
            if (length !== this.height) {
                throw new Error('BoxItem height must equal the sum of child heights when vertical is true')
            }
            const width = Math.max(...rendered.map((item) => item.width)) + this.leftPadding
            const canvas = createCanvas(width, this.height)
            const ctx = getContext2d(canvas)
            ctx.fillStyle = '#fff'
            ctx.fillRect(0, 0, width, this.height)
            let offset = 0
            for (const item of rendered) {
                ctx.drawImage(item, this.leftPadding, offset)
                offset += item.height
            }
            return canvas
        }

        const length = rendered.reduce((acc, item) => acc + item.width, 0) + this.leftPadding
        const canvas = createCanvas(length, this.height)
        const ctx = getContext2d(canvas)
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, length, this.height)
        let offset = this.leftPadding
        for (const item of rendered) {
            ctx.drawImage(item, offset, 0)
            offset += item.width
        }
        return canvas
    }
}

function renderItem(item) {
    if (typeof OffscreenCanvas !== 'undefined' && item instanceof OffscreenCanvas) {
        return item
    }
    if (typeof HTMLCanvasElement !== 'undefined' && item instanceof HTMLCanvasElement) {
        return item
    }
    if (typeof item?.render === 'function') {
        return item.render()
    }
    throw new Error('Item must be a canvas or expose render()')
}

function combineRows(rows) {
    const width = Math.max(...rows.map((row) => row.width))
    const height = rows.reduce((acc, row) => acc + row.height, 0)
    const canvas = createCanvas(width, height)
    const ctx = getContext2d(canvas)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    let y = 0
    for (const row of rows) {
        ctx.drawImage(row, 0, y)
        y += row.height
    }
    return canvas
}

export class Label extends BasePage {
    constructor(resolution = Resolution.LOW, ...items) {
        const flatItems = items.flat().map(renderItem)
        if (!flatItems.length) {
            throw new Error('Label needs at least one item or canvas')
        }
        const canvas = flatItems.length > 1 ? combineRows(flatItems) : flatItems[0]
        const ctx = getContext2d(canvas)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const { bitmap, width, length } = imageDataToBitmap(imageData)
        super(bitmap, width, length, resolution)
        this.canvas = canvas
    }

    static fromCanvas(canvas, resolution = Resolution.LOW) {
        return new Label(resolution, canvas)
    }
}
