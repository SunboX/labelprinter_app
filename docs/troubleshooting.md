# Troubleshooting

## Project/Parameter URL Load Fails

Symptoms:

- Status shows load failure.
- URL-driven startup does not apply project or parameter rows.

Checks:

- Open the URL directly in browser and verify it returns valid JSON/CSV/XLS/XLSX/ODS.
- Verify CORS headers allow the app origin.
- Confirm URL is reachable from the client machine/browser.
- For `project` links, ensure the value is valid base64url payload, valid URL, or valid raw JSON object.

## Parameter File Accepted But Printing Blocked

Symptoms:

- Parameters panel shows errors.
- Print button reports parameter issues.

Checks:

- Fix JSON parse errors first (line/column shown).
- Ensure each row is an object.
- Ensure placeholders used in text/QR/barcode exist in parameter definitions.
- Ensure required placeholder values exist in each row or have defaults.

Note:

- Warnings do not block printing.
- Errors block printing.

## Spreadsheet Imports Look Wrong

Symptoms:

- Unexpected keys/values in preview JSON.

Checks:

- First sheet is used.
- First row must contain headers.
- No merged/title rows above header row.
- One label row per spreadsheet row.

## BLE Printer Not Found Or Write Fails

Symptoms:

- No BLE device shown.
- Connect/write fails after selection.

Checks:

- Ensure backend is set to `WebBluetooth (BLE)`.
- Verify Service UUID and Write Characteristic UUID.
- Try clearing Name prefix filter.
- Ensure printer is in pairing/advertising mode.
- Verify browser supports WebBluetooth in secure context (`https` or `localhost`).

## USB Printer Not Listed

Symptoms:

- USB picker opens but printer is missing.

Checks:

- Ensure backend is set to `WebUSB (USB)`.
- Check cable/device mode.
- Reconnect device and retry.
- Verify browser supports WebUSB in secure context.

## Barcode Shows Placeholder Instead Of Bars

Symptoms:

- Barcode block appears with fallback/placeholder visuals.

Checks:

- Verify barcode content matches selected barcode format rules.
- Try `CODE128` for broad content compatibility.
- Disable readable text temporarily (`Show readable text`) to isolate layout issues.

## Icon Missing Or Falls Back To Another Icon

Symptoms:

- Selected icon is not available.
- App shows fallback icon.

Checks:

- Verify icon exists in `src/assets/icons/icon-manifest.mjs`.
- Verify SVG file exists in `src/assets/icons/`.
- Ensure SVG root attributes `id`, `category`, and `label` are present and match manifest.
- Check browser console warnings from `IconLibraryUtils`.

## Shared URL Too Large

Symptoms:

- Link cannot be opened reliably.
- Browser/proxy rejects long URL.

Checks:

- Use `projectUrl` pointing to hosted JSON instead of embedded `project` payload.
- Reduce embedded image/icon-heavy project data where possible.

## Google Font Not Loading

Symptoms:

- Font not added to dropdown.

Checks:

- URL must point to `fonts.googleapis.com` and path must start with `/css` or `/css2`.
- URL must contain at least one `family=` parameter.
- Check network connectivity and browser console for stylesheet load errors.
