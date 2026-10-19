// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

/** Keeps dimension settings and preview synchronized with label media changes. */
export class EditorMediaControls {
    /**
     * Binds label orientation, media, resolution, and optional length controls.
     * @param {object} els
     * @param {object} state
     * @param {object} itemsEditor
     * @param {object} previewRenderer
     */
    static bind(els, state, itemsEditor, previewRenderer) {
        for (const key of ['orientation', 'media', 'resolution']) {
            els[key].addEventListener('change', () => {
                state[key] = els[key].value
                // Existing controls capture tape limits and DPI; rebuild them together.
                itemsEditor.render()
                previewRenderer.render()
            })
        }
        els.mediaLength.addEventListener('input', (event) => {
            const value = event.target.value.trim()
            state.mediaLengthMm = value ? Number(value) : null
            previewRenderer.render()
        })
    }
}
