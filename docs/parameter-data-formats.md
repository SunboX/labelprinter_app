# Parameter Data File Formats

The Parameters panel accepts these input formats:

- `JSON` (`.json`)
- `CSV` (`.csv`)
- `XLS` (`.xls`)
- `XLSX` (`.xlsx`)
- `ODS` (`.ods`)

The same format support applies to:

- Local upload from the **Load file** button.
- URL-based loading through `parameterDataUrl`.

## Conversion Pipeline

All supported parameter files are converted to a JSON array-of-objects representation before validation and preview.

- JSON files: kept as raw text (so JSON parse errors keep accurate line/column output).
- CSV/XLS/XLSX/ODS files: parsed from first worksheet and converted to pretty JSON.
- Unknown file types are attempted as JSON first, then as spreadsheet; unsupported inputs fail with a format error.

After conversion, the app uses the existing JSON-based validation and preview renderer:

- Missing/unused/unknown parameter checks.
- Pretty-printed JSON preview with issue markers.
- One label per row at print time.

## Preview vs Print Rows

Parameter rows are used differently in preview and print:

- Preview uses the first row (`row 1`) as template values.
- Print uses all rows and prints one label per row.
- If no rows are loaded, preview/print fall back to parameter default values.

## Parameter Definition Auto-Creation

If no parameter definitions exist yet and loaded row data contains object properties:

- definitions are inferred automatically from row property names
- inferred definitions use empty default values
- this lets users load a file first and map placeholders afterwards

UI visibility behavior:

- **Example JSON** button and the data preview/issue panel are shown only when at least one parameter definition exists.
- After auto-creation, these sections become visible automatically.

## Spreadsheet Notes

- First worksheet is used.
- First row is treated as column headers.
- Rows are converted to objects using those headers as property names.

## Required Data Structure

Each row represents **one printed label**.

- One file row = one label row.
- Column headers are the parameter names.
- Header names should match the placeholder format used in templates:
  - Allowed: `A-Z`, `a-z`, `0-9`, `_`
  - Must start with a letter or `_`
  - Example: `hostname`, `port_1`, `_location`
- Header names should be unique.

## CSV / Spreadsheet Formatting Rules

- Use the first row as headers only (no merged title rows).
- Keep one parameter per column.
- Keep one label entry per row.
- Prefer plain cell values (text/number/boolean).
- Empty cells are imported as empty strings (`""`), not as missing properties.

## Validation And Preview Behavior

- Parse errors block printing.
- Validation errors (for example missing required placeholder values) block printing.
- Warnings (for example unknown extra columns or fallback-to-default usage) do not block printing.
- JSON preview is line-numbered.
- JSON preview highlights parser error lines.
- JSON preview highlights row ranges with validation errors.
- JSON preview highlights row ranges with warnings.

## Examples

### CSV Example

```csv
hostname,port,room
switch-01,24,Rack-A1
switch-02,48,Rack-A2
```

### Resulting JSON Preview

```json
[
  {
    "hostname": "switch-01",
    "port": "24",
    "room": "Rack-A1"
  },
  {
    "hostname": "switch-02",
    "port": "48",
    "room": "Rack-A2"
  }
]
```

### Matching Template Usage

- Text item: `Port {{port}}`
- QR item: `{{hostname}}-{{port}}`
