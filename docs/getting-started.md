# Getting Started: Create And Print A Label

This guide walks through the normal editor flow from an empty screen to a printed label.

## 1. Open The App

1. Open the app in your browser.
2. In the top bar, optionally switch language (`English` / `Deutsch`).

## 2. Configure Printer And Media

1. In the **Printer** panel, choose:
   - `Backend` (`WebUSB` or `WebBluetooth`)
   - `Printer model`
   - `Width`, `Resolution`, `Orientation`
2. Optionally set `Media length (mm)`:
   - Leave empty for automatic label length from placed objects.
   - Set a value to force a fixed length.

Detailed setup instructions and connection requirements are in [printers-and-connections.md](./printers-and-connections.md).

## 3. Add Objects To The Label

1. Go to the **Objects** panel.
2. Use the add-object icon row (`Text`, `QR`, `Barcode`, `Image`, `Icon`, `Form`) to place items.
3. A default text object is already present in a new session and can be edited immediately.

Full object list and all properties are documented in [objects-and-alignment.md](./objects-and-alignment.md).

## 4. Edit And Arrange Objects

1. Click an object in the preview to select it.
2. Drag to move.
3. Resize using handle dots (single selection).
4. Rotate using the `Rotation` slider in the object card.
5. Reorder object cards in the panel as needed (panel order only).
6. Use multi-select with:
   - `Ctrl+Click` (Windows/Linux)
   - `Cmd+Click` (macOS)
7. Use alignment controls in the workspace toolbar to align selected objects.

Advanced interaction behavior and alignment modes are in [objects-and-alignment.md](./objects-and-alignment.md).

## 5. (Optional) Use Parameters For Batch Labels

1. Add parameter definitions in the **Parameters** section.
2. Use placeholders like `{{serial}}` in text, QR, or barcode content.
3. Load parameter data from:
   - `JSON`, `CSV`, `XLS`, `XLSX`, or `ODS`
4. Review parsed/pretty-printed JSON preview and validation messages.
5. Fix missing/unused parameter warnings before printing.

Data format and validation rules are in:
- [parameter-data-formats.md](./parameter-data-formats.md)
- [project-json-schema.md](./project-json-schema.md)

## 6. Print

1. Click **Print**.
2. Browser permission prompts may appear for USB/Bluetooth device access.
3. If parameter rows are loaded:
   - One label is printed per row.
   - A confirmation prompt appears for batches larger than 10 labels unless explicitly bypassed.

## 7. Save, Load, And Share

1. Use **Save** to export the current project JSON.
2. Use **Load** to import an existing project JSON.
3. Use **Share** to generate a URL containing the project payload.

Complete persistence and sharing behavior is in:
- [persistence-and-sharing.md](./persistence-and-sharing.md)
- [security-and-privacy.md](./security-and-privacy.md)

## 8. Troubleshooting

If something does not behave as expected, start with [troubleshooting.md](./troubleshooting.md).
