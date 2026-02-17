/**
 * Shared placement heuristics for assistant rebuild overlap resolution.
 */
export class AiRebuildPlacementHeuristics {
    /**
     * Returns true when overlap should resolve vertically (downwards) rather than horizontally.
     * @param {{
     *  leftItem: Record<string, any>,
     *  rightItem: Record<string, any>,
     *  isTextTextOverlap: boolean,
     *  touchesMachineReadable: boolean
     * }} options
     * @returns {boolean}
     */
    static shouldPreferVerticalOverlapFlow({ leftItem, rightItem, isTextTextOverlap, touchesMachineReadable }) {
        const mixedRotationTextOverlap =
            isTextTextOverlap &&
            AiRebuildPlacementHeuristics.isQuarterTurnText(leftItem) !==
                AiRebuildPlacementHeuristics.isQuarterTurnText(rightItem)
        const shortTokenTextOverlap =
            isTextTextOverlap &&
            AiRebuildPlacementHeuristics.isShortTokenText(leftItem) !==
                AiRebuildPlacementHeuristics.isShortTokenText(rightItem)
        const machineReadableShortTokenOverlap =
            touchesMachineReadable &&
            ((AiRebuildPlacementHeuristics.#isMachineReadable(leftItem) &&
                AiRebuildPlacementHeuristics.isShortTokenText(rightItem)) ||
                (AiRebuildPlacementHeuristics.#isMachineReadable(rightItem) &&
                    AiRebuildPlacementHeuristics.isShortTokenText(leftItem)))
        return (
            (isTextTextOverlap && !mixedRotationTextOverlap && !shortTokenTextOverlap) ||
            (touchesMachineReadable && !machineReadableShortTokenOverlap)
        )
    }

    /**
     * Returns true when a text item uses quarter-turn rotation.
     * @param {Record<string, any>} item
     * @returns {boolean}
     */
    static isQuarterTurnText(item) {
        if (!item || item.type !== 'text') return false
        const normalizedRotation = Math.abs(Number(item.rotation || 0)) % 180
        return Math.abs(normalizedRotation - 90) <= 12
    }

    /**
     * Returns true when text appears to be a compact token (e.g. one-letter marker/symbol).
     * @param {Record<string, any>} item
     * @returns {boolean}
     */
    static isShortTokenText(item) {
        if (!item || item.type !== 'text') return false
        const normalized = String(item.text || '')
            .replace(/\r/g, '')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, '')
        if (!normalized) return false
        return normalized.length <= 3
    }

    /**
     * Returns true for machine-readable items.
     * @param {Record<string, any>} item
     * @returns {boolean}
     */
    static #isMachineReadable(item) {
        const type = String(item?.type || '')
            .trim()
            .toLowerCase()
        return type === 'qr' || type === 'barcode'
    }
}
