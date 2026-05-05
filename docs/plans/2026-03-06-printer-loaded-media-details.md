<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Printer Loaded Media Details Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose structured loaded-media details from `labelprinterkit` print/status failures and use them in `labelprinter_app` to render better localized tape mismatch messages.

**Architecture:** Keep printer protocol parsing and error classification inside `labelprinterkit`, where raw status bytes already exist. Propagate a stable structured payload on print failures, then let `labelprinter_app` format localized user-facing messages from that payload while preserving fallback behavior for legacy string-only errors.

**Tech Stack:** ESM JavaScript, Node test runner, `labelprinterkit-web`, app i18n JSON translations, Git-commit-pinned npm dependency.

---

### Task 1: Add a failing toolkit test for structured mismatch details

**Files:**
- Modify: `/Users/afiedler/Documents/privat/Andrés_Werkstatt/labelprinterkit/test/printers.test.mjs`

**Step 1: Write the failing test**

Add a test that triggers a mismatch with an unsupported loaded cassette, for example:

```js
test('Printer exposes structured mismatch details for unsupported loaded media', async () => {
    const backend = new FakeBackend([
        makeStatus({
            errorHigh: 0x01,
            mediaWidth: 12,
            mediaType: MediaType.NON_LAMINATED_TAPE
        })
    ])
    const printer = new P700(backend)

    await assert.rejects(async () => {
        await printer.print(makeJob(Media.W9))
    }, (error) => {
        assert.equal(error.code, 'MEDIA_MISMATCH')
        assert.equal(error.details.loadedMedia.width, 12)
        assert.equal(error.details.loadedMedia.isKnown, false)
        assert.equal(error.details.expectedMedia.width, 9)
        return true
    })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/printers.test.mjs`

Expected: FAIL because the thrown error has no structured `code`/`details` payload yet.

**Step 3: Commit**

```bash
git add test/printers.test.mjs
git commit -m "test: capture structured mismatch details requirement"
```

### Task 2: Implement structured toolkit status and print error payloads

**Files:**
- Modify: `/Users/afiedler/Documents/privat/Andrés_Werkstatt/labelprinterkit/src/printers.mjs`
- Modify: `/Users/afiedler/Documents/privat/Andrés_Werkstatt/labelprinterkit/src/index.mjs`

**Step 1: Add minimal implementation**

Implement a normalized media-details helper and use it to:

- expose structured media details from `Status`
- attach structured payloads to mismatch-related errors raised by `_assertStatus(...)`

Sketch:

```js
function buildMediaDetails(statusOrMedia) {
    return {
        width: ...,
        mediaType: ...,
        mediaId: ...,
        isKnown: ...
    }
}

function createPrinterStatusError(message, code, details) {
    const error = new Error(message)
    error.code = code
    error.details = details
    return error
}
```

Use a narrow contract:

- `error.code === 'MEDIA_MISMATCH'` for mismatch errors
- `error.details.loadedMedia`
- `error.details.expectedMedia`
- optional raw status metadata if already available

**Step 2: Run test to verify it passes**

Run: `npm test -- test/printers.test.mjs`

Expected: PASS for the new mismatch-details test and existing printer tests.

**Step 3: Commit**

```bash
git add src/printers.mjs src/index.mjs test/printers.test.mjs
git commit -m "feat: expose structured printer media mismatch details"
```

### Task 3: Document and version the toolkit change

**Files:**
- Modify: `/Users/afiedler/Documents/privat/Andrés_Werkstatt/labelprinterkit/docs/printers-and-status.md`
- Modify: `/Users/afiedler/Documents/privat/Andrés_Werkstatt/labelprinterkit/README.md`
- Modify: `/Users/afiedler/Documents/privat/Andrés_Werkstatt/labelprinterkit/package.json`
- Modify: `/Users/afiedler/Documents/privat/Andrés_Werkstatt/labelprinterkit/package-lock.json`

**Step 1: Document the new structured error/status contract**

Add a short note showing that print errors may include structured mismatch details and that `Status` exposes normalized loaded-media data.

**Step 2: Bump the toolkit patch version**

Update `package.json` and `package-lock.json` together, defaulting to a patch bump.

**Step 3: Run verification**

Run: `npm test`

Expected: PASS for the full toolkit suite.

**Step 4: Commit**

```bash
git add README.md docs/printers-and-status.md package.json package-lock.json
git commit -m "docs: record structured media mismatch details"
```

### Task 4: Add a failing app test for localized structured mismatch messaging

**Files:**
- Modify: `/Users/afiedler/Documents/privat/Andrés_Werkstatt/labelprinter_app/tests/print-controller-status-errors.test.mjs`

**Step 1: Write the failing test**

Add a controller test that throws a printer error carrying structured mismatch details from the toolkit contract:

```js
const error = new Error('Loaded media mismatch: printer has an unsupported tape...')
error.code = 'MEDIA_MISMATCH'
error.details = {
    loadedMedia: { width: 12, mediaType: MediaType.NON_LAMINATED_TAPE, mediaId: null, isKnown: false },
    expectedMedia: { width: 9, mediaType: Media.W9.mediaType, mediaId: 'W9', isKnown: true }
}
```

Assert that the app renders a better status message such as:

- English: `Loaded media mismatch: printer has 12mm tape, but this job expects 9mm tape. Load 9mm tape and retry.`

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/print-controller-status-errors.test.mjs`

Expected: FAIL because `PrintController` still shows the raw toolkit string.

**Step 3: Commit**

```bash
git add tests/print-controller-status-errors.test.mjs
git commit -m "test: capture structured media mismatch messaging"
```

### Task 5: Implement app-side structured mismatch formatting

**Files:**
- Modify: `/Users/afiedler/Documents/privat/Andrés_Werkstatt/labelprinter_app/src/ui/PrintController.mjs`
- Modify: `/Users/afiedler/Documents/privat/Andrés_Werkstatt/labelprinter_app/src/i18n/en.json`
- Modify: `/Users/afiedler/Documents/privat/Andrés_Werkstatt/labelprinter_app/src/i18n/de.json`

**Step 1: Add minimal implementation**

Teach `PrintController` to detect the toolkit payload and translate the message from structured details:

- if `err.code === 'MEDIA_MISMATCH'` and details exist, format via `translate(...)`
- otherwise fall back to `err.message`

Keep helper logic local and minimal, for example:

```js
const statusMessage = this.#formatStructuredPrintError(err) || err?.message || this.translate('print.failed')
```

Add i18n keys for:

- mismatch message template
- generic loaded tape label by width

**Step 2: Run targeted test**

Run: `npm test -- tests/print-controller-status-errors.test.mjs`

Expected: PASS including the new unsupported-loaded-media case.

**Step 3: Commit**

```bash
git add src/ui/PrintController.mjs src/i18n/en.json src/i18n/de.json tests/print-controller-status-errors.test.mjs
git commit -m "feat: localize structured printer media mismatch errors"
```

### Task 6: Update app dependency/version and verify end-to-end

**Files:**
- Modify: `/Users/afiedler/Documents/privat/Andrés_Werkstatt/labelprinter_app/package.json`
- Modify: `/Users/afiedler/Documents/privat/Andrés_Werkstatt/labelprinter_app/package-lock.json`

**Step 1: Bump the app patch version**

Increment the app version as required by repository policy.

**Step 2: Refresh the toolkit dependency for local verification**

Because the app depends on a Git-commit-pinned toolkit package, use the new toolkit checkout for local verification after the toolkit commit exists:

Run: `npm install --no-save /Users/afiedler/Documents/privat/Andrés_Werkstatt/labelprinterkit`

Expected: `node_modules/labelprinterkit-web` now reflects the local toolkit changes for this workspace.

**Step 3: Update committed dependency metadata**

Pin the app dependency to the new toolkit commit in `package.json`, then refresh `package-lock.json` in the final integration step once that commit is available from the canonical Git remote.

**Step 4: Run full verification**

Run: `npm test`

Expected: PASS for the full app suite.

**Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: bump app version for media mismatch integration"
```
