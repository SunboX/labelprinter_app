# Objects, Properties, And Alignment

This document describes every object type that can be placed on a label, its editable properties, and how object interactions and alignment work.

## Shared Object Behavior

All object types share these interaction rules:

- Select by clicking an object in the preview.
- Add/remove selection with `Ctrl` (Windows/Linux) or `Cmd` (macOS) + click.
- Drag selected object(s) to move them.
- Resize with visible handle dots (single selection only).
- Rotate using the `Rotation` slider (`-180` to `180` degrees).

Special double-click actions:

- Text: opens inline text editing directly on the label.
- Image: opens image file picker (same as `Upload image`).
- Icon: opens icon picker popup.

Notes:

- Multi-selection hides resize handles (move + align only).
- When multiple items are selected, dragging one selected item moves the full selection.
- Object cards can be reordered in the **Objects** panel using drag handles; this reorders settings cards only.
- Width/height controls for image-like objects are constrained to the printable cross-axis (depends on media width + orientation).

## Interaction Cheatsheet

- `Click` object: select object.
- `Ctrl+Click` (Windows/Linux) or `Cmd+Click` (macOS): add/remove object in selection.
- `Drag` selected object: move object.
- `Drag` one object within a multi-selection: move whole selection.
- `Drag` handle dots (single selection): resize.
- `Double-click` text: inline text edit.
- `Double-click` image: open image picker for that item.
- `Double-click` icon: open icon picker for that item.
- Inline text edit `Enter`: apply.
- Inline text edit `Esc`: cancel.

## Text Object

Description: Plain text rendered with selected font family/size.

Properties:

- `text`: displayed text content (supports `{{parameter_name}}` placeholders).
- `fontFamily`: selected font family (local + added Google fonts).
- `fontSize`: text size.
- `textBold`: bold style toggle.
- `textItalic`: italic style toggle.
- `textUnderline`: underline style toggle.
- `textStrikethrough`: strikethrough style toggle.
- `xOffset`: horizontal offset.
- `yOffset`: vertical offset.
- `rotation`: rotation in degrees.
- `height`: internal layout span in dots (stored in project JSON).

Handling:

- Edit text in the card textarea or double-click text in preview for inline editing.
- Inline editor shortcuts: `Enter` = apply, `Esc` = cancel.

## QR-Code Object

Description: Monochrome QR code generated from the configured content/options.

Properties:

- `data`: QR payload text (supports `{{parameter_name}}` placeholders).
- `size`: QR square size (dots).
- `xOffset`: horizontal offset.
- `yOffset`: vertical offset.
- `rotation`: rotation in degrees.
- `qrErrorCorrectionLevel`: one of `L`, `M`, `Q`, `H`.
- `qrVersion`: `0` (auto) or `1..40`.
- `qrEncodingMode`: one of `auto`, `byte`, `alphanumeric`, `numeric`.

Handling:

- Size is clamped to label limits.
- QR is always square. Width/height are not edited independently.
- Changing QR options invalidates and rebuilds QR render cache automatically.

## Barcode Object

Description: Monochrome 1D barcode generated from content using JsBarcode formats.

Properties:

- `data`: barcode payload text (supports `{{parameter_name}}` placeholders).
- `width`: barcode width in dots.
- `height`: barcode height in dots.
- `xOffset`: horizontal offset.
- `yOffset`: vertical offset.
- `rotation`: rotation in degrees.
- `barcodeFormat`: barcode symbology (for example `CODE128`, `CODE39`, `EAN13`, `ITF14`).
- `barcodeShowText`: show/hide human-readable text below bars.
- `barcodeModuleWidth`: bar module width.
- `barcodeMargin`: quiet-zone margin around bars.

Handling:

- The preview and print output use the same barcode generation pipeline.
- Invalid barcode payload/format combinations show a visible placeholder block instead of breaking rendering.
- Width/height are constrained to the printable cross-axis based on orientation/media, similar to images/icons.

Supported `barcodeFormat` values:

- `CODE128`, `CODE128A`, `CODE128B`, `CODE128C`
- `CODE39`
- `EAN13`, `EAN8`, `EAN5`, `EAN2`
- `UPC`, `UPCE`
- `ITF14`
- `MSI`, `MSI10`, `MSI11`, `MSI1010`, `MSI1110`
- `codabar`
- `pharmacode`

## Image Object

Description: Uploaded raster image converted to printer-like black/white output.

Properties:

- `imageData`: image as data URL.
- `imageName`: source file name.
- `width`: image width in dots.
- `height`: image height in dots.
- `xOffset`: horizontal offset.
- `yOffset`: vertical offset.
- `rotation`: rotation in degrees.
- `imageThreshold`: threshold `0..255`.
- `imageDither`: one of `threshold`, `floyd-steinberg`, `ordered`.
- `imageSmoothing`: one of `off`, `low`, `medium`, `high`.
- `imageInvert`: invert black/white output.

Handling:

- Upload using `Upload image` in the card or double-click the image in preview.
- Width/height are constrained to the printable cross-axis based on orientation/media.
- Empty image shows a placeholder in preview and in the object card.

## Icon Object

Description: Monochrome SVG icon from the built-in icon library.

Properties:

- `iconId`: selected icon identifier.
- `width`: icon width in dots.
- `height`: icon height in dots.
- `xOffset`: horizontal offset.
- `yOffset`: vertical offset.
- `rotation`: rotation in degrees.

Handling:

- Choose icon from the popup icon picker.
- Double-click icon in preview to open picker for that item.
- Size is constrained similarly to image objects.
- Picker entries are grouped by category and rendered as an overlay.
- Icon previews are loaded lazily when the picker is opened.

Icon asset requirements (for maintainers adding icons):

- Icons are defined in `src/assets/icons/icon-manifest.mjs`.
- SVG files are loaded from `src/assets/icons/`.
- Each SVG root must include matching `id`, `category`, and `label` attributes.
- Icons failing metadata validation are excluded and a warning is printed in the browser console.

## Form Object

Description: Vector shape/form primitives rendered as black strokes/fills.

Shared properties:

- `shapeType`: selected form type.
- `width`: form width in dots.
- `height`: form height in dots.
- `strokeWidth`: stroke thickness.
- `xOffset`: horizontal offset.
- `yOffset`: vertical offset.
- `rotation`: rotation in degrees.

Conditional properties:

- `cornerRadius`: only relevant for `roundRect`.
- `sides`: only relevant for `polygon`.

Available `shapeType` values:

- `rect`
- `roundRect`
- `oval`
- `polygon`
- `line`
- `triangle`
- `diamond`
- `arrowRight`
- `arrowLeft`
- `plus`
- `dot`

Line-specific behavior:

- Resize handles are limited to left/right endpoints (`w`, `e`).
- Dragging from the center area still moves the line.

## Alignment Feature

Alignment is available from the alignment button in the workspace header.

Supported align actions:

- Horizontal: `Left`, `Center`, `Right`
- Vertical: `Top`, `Middle`, `Bottom`

`Align to` reference modes:

- `Selection`: bounding box of all selected items.
- `Largest item`: bounds of the largest selected item (area-based).
- `Smallest item`: bounds of the smallest selected item (area-based).
- `Label`: full label bounds.

Rules:

- For `Selection`, `Largest item`, `Smallest item`: at least 2 selected items are required.
- For `Label`: at least 1 selected item is required.
- Alignment updates `xOffset`/`yOffset` of selected items; size/rotation remain unchanged.
