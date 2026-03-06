# Printer Loaded Media Details Design

**Date:** 2026-03-06

## Goal

Expose structured loaded-media details from `labelprinterkit` print/status failures and consume those details in `labelprinter_app` so unsupported cassettes can still produce precise, localized mismatch messages.

## Context

`labelprinterkit` already parses raw printer status bytes into `Status.mediaWidth` and `Status.mediaType`, but mismatch error messaging collapses unknown width/type combinations into the generic phrase `unsupported tape`. `labelprinter_app` currently treats printer failures as opaque strings and therefore cannot recover better loaded-media information on its own.

## Design

### Toolkit

- Keep existing `err.message` behavior for backward compatibility.
- Add a normalized loaded-media details shape derived from raw printer status:
  - raw width in mm
  - raw media type
  - resolved media object when known
  - known/unknown compatibility marker
- Attach normalized status details to print errors raised from `_assertStatus(...)` so callers can inspect the loaded and expected media without reparsing the message text.
- Expose the same normalized media details from `Status` to support direct status inspection when needed.

### App

- Continue to fall back to `err.message` for unstructured or unrelated failures.
- Detect structured media-mismatch print errors from `labelprinterkit`.
- Render localized messages from structured data instead of relying on toolkit English strings.
- For known media, show the resolved width as today.
- For unknown loaded media, show the raw measured width so the message becomes actionable, for example `printer has 12mm tape`.

## Error Flow

1. Printer returns status bytes.
2. `labelprinterkit` parses status into `Status`.
3. When `_assertStatus(...)` detects media mismatch, it throws an `Error` with both:
   - the legacy human-readable message
   - structured status details for loaded and expected media
4. `labelprinter_app` checks for those structured details in `PrintController`.
5. If present, the app formats a localized mismatch message from the structured payload.
6. If absent, the app preserves the old behavior and shows `err.message`.

## Data Contract

The structured payload should be stable and minimal. It only needs enough information for callers to identify the loaded cassette and render a message:

- error classification/code for media mismatch
- loaded media:
  - width
  - mediaType
  - resolved media id when available
  - `isKnown`
- expected media:
  - width
  - mediaType
  - resolved media id when available
  - `isKnown`

## Testing

### Toolkit

- Add failing tests for mismatch errors where loaded media is known.
- Add failing tests for mismatch errors where loaded media width is present but the width/type combination resolves to unknown media.
- Assert the thrown error includes structured loaded-media details.
- Bump toolkit patch version and keep docs aligned.

### App

- Add failing tests for structured mismatch errors coming from the toolkit payload.
- Verify the localized status message uses structured loaded-media width for unknown loaded media.
- Keep fallback coverage for legacy string-only errors.
- Bump app patch version.

## Tradeoffs

- This keeps printer protocol and status parsing in `labelprinterkit`, where it belongs.
- It avoids duplicating raw status interpretation logic in the app.
- It does add a small public error contract, but that contract is intentionally narrow and future-proof.
