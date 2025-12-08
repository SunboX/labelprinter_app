// JavaScript port of labelprinterkit constants.
// The structures mirror the original enums and NamedTuple values.

export const Resolution = Object.freeze({
    // Keep lead/trail feed minimal but leave a tiny buffer so the first printed dots aren't clipped.
    LOW: { id: 'LOW', dots: [180, 180], minLength: 31, margin: new Uint8Array([0x02, 0x00]) },
    HIGH: { id: 'HIGH', dots: [180, 320], minLength: 62, margin: new Uint8Array([0x04, 0x00]) }
})

export const VariousModesSettings = Object.freeze({
    AUTO_CUT: 0b01000000,
    MIRROR_PRINTING: 0b10000000
})

export const AdvancedModeSettings = Object.freeze({
    HALF_CUT: 0b00000100,
    CHAIN_PRINTING: 0b00001000,
    SPECIAL_TAPE: 0b00010000,
    HIGH_RESOLUTION: 0b01000000,
    BUFFER_CLEARING: 0b10000000
})

export const ErrorCodes = Object.freeze({
    NO_MEDIA: 0x0001,
    CUTTER_JAM: 0x0004,
    WEAK_BATTERY: 0x0008,
    HIGH_VOLTAGE_ADAPTER: 0x0040,
    REPLACE_MEDIA: 0x0100,
    COVER_OPEN: 0x1000,
    OVERHEATING: 0x2000
})

export const MediaType = Object.freeze({
    NO_MEDIA: 0x00,
    LAMINATED_TAPE: 0x01,
    NON_LAMINATED_TAPE: 0x03,
    HEATSHRINK_TUBE_21: 0x11,
    HEATSHRINK_TUBE_31: 0x17,
    INCOMPATIBLE_TAPE: 0xff
})

export const StatusCodes = Object.freeze({
    STATUS_REPLY: 0x00,
    PRINTING_DONE: 0x01,
    ERROR_OCCURRED: 0x02,
    EDIT_IF_MODE: 0x03,
    TURNED_OFF: 0x04,
    NOTIFICATION: 0x05,
    PHASE_CHANGE: 0x06
})

export const NotificationCodes = Object.freeze({
    NOT_AVAILABLE: 0x00,
    COVER_OPEN: 0x01,
    COVER_CLOSED: 0x02
})

export const TapeColor = Object.freeze({
    NO_MEDIA: 0x00,
    WHITE: 0x01,
    OTHER: 0x02,
    CLEAR: 0x03,
    RED: 0x04,
    BLUE: 0x05,
    YELLOW: 0x06,
    GREEN: 0x07,
    BLACK: 0x08,
    CLEAR_WHITE_TEXT: 0x09,
    MATTE_WHITE: 0x20,
    MATTE_CLEAR: 0x21,
    MATTE_SILVER: 0x22,
    SATIN_GOLD: 0x23,
    SATIN_SILVER: 0x24,
    BLUE_D: 0x30,
    RED_D: 0x31,
    FLUORESCENT_ORANGE: 0x40,
    FLUORESCENT_YELLOW: 0x41,
    BERRY_PINK_S: 0x50,
    LIGHT_GRAY_S: 0x51,
    LIME_GREEN_S: 0x52,
    YELLOW_F: 0x60,
    PINK_F: 0x61,
    BLUE_F: 0x62,
    WHITE_HEAT_SHRINK_TUBE: 0x70,
    WHITE_FLEX_ID: 0x90,
    YELLOW_FLEX_ID: 0x91,
    CLEANING: 0xf0,
    STENCIL: 0xf1,
    INCOMPATIBLE: 0xff
})

export const TextColor = Object.freeze({
    NO_MEDIA: 0x00,
    WHITE: 0x01,
    OTHER: 0x02,
    RED: 0x04,
    BLUE: 0x05,
    BLACK: 0x08,
    GOLD: 0x0a,
    BLUE_F: 0x62,
    CLEANING: 0xf0,
    STENCIL: 0xf1,
    INCOMPATIBLE: 0xff
})

const buildMedia = () => {
    const headDots = 128 // print head height at 180dpi for these models

    const makeMedia = (id, widthMm, mediaType) => {
        const dots = Math.min(headDots, Math.round((widthMm / 25.4) * Resolution.LOW.dots[0]))
        const lmargin = Math.max(0, Math.floor((headDots - dots) / 2))
        const rmargin = headDots - dots - lmargin
        return { id, width: widthMm, length: 0, lmargin, printArea: dots, rmargin, mediaType }
    }

    const media = {
        UNSUPPORTED_MEDIA: { id: 'UNSUPPORTED_MEDIA', width: 0, length: 0, lmargin: null, printArea: null, rmargin: null, mediaType: null },
        NO_MEDIA: { id: 'NO_MEDIA', width: 0, length: 0, lmargin: null, printArea: null, rmargin: null, mediaType: null },
        W3_5: makeMedia('W3_5', 4, MediaType.LAMINATED_TAPE),
        W6: makeMedia('W6', 6, MediaType.LAMINATED_TAPE),
        W9: makeMedia('W9', 9, MediaType.LAMINATED_TAPE),
        W12: makeMedia('W12', 12, MediaType.LAMINATED_TAPE),
        W18: makeMedia('W18', 18, MediaType.LAMINATED_TAPE),
        W24: makeMedia('W24', 24, MediaType.LAMINATED_TAPE)
    }

    const byKey = Object.freeze(media)
    const byTypeAndWidth = (width, mediaType) =>
        Object.values(byKey).find((m) => m.width === width && m.mediaType === mediaType) || byKey.UNSUPPORTED_MEDIA

    return { byKey, byTypeAndWidth }
}

const { byKey: Media, byTypeAndWidth: getMedia } = buildMedia()

export { Media, getMedia }
