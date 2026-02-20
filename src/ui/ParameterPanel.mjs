import { ParameterTemplateUtils } from '../ParameterTemplateUtils.mjs'
import { ParameterDataFileUtils } from '../ParameterDataFileUtils.mjs'

/**
 * Manages parameter definitions, uploaded parameter data, validation, and preview rendering.
 */
export class ParameterPanel {
    #onChange = () => {}
    #translate = (key) => key

    /**
     * @param {object} els
     * @param {object} state
     * @param {(text: string, type?: string) => void} setStatus
     * @param {() => void} onChange
     * @param {(key: string, params?: Record<string, string | number>) => string} translate
     * @param {{
     *  parameterDataWorkerClient?: { isAvailable?: () => boolean, parseSpreadsheet?: (bytes: Uint8Array, sourceName: string) => Promise<Record<string, unknown>[]> } | null,
     *  parameterValidationWorkerClient?: { isAvailable?: () => boolean, validateParameters?: (payload: object) => Promise<any> } | null
     * }} [options={}]
     */
    constructor(els, state, setStatus, onChange, translate, options = {}) {
        this.els = els
        this.state = state
        this.setStatus = setStatus
        this.onChange = onChange
        this.translate = translate
        this.parameterDataWorkerClient = options.parameterDataWorkerClient || null
        this.parameterValidationWorkerClient = options.parameterValidationWorkerClient || null
        this.validation = { errors: [], warnings: [], placeholders: [] }
        this.parseError = null
        this.parseErrorLine = null
        this.parseErrorColumn = null
        this.previewText = '[]'
        this.rowLineRanges = []
        this._parameterValidationRowThreshold = 200
        this._validationRequestToken = 0
        this._pendingValidationPromise = null
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
     * Sets the translation callback.
     * @param {(key: string, params?: Record<string, string | number>) => string} callback
     */
    set translate(callback) {
        this.#translate = typeof callback === 'function' ? callback : (key) => key
    }

    /**
     * Returns the translation callback.
     * @returns {(key: string, params?: Record<string, string | number>) => string}
     */
    get translate() {
        return this.#translate
    }

    /**
     * Initializes the panel.
     */
    init() {
        this.#ensureStateShape()
        this.#syncFileInputAccept()
        this.#bindEvents()
        this.syncFromState()
    }

    /**
     * Syncs the hidden file input accept attribute with supported formats.
     */
    #syncFileInputAccept() {
        if (!this.els.parameterDataInput) return
        this.els.parameterDataInput.setAttribute('accept', ParameterDataFileUtils.FILE_INPUT_ACCEPT_VALUE)
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
     * Waits for any in-flight validation worker request.
     * @returns {Promise<void>}
     */
    async waitForValidation() {
        if (!this._pendingValidationPromise) return
        try {
            await this._pendingValidationPromise
        } catch (_error) {}
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
            this.setStatus(this.translate('parameterStatus.defineOne'), 'info')
            return
        }

        const exampleRows = ParameterTemplateUtils.buildExampleRows(normalizedParameters)
        const content = JSON.stringify(exampleRows, null, 2)
        const stamp = new Date().toISOString().slice(0, 10)
        const fileName = this.translate('parameters.downloadExampleName', { date: stamp })
        const blob = new Blob([content], { type: 'application/json' })
        const objectUrl = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = objectUrl
        anchor.download = fileName
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
        this.setStatus(this.translate('parameterStatus.downloaded', { fileName }), 'success')
    }

    /**
     * Loads parameter row data from a local parameter data file.
     * @returns {Promise<void>}
     */
    async #loadParameterDataFromFile() {
        try {
            const file = await this.#promptForParameterDataFile()
            if (!file) {
                this.setStatus(this.translate('parameterStatus.loadCanceled'), 'info')
                return
            }
            const { jsonText } = await ParameterDataFileUtils.convertFileToParameterJsonText(file, {
                workerClient: this.parameterDataWorkerClient
            })
            this.applyParameterDataRawText(jsonText, file.name)
        } catch (err) {
            if (err?.name === 'AbortError') {
                this.setStatus(this.translate('parameterStatus.loadCanceled'), 'info')
                return
            }
            const message = err?.message || this.translate('messages.unknownError')
            this.setStatus(this.translate('parameterStatus.loadFailed', { message }), 'error')
        }
    }

    /**
     * Applies parameter rows from raw JSON text.
     * @param {string} rawText
     * @param {string} sourceName
     */
    applyParameterDataRawText(rawText, sourceName = '') {
        const safeRawText = typeof rawText === 'string' ? rawText : ''
        const parsed = ParameterTemplateUtils.parseParameterDataJson(safeRawText)

        this.state.parameterDataSourceName = typeof sourceName === 'string' ? sourceName : ''
        this.state.parameterDataRaw = safeRawText

        if (parsed.parseError) {
            this.state.parameterDataRows = []
            this.parseError = parsed.parseError
            this.parseErrorLine = parsed.parseErrorLine
            this.parseErrorColumn = parsed.parseErrorColumn
            this.previewText = parsed.prettyText || safeRawText || ''
            this.rowLineRanges = []
            this.#refreshValidationViews(false)
            const location = this.parseErrorLine
                ? this.translate('parameterStatus.parseLocation', {
                      line: this.parseErrorLine,
                      column: this.parseErrorColumn || '?'
                  })
                : ''
            this.setStatus(this.translate('parameterStatus.invalidJson', { location }), 'error')
            this.#emitChange()
            return
        }

        this.#clearParseError()
        this.state.parameterDataRows = parsed.rows || []
        const addedCount = this.#autoCreateParametersFromRows(this.state.parameterDataRows)
        if (addedCount > 0) {
            this.#renderDefinitions()
        }
        this.#refreshValidationViews()
        const rowCount = this.state.parameterDataRows.length
        const rowSuffix = rowCount === 1 ? '' : this.translate('parameters.rowPluralSuffix')
        this.setStatus(
            this.translate('parameterStatus.loadedRows', { count: rowCount, suffix: rowSuffix }),
            'success'
        )
        this.#emitChange()
    }

    /**
     * Prompts for a single parameter data file.
     * @returns {Promise<File | null>}
     */
    async #promptForParameterDataFile() {
        if (window.showOpenFilePicker) {
            const [handle] = await window.showOpenFilePicker({
                multiple: false,
                types: ParameterDataFileUtils.buildPickerTypes(this.translate('parameterStatus.pickerDescription'))
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
            hint.textContent = this.translate('parameters.noParameters')
            this.els.parameterDefinitions.appendChild(hint)
            this.#syncConditionalVisibility()
            return
        }

        this.state.parameters.forEach((parameter, index) => {
            const row = document.createElement('div')
            row.className = 'parameter-row'

            const nameField = document.createElement('div')
            nameField.className = 'field'
            const nameLabel = document.createElement('label')
            nameLabel.textContent = this.translate('parameters.name')
            const nameInput = document.createElement('input')
            nameInput.value = parameter.name
            nameInput.placeholder = this.translate('parameters.namePlaceholder')
            nameInput.addEventListener('input', (e) => {
                this.state.parameters[index].name = e.target.value
                this.#refreshValidationViews()
                this.#emitChange()
            })
            nameField.append(nameLabel, nameInput)

            const defaultField = document.createElement('div')
            defaultField.className = 'field'
            const defaultLabel = document.createElement('label')
            defaultLabel.textContent = this.translate('parameters.default')
            const defaultInput = document.createElement('input')
            defaultInput.value = parameter.defaultValue
            defaultInput.placeholder = this.translate('parameters.defaultPlaceholder')
            defaultInput.addEventListener('input', (e) => {
                this.state.parameters[index].defaultValue = e.target.value
                this.#refreshValidationViews()
                this.#emitChange()
            })
            defaultField.append(defaultLabel, defaultInput)

            const remove = document.createElement('button')
            remove.className = 'ghost parameter-remove'
            remove.textContent = this.translate('parameters.remove')
            remove.addEventListener('click', () => {
                this.state.parameters.splice(index, 1)
                this.#renderDefinitions()
                this.#refreshValidationViews()
                this.#emitChange()
            })

            row.append(nameField, defaultField, remove)
            this.els.parameterDefinitions.appendChild(row)
        })
        this.#syncConditionalVisibility()
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
        const requestToken = this.#nextValidationRequestToken()
        if (this.#shouldUseValidationWorker()) {
            this.#runValidationViaWorker(requestToken, rebuildPreview)
            return
        }
        this._pendingValidationPromise = null
        this.#applyValidationInThread(rebuildPreview)
    }

    /**
     * Returns whether worker validation should be used for current payload size.
     * @returns {boolean}
     */
    #shouldUseValidationWorker() {
        if (this.parseError) return false
        if (!this.parameterValidationWorkerClient || typeof this.parameterValidationWorkerClient.validateParameters !== 'function') {
            return false
        }
        const workerAvailable =
            typeof this.parameterValidationWorkerClient.isAvailable === 'function'
                ? this.parameterValidationWorkerClient.isAvailable()
                : true
        if (!workerAvailable) return false
        return this.state.parameterDataRows.length >= this._parameterValidationRowThreshold
    }

    /**
     * Runs validation via worker and applies result if request token is current.
     * @param {number} requestToken
     * @param {boolean} rebuildPreview
     */
    #runValidationViaWorker(requestToken, rebuildPreview) {
        const payload = {
            definitions: this.state.parameters,
            items: this.state.items,
            rows: this.state.parameterDataRows,
            rawJson: this.parseError ? '' : this.state.parameterDataRaw
        }
        const validationPromise = this.parameterValidationWorkerClient
            .validateParameters(payload)
            .then((result) => {
                if (!this.#isCurrentValidationRequest(requestToken)) return
                this.validation = result?.validation || { errors: [], warnings: [], placeholders: [] }
                if (rebuildPreview && !this.parseError) {
                    this.previewText = String(result?.previewText || '[]')
                    this.rowLineRanges = Array.isArray(result?.rowLineRanges) ? result.rowLineRanges : []
                }
                this.#renderValidationViews()
            })
            .catch((error) => {
                if (!this.#isCurrentValidationRequest(requestToken)) return
                const message = error instanceof Error ? error.message : 'unknown worker error'
                console.debug('[ParameterPanel] validation worker fallback:', message)
                this.#applyValidationInThread(rebuildPreview)
            })
            .finally(() => {
                if (this.#isCurrentValidationRequest(requestToken)) {
                    this._pendingValidationPromise = null
                }
            })
        this._pendingValidationPromise = validationPromise
    }

    /**
     * Runs validation logic on the main thread.
     * @param {boolean} rebuildPreview
     */
    #applyValidationInThread(rebuildPreview) {
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
        this.#renderValidationViews()
    }

    /**
     * Re-renders all validation-derived views.
     */
    #renderValidationViews() {
        this.#syncConditionalVisibility()
        this.#renderDataMeta()
        this.#renderIssues()
        this.#renderPreview()
    }

    /**
     * Returns the next validation request token.
     * @returns {number}
     */
    #nextValidationRequestToken() {
        this._validationRequestToken += 1
        return this._validationRequestToken
    }

    /**
     * Returns whether the token matches the latest validation request.
     * @param {number} requestToken
     * @returns {boolean}
     */
    #isCurrentValidationRequest(requestToken) {
        return Number(requestToken) === this._validationRequestToken
    }

    /**
     * Returns true when at least one parameter definition exists.
     * @returns {boolean}
     */
    #hasParameterDefinitions() {
        return Array.isArray(this.state.parameters) && this.state.parameters.length > 0
    }

    /**
     * Shows or hides parameter-data controls based on whether parameters exist.
     */
    #syncConditionalVisibility() {
        const hasParameters = this.#hasParameterDefinitions()
        if (this.els.downloadParameterExample) {
            this.els.downloadParameterExample.hidden = !hasParameters
        }
        if (this.els.parameterDataPanel) {
            this.els.parameterDataPanel.hidden = !hasParameters
        }
    }

    /**
     * Auto-creates parameter definitions from row property names when none exist yet.
     * @param {Record<string, unknown>[]} rows
     * @returns {number}
     */
    #autoCreateParametersFromRows(rows) {
        if (this.#hasParameterDefinitions()) return 0
        const inferred = ParameterTemplateUtils.buildParameterDefinitionsFromRows(rows)
        if (!inferred.length) return 0
        this.state.parameters = inferred
        return inferred.length
    }

    /**
     * Updates the data summary text.
     */
    #renderDataMeta() {
        if (!this.els.parameterDataMeta) return
        const rowCount = this.state.parameterDataRows.length
        const sourceName = this.state.parameterDataSourceName || this.translate('parameters.sourceNone')
        const rowSuffix = rowCount === 1 ? '' : this.translate('parameters.rowPluralSuffix')
        this.els.parameterDataMeta.textContent = this.translate('parameters.rowsLoaded', {
            count: rowCount,
            suffix: rowSuffix,
            sourceName
        })
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
                ? this.translate('parameterStatus.parseLocation', {
                      line: this.parseErrorLine,
                      column: this.parseErrorColumn || '?'
                  })
                : ''
            issues.push({
                level: 'error',
                message: this.translate('validation.parseError', {
                    location,
                    message: this.parseError
                })
            })
        }
        this.validation.errors.forEach((issue) =>
            issues.push({
                ...issue,
                message: this.#formatIssueMessage(issue)
            })
        )
        this.validation.warnings.forEach((issue) =>
            issues.push({
                ...issue,
                message: this.#formatIssueMessage(issue)
            })
        )

        if (!issues.length) {
            const ok = document.createElement('div')
            ok.className = 'parameter-issue-ok small muted'
            ok.textContent = this.translate('parameters.issuesNone')
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
     * Formats an issue message using translated templates.
     * @param {object} issue
     * @returns {string}
     */
    #formatIssueMessage(issue) {
        const row = issue.rowNumber || (Number.isInteger(issue.rowIndex) ? issue.rowIndex + 1 : '')
        switch (issue.code) {
            case 'empty-definition-name':
                return this.translate('validation.emptyDefinitionName', { index: issue.definitionIndex || '' })
            case 'invalid-definition-name':
                return this.translate('validation.invalidDefinitionName', { name: issue.parameterName || '' })
            case 'duplicate-definition-name':
                return this.translate('validation.duplicateDefinitionName', {
                    name: issue.parameterName || '',
                    count: issue.count || ''
                })
            case 'undefined-placeholder':
                return this.translate('validation.undefinedPlaceholder', { placeholder: issue.placeholder || '' })
            case 'unused-definition':
                return this.translate('validation.unusedDefinition', { name: issue.parameterName || '' })
            case 'invalid-row-type':
                return this.translate('validation.invalidRowType', { row })
            case 'unknown-row-parameter':
                return this.translate('validation.unknownRowParameter', { row, name: issue.parameterName || '' })
            case 'missing-row-parameter':
                return this.translate('validation.missingRowParameter', { row, name: issue.parameterName || '' })
            case 'fallback-default-parameter':
                return this.translate('validation.fallbackDefaultParameter', { row, name: issue.parameterName || '' })
            case 'json-formatting':
                return this.translate('validation.jsonFormatting')
            default:
                return issue.message || issue.code || ''
        }
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
