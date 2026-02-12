# Icon Library Maintenance

This guide explains how to add or update icons used by the `Icon` object.

## File Locations

- SVG files: `src/assets/icons/*.svg`
- Manifest: `src/assets/icons/icon-manifest.mjs`
- Runtime catalog loader: `src/IconLibraryUtils.mjs`
- Rasterization for preview/print: `src/IconRasterUtils.mjs`

## Required SVG Metadata

Each icon SVG root element must include these attributes:

- `id`
- `category`
- `label`

Example:

```xml
<svg id="icon-example" category="Tools" label="Example tool" viewBox="0 0 24 24" ...>
```

The values must match the corresponding manifest entry.

## Manifest Entry Requirements

Each entry in `icon-manifest.mjs` must include:

- `file`: SVG file name
- `id`: unique icon id
- `category`: grouping label used in the picker
- `label`: human-readable tooltip/accessibility label

## Add A New Icon

1. Add the SVG file to `src/assets/icons/`.
2. Ensure root attributes (`id`, `category`, `label`) are present and correct.
3. Add a manifest entry with matching values.
4. Run tests:
   - `npm test`
5. Manually check the picker:
   - add an `Icon` item
   - open picker
   - verify icon renders and can be selected

## Validation Behavior

At runtime, icon metadata is validated lazily on first use:

- If metadata is valid, icon stays available.
- If metadata is missing/mismatched or file loading fails:
  - icon is marked invalid
  - icon is excluded from usage
  - a warning is printed in browser console
  - fallback icon id is used

## Relevant Tests

- `tests/icon-assets-attributes.test.mjs`
- `tests/icon-library-utils.test.mjs`
- `tests/items-editor-icon-picker.test.mjs`
