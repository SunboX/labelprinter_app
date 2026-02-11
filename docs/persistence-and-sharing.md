# Save, Load, Share, And URL Parameters

This document describes project persistence and startup automation features.

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

## URL Parameters

Supported query parameters:

- `project`: embedded project payload (base64url JSON) or project URL.
- `projectUrl`: explicit project JSON URL.
- `parameterDataUrl`: parameter data file URL (`.json`, `.csv`, `.xls`, `.xlsx`, `.ods`).
- `autoPrint`: auto-start printing after URL loading.
- `skipBatchConfirm`: skip “more than 10 labels” confirmation.

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
