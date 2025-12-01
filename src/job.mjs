import { Resolution } from './constants.mjs'

export class Job {
    constructor(
        media,
        {
            autoCut = true,
            mirrorPrinting = false,
            halfCut = false,
            chain = false,
            specialTape = false,
            cutEach = 1,
            resolution = Resolution.LOW
        } = {}
    ) {
        this.media = media
        this.autoCut = autoCut
        this.mirrorPrinting = mirrorPrinting
        this.halfCut = halfCut
        this.chain = chain
        this.specialTape = specialTape
        if (cutEach < 1 || cutEach > 99) {
            throw new Error('cutEach has to be between 1 and 99')
        }
        this.cutEach = cutEach
        this.resolution = resolution
        this.pages = []
    }

    addPage(page) {
        const width = this.media.printArea
        if (width == null) {
            throw new Error('Media does not define a printable area')
        }
        if (page.width !== width) {
            throw new Error('Page width does not match media width')
        }
        if (page.resolution.id !== this.resolution.id) {
            throw new Error('Page resolution does not match media resolution')
        }
        if (page.length < this.resolution.minLength) {
            throw new Error('Page is not long enough for the selected resolution')
        }
        this.pages.push(page)
    }

    [Symbol.iterator]() {
        return this.pages[Symbol.iterator]()
    }

    get length() {
        return this.pages.length
    }
}
