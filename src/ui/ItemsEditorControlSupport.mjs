/**
 * Shared UI-control helpers for item settings cards.
 */
export class ItemsEditorControlSupport {
    /**
     * Resolves max width/height values for orientation-aware item sliders.
     * @param {object} state
     * @param {number} crossAxisLimit
     * @param {number} [wideAxisMax=600]
     * @param {number} [tallAxisMax=320]
     * @returns {{ widthMax: number, heightMax: number }}
     */
    static resolveDimensionMax(state, crossAxisLimit, wideAxisMax = 600, tallAxisMax = 320) {
        return {
            widthMax: state.orientation === 'vertical' ? crossAxisLimit : wideAxisMax,
            heightMax: state.orientation === 'horizontal' ? crossAxisLimit : tallAxisMax
        }
    }

    /**
     * Creates width/height sliders for constrained item dimensions.
     * @param {{
     *  item: object,
     *  state: object,
     *  sizeLabel: string,
     *  heightLabel: string,
     *  minWidth: number,
     *  minHeight: number,
     *  widthMax: number,
     *  heightMax: number,
     *  defaultWidth: number,
     *  defaultHeight: number,
     *  onChange: () => void,
     *  constrainDimensions: (width: number, height: number, state: object) => { width: number, height: number },
     *  createSlider: (label: string, value: number, min: number, max: number, step: number, onInput: (value: number) => void) => HTMLDivElement
     * }} options
     * @returns {{ widthCtrl: HTMLDivElement, heightCtrl: HTMLDivElement }}
     */
    static createConstrainedDimensionControls({
        item,
        state,
        sizeLabel,
        heightLabel,
        minWidth,
        minHeight,
        widthMax,
        heightMax,
        defaultWidth,
        defaultHeight,
        onChange,
        constrainDimensions,
        createSlider
    }) {
        const applyConstrainedDimensions = (nextWidth, nextHeight) => {
            const constrained = constrainDimensions(nextWidth, nextHeight, state)
            item.width = Math.max(minWidth, constrained.width)
            item.height = Math.max(minHeight, constrained.height)
        }

        applyConstrainedDimensions(item.width || defaultWidth, item.height || defaultHeight)

        const widthCtrl = createSlider(sizeLabel, item.width, minWidth, widthMax, 1, (value) => {
            applyConstrainedDimensions(value, item.height || defaultHeight)
            onChange()
        })
        const heightCtrl = createSlider(heightLabel, item.height, minHeight, heightMax, 1, (value) => {
            applyConstrainedDimensions(item.width || defaultWidth, value)
            onChange()
        })

        return { widthCtrl, heightCtrl }
    }

    /**
     * Creates X/Y offset sliders and an optional rotation slider.
     * @param {{
     *  item: object,
     *  translate: (key: string, params?: Record<string, string | number>) => string,
     *  onChange: () => void,
     *  createSlider: (label: string, value: number, min: number, max: number, step: number, onInput: (value: number) => void) => HTMLDivElement,
     *  xMin?: number,
     *  xMax?: number,
     *  yMin?: number,
     *  yMax?: number,
     *  includeRotation?: boolean,
     *  rotationMin?: number,
     *  rotationMax?: number
     * }} options
     * @returns {{ offsetCtrl: HTMLDivElement, yOffsetCtrl: HTMLDivElement, rotationCtrl: HTMLDivElement | null }}
     */
    static createOffsetAndRotationControls({
        item,
        translate,
        onChange,
        createSlider,
        xMin = -80,
        xMax = 80,
        yMin = -80,
        yMax = 80,
        includeRotation = true,
        rotationMin = -180,
        rotationMax = 180
    }) {
        const offsetCtrl = createSlider(translate('itemsEditor.sliderXOffset'), item.xOffset ?? 0, xMin, xMax, 1, (value) => {
            item.xOffset = value
            onChange()
        })
        const yOffsetCtrl = createSlider(translate('itemsEditor.sliderYOffset'), item.yOffset ?? 0, yMin, yMax, 1, (value) => {
            item.yOffset = value
            onChange()
        })
        const rotationCtrl = includeRotation
            ? createSlider(
                  translate('itemsEditor.sliderRotation'),
                  item.rotation ?? 0,
                  rotationMin,
                  rotationMax,
                  1,
                  (value) => {
                      item.rotation = value
                      onChange()
                  }
              )
            : null
        return { offsetCtrl, yOffsetCtrl, rotationCtrl }
    }

    /**
     * Builds a labeled select field.
     * @param {{
     *  labelText: string,
     *  value: string,
     *  options: Array<{ value: string, label: string }>,
     *  onChange: (value: string) => void
     * }} options
     * @returns {{ field: HTMLDivElement, select: HTMLSelectElement }}
     */
    static createSelectField({ labelText, value, options, onChange }) {
        const field = document.createElement('div')
        field.className = 'field'
        const label = document.createElement('label')
        label.textContent = labelText
        const select = document.createElement('select')
        options.forEach((entry) => {
            const option = document.createElement('option')
            option.value = entry.value
            option.textContent = entry.label
            select.append(option)
        })
        select.value = value
        select.addEventListener('change', (event) => {
            onChange(event.target.value)
        })
        field.append(label, select)
        return { field, select }
    }

    /**
     * Builds a checkbox field styled like other controls.
     * @param {{
     *  labelText: string,
     *  checked: boolean,
     *  onChange: (checked: boolean) => void
     * }} options
     * @returns {{ field: HTMLDivElement, input: HTMLInputElement }}
     */
    static createCheckboxField({ labelText, checked, onChange }) {
        const field = document.createElement('div')
        field.className = 'field'
        const label = document.createElement('label')
        label.className = 'checkbox-row'
        const input = document.createElement('input')
        input.type = 'checkbox'
        input.checked = Boolean(checked)
        input.addEventListener('change', (event) => {
            onChange(event.target.checked)
        })
        const text = document.createElement('span')
        text.textContent = labelText
        label.append(input, text)
        field.append(label)
        return { field, input }
    }

    /**
     * Builds a labeled row of toggle buttons.
     * @param {{
     *  labelText: string,
     *  buttons: Array<{
     *   id: string,
     *   label: string,
     *   title: string,
     *   className?: string,
     *   isActive: () => boolean,
     *   onToggle: () => void
     *  }>
     * }} options
     * @returns {{ field: HTMLDivElement, buttons: Record<string, HTMLButtonElement> }}
     */
    static createToggleButtonGroupField({ labelText, buttons }) {
        const field = document.createElement('div')
        field.className = 'field text-style-field'
        const label = document.createElement('label')
        label.textContent = labelText
        const group = document.createElement('div')
        group.className = 'text-style-buttons'
        const buttonMap = {}
        ;(Array.isArray(buttons) ? buttons : []).forEach((entry) => {
            const button = document.createElement('button')
            button.type = 'button'
            button.className = `text-style-toggle ${entry.className || ''}`.trim()
            button.textContent = String(entry.label || '')
            button.title = String(entry.title || '')
            button.setAttribute('aria-label', String(entry.title || ''))
            button.setAttribute('aria-pressed', entry.isActive() ? 'true' : 'false')
            if (entry.isActive()) {
                button.classList.add('is-active')
            }
            button.addEventListener('click', () => {
                entry.onToggle()
                const isActive = entry.isActive()
                button.classList.toggle('is-active', isActive)
                button.setAttribute('aria-pressed', isActive ? 'true' : 'false')
            })
            group.append(button)
            if (entry.id) buttonMap[entry.id] = button
        })
        field.append(label, group)
        return { field, buttons: buttonMap }
    }
}
