import {
    AdvancedModeSettings,
    ErrorCodes,
    Media,
    MediaType,
    NotificationCodes,
    Resolution,
    StatusCodes,
    TapeColor,
    TextColor,
    VariousModesSettings,
    getMedia
} from './constants.mjs'
import { packbitsEncode } from './packbits.mjs'

function concatBytes(...arrays) {
    const size = arrays.reduce((acc, arr) => acc + arr.length, 0)
    const out = new Uint8Array(size)
    let offset = 0
    for (const arr of arrays) {
        out.set(arr, offset)
        offset += arr.length
    }
    return out
}

export function encodeLine(bitmapLine, padding) {
    // Convert the line to an int, shift by padding bits, then PackBits compress.
    let line = 0n
    for (const byte of bitmapLine) {
        line = (line << 8n) | BigInt(byte)
    }
    line <<= BigInt(padding)
    const padded = new Uint8Array(16)
    let tmp = line
    for (let i = 15; i >= 0; i -= 1) {
        padded[i] = Number(tmp & 0xffn)
        tmp >>= 8n
    }
    const compressed = packbitsEncode(padded)
    const prefix = new Uint8Array(2)
    new DataView(prefix.buffer).setUint16(0, compressed.length, true)
    return concatBytes(prefix, compressed)
}

class ErrorState {
    constructor(byte1, byte2) {
        const value = byte1 | (byte2 << 8)
        this.flags = {}
        Object.entries(ErrorCodes).forEach(([key, code]) => {
            this.flags[key] = Boolean(value & code)
        })
    }

    any() {
        return Object.values(this.flags).some(Boolean)
    }

    toString() {
        return `<Errors ${JSON.stringify(this.flags)}>`
    }
}

export class Status {
    constructor(data) {
        if (!data || data.length < 32) {
            throw new Error('Invalid status response')
        }
        this.model = data[4]
        this.errors = new ErrorState(data[8], data[9])
        this.mediaWidth = data[10]
        this.mediaType = Object.values(MediaType).find((v) => v === data[11]) ?? data[11]
        this.status = Object.values(StatusCodes).find((v) => v === data[18]) ?? data[18]
        this.notification = Object.values(NotificationCodes).find((v) => v === data[22]) ?? data[22]
        this.tapeColor = Object.values(TapeColor).find((v) => v === data[24]) ?? data[24]
        this.textColor = Object.values(TextColor).find((v) => v === data[25]) ?? data[25]
        this._media = null
    }

    ready() {
        return !this.errors.any()
    }

    get media() {
        if (!this._media) {
            this._media = getMedia(this.mediaWidth, this.mediaType)
        }
        return this._media
    }
}

export class BasePrinter {
    constructor(backend) {
        this.backend = backend
    }
}

export class GenericPrinter extends BasePrinter {
    constructor(backend) {
        super(backend)
        this._supportedResolutions = [Resolution.LOW, Resolution.HIGH]
        this._featureHalfCut = true
    }

    async reset() {
        await this.backend.write(new Uint8Array(100)) // Invalidate command buffer
        await this.backend.write(new Uint8Array([0x1b, 0x40])) // Initialize
    }

    async getStatus() {
        if (typeof this.backend.getStatus === 'function') {
            return this.backend.getStatus()
        }
        await this.reset()
        await this.backend.write(new Uint8Array([0x1b, 0x69, 0x53]))
        const data = await this.backend.read(32)
        if (!data) {
            throw new Error('No response from printer')
        }
        return new Status(data)
    }

    async print(job) {
        if ([Media.NO_MEDIA, Media.UNSUPPORTED_MEDIA].includes(job.media)) {
            throw new Error('Unsupported media')
        }
        if (!this._supportedResolutions.some((res) => res.id === job.resolution.id)) {
            throw new Error('Resolution is not supported by this printer')
        }

        await this.reset()

        const mediaType = new Uint8Array([job.media.mediaType])
        const mediaSize = new Uint8Array([job.media.width])
        const offset = job.media.lmargin

        let variousMode = 0
        if (job.autoCut) {
            variousMode |= VariousModesSettings.AUTO_CUT
        }
        if (job.mirrorPrinting) {
            variousMode |= VariousModesSettings.MIRROR_PRINTING
        }
        const variousModeBytes = new Uint8Array([variousMode])

        let advancedMode = 0
        if (job.halfCut) {
            if (!this._featureHalfCut) {
                throw new Error('Half cut is not supported by this printer')
            }
            advancedMode |= AdvancedModeSettings.HALF_CUT
        }
        if (!job.chain) {
            advancedMode |= AdvancedModeSettings.CHAIN_PRINTING
        }
        if (job.specialTape) {
            advancedMode |= AdvancedModeSettings.SPECIAL_TAPE
        }
        const margin = job.resolution.id === Resolution.HIGH.id ? Resolution.HIGH.margin : Resolution.LOW.margin
        if (job.resolution.id === Resolution.HIGH.id) {
            advancedMode |= AdvancedModeSettings.HIGH_RESOLUTION
        }
        const advancedModeBytes = new Uint8Array([advancedMode])
        const cutEach = new Uint8Array([job.cutEach])

        for (let i = 0; i < job.pages.length; i += 1) {
            const page = job.pages[i]
            // Switch to raster mode
            await this.backend.write(new Uint8Array([0x1b, 0x69, 0x61, 0x01]))

            const informationCommand = new Uint8Array([
                0x1b,
                0x69,
                0x7a,
                0x86,
                mediaType[0],
                mediaSize[0],
                0x00,
                0x00,
                0x00,
                0x00,
                0x00,
                0x00
            ])
            await this.backend.write(informationCommand)
            if (i === 0 && job.autoCut) {
                await this.backend.write(informationCommand)
            }

            await this.backend.write(new Uint8Array([0x1b, 0x69, 0x4d, variousModeBytes[0]]))
            await this.backend.write(new Uint8Array([0x1b, 0x69, 0x4b, advancedModeBytes[0]]))
            await this.backend.write(new Uint8Array([0x1b, 0x69, 0x64, margin[0], margin[1]]))

            if (job.autoCut) {
                await this.backend.write(new Uint8Array([0x1b, 0x69, 0x41, cutEach[0]]))
            }

            // Enable compression mode
            await this.backend.write(new Uint8Array([0x4d, 0x02]))

            for (const line of page.lines()) {
                const encoded = encodeLine(line, offset)
                await this.backend.write(concatBytes(new Uint8Array([0x47]), encoded))
            }

            await this.backend.write(new Uint8Array([0x5a]))

            if (i < job.pages.length - 1) {
                await this.backend.write(new Uint8Array([0x0c]))
            }
        }

        await this.backend.write(new Uint8Array([0x1a]))
    }
}

export class P700 extends GenericPrinter {}
export class P750W extends GenericPrinter {}

export class H500 extends GenericPrinter {
    constructor(backend) {
        super(backend)
        this._supportedResolutions = [Resolution.LOW]
        this._featureHalfCut = false
    }
}

export class E500 extends H500 {}
export class E550W extends P750W {}
