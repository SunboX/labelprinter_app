// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { it } from 'node:test'
import { EditorMediaControls } from '../src/ui/EditorMediaControls.mjs'

it('refreshes dimension limits and millimetre conversion when media, resolution, or orientation changes', () => {
    const events = {}
    const els = {}
    for (const key of ['orientation', 'media', 'resolution', 'mediaLength']) {
        els[key] = {
            value: '',
            addEventListener(type, callback) {
                events[`${key}:${type}`] = callback
            }
        }
    }
    let editorRenders = 0
    let previewRenders = 0
    const state = {}
    EditorMediaControls.bind(
        els,
        state,
        {
            render() {
                editorRenders++
            }
        },
        {
            render() {
                previewRenders++
            }
        }
    )
    for (const [key, value] of [
        ['media', 'W24'],
        ['resolution', 'HIGH'],
        ['orientation', 'vertical']
    ]) {
        els[key].value = value
        events[`${key}:change`]()
        assert.equal(state[key], value)
    }
    assert.equal(editorRenders, 3)
    assert.equal(previewRenders, 3)
    events['mediaLength:input']({ target: { value: '42.5' } })
    assert.equal(state.mediaLengthMm, 42.5)
    events['mediaLength:input']({ target: { value: '' } })
    assert.equal(state.mediaLengthMm, null)
})
