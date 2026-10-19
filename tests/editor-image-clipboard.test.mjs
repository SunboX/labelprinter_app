// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { it, mock } from 'node:test'
import { EditorImageClipboard } from '../src/ui/EditorImageClipboard.mjs'
import { ItemsEditorImageSupport } from '../src/ui/ItemsEditorImageSupport.mjs'

it('imports clipboard images once through the upload path, including paste into a text field', async () => {
    const file = { type: 'image/png', name: 'clipboard.png' }
    const state = { items: [{ type: 'text', text: 'keep me' }] }
    const loaded = []
    const loader = mock.method(ItemsEditorImageSupport, 'loadImageFile', async ({ item, file }) => {
        item.imageData = 'decoded'
        loaded.push(file)
    })
    try {
        let prevented = false
        const editor = {
            state,
            addImageItem() {
                state.items.push({ type: 'image' })
            }
        }
        const event = {
            target: { tagName: 'TEXTAREA' },
            clipboardData: {
                items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
                files: [file]
            },
            preventDefault() {
                prevented = true
            }
        }
        const result = EditorImageClipboard.handlePaste(event, editor)
        assert.equal(prevented, true, 'prevents native image insertion before any async read')
        await result
        assert.deepEqual(loaded, [file])
        assert.equal(state.items.length, 2)
        assert.equal(state.items[0].text, 'keep me')
        assert.equal(state.items[1].imageData, 'decoded')
    } finally {
        loader.mock.restore()
    }
})

it('leaves ordinary text paste untouched and handles file-only clipboard data', async () => {
    let prevented = 0
    let added = 0
    const editor = {
        state: { items: [] },
        addImageItem() {
            added++
            this.state.items.push({ type: 'image' })
        }
    }
    await EditorImageClipboard.handlePaste(
        {
            clipboardData: { items: [{ kind: 'string', type: 'text/plain' }] },
            preventDefault() {
                prevented++
            }
        },
        editor
    )
    assert.equal(prevented, 0)
    assert.equal(added, 0)
    const loader = mock.method(ItemsEditorImageSupport, 'loadImageFile', async () => {})
    try {
        await EditorImageClipboard.handlePaste(
            {
                clipboardData: { files: [{ type: 'image/jpeg' }] },
                preventDefault() {
                    prevented++
                }
            },
            editor
        )
        assert.equal(prevented, 1)
        assert.equal(added, 1)
    } finally {
        loader.mock.restore()
    }
})
