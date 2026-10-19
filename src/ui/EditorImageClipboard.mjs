// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import { ItemsEditorImageSupport } from './ItemsEditorImageSupport.mjs'

/** Imports clipboard image files through the same path as image uploads. */
export class EditorImageClipboard {
    /**
     * Listens across the editor, including focused text fields.
     * @param {object} editor
     * @param {Document} [root=document]
     */
    static bind(editor, root = document) {
        root.addEventListener('paste', (event) => EditorImageClipboard.handlePaste(event, editor))
    }

    /**
     * Imports each clipboard image once, leaving text-only paste to the browser.
     * @param {ClipboardEvent} event
     * @param {object} editor
     * @returns {Promise<void>}
     */
    static async handlePaste(event, editor) {
        const data = event.clipboardData
        if (!data || event.defaultPrevented) return
        const images = Array.from(data.items || [])
            .filter((entry) => entry.kind === 'file' && entry.type.startsWith('image/'))
            .map((entry) => entry.getAsFile())
            .filter(Boolean)
        if (!images.length) {
            images.push(...Array.from(data.files || []).filter((file) => file.type.startsWith('image/')))
        }
        if (!images.length) return
        event.preventDefault()
        for (const file of images) {
            editor.addImageItem()
            const item = editor.state.items.at(-1)
            await ItemsEditorImageSupport.loadImageFile({
                item,
                file,
                state: editor.state,
                translate: editor.translate,
                setStatus: editor.setStatus,
                render: () => editor.render(),
                onChange: () => editor.onChange()
            })
        }
    }
}
