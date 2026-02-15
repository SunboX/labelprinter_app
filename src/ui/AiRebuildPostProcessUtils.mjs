/**
 * Utilities for deterministic assistant rebuild cleanup.
 */
export class AiRebuildPostProcessUtils {
    /**
     * Detects an aggregated multiline text item duplicated by split text lines.
     * @param {Array<Record<string, any>>} items
     * @returns {Record<string, any> | null}
     */
    static findDuplicatedAggregateTextItem(items) {
        const textItems = Array.isArray(items) ? items.filter((item) => item.type === 'text') : []
        if (textItems.length < 2) return null
        const normalizedRows = textItems.map((item) => {
            const text = String(item.text || '')
            const normalized = text
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim()
            const nonEmptyLineCount = text
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean).length
            return { item, normalized, nonEmptyLineCount }
        })
        const aggregateCandidates = normalizedRows
            .filter((row) => row.nonEmptyLineCount >= 4 && row.normalized.length >= 24)
            .sort((left, right) => right.nonEmptyLineCount - left.nonEmptyLineCount)
        for (const candidate of aggregateCandidates) {
            const overlapCount = normalizedRows
                .filter((row) => row.item.id !== candidate.item.id && row.normalized.length >= 4)
                .reduce((count, row) => count + (candidate.normalized.includes(row.normalized) ? 1 : 0), 0)
            if (overlapCount >= 2) return candidate.item
        }
        return null
    }
}
