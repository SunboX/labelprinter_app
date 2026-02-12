# URL Parameters

This app supports URL-based loading and print behavior flags.

## Supported Parameters

- `project`: Embedded project payload (base64url JSON), URL reference, or URL-encoded raw JSON object.
- `projectUrl`: Project JSON URL.
- `parameterDataUrl`: Parameter data file URL (`.json`, `.csv`, `.xls`, `.xlsx`, `.ods`).
- `autoPrint`: Auto-start printing after URL loading (`true`, `1`, `yes`, `on`, or empty value).
- `skipBatchConfirm`: Skip the ">10 labels" confirmation (`true`, `1`, `yes`, `on`, or empty value).
- `lang`: UI locale (`en` or `de`; locale prefixes like `de-DE` also resolve to `de`).

## `project` Parameter Modes

`project` is interpreted in this order:

1. URL-like value (`https://...`, `/...`, `./...`, `../...`) -> fetched as remote JSON.
2. Raw JSON object string (starts with `{`) -> parsed directly.
3. Otherwise -> treated as shared-link base64url payload.

## Startup Behavior

When the app opens, URL-driven flow is:

1. Load project from `project`/`projectUrl` if present.
2. Load parameter rows from `parameterDataUrl` if present.
3. If a project was URL-loaded and `autoPrint` is enabled, start printing.
4. If `skipBatchConfirm` is enabled, the batch-size confirmation is bypassed.

Locale resolution runs before app bootstrap:

1. `lang` URL parameter (if present)
2. persisted locale in localStorage
3. browser language fallback

## Remote Loading Constraints

URL-based loading (`project`, `projectUrl`, `parameterDataUrl`) uses browser `fetch(...)`.

Requirements and limits:

- Remote endpoints must be reachable from the browser.
- Cross-origin endpoints must allow CORS for the app origin.
- Protected endpoints that require custom auth headers are not supported by URL parameters.
- Cross-origin cookie-based auth is typically not available because requests are sent without cross-site credentials.
- `autoPrint` can trigger rendering/print flow automatically, but browser/device permission prompts (USB/BLE) may still require user interaction.

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
- Open app in German:
  - `http://localhost:3000/?lang=de`
- Open app in German and load spreadsheet rows:
  - `http://localhost:3000/?lang=de&projectUrl=https://example.com/project.json&parameterDataUrl=https://example.com/parameters.xlsx`

## Notes

- All parameter file formats are converted to a normalized JSON array preview in the UI.
- Converted data still goes through the same parameter validation and preview highlighting.
- Invalid JSON input prevents parameter row usage and shows JSON parser diagnostics.
- Invalid spreadsheet input prevents parameter row usage and shows a load error status.
- Browser/device permission prompts (WebUSB/WebBluetooth) may still require user interaction depending on browser policy.
