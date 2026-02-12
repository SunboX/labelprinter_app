# Save, Load, Share, And URL Parameters

This document describes project persistence and startup automation features.

For security/privacy implications of shared URLs and remote loading, see `docs/security-and-privacy.md`.

## Save Project

Use the top-bar **Save** button.

Behavior:

- Exports current editor state as a `.json` project file.
- Uses native save picker when available.
- Falls back to browser download if native picker is unavailable.

Saved project includes:

- Printer/media settings.
- All objects and their properties.
- Parameters/defaults.
- Parameter data rows (if loaded).
- Custom Google font links.

Notes:

- Runtime-only cache fields are removed from saved items.
- Parameter definitions, parameter rows, and custom font links are normalized before export.

## Load Project

Use the top-bar **Load** button.

Behavior:

- Imports a project JSON file.
- Normalizes and validates state before applying.
- Re-renders preview and object editor after load.

## Share Project URL

Use the top-bar share icon.

Behavior:

- Creates a link with embedded project payload in `project=<base64url>`.
- Uses Web Share API if supported.
- Falls back to clipboard copy, then prompt fallback if needed.

Notes:

- Generated share link embeds project JSON in URL.
- Generated link intentionally removes `projectUrl` to avoid source conflicts.

## Local Browser Preferences

The app also stores non-project preferences in browser localStorage:

- `labelprinter-app.zoom-preference.v1`: stores zoom + display fingerprint (`screen` metrics + `devicePixelRatio`); zoom is restored only when the current display fingerprint matches.
- `labelprinter-app.google-font-links.v1`: stores added Google Fonts CSS URLs; links are reloaded on startup.
- `labelprinter_app_locale`: stores the selected UI locale (`en` / `de`).

When a project is loaded from URL (`project`/`projectUrl`), project values are applied first and local zoom/font restoration is not applied on top.

## Browser Capability Matrix

The app detects browser capabilities and applies fallbacks automatically.

| Feature | Preferred API | Fallback behavior |
| --- | --- | --- |
| Save project | `window.showSaveFilePicker` | file-name prompt + browser download |
| Load project | `window.showOpenFilePicker` | hidden `<input type="file">` |
| Load parameter file | `window.showOpenFilePicker` | hidden `<input type="file">` |
| Share URL | `navigator.share` | clipboard copy (`navigator.clipboard.writeText`) |
| Share URL (no clipboard) | `navigator.share` / clipboard | `window.prompt(...)` with URL text |
| Installed fonts | `window.queryLocalFonts` | curated fallback font list |

Notes:

- In restricted/private contexts, localStorage writes may fail silently.
- Device permission dialogs for printing are still browser-controlled.

## URL Parameters

Supported query parameters:

- `project`: embedded project payload (base64url JSON), project URL, or URL-encoded raw JSON object.
- `projectUrl`: explicit project JSON URL.
- `parameterDataUrl`: parameter data file URL (`.json`, `.csv`, `.xls`, `.xlsx`, `.ods`).
- `autoPrint`: auto-start printing after URL loading.
- `skipBatchConfirm`: skip “more than 10 labels” confirmation.
- `lang`: app locale (`en` / `de`).

Boolean parsing (`autoPrint`, `skipBatchConfirm`):

- True values: `1`, `true`, `yes`, `on`, or empty value (e.g. `?autoPrint`).
- Any missing value/false-like value keeps feature disabled.

Source precedence:

- If both `project` and `projectUrl` exist, `project` is used.

Startup sequence:

1. Project load (`project`/`projectUrl`)
2. Parameter data load (`parameterDataUrl`)
3. Optional auto-print (only if project came from URL and `autoPrint` is enabled)
4. Optional skip of >10 label confirmation (`skipBatchConfirm`)

## Parameter Data URL Formats

`parameterDataUrl` supports the same formats as local upload:

- JSON
- CSV
- XLS
- XLSX
- ODS

Non-JSON formats are converted to JSON internally, then passed through the same validation and preview pipeline as uploaded JSON.

## Examples

Load project:

- `http://localhost:3000/?projectUrl=https://example.com/project.json`

Load project + spreadsheet parameter data:

- `http://localhost:3000/?projectUrl=https://example.com/project.json&parameterDataUrl=https://example.com/labels.xlsx`

Load and auto-print, skip large batch confirmation:

- `http://localhost:3000/?projectUrl=https://example.com/project.json&parameterDataUrl=https://example.com/labels.csv&autoPrint=true&skipBatchConfirm=true`
