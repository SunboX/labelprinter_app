// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Resolution } from 'labelprinterkit-web/src/index.mjs'
import { ItemsEditorImageDimensions } from './ItemsEditorImageDimensions.mjs'

/** Millimetre inputs for item geometry, stored as printer dots for rendering. */
export class ItemsEditorMillimetreControl {
    static #syncCallbacks = new WeakMap()

    /** Refreshes a control after related geometry changes. @param {HTMLElement} field */
    static sync(field) {
        ItemsEditorMillimetreControl.#syncCallbacks.get(field)?.()
    }

    /**
     * Builds a numeric input, slider, and buttons with 0.1 mm increments.
     * Existing dot values remain unchanged until the user edits a control.
     * @param {{item: object, state: object, key: string, label: string, axis: number,
     * defaultDots: number, min?: number, max?: number, unitsPerMm?: number, getDots?: () => number, setDots?: (dots: number) => void,
     * translate: Function, onChange: Function}} options
     * @returns {HTMLElement}
     */
    static createControl({ item, state, key, label, axis, defaultDots, min = 0.1, max = Infinity, unitsPerMm, getDots, setDots, translate, onChange }) {
        const resolution = Resolution[state.resolution] || Resolution.LOW
        const dotsPerMm = unitsPerMm || resolution.dots[axis] / 25.4
        const labelText = `${label} (mm)`
        const field = document.createElement('div')
        field.className = 'field image-dimension-field'
        const caption = document.createElement('label')
        caption.textContent = labelText
        const row = document.createElement('div')
        row.className = 'image-dimension-inputs'
        const input = document.createElement('input')
        input.type = 'number'
        if (Number.isFinite(min)) input.min = String(min)
        if (Number.isFinite(max)) input.max = String(max)
        input.step = '0.1'
        input.inputMode = 'decimal'
        input.setAttribute('aria-label', labelText)
        const range = document.createElement('input')
        range.type = 'range'
        range.step = '0.1'
        range.setAttribute('aria-label', labelText)
        const minus = document.createElement('button')
        const plus = document.createElement('button')
        /** Refreshes both controls without rounding the stored printer dots. */
        const sync = (preserveInput = false) => {
            const mm = (getDots ? getDots() : item[key] ?? defaultDots) / dotsPerMm
            const displayed = String(Math.round(mm * 100) / 100)
            // Reassigning a number input while typing discards its pending decimal separator.
            if (!preserveInput) input.value = displayed
            // Signed offsets have no artificial typing limit; keep their slider useful around zero.
            range.min = String(Number.isFinite(min) ? min : Math.min(-100, Math.floor(mm)))
            range.max = String(Number.isFinite(max) ? max : Math.max(key === 'strokeWidth' ? 10 : 100, Math.ceil(mm)))
            range.value = displayed
            minus.disabled = mm <= min + 0.000001
            plus.disabled = mm >= max - 0.000001
        }
        /** Applies valid edits, preserving unfinished numeric input while typing. */
        const apply = (mm, normalize = true) => {
            if (!Number.isFinite(mm) || mm < min) return
            const dots = Math.min(max, mm) * dotsPerMm
            if (setDots) setDots(dots)
            else item[key] = dots
            sync(!normalize)
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
                const current = (getDots ? getDots() : item[key] ?? defaultDots) / dotsPerMm
                const next = Math.round((current + (button === plus ? 0.1 : -0.1)) * 100) / 100
                apply(Math.max(min, next))
            })
        }
        input.addEventListener('input', () => {
            if (input.value.trim()) apply(Number(input.value), false)
        })
        input.addEventListener('change', () => sync())
        input.addEventListener('focus', () => sync())
        range.addEventListener('input', () => apply(Number(range.value)))
        row.append(minus, input, plus)
        field.append(caption, row, range)
        ItemsEditorMillimetreControl.#syncCallbacks.set(field, sync)
        sync()
        return field
    }
}
