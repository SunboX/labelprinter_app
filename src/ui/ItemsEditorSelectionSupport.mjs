// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import { InteractionUtils } from '../InteractionUtils.mjs'

/** Selects objects from their cards without rebuilding focused form controls. */
export class ItemsEditorSelectionSupport {
    /** Binds delegated mouse and keyboard selection. @param {object} editor */
    static bind(editor) {
        const root = editor.els.items
        if (!root) return
        root.addEventListener('click', (event) => {
            const card = event.target.closest('.item-card')
            if (!card || !root.contains(card) || event.target.closest('.item-delete, .item-toggle')) return
            ItemsEditorSelectionSupport.select(editor, card, event)
        })
        root.addEventListener('keydown', (event) => {
            if (!['Enter', ' '].includes(event.key) || !event.target.matches('.item-card')) return
            event.preventDefault()
            ItemsEditorSelectionSupport.select(editor, event.target, event)
        })
    }

    /**
     * Updates selection styling and notifies the preview while retaining input focus.
     * @param {object} editor
     * @param {HTMLElement} card
     * @param {MouseEvent | KeyboardEvent} event
     */
    static select(editor, card, event) {
        const id = card.dataset.itemId
        if (!editor.state.items.some((item) => item.id === id)) return
        const ids = InteractionUtils.isAdditiveSelectionModifier(event)
            ? InteractionUtils.resolveSelectionIds(id, editor.selectedItemIds, true)
            : [id]
        editor.selectedItemIds = new Set(ids)
        editor.els.items.querySelectorAll('.item-card').forEach((element) => {
            element.classList.toggle('selected', editor.selectedItemIds.has(element.dataset.itemId))
        })
        editor.onSelectionChange(ids)
    }
}
