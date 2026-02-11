# URL Parameters

This app supports URL-based loading and print behavior flags.

## Supported Parameters

- `project`: Embedded project payload (base64url JSON) or a JSON URL.
- `projectUrl`: Project JSON URL.
- `parameterDataUrl`: Parameter data file URL (`.json`, `.csv`, `.xls`, `.xlsx`, `.ods`).
- `autoPrint`: Auto-start printing after URL loading (`true`, `1`, `yes`, `on`, or empty value).
- `skipBatchConfirm`: Skip the ">10 labels" confirmation (`true`, `1`, `yes`, `on`, or empty value).

## Startup Behavior

When the app opens, URL-driven flow is:

1. Load project from `project`/`projectUrl` if present.
2. Load parameter rows from `parameterDataUrl` if present.
3. If a project was URL-loaded and `autoPrint` is enabled, start printing.
4. If `skipBatchConfirm` is enabled, the batch-size confirmation is bypassed.

## Examples

- Load project only:
  - `http://localhost:3000/?projectUrl=https://example.com/project.json`
- Load project and parameter rows:
  - `http://localhost:3000/?projectUrl=https://example.com/project.json&parameterDataUrl=https://example.com/parameters.json`
- Load project and CSV parameter rows:
  - `http://localhost:3000/?projectUrl=https://example.com/project.json&parameterDataUrl=https://example.com/parameters.csv`
- Load project and XLSX parameter rows:
  - `http://localhost:3000/?projectUrl=https://example.com/project.json&parameterDataUrl=https://example.com/parameters.xlsx`
- Auto-print after load:
  - `http://localhost:3000/?projectUrl=https://example.com/project.json&parameterDataUrl=https://example.com/parameters.json&autoPrint=true`
- Auto-print and skip large-batch confirmation:
  - `http://localhost:3000/?projectUrl=https://example.com/project.json&parameterDataUrl=https://example.com/parameters.json&autoPrint=true&skipBatchConfirm=true`

## Notes

- All parameter file formats are converted to a normalized JSON array preview in the UI.
- Converted data still goes through the same parameter validation and preview highlighting.
- Invalid JSON input prevents parameter row usage and shows JSON parser diagnostics.
- Invalid spreadsheet input prevents parameter row usage and shows a load error status.
- Browser/device permission prompts (WebUSB/WebBluetooth) may still require user interaction depending on browser policy.
