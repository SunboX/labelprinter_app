# Tests

## Shape menu overlay
- Unit: `tests/shape-menu-utils.test.mjs` validates the outside-click detection helper.
- Unit: `tests/hidden-attribute.test.mjs` verifies the `[hidden]` CSS rule hides overlays like the shape menu.
- Unit: `tests/shape-menu-icons.test.mjs` ensures SVG icons and labels are used in the shape menu.
- Manual: run `npm start`, open `http://localhost:3000/src/`, click Form to open the menu, then click outside or press Escape to close.
- Expected: clicking a menu item adds the shape and closes the menu.

## Layout preview sizing
- Unit: `tests/preview-layout-utils.test.mjs` checks preview dimensions, scaling limits, label tag offsets, tape width mapping, margin marker geometry, and auto length expansion/shrink rules.

## Ruler alignment
- Unit: `tests/ruler-utils.test.mjs` verifies the pixel scale, offsets, and highlight ranges used for ruler alignment.
- Unit: `tests/ruler-utils.test.mjs` also validates clamped label positions so edge labels (like the vertical `0`) stay readable.
- Manual: run `npm start`, open `http://localhost:3000/src/`, set media `W9`, and verify the vertical ruler highlight spans exactly from the label top edge to the label bottom edge.

## Preview interactions
- Unit: `tests/interaction-utils.test.mjs` checks handle positions, hit testing, cursor mapping, handle-edge mapping, interactive item type support, and drag clamping for the preview overlay.
- Manual: click an item to select it, then hold `Ctrl` (Windows/Linux) or `Cmd` (macOS) and click additional items.
- Expected: multiple items stay selected, alignment controls become active, resize dots are hidden while more than one item is selected, plain click on one selected item keeps the multi-selection, and dragging one selected item moves the full selection together.

## Alignment controls
- Unit: `tests/alignment-utils.test.mjs` validates reference bounds and deltas for left/center/right/top/middle/bottom alignment modes.
- Manual: open the alignment dropdown in the workspace header, select multiple items, choose `Selection`, `Largest item`, `Smallest item`, or `Label`, then click an align button.
- Expected: selected items align according to the chosen axis and target.

## Project save/load
- Unit: `tests/project-io-utils.test.mjs` validates JSON payload sanitizing, normalization, and id reseeding.
- Unit: `tests/project-url-utils.test.mjs` validates shareable URL payload encoding/decoding and URL parameter source resolution.
- Manual: run `npm start`, open `http://localhost:3000/src/`, click Save to export JSON, then click Load and select the file.
- Expected: save creates a `.json` file, load restores the same items and settings, and status reflects success.
- Manual: append `?projectUrl=<url-to-json>` or open a shared `?project=<encoded>` link.
- Expected: project loads automatically on startup and the Share button creates a link that restores the same layout.

## Workspace zoom
- Unit: `tests/zoom-utils.test.mjs` validates zoom clamping, stepping, and label formatting used by the workspace zoom controls.
- Manual: run `npm start`, open `http://localhost:3000/src/`, use `-`, `+`, and the zoom slider in the workspace header.
- Expected: rulers and label preview scale together, and the reset button jumps back to `100%`.

## QR initial sizing
- Unit: `tests/qr-size-utils.test.mjs` verifies new QR items start at a size that fits the selected media width and optional fixed media length.
- Manual: run `npm start`, open `http://localhost:3000/src/`, switch between tape widths (for example `W24` and `W9`), then click `QR-Code`.
- Expected: the newly added QR square stays within the label bounds without clipping on narrow media.
