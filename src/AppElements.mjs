/**
 * DOM selector registry for the main app shell.
 */
export class AppElements {
    /**
     * Queries and returns all app element references.
     * @param {ParentNode} root
     * @returns {Record<string, HTMLElement | null>}
     */
    static query(root) {
        const safeRoot = root || document
        return {
            items: safeRoot.querySelector('[data-items]'),
            addText: safeRoot.querySelector('[data-add-text]'),
            addQr: safeRoot.querySelector('[data-add-qr]'),
            addBarcode: safeRoot.querySelector('[data-add-barcode]'),
            addImage: safeRoot.querySelector('[data-add-image]'),
            addIcon: safeRoot.querySelector('[data-add-icon]'),
            addShape: safeRoot.querySelector('[data-add-shape]'),
            shapeMenu: safeRoot.querySelector('[data-shape-menu]'),
            saveProject: safeRoot.querySelector('[data-save-project]'),
            loadProject: safeRoot.querySelector('[data-load-project]'),
            shareProject: safeRoot.querySelector('[data-share-project]'),
            loadInput: safeRoot.querySelector('[data-load-input]'),
            appVersion: safeRoot.querySelector('[data-app-version]'),
            print: safeRoot.querySelector('[data-print]'),
            status: safeRoot.querySelector('[data-status]'),
            mode: safeRoot.querySelector('[data-mode]'),
            media: safeRoot.querySelector('[data-media]'),
            orientation: safeRoot.querySelector('[data-orientation]'),
            resolution: safeRoot.querySelector('[data-resolution]'),
            mediaLength: safeRoot.querySelector('[data-media-length]'),
            printer: safeRoot.querySelector('[data-printer]'),
            preview: safeRoot.querySelector('[data-preview]'),
            dimensions: safeRoot.querySelector('[data-dimensions]'),
            zoomOut: safeRoot.querySelector('[data-zoom-out]'),
            zoomIn: safeRoot.querySelector('[data-zoom-in]'),
            zoomReset: safeRoot.querySelector('[data-zoom-reset]'),
            zoomRange: safeRoot.querySelector('[data-zoom-range]'),
            zoomLabel: safeRoot.querySelector('[data-zoom-label]'),
            localeSelect: safeRoot.querySelector('[data-locale-select]'),
            alignMenu: safeRoot.querySelector('.align-dropdown'),
            alignMenuTrigger: safeRoot.querySelector('[data-align-menu-trigger]'),
            alignReference: safeRoot.querySelector('[data-align-reference]'),
            alignLeft: safeRoot.querySelector('[data-align-left]'),
            alignCenter: safeRoot.querySelector('[data-align-center]'),
            alignRight: safeRoot.querySelector('[data-align-right]'),
            alignTop: safeRoot.querySelector('[data-align-top]'),
            alignMiddle: safeRoot.querySelector('[data-align-middle]'),
            alignBottom: safeRoot.querySelector('[data-align-bottom]'),
            rulerX: safeRoot.querySelector('[data-ruler-x]'),
            rulerY: safeRoot.querySelector('[data-ruler-y]'),
            labelWidth: safeRoot.querySelector('[data-label-width]'),
            canvasWrap: safeRoot.querySelector('.canvas-wrap'),
            labelPlate: safeRoot.querySelector('.label-plate'),
            bleFields: safeRoot.querySelector('.ble-fields'),
            bleService: safeRoot.querySelector('[data-ble-service]'),
            bleWrite: safeRoot.querySelector('[data-ble-write]'),
            bleNotify: safeRoot.querySelector('[data-ble-notify]'),
            bleFilter: safeRoot.querySelector('[data-ble-filter]'),
            parameterDefinitions: safeRoot.querySelector('[data-parameter-definitions]'),
            addParameter: safeRoot.querySelector('[data-add-parameter]'),
            loadParameterData: safeRoot.querySelector('[data-load-parameter-data]'),
            downloadParameterExample: safeRoot.querySelector('[data-download-parameter-example]'),
            parameterDataInput: safeRoot.querySelector('[data-parameter-data-input]'),
            parameterDataPanel: safeRoot.querySelector('[data-parameter-data-panel]'),
            parameterDataMeta: safeRoot.querySelector('[data-parameter-data-meta]'),
            parameterIssues: safeRoot.querySelector('[data-parameter-issues]'),
            parameterPreview: safeRoot.querySelector('[data-parameter-preview]'),
            objectsScrollIndicator: safeRoot.querySelector('[data-objects-scroll-indicator]'),
            aiToggle: safeRoot.querySelector('[data-ai-toggle]'),
            aiOverlay: safeRoot.querySelector('[data-ai-overlay]'),
            aiClose: safeRoot.querySelector('[data-ai-close]'),
            aiMessages: safeRoot.querySelector('[data-ai-messages]'),
            aiInput: safeRoot.querySelector('[data-ai-input]'),
            aiSend: safeRoot.querySelector('[data-ai-send]'),
            aiWorking: safeRoot.querySelector('[data-ai-working]'),
            aiAttachSketch: safeRoot.querySelector('[data-ai-attach-sketch]'),
            aiImageInput: safeRoot.querySelector('[data-ai-image-input]'),
            aiAttachments: safeRoot.querySelector('[data-ai-attachments]')
        }
    }
}
