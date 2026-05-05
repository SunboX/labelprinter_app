// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { PreviewRendererInteractions } from './PreviewRendererInteractions.mjs'

/**
 * Public preview renderer composed from split rendering and interaction layers.
 */
export class PreviewRenderer extends PreviewRendererInteractions {
    /**
     * @param {object} els
     * @param {object} state
     * @param {(text: string, type?: string) => void} setStatus
     * @param {(key: string, params?: Record<string, string | number>) => string} translate
     * @param {{
     *  rasterWorkerClient?: { isAvailable?: () => boolean, rasterizeImage?: Function, rasterizeIcon?: Function } | null,
     *  codeRasterWorkerClient?: { isAvailable?: () => boolean, buildQrRaster?: Function, buildBarcodeRaster?: Function } | null
     * }} [options={}]
     */
    constructor(els, state, setStatus, translate, options = {}) {
        super(els, state, setStatus, translate, options)
    }
}
