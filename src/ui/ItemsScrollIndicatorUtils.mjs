/**
 * Helpers for objects-panel scroll indicator behavior.
 */
export class ItemsScrollIndicatorUtils {
    /**
     * Binds scroll + resize listeners that keep indicator state in sync.
     * @param {HTMLElement | null | undefined} itemsElement
     * @param {() => void} updateCallback
     */
    static bind(itemsElement, updateCallback) {
        if (!itemsElement || typeof updateCallback !== 'function') return
        itemsElement.addEventListener(
            'scroll',
            () => {
                updateCallback()
            },
            { passive: true }
        )
        window.addEventListener('resize', updateCallback)
    }

    /**
     * Updates scroll indicator attributes for the objects-panel list.
     * @param {HTMLElement | null | undefined} itemsElement
     * @param {HTMLElement | null | undefined} indicatorElement
     * @param {(key: string) => string} translate
     */
    static update(itemsElement, indicatorElement, translate) {
        if (!itemsElement) return
        const overflowThreshold = 2
        const hasOverflow = itemsElement.scrollHeight - itemsElement.clientHeight > overflowThreshold
        const hasHiddenTop = hasOverflow && itemsElement.scrollTop > 1
        const hasHiddenBottom =
            hasOverflow &&
            itemsElement.scrollTop + itemsElement.clientHeight < itemsElement.scrollHeight - 1

        itemsElement.dataset.overflow = hasOverflow ? 'true' : 'false'
        itemsElement.dataset.scrollTop = hasHiddenTop ? 'true' : 'false'
        itemsElement.dataset.scrollBottom = hasHiddenBottom ? 'true' : 'false'

        if (!indicatorElement) return
        const indicatorDirection =
            hasHiddenTop && hasHiddenBottom ? 'both' : hasHiddenTop ? 'up' : hasHiddenBottom ? 'down' : 'down'
        indicatorElement.dataset.direction = indicatorDirection
        indicatorElement.hidden = !hasOverflow
        if (!hasOverflow) return

        const hintKey =
            hasHiddenTop && hasHiddenBottom
                ? 'objects.scrollHintBoth'
                : hasHiddenTop
                  ? 'objects.scrollHintUp'
                  : 'objects.scrollHintDown'
        indicatorElement.textContent = translate(hintKey)
    }
}
