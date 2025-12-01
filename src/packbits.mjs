// Minimal PackBits encoder used by the Brother raster protocol.
export function packbitsEncode(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    const out = []
    let i = 0

    while (i < data.length) {
        // Detect repeated run.
        let runLength = 1
        while (i + runLength < data.length && data[i + runLength] === data[i] && runLength < 128) {
            runLength += 1
        }

        if (runLength > 1) {
            // Encoded run: count is stored as two's complement (257 - runLength).
            out.push(257 - runLength)
            out.push(data[i])
            i += runLength
            continue
        }

        // Literal run until a repeat appears or 128 bytes.
        let literalLength = 1
        while (
            i + literalLength < data.length &&
            (i + literalLength + 1 >= data.length || data[i + literalLength] !== data[i + literalLength + 1]) &&
            literalLength < 128
        ) {
            literalLength += 1
        }

        out.push(literalLength - 1)
        for (let j = 0; j < literalLength; j += 1) {
            out.push(data[i + j])
        }
        i += literalLength
    }

    return new Uint8Array(out)
}
