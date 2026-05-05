// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Centralizes backend assistant model defaults and reasoning-effort normalization.
 */
export class AssistantBackendConfig {
    static #DEFAULT_MODEL = 'gpt-5.4'
    static #DEFAULT_REASONING_EFFORT = 'none'
    static #SUPPORTED_REASONING_EFFORTS = Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'])

    /**
     * Returns the backend default model id.
     * @returns {string}
     */
    static get defaultModel() {
        return AssistantBackendConfig.#DEFAULT_MODEL
    }

    /**
     * Returns the backend default reasoning effort.
     * @returns {string}
     */
    static get defaultReasoningEffort() {
        return AssistantBackendConfig.#DEFAULT_REASONING_EFFORT
    }

    /**
     * Returns the normalized model id or the configured fallback when empty.
     * @param {string | undefined | null} rawValue
     * @param {string} [fallback]
     * @returns {string}
     */
    static resolveModel(rawValue, fallback = AssistantBackendConfig.defaultModel) {
        const normalized = String(rawValue || '').trim()
        return normalized || fallback
    }

    /**
     * Returns a supported reasoning effort value or the fallback when invalid.
     * Legacy `minimal` remains accepted for older model overrides.
     * @param {string | undefined | null} rawValue
     * @param {string} [fallback]
     * @returns {string}
     */
    static parseReasoningEffort(rawValue, fallback = AssistantBackendConfig.defaultReasoningEffort) {
        const normalized = String(rawValue || '')
            .trim()
            .toLowerCase()
        if (AssistantBackendConfig.#SUPPORTED_REASONING_EFFORTS.includes(normalized)) {
            return normalized
        }
        return fallback
    }
}
