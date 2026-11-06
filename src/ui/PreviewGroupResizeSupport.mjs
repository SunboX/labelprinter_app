// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import { AlignmentUtils } from '../AlignmentUtils.mjs'
import { InteractionUtils } from '../InteractionUtils.mjs'
import { SelectionTransformUtils } from './SelectionTransformUtils.mjs'

/** Dedicated corner handles for proportional resizing of a multi-selection. */
export class PreviewGroupResizeSupport {
    /** Returns selected interactive entries. @param {object} renderer @returns {object[]} */
    static entries(renderer) {
        return renderer._interactiveItems.filter((entry) => renderer._selectedItemIds.has(entry.id))
    }

    /** Creates or updates the group handle layer. @param {object} renderer */
    static sync(renderer) {
        const entries = PreviewGroupResizeSupport.entries(renderer)
        if (entries.length < 2 || !renderer._interactionLayer) {
            if (renderer._groupResizeElement) renderer._groupResizeElement.style.display = 'none'
            return
        }
        const bounds = AlignmentUtils.computeBoundingRect(entries.map((entry) => entry.boundsCss))
        let element = renderer._groupResizeElement
        if (!element) {
            element = document.createElement('div')
            element.className = 'preview-group-hitbox'
            Object.assign(element.style, { position: 'absolute', pointerEvents: 'none', touchAction: 'none' })
            for (const name of ['nw', 'ne', 'se', 'sw']) {
                const handle = document.createElement('div')
                handle.className = 'preview-group-handle'
                handle.dataset.groupHandle = name
                handle.setAttribute('aria-label', `${renderer.translate('itemsEditor.resizeSelection')} (${name})`)
                Object.assign(handle.style, {
                    position: 'absolute',
                    width: '12px',
                    height: '12px',
                    pointerEvents: 'auto',
                    touchAction: 'none',
                    cursor: InteractionUtils.getCursorForHandle(name),
                    left: name.includes('w') ? '-6px' : 'calc(100% - 6px)',
                    top: name.includes('n') ? '-6px' : 'calc(100% - 6px)'
                })
                element.appendChild(handle)
            }
            renderer._interactionLayer.appendChild(element)
            renderer._groupResizeElement = element
            const interactable = renderer
                ._requireInteract()(element)
                .resizable({
                    edges: { left: true, right: true, top: true, bottom: true },
                    listeners: {
                        start: (event) => PreviewGroupResizeSupport.start(renderer, event),
                        move: (event) => PreviewGroupResizeSupport.move(renderer, event),
                        end: () => PreviewGroupResizeSupport.end(renderer)
                    }
                })
            interactable.actionChecker((_pointer, event) => {
                if (InteractionUtils.isAdditiveSelectionModifier(event)) return null
                const name = event.target?.closest('[data-group-handle]')?.dataset.groupHandle
                return name ? { name: 'resize', edges: InteractionUtils.getEdgesFromHandle(name) } : null
            })
            renderer._groupResizeInteractable = interactable
        }
        Object.assign(element.style, {
            display: 'block',
            left: `${bounds.x}px`,
            top: `${bounds.y}px`,
            width: `${bounds.width}px`,
            height: `${bounds.height}px`,
            zIndex: String(renderer._interactiveItems.length * 4 + 1)
        })
    }

    /** Captures the group before the gesture. @param {object} renderer @param {object} event */
    static start(renderer, event) {
        const entries = PreviewGroupResizeSupport.entries(renderer)
        if (entries.length < 2) return
        renderer._interaction = {
            type: 'group-resize',
            snapshot: SelectionTransformUtils.snapshot(entries, renderer.state.items),
            startRect: { width: event.rect.width, height: event.rect.height },
            edges: { ...event.edges }
        }
    }

    /** Applies one uniform scale from the original snapshot. @param {object} renderer @param {object} event */
    static move(renderer, event) {
        const interaction = renderer._interaction
        if (interaction?.type !== 'group-resize') return
        const { width, height } = interaction.startRect
        // Project the pointer's requested rectangle onto the original aspect ratio.
        const scale = (event.rect.width * width + event.rect.height * height) / (width * width + height * height)
        SelectionTransformUtils.apply(interaction.snapshot, scale, interaction.edges, renderer.state)
        renderer._queueRender()
    }

    /** Commits the group edit and refreshes panel values. @param {object} renderer */
    static end(renderer) {
        if (renderer._interaction?.type !== 'group-resize') return
        renderer._interaction = null
        renderer._drawOverlay()
        renderer._emitItemChange()
    }
}
