// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { it } from 'node:test'
import { ItemsEditorImageSupport } from '../src/ui/ItemsEditorImageSupport.mjs'

/** Minimal native button/file input harness for the image source controls. */
class Element {
    children = []
    listeners = {}
    attributes = {}
    clickCount = 0
    /** Records attributes used by accessible buttons. */
    setAttribute(key, value) {
        this.attributes[key] = value
    }
    /** Records the public event handlers. */
    addEventListener(key, callback) {
        this.listeners[key] = callback
    }
    /** Appends elements in DOM order. */
    append(...children) {
        this.children.push(...children)
    }
    /** Emulates native activation. */
    click() {
        this.clickCount++
        this.listeners.click?.()
    }
}

it('opens the same picker from the image preview and upload button, empty or populated', async () => {
    const original = globalThis.document
    globalThis.document = { createElement: () => new Element() }
    try {
        for (const imageData of ['', 'data:image/png;base64,example']) {
            const contentWrap = new Element()
            const selected = []
            ItemsEditorImageSupport.appendImageSourceControls({
                item: { imageData, imageName: 'example.png' },
                contentWrap,
                translate: (key) => key,
                onFileSelected: (file) => selected.push(file)
            })
            const [preview, , upload, , input] = contentWrap.children
            assert.equal(preview.type, 'button', 'native button supports mouse and keyboard activation')
            assert.equal(preview.attributes['aria-label'], 'itemsEditor.uploadImage')
            preview.click()
            upload.click()
            assert.equal(input.clickCount, 2)
            const file = { name: 'replacement.png', type: 'image/png' }
            input.files = [file]
            await input.listeners.change()
            assert.deepEqual(selected, [file])
        }
    } finally {
        globalThis.document = original
    }
})
