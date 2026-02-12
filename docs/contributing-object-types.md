# Contributing New Object Types

This guide describes the minimum changes required when adding a new label object type.

## 1. Define Data Model + Normalization

Update `src/ProjectIoUtils.mjs`:

- Add defaults for the new `type`.
- Normalize new fields on load.
- Strip/ignore runtime-only fields as needed.
- Ensure save payload contains only stable fields.

## 2. Add Object Creation Entry Point

Update `src/index.html` and `src/main.mjs`:

- Add an Objects panel button (`data-add-*`) with i18n tooltip/aria label.
- Wire click handler in `main.mjs` to create the new object.

Update `src/ui/ItemsEditor.mjs`:

- Add `add...Item()` method.
- Add card rendering branch and controls branch for the new type.

## 3. Add/Reuse Editor Control Support

Place control logic in a focused support module under `src/ui/` when possible:

- Reuse `ItemsEditorControlSupport` slider/select/checkbox helpers.
- Keep `ItemsEditor.mjs` and support files under 1000 lines (project rule).

## 4. Render In Preview + Print

Update preview canvas build pipeline:

- `src/ui/PreviewRendererCanvasBuild.mjs`
- `src/ui/PreviewRendererCanvasSupport.mjs` if shared helpers are needed

Requirements:

- Render output must be identical for preview and print canvas path.
- Add layout bounds to `layoutItems` for selection/interaction overlays.

## 5. Enable Interactions

Update interaction gating:

- `src/InteractionUtils.mjs` for interactive type recognition.
- `src/ui/PreviewRendererInteractions.mjs` for type-specific drag/resize/edit behavior.

If rotation/resize rules differ by type, codify them explicitly.

## 6. Localization

Add/adjust i18n keys in:

- `src/i18n/en.json`
- `src/i18n/de.json`

Include:

- object button label
- item card labels/controls
- status/error messages (if any)

## 7. Parameter Support (Optional)

If object text/data should support placeholders, integrate with:

- `src/ParameterTemplateUtils.mjs`
- parameter validation logic for used placeholders.

## 8. Documentation

Update docs:

- `docs/objects-and-alignment.md` for object fields and handling.
- `docs/project-json-schema.md` for persisted fields.
- Other docs if URL/load/print behavior changes.

## 9. Tests

Add or update tests in `tests/`:

- object creation + editor control rendering
- normalization/save-load round-trip
- preview interaction behavior
- rendering path behavior (including rotation if supported)

Run:

- `npm test`

## 10. Manual Sanity Checks

Before merge, verify:

- object can be added, edited, dragged, resized, rotated (if applicable)
- save/load preserves object state
- share URL round-trip works for object payload
- print path handles the object without runtime errors
