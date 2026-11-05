// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Resolution } from 'labelprinterkit-web/src/index.mjs'
import { ItemsEditorImageDimensions } from './ItemsEditorImageDimensions.mjs'

/** Millimetre inputs for shape geometry, stored as printer dots for rendering. */
export class ItemsEditorShapeDimensions {
    /**
     * Builds a numeric input, slider, and buttons with 0.1 mm increments.
     * Existing dot values remain unchanged until the user edits a control.
     * @param {{item: object, state: object, key: string, label: string, axis: number,
     * defaultDots: number, min?: number, translate: Function, onChange: Function}} options
     * @returns {HTMLElement}
     */
    static createControl({ item, state, key, label, axis, defaultDots, min = 0.1, translate, onChange }) {
        const resolution = Resolution[state.resolution] || Resolution.LOW
        const dotsPerMm = resolution.dots[axis] / 25.4
        const labelText = `${label} (mm)`
        const field = document.createElement('div')
        field.className = 'field image-dimension-field'
        const caption = document.createElement('label')
        caption.textContent = labelText
        const row = document.createElement('div')
        row.className = 'image-dimension-inputs'
        const input = document.createElement('input')
        input.type = 'number'
        input.min = String(min)
        input.step = '0.1'
        input.inputMode = 'decimal'
        input.setAttribute('aria-label', labelText)
        const range = document.createElement('input')
        range.type = 'range'
        range.min = String(min)
        range.step = '0.1'
        range.setAttribute('aria-label', labelText)
        const minus = document.createElement('button')
        const plus = document.createElement('button')
        /** Refreshes both controls without rounding the stored printer dots. */
        const sync = () => {
            const mm = (item[key] ?? defaultDots) / dotsPerMm
            input.value = String(Math.round(mm * 100) / 100)
            range.max = String(Math.max(key === 'strokeWidth' ? 10 : 100, Math.ceil(mm)))
            range.value = input.value
            minus.disabled = mm <= min + 0.000001
        }
        /** Applies valid edits, preserving unfinished numeric input while typing. */
        const apply = (mm, normalize = true) => {
            if (!Number.isFinite(mm) || mm < min) return
            item[key] = mm * dotsPerMm
            const typed = input.value
            sync()
            if (!normalize) input.value = typed
            onChange()
        }
        for (const [button, translationKey] of [
            [minus, 'itemsEditor.decreaseSize'],
            [plus, 'itemsEditor.increaseSize']
        ]) {
            button.type = 'button'
            button.className = 'ghost'
            button.append(ItemsEditorImageDimensions.createStepIcon(button === plus))
            button.setAttribute('aria-label', translate(translationKey, { dimension: labelText }))
            button.addEventListener('click', () => {
                const current = (item[key] ?? defaultDots) / dotsPerMm
                const next = Math.round((current + (button === plus ? 0.1 : -0.1)) * 10) / 10
                apply(Math.max(min, next))
            })
        }
        input.addEventListener('input', () => {
            if (input.value.trim()) apply(Number(input.value), false)
        })
        input.addEventListener('change', sync)
        range.addEventListener('input', () => apply(Number(range.value)))
        row.append(minus, input, plus)
        field.append(caption, row, range)
        sync()
        return field
    }
}
