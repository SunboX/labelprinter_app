// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import { ItemsEditorMillimetreControl } from './ItemsEditorMillimetreControl.mjs'

/** Text size settings retain the legacy CSS-pixel project representation. */
export class ItemsEditorTextSupport {
    /**
     * Creates nominal font-em size controls in mm, independent of printer resolution.
     * @param {{item: object, state: object, translate: Function, onChange: Function}} options
     * @returns {HTMLElement}
     */
    static createFontSizeControl({ item, state, translate, onChange }) {
        const field = ItemsEditorMillimetreControl.createControl({
            item,
            state,
            key: 'fontSize',
            label: translate('itemsEditor.sliderFontSize'),
            axis: 1,
            unitsPerMm: 96 / 25.4,
            defaultDots: 24,
            min: 2.7,
            max: (64 * 25.4) / 96,
            translate,
            onChange
        })
        field.className += ' size-field'
        return field
    }
}
