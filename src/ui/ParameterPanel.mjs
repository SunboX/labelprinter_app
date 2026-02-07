import { ParameterTemplateUtils } from '../ParameterTemplateUtils.mjs'

/**
 * Manages parameter definitions, uploaded parameter data, validation, and preview rendering.
 */
export class ParameterPanel {
    #onChange = () => {}

    /**
     * @param {object} els
     * @param {object} state
     * @param {(text: string, type?: string) => void} setStatus
     * @param {() => void} onChange
     */
    constructor(els, state, setStatus, onChange) {
        this.els = els
        this.state = state
        this.setStatus = setStatus
        this.onChange = onChange
        this.validation = { errors: [], warnings: [], placeholders: [] }
        this.parseError = null
        this.parseErrorLine = null
        this.parseErrorColumn = null
        this.previewText = '[]'
        this.rowLineRanges = []
        this._eventsBound = false
    }

    /**
     * Sets the panel change callback.
     * @param {() => void} callback
     */
    set onChange(callback) {
        this.#onChange = typeof callback === 'function' ? callback : () => {}
    }

    /**
     * Returns the panel change callback.
     * @returns {() => void}
     */
    get onChange() {
        return this.#onChange
    }

    /**
     * Initializes the panel.
     */
    init() {
        this.#ensureStateShape()
        this.#bindEvents()
        this.syncFromState()
    }

    /**
     * Re-renders the panel from current state values.
     */
    syncFromState() {
        this.#ensureStateShape()
        this.#clearParseError()
        if (this.state.parameterDataRaw.trim()) {
            const parsed = ParameterTemplateUtils.parseParameterDataJson(this.state.parameterDataRaw)
            if (parsed.parseError) {
                this.parseError = parsed.parseError
                this.parseErrorLine = parsed.parseErrorLine
                this.parseErrorColumn = parsed.parseErrorColumn
                this.previewText = parsed.prettyText || this.state.parameterDataRaw
                this.state.parameterDataRows = []
            } else {
                this.state.parameterDataRows = parsed.rows || []
            }
        }
        this.#renderDefinitions()
        this.#refreshValidationViews()
    }

    /**
     * Re-validates when item templates change.
     */
    handleItemTemplatesChanged() {
        this.#refreshValidationViews()
    }

    /**
     * Returns the value map used for on-screen preview rendering.
     * @returns {Record<string, string>}
     */
    getPreviewParameterValues() {
        const firstRow = Array.isArray(this.state.parameterDataRows) && this.state.parameterDataRows.length
            ? this.state.parameterDataRows[0]
            : {}
        return ParameterTemplateUtils.buildParameterValueMap(this.state.parameters, firstRow)
    }

    /**
     * Returns value maps for all labels that will be printed.
     * @returns {Array<Record<string, string>>}
     */
    buildPrintParameterValueMaps() {
        const rows = Array.isArray(this.state.parameterDataRows) && this.state.parameterDataRows.length
            ? this.state.parameterDataRows
            : [{}]
        return rows.map((row) => ParameterTemplateUtils.buildParameterValueMap(this.state.parameters, row))
    }

    /**
     * Returns true when printing should be blocked.
     * @returns {boolean}
     */
    hasBlockingErrors() {
        return Boolean(this.parseError) || this.validation.errors.length > 0
    }

    /**
     * Ensures parameter state fields are present and normalized.
     */
    #ensureStateShape() {
        if (!Array.isArray(this.state.parameters)) {
            this.state.parameters = []
        }
        if (!Array.isArray(this.state.parameterDataRows)) {
            this.state.parameterDataRows = []
        }
        if (typeof this.state.parameterDataRaw !== 'string') {
            this.state.parameterDataRaw = ''
        }
        if (typeof this.state.parameterDataSourceName !== 'string') {
            this.state.parameterDataSourceName = ''
        }
        this.state.parameters = ParameterTemplateUtils.normalizeParameterDefinitions(this.state.parameters)
    }

    /**
     * Binds panel event handlers.
     */
    #bindEvents() {
        if (this._eventsBound) return
        this._eventsBound = true

        if (this.els.addParameter) {
            this.els.addParameter.addEventListener('click', () => {
                this.state.parameters.push({ name: this.#buildNextParameterName(), defaultValue: '' })
                this.#renderDefinitions()
                this.#refreshValidationViews()
                this.#emitChange()
            })
        }

        if (this.els.loadParameterData) {
            this.els.loadParameterData.addEventListener('click', () => this.#loadParameterDataFromFile())
        }
        if (this.els.downloadParameterExample) {
            this.els.downloadParameterExample.addEventListener('click', () => this.#downloadExampleParameterJson())
        }
    }

    /**
     * Downloads an example parameter JSON file derived from current definitions.
     */
    #downloadExampleParameterJson() {
        const normalizedParameters = ParameterTemplateUtils.normalizeParameterDefinitions(this.state.parameters)
        const hasAnyParameter = normalizedParameters.some((parameter) => parameter.name)
        if (!hasAnyParameter) {
            this.setStatus('Define at least one parameter first.', 'info')
            return
        }

        const exampleRows = ParameterTemplateUtils.buildExampleRows(normalizedParameters)
        const content = JSON.stringify(exampleRows, null, 2)
        const stamp = new Date().toISOString().slice(0, 10)
        const fileName = `label-parameters-example-${stamp}.json`
        const blob = new Blob([content], { type: 'application/json' })
        const objectUrl = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = objectUrl
        anchor.download = fileName
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
        this.setStatus(`Downloaded ${fileName}.`, 'success')
    }

    /**
     * Loads parameter row data from a local JSON file.
     * @returns {Promise<void>}
     */
    async #loadParameterDataFromFile() {
        try {
            const file = await this.#promptForJsonFile()
            if (!file) {
                this.setStatus('Parameter data load canceled.', 'info')
                return
            }
            const rawText = await file.text()
            const parsed = ParameterTemplateUtils.parseParameterDataJson(rawText)

            this.state.parameterDataSourceName = file.name
            this.state.parameterDataRaw = rawText

            if (parsed.parseError) {
                this.state.parameterDataRows = []
                this.parseError = parsed.parseError
                this.parseErrorLine = parsed.parseErrorLine
                this.parseErrorColumn = parsed.parseErrorColumn
                this.previewText = parsed.prettyText || rawText || ''
                this.rowLineRanges = []
                this.#refreshValidationViews(false)
                const location = this.parseErrorLine ? ` (line ${this.parseErrorLine}, col ${this.parseErrorColumn || '?'})` : ''
                this.setStatus(`Invalid parameter JSON${location}.`, 'error')
                this.#emitChange()
                return
            }

            this.#clearParseError()
            this.state.parameterDataRows = parsed.rows || []
            this.#refreshValidationViews()
            const rowCount = this.state.parameterDataRows.length
            this.setStatus(`Loaded parameter data (${rowCount} row${rowCount === 1 ? '' : 's'}).`, 'success')
            this.#emitChange()
        } catch (err) {
            if (err?.name === 'AbortError') {
                this.setStatus('Parameter data load canceled.', 'info')
                return
            }
            const message = err?.message || 'Unknown error'
            this.setStatus(`Failed to load parameter JSON: ${message}.`, 'error')
        }
    }

    /**
     * Prompts for a single JSON file.
     * @returns {Promise<File | null>}
     */
    async #promptForJsonFile() {
        if (window.showOpenFilePicker) {
            const [handle] = await window.showOpenFilePicker({
                multiple: false,
                types: [
                    {
                        description: 'Parameter data JSON',
                        accept: { 'application/json': ['.json'] }
                    }
                ]
            })
            return handle ? handle.getFile() : null
        }

        if (!this.els.parameterDataInput) return null

        return new Promise((resolve) => {
            const input = this.els.parameterDataInput
            let settled = false
            const cleanup = () => {
                input.removeEventListener('change', onChange)
                window.removeEventListener('focus', onFocus)
            }
            const onChange = () => {
                settled = true
                cleanup()
                resolve(input.files?.[0] ?? null)
            }
            const onFocus = () => {
                window.setTimeout(() => {
                    if (settled) return
                    cleanup()
                    resolve(null)
                }, 0)
            }
            input.addEventListener('change', onChange)
            window.addEventListener('focus', onFocus, { once: true })
            input.value = ''
            input.click()
        })
    }

    /**
     * Rebuilds the parameter definition editor rows.
     */
    #renderDefinitions() {
        if (!this.els.parameterDefinitions) return
        this.els.parameterDefinitions.innerHTML = ''

        if (!this.state.parameters.length) {
            const hint = document.createElement('p')
            hint.className = 'muted small'
            hint.textContent = 'No parameters yet. Add one to use {{placeholders}} in text or QR content.'
            this.els.parameterDefinitions.appendChild(hint)
            return
        }

        this.state.parameters.forEach((parameter, index) => {
            const row = document.createElement('div')
            row.className = 'parameter-row'

            const nameField = document.createElement('div')
            nameField.className = 'field'
            const nameLabel = document.createElement('label')
            nameLabel.textContent = 'Name'
            const nameInput = document.createElement('input')
            nameInput.value = parameter.name
            nameInput.placeholder = 'parameter_name'
            nameInput.addEventListener('input', (e) => {
                this.state.parameters[index].name = e.target.value
                this.#refreshValidationViews()
                this.#emitChange()
            })
            nameField.append(nameLabel, nameInput)

            const defaultField = document.createElement('div')
            defaultField.className = 'field'
            const defaultLabel = document.createElement('label')
            defaultLabel.textContent = 'Default'
            const defaultInput = document.createElement('input')
            defaultInput.value = parameter.defaultValue
            defaultInput.placeholder = 'Optional default value'
            defaultInput.addEventListener('input', (e) => {
                this.state.parameters[index].defaultValue = e.target.value
                this.#refreshValidationViews()
                this.#emitChange()
            })
            defaultField.append(defaultLabel, defaultInput)

            const remove = document.createElement('button')
            remove.className = 'ghost parameter-remove'
            remove.textContent = 'Remove'
            remove.addEventListener('click', () => {
                this.state.parameters.splice(index, 1)
                this.#renderDefinitions()
                this.#refreshValidationViews()
                this.#emitChange()
            })

            row.append(nameField, defaultField, remove)
            this.els.parameterDefinitions.appendChild(row)
        })
    }

    /**
     * Computes a unique default parameter name.
     * @returns {string}
     */
    #buildNextParameterName() {
        const usedNames = new Set(this.state.parameters.map((parameter) => parameter.name))
        let index = 1
        while (usedNames.has(`param_${index}`)) {
            index += 1
        }
        return `param_${index}`
    }

    /**
     * Re-validates and updates all parameter data views.
     * @param {boolean} [rebuildPreview=true]
     */
    #refreshValidationViews(rebuildPreview = true) {
        this.#ensureStateShape()

        this.validation = ParameterTemplateUtils.validateParameterSetup(
            this.state.parameters,
            this.state.items,
            this.state.parameterDataRows,
            this.parseError ? '' : this.state.parameterDataRaw
        )

        if (rebuildPreview && !this.parseError) {
            const { prettyText, rowLineRanges } = ParameterTemplateUtils.buildPrettyArrayPreview(this.state.parameterDataRows)
            this.previewText = prettyText
            this.rowLineRanges = rowLineRanges
        }

        this.#renderDataMeta()
        this.#renderIssues()
        this.#renderPreview()
    }

    /**
     * Updates the data summary text.
     */
    #renderDataMeta() {
        if (!this.els.parameterDataMeta) return
        const rowCount = this.state.parameterDataRows.length
        const sourceName = this.state.parameterDataSourceName || 'No file selected'
        this.els.parameterDataMeta.textContent = `${rowCount} row${rowCount === 1 ? '' : 's'} loaded (${sourceName})`
    }

    /**
     * Renders validation issues.
     */
    #renderIssues() {
        if (!this.els.parameterIssues) return
        this.els.parameterIssues.innerHTML = ''

        const issues = []
        if (this.parseError) {
            const location = this.parseErrorLine
                ? ` (line ${this.parseErrorLine}, col ${this.parseErrorColumn || '?'})`
                : ''
            issues.push({ level: 'error', message: `JSON parse error${location}: ${this.parseError}` })
        }
        this.validation.errors.forEach((issue) => issues.push(issue))
        this.validation.warnings.forEach((issue) => issues.push(issue))

        if (!issues.length) {
            const ok = document.createElement('div')
            ok.className = 'parameter-issue-ok small muted'
            ok.textContent = 'No parameter issues detected.'
            this.els.parameterIssues.appendChild(ok)
            return
        }

        issues.forEach((issue) => {
            const row = document.createElement('div')
            row.className = `parameter-issue ${issue.level === 'error' ? 'error' : 'warning'}`
            row.textContent = issue.message
            this.els.parameterIssues.appendChild(row)
        })
    }

    /**
     * Renders the pretty JSON preview with issue highlighting.
     */
    #renderPreview() {
        if (!this.els.parameterPreview) return

        const text = this.parseError ? this.previewText || '' : this.previewText || '[]'
        const lines = String(text).split('\n')
        const errorLines = new Set()
        const warningLines = new Set()

        if (this.parseErrorLine) {
            errorLines.add(this.parseErrorLine)
        }

        this.validation.errors.forEach((issue) => this.#markIssueLines(issue, errorLines))
        this.validation.warnings.forEach((issue) => this.#markIssueLines(issue, warningLines))

        const renderedLines = lines.map((line, index) => {
            const lineNumber = index + 1
            const lineClass = errorLines.has(lineNumber)
                ? ' error'
                : warningLines.has(lineNumber)
                  ? ' warning'
                  : ''
            const escapedLine = ParameterTemplateUtils.escapeHtml(line)
            return `<span class="json-line${lineClass}"><span class="json-line-number">${lineNumber}</span><span class="json-line-text">${escapedLine || ' '}</span></span>`
        })

        this.els.parameterPreview.innerHTML = renderedLines.join('\n')
    }

    /**
     * Marks preview lines for a row-specific issue.
     * @param {{ rowIndex?: number }} issue
     * @param {Set<number>} lineSet
     */
    #markIssueLines(issue, lineSet) {
        if (!Number.isInteger(issue?.rowIndex)) return
        const range = this.rowLineRanges[issue.rowIndex]
        if (!range) return
        for (let line = range.start; line <= range.end; line += 1) {
            lineSet.add(line)
        }
    }

    /**
     * Clears current parse error metadata.
     */
    #clearParseError() {
        this.parseError = null
        this.parseErrorLine = null
        this.parseErrorColumn = null
    }

    /**
     * Triggers the onChange callback.
     */
    #emitChange() {
        this.onChange()
    }
}
