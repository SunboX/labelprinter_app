import { Resolution } from './constants.mjs'

export function bytesPerLine(width) {
    return Math.ceil(width / 8)
}

export function imageDataToBitmap(imageData) {
    const { width, height, data } = imageData
    const rotatedWidth = height
    const rotatedHeight = width
    const lineBytes = bytesPerLine(rotatedWidth)
    const bitmap = new Uint8Array(lineBytes * rotatedHeight)

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const idx = (y * width + x) * 4
            const r = data[idx]
            const g = data[idx + 1]
            const b = data[idx + 2]
            const a = data[idx + 3]

            // Use luminance to decide whether a pixel is black enough to print.
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) * (a / 255)
            // Push semi-transparent antialiased edges to solid black for crisper print output.
            const isBlack = luminance < 200

            // Match the raster pipeline: rotate 90 deg clockwise, flip vertically, then invert.
            // After inverting, black pixels become "1" bits in the bitmap we send to the printer.
            if (isBlack) {
                const rx = height - 1 - y // rotated x
                const ry = width - 1 - x // flipped y after rotation
                const byteIndex = ry * lineBytes + (rx >> 3)
                bitmap[byteIndex] |= 0x80 >> (rx & 7)
            }
        }
    }

    return { bitmap, width: rotatedWidth, length: rotatedHeight }
}

export function bitmapToImageData(bitmap, width, length) {
    // Produces an ImageData in the rotated/flipped orientation (good for debugging in browser).
    const lineBytes = bytesPerLine(width)
    if (lineBytes * length !== bitmap.length) {
        throw new Error('Bitmap length does not match dimensions')
    }

    const data = new Uint8ClampedArray(width * length * 4)
    for (let y = 0; y < length; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const byte = bitmap[y * lineBytes + (x >> 3)]
            const bit = (byte >> (7 - (x & 7))) & 1
            const value = bit ? 0 : 255 // 1 bit => black pixel after the invert step
            const idx = (y * width + x) * 4
            data[idx] = value
            data[idx + 1] = value
            data[idx + 2] = value
            data[idx + 3] = 255
        }
    }
    return new ImageData(data, width, length)
}

export class BasePage {
    constructor(bitmap, width, length, resolution = Resolution.LOW) {
        this.bitmap = bitmap instanceof Uint8Array ? bitmap : new Uint8Array(bitmap)
        this.width = width
        this.length = length
        this.resolution = resolution
        this._lineBytes = bytesPerLine(width)

        if (this._lineBytes * length !== this.bitmap.length) {
            throw new Error('Bitmap dimensions and data length do not match')
        }
    }

    lines() {
        const lines = []
        for (let i = 0; i < this.bitmap.length; i += this._lineBytes) {
            lines.push(this.bitmap.slice(i, i + this._lineBytes))
        }
        return lines
    }
}

export class Page extends BasePage {
    static fromImageData(imageData, resolution = Resolution.LOW) {
        const { bitmap, width, length } = imageDataToBitmap(imageData)
        return new Page(bitmap, width, length, resolution)
    }

    constructor(bitmap, width, length, resolution = Resolution.LOW) {
        super(bitmap, width, length, resolution)
    }
}
