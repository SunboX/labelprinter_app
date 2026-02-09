# Tests

## Shape menu overlay
- Unit: `tests/shape-menu-utils.test.mjs` validates the outside-click detection helper.
- Unit: `tests/hidden-attribute.test.mjs` verifies the `[hidden]` CSS rule hides overlays like the shape menu.
- Unit: `tests/shape-menu-icons.test.mjs` ensures SVG icons and labels are used in the shape menu.
- Manual: run `npm start`, open `http://localhost:3000/`, click Form to open the menu, then click outside or press Escape to close.
- Expected: clicking a menu item adds the shape and closes the menu.

## Layout preview sizing
- Unit: `tests/preview-layout-utils.test.mjs` checks preview dimensions, scaling limits, label tag offsets, tape width mapping, margin marker geometry, and auto length expansion/shrink rules.

## Ruler alignment
- Unit: `tests/ruler-utils.test.mjs` verifies the pixel scale, offsets, and highlight ranges used for ruler alignment.
- Unit: `tests/ruler-utils.test.mjs` also validates clamped label positions so edge labels (like the vertical `0`) stay readable.
- Manual: run `npm start`, open `http://localhost:3000/`, set media `W9`, and verify the vertical ruler highlight spans exactly from the label top edge to the label bottom edge.

## Preview interactions
- Unit: `tests/interaction-utils.test.mjs` checks handle positions, hit testing, cursor mapping, handle-edge mapping, interactive item type support, and drag clamping for the preview overlay.
- Manual: click an item to select it, then hold `Ctrl` (Windows/Linux) or `Cmd` (macOS) and click additional items.
- Expected: multiple items stay selected, alignment controls become active, resize dots are hidden while more than one item is selected, plain click on one selected item keeps the multi-selection, and dragging one selected item moves the full selection together.

## Collapsible item cards
- Unit: `tests/items-editor-collapsible.test.mjs` verifies the items editor exposes collapse toggles and collapsed-body CSS.
- Unit: `tests/items-editor-ordering.test.mjs` verifies dragging object cards reorders only the inspector panel order, not `state.items` label order.
- Unit: `tests/items-editor-selection-collapse.test.mjs` verifies cards auto-expanded by selection are collapsed again when deselected.
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
- Unit: `tests/project-io-utils.test.mjs` validates JSON payload sanitizing, normalization, and id reseeding.
- Unit: `tests/project-url-utils.test.mjs` validates shareable URL payload encoding/decoding and URL parameter source resolution.
- Manual: run `npm start`, open `http://localhost:3000/`, click Save to export JSON, then click Load and select the file.
- Expected: save creates a `.json` file, load restores the same items and settings, and status reflects success.
- Manual: append `?projectUrl=<url-to-json>` or open a shared `?project=<encoded>` link.
- Expected: project loads automatically on startup and the Share button creates a link that restores the same layout.

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

## Parameterized labels
- Unit: `tests/parameter-template-utils.test.mjs` validates placeholder extraction and substitution, JSON parsing constraints, and parameter-row validation diagnostics.
- Unit: `tests/project-io-utils.test.mjs` also covers serialization/normalization for `parameters` and `parameterDataRows`.
- Manual: run `npm start`, open `http://localhost:3000/`, add parameters in the inspector, use them in text/QR as `{{name}}`, then upload a JSON array file.
- Expected: JSON is validated, issues are shown with row-aware highlighting, preview uses the first row, and Print produces one label per row (with confirmation when row count exceeds 10).

## Localization
- Unit: `tests/i18n.test.mjs` validates locale detection, interpolation, and `data-i18n` attribute application.
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
