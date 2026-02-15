# Tests

## Shape menu overlay
- Unit: `tests/shape-menu-utils.test.mjs` validates the outside-click detection helper.
- Unit: `tests/hidden-attribute.test.mjs` verifies the `[hidden]` CSS rule hides overlays like the shape menu.
- Unit: `tests/shape-menu-icons.test.mjs` ensures SVG icons and labels are used for the expanded form catalog in the shape menu.
- Unit: `tests/objects-action-icons.test.mjs` ensures the five Objects add buttons are icon-only, expose localized tooltip/ARIA bindings, and no longer rely on text replacement via `data-i18n`.
- Unit: `tests/mjs-line-limit.test.mjs` enforces the project rule that each source `.mjs` module stays below 1000 lines.
- Manual: run `npm start`, open `http://localhost:3000/`, click Form to open the menu, then click outside or press Escape to close.
- Expected: clicking any listed form (including arrows, dot, plus, triangle, and diamond) adds the selected form and closes the menu.
- Manual: in the Objects panel hover each add button (`Text`, `QR-Code`, `Image`, `Icon`, `Form`) and switch language between `English` and `Deutsch`.
- Expected: each button is icon-only, tooltip text is localized, screen-reader label follows locale, and click behavior (add item / open Form menu) remains unchanged.

## Layout preview sizing
- Unit: `tests/preview-layout-utils.test.mjs` checks preview dimensions, scaling limits, label tag offsets, tape width mapping, margin marker geometry, and auto length expansion/shrink rules.
- Unit: `tests/preview-text-media-scale.test.mjs` verifies text media-width compensation is applied only for horizontal layout so text does not shrink when switching tape width in vertical layout.
- Unit: `tests/preview-text-visual-regression.test.mjs` renders text for `W9` and `W24` using a canvas snapshot pipeline and compares normalized monochrome bitmaps to guard against media-width text regressions.
- Manual: run `npm start`, open `http://localhost:3000/`, add one text item, then switch media width between `W9` and `W24` in horizontal and vertical orientation.
- Expected: text keeps the same visual glyph proportions (width and height) when changing media width.

## Ruler alignment
- Unit: `tests/ruler-utils.test.mjs` verifies the pixel scale, offsets, and highlight ranges used for ruler alignment.
- Unit: `tests/ruler-utils.test.mjs` also validates clamped label positions so edge labels (like the vertical `0`) stay readable.
- Unit: `tests/preview-ruler-scroll-sync.test.mjs` verifies ruler redraw is synchronized with canvas viewport scrolling.
- Manual: run `npm start`, open `http://localhost:3000/`, set media `W9`, and verify the vertical ruler highlight spans exactly from the label top edge to the label bottom edge.
- Manual: extend label length so the horizontal stage needs scrolling and inspect the right edge ruler labels.
- Expected: right-edge ruler numbers stay readable and do not overlap.
- Manual: scroll the label viewport horizontally and compare item positions to ruler marks.
- Expected: horizontal ruler values track scrolling and remain aligned with content.

## Preview interactions
- Unit: `tests/interaction-utils.test.mjs` checks handle positions, hit testing, cursor mapping, handle-edge mapping, interactive item type support, and drag clamping for the preview overlay.
- Unit: `tests/preview-inline-text-edit.test.mjs` validates source wiring for double-click inline text editing in the preview layer.
- Unit: `tests/preview-rotation-rendering.test.mjs` verifies rotation transforms and rotated bounds wiring in preview canvas rendering.
- Manual: click an item to select it, then hold `Ctrl` (Windows/Linux) or `Cmd` (macOS) and click additional items.
- Expected: multiple items stay selected, alignment controls become active, resize dots are hidden while more than one item is selected, plain click on one selected item keeps the multi-selection, and dragging one selected item moves the full selection together.
- Manual: double-click a text item on the label preview.
- Expected: an inline text input opens directly on the label, `Enter` commits, and `Escape` cancels.
- Manual: add a `Form` item of type `Line`, select it on the label preview, then try resizing and dragging.
- Expected: only left and right resize dots are shown for the line, and dragging inside the line body moves it without triggering top/bottom scaling.
- Manual: add a `Form` item of type `Polygon`, then adjust the `Sides` controls (slider + number input) and select the polygon on the label preview.
- Expected: polygon edges update immediately, and the selection box/hit area matches the drawn polygon footprint instead of a much wider rectangle.
- Manual: widen the label so the stage requires horizontal scrolling, scroll right, then click/select or drag items near the right side.
- Expected: hitboxes and selection handles remain aligned with items while scrolled.
- Manual: add `Text`, `QR-Code`, `Image`, `Icon`, and `Form` items, then adjust each `Rotation (°)` slider.
- Expected: each object rotates in preview around its center and rotation survives Save/Load.

## Collapsible item cards
- Unit: `tests/items-editor-collapsible.test.mjs` verifies the items editor exposes collapse toggles and collapsed-body CSS.
- Unit: `tests/items-editor-ordering.test.mjs` verifies dragging object cards reorders only the inspector panel order, not `state.items` label order.
- Unit: `tests/items-editor-selection-collapse.test.mjs` verifies cards auto-expanded by selection are collapsed again when deselected.
- Unit: `tests/items-editor-rotation-controls.test.mjs` verifies rotation sliders are exposed for text, QR, image, icon, and form item controls.
- Manual: run `npm start`, open `http://localhost:3000/`, and click the chevron on any object card header.
- Expected: item settings collapse/expand without deleting values; selecting an item from the preview expands that item for editing.
- Manual: collapse an item card, click the matching item on the label preview, then deselect it.
- Expected: the card expands while selected and returns to collapsed only if it had been collapsed before selection.
- Manual: drag an object card to a different position in the inspector.
- Expected: only panel card order changes; item placement/render order on the label remains unchanged.

## Alignment controls
- Unit: `tests/alignment-utils.test.mjs` validates reference bounds and deltas for left/center/right/top/middle/bottom alignment modes.
- Manual: open the alignment dropdown in the workspace header, select multiple items, choose `Selection`, `Largest item`, `Smallest item`, or `Label`, then click an align button.
- Expected: selected items align according to the chosen axis and target.

## Project save/load
- Unit: `tests/project-io-utils.test.mjs` validates JSON payload sanitizing, normalization (including rotation), and id reseeding.
- Unit: `tests/project-url-utils.test.mjs` validates shareable URL payload encoding/decoding and URL parameter source resolution.
- Manual: run `npm start`, open `http://localhost:3000/`, click Save to export JSON, then click Load and select the file.
- Expected: save creates a `.json` file, load restores the same items and settings, and status reflects success.
- Manual: append `?projectUrl=<url-to-json>` or open a shared `?project=<encoded>` link.
- Expected: project loads automatically on startup and the Share button creates a link that restores the same layout.
- Manual: append `?parameterDataUrl=<url-to-parameter-file>` to the app URL (optionally together with `project`/`projectUrl`), where the file is JSON/CSV/XLS/XLSX/ODS.
- Expected: parameter rows are fetched on startup, converted to JSON preview, validated, shown with issue markers, and auto-create parameter definitions when none exist yet.
- Manual: append `?projectUrl=<url-to-project-json>&parameterDataUrl=<url-to-parameter-file>&autoPrint=true`.
- Expected: after loading URL content, print starts automatically (subject to browser device permission rules).
- Manual: append `?projectUrl=<url-to-project-json>&parameterDataUrl=<url-to-many-rows-file>&autoPrint=true&skipBatchConfirm=true`.
- Expected: the “more than 10 labels” confirmation is skipped and the print job starts immediately.

## AI assistant
- Unit: `tests/assistant-ui.test.mjs` verifies assistant toolbar/panel data hooks are present in `src/index.html`.
- Unit: `tests/ai-response-utils.test.mjs` verifies assistant response text extraction and tool-action extraction.
- Manual: run `npm start`, open `http://localhost:3000/`, open assistant from toolbar, ask an editor question, attach one sketch, then request one editor action (for example "add a text item").
- Expected: assistant replies in panel, actions execute only through allowlisted commands, and endpoint errors are surfaced in chat/status.

## Workspace zoom
- Unit: `tests/zoom-utils.test.mjs` validates zoom clamping, stepping, label formatting, and display-aware zoom persistence payload matching.
- Manual: run `npm start`, open `http://localhost:3000/`, use `-`, `+`, and the zoom slider in the workspace header.
- Expected: rulers and label preview scale together, and the reset button jumps back to `100%`.
- Manual: set a non-default zoom, reload the page on the same display, then move the browser to a different display profile (for example dock/undock) and reload again.
- Expected: zoom is restored only when the saved display fingerprint matches the current display.

## QR initial sizing
- Unit: `tests/qr-size-utils.test.mjs` verifies new QR items start at a size that fits the selected media width and optional fixed media length.
- Manual: run `npm start`, open `http://localhost:3000/`, switch between tape widths (for example `W24` and `W9`), then click `QR-Code`.
- Expected: the newly added QR square stays within the label bounds without clipping on narrow media.
- Manual: select a QR item and adjust `Error correction`, `QR version`, and `Encoding mode`.
- Expected: preview updates immediately, options persist in project save/load, and print uses the selected QR options.

## Image objects
- Unit: `tests/image-raster-utils.test.mjs` verifies image raster option normalization and monochrome conversion output.
- Unit: `tests/interaction-utils.test.mjs` and `tests/project-io-utils.test.mjs` verify image items are interactive and persist correctly through project save/load normalization.
- Manual: run `npm start`, open `http://localhost:3000/`, click `Image` in the Objects panel, upload a PNG/JPEG, then adjust `Length`, `Height`, `Threshold`, `Dithering`, `Resampling`, and `Invert black/white`.
- Expected: preview shows a black/white print-like image, resize sliders change output dimensions, and all image settings survive Save/Load and shared project links.

## Icon objects
- Unit: `tests/icon-library-utils.test.mjs` verifies icon catalog defaults, id normalization, and SVG data URL generation.
- Unit: `tests/items-editor-icon-picker.test.mjs` verifies icon selection uses a popup grid (not a plain text dropdown).
- Unit: `tests/interaction-utils.test.mjs` and `tests/project-io-utils.test.mjs` also verify icon items are interactive and persist correctly through project save/load normalization.
- Manual: run `npm start`, open `http://localhost:3000/`, click `Icon` in the Objects panel, open the icon picker popup, select icons from different rows/categories, then resize or drag them in the label preview.
- Expected: the popup shows icons in a multi-row/multi-column grid, icons render in monochrome (black/white print style), and selected icon settings survive Save/Load and shared project links.

## Parameterized labels
- Unit: `tests/parameter-template-utils.test.mjs` validates placeholder extraction and substitution, JSON parsing constraints, and parameter-row validation diagnostics.
- Unit: `tests/parameter-data-file-utils.test.mjs` validates conversion from JSON/CSV/XLS/XLSX/ODS to normalized JSON preview text.
- Unit: `tests/project-io-utils.test.mjs` also covers serialization/normalization for `parameters` and `parameterDataRows`.
- Manual: run `npm start`, open `http://localhost:3000/`, add parameters in the inspector, use them in text/QR as `{{name}}`, then upload a JSON/CSV/XLS/XLSX/ODS file.
- Expected: input is converted to JSON preview, issues are shown with row-aware highlighting, preview uses the first row, and Print produces one label per row (with confirmation when row count exceeds 10).

## Localization
- Unit: `tests/i18n.test.mjs` validates locale detection, interpolation, and `data-i18n` attribute application.
- Unit: `tests/rotation-utils.test.mjs` validates angle normalization and rotated-bounds geometry helpers used by preview rendering.
- Manual: run `npm start`, open `http://localhost:3000/`, switch language via the top toolbar locale selector (`English` / `Deutsch`).
- Expected: static UI labels and dynamic editor panels update to the selected language.

## Font family dropdown
- Unit: `tests/font-family-utils.test.mjs` validates font family normalization, persisted Google font link parsing, and local-font API fallback behavior.
- Manual: run `npm start`, open `http://localhost:3000/`, add/select a text item, and open the `Font family` control.
- Expected: a dropdown is shown instead of free text; when local font access is available, installed font families appear, otherwise a fallback list is shown.
- Manual: paste a Google Fonts CSS URL (for example `https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap`) into the text item `Google Font URL` field and click `Add font`.
- Expected: the stylesheet is loaded, the font appears in the dropdown, becomes selectable, and is stored in project JSON for load/share.
- Manual: after adding a Google font, reload the browser tab.
- Expected: the previously added Google font remains available in the font dropdown.
