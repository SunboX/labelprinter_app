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

After conversion, the app uses the existing JSON-based validation and preview renderer:

- Missing/unused/unknown parameter checks.
- Pretty-printed JSON preview with issue markers.
- One label per row at print time.

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
