// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Media, Resolution } from 'labelprinterkit-web/src/index.mjs'
import { ImageDimensionUtils } from '../ImageDimensionUtils.mjs'

/** Decimal millimetre controls for the displayed image axes. */
export class ItemsEditorImageDimensions {
    /**
     * Builds synchronized size sliders, decimal inputs, and 0.1 mm step buttons.
     * @param {{item: object, state: object, translate: Function, onChange: Function}} options
     * @returns {{widthCtrl: HTMLElement, heightCtrl: HTMLElement, sync: Function}}
     */
    static create({ item, state, translate, onChange }) {
        const limit = Math.max(8, (Media[state.media]?.printArea || 128) - 4)
        const isHorizontal = state.orientation === 'horizontal'
        item.width ||= 96
        item.height ||= 96
        const resolution = Resolution[state.resolution] || Resolution.LOW
        const fields = []
        /** Updates both displayed dimensions after size or rotation changes. */
        const sync = () => {
            const swapped = ImageDimensionUtils.swapsAxes(item.rotation)
            const fitted = ImageDimensionUtils.constrain(item.width, item.height, limit, isHorizontal, item.rotation)
            fields.forEach(({ axis, input, range, minus, plus }) => {
                const key = (axis === 0) !== swapped ? 'width' : 'height'
                const dotsPerMm = (resolution.dots[axis] || 180) / 25.4
                const value = fitted[key] / dotsPerMm
                input.value = String(Math.round(value * 100) / 100)
                input.min = String(Math.ceil((8 / dotsPerMm) * 100) / 100)
                // The range is a convenience; typed feed-axis sizes have no artificial maximum.
                range.max = String(Math.max(100, Math.ceil(value)))
                range.value = input.value
                minus.disabled = fitted[key] <= 8 + 0.000001
                const next = { ...item, ...fitted }
                ImageDimensionUtils.setDimension(next, key, fitted[key] + dotsPerMm / 10, limit, isHorizontal)
                plus.disabled = next[key] <= fitted[key] + 0.000001
            })
        }
        for (const axis of [0, 1]) {
            const labelText = `${translate(axis === 0 ? 'itemsEditor.sizeLength' : 'itemsEditor.sizeHeight')} (mm)`
            const field = document.createElement('div')
            field.className = 'field image-dimension-field'
            const label = document.createElement('label')
            label.textContent = labelText
            const row = document.createElement('div')
            row.className = 'image-dimension-inputs'
            const input = document.createElement('input')
            input.type = 'number'
            input.step = 'any'
            input.inputMode = 'decimal'
            input.setAttribute('aria-label', labelText)
            const range = document.createElement('input')
            range.type = 'range'
            range.min = '0'
            range.max = '100'
            range.step = '0.1'
            range.setAttribute('aria-label', labelText)
            /** Commits a valid millimetre size while preserving incomplete input during typing. */
            const apply = (value, normalize = true) => {
                if (!Number.isFinite(value) || value <= 0) return
                const key = (axis === 0) !== ImageDimensionUtils.swapsAxes(item.rotation) ? 'width' : 'height'
                const dotsPerMm = (resolution.dots[axis] || 180) / 25.4
                Object.assign(item, ImageDimensionUtils.constrain(item.width, item.height, limit, isHorizontal, item.rotation))
                ImageDimensionUtils.setDimension(item, key, value * dotsPerMm, limit, isHorizontal)
                const typed = input.value
                sync()
                if (!normalize) input.value = typed
                onChange()
            }
            const minus = document.createElement('button')
            const plus = document.createElement('button')
            for (const [button, sign, key] of [
                [minus, '−', 'itemsEditor.decreaseSize'],
                [plus, '+', 'itemsEditor.increaseSize']
            ]) {
                button.type = 'button'
                button.className = 'ghost'
                button.textContent = sign
                button.setAttribute('aria-label', translate(key, { dimension: labelText }))
                button.addEventListener('click', () => apply(Number(input.value) + (button === plus ? 0.1 : -0.1)))
            }
            input.addEventListener('input', () => {
                if (input.value.trim()) apply(Number(input.value), false)
            })
            input.addEventListener('change', sync)
            range.addEventListener('input', () => apply(Number(range.value)))
            row.append(minus, input, plus)
            field.append(label, row, range)
            fields.push({ axis, field, input, range, minus, plus })
        }
        sync()
        return { widthCtrl: fields[0].field, heightCtrl: fields[1].field, sync }
    }
}
