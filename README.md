# Labelprinter App

Web-based label editor application built on top of `labelprinterkit`.

Live app: [https://labelprinter.app/](https://labelprinter.app/)

## Overview

This repository now contains the application layer only:
- UI/editor in `src/`
- Utility modules in `src/*.mjs`
- App UI components in `src/ui/`
- Static app shell in `src/index.html`
- Local dev server in `src/server.mjs`

The printer protocol and backend implementation are consumed from:
- `git@github.com:SunboX/labelprinterkit.git`

## Parameters And Batch Printing

- Placeholders use the Mustache-style format `{{parameter_name}}`.
- Placeholders work in text items (`text`), QR items (`data`), and barcode items (`data`).
- Define parameters with optional defaults in the inspector.
- Load parameter data from JSON, CSV, XLS, XLSX, or ODS to print one label per row.
- Uploaded spreadsheet formats are converted to JSON preview before validation.
- The app validates uploaded parameter data and highlights parse or row-level issues.
- Printing asks for confirmation before large runs (>10 labels).

### URL Parameters

- `project=<embedded-or-json-url-or-raw-json>`: load project from shared payload, URL, or raw JSON object.
- `projectUrl=<json-url>`: load project JSON from URL.
- `parameterDataUrl=<data-url>`: load parameter row data from URL (JSON/CSV/XLS/XLSX/ODS).
- `autoPrint=true|1|yes|on`: start printing automatically after URL load completed.
- `skipBatchConfirm=true|1|yes|on`: skip the >10 labels confirmation prompt.
- `lang=en|de`: set UI language.

## Localization

- Translation bundles live in `src/i18n/en.json` and `src/i18n/de.json`.
- Runtime localization is handled by `src/I18n.mjs`.
- Switch language from the top toolbar locale selector (`English` / `Deutsch`).

## Documentation

- `docs/ai-assistant.md`: in-app assistant usage, action automation, and PHP endpoint setup.
- `docs/webmcp.md`: browser-side WebMCP tool exposure for external in-browser agents.
- `docs/getting-started.md`: step-by-step editor guide from setup to print.
- `docs/objects-and-alignment.md`: object types, properties, editing behavior, and alignment.
- `docs/parameter-data-formats.md`: parameter file formats and required CSV/spreadsheet structure.
- `docs/printers-and-connections.md`: supported printer models, backend setup, and connection troubleshooting.
- `docs/persistence-and-sharing.md`: save/load/share and URL parameter behavior.
- `docs/url-parameters.md`: URL parameter reference and examples.
- `docs/localization.md`: locale support and translation binding behavior.
- `docs/icon-library-maintenance.md`: how to add/validate icon assets.
- `docs/project-json-schema.md`: persisted project structure and object field reference.
- `docs/security-and-privacy.md`: share URL and remote-loading security notes.
- `docs/troubleshooting.md`: common issues and fixes.
- `docs/contributing-object-types.md`: checklist for adding new object types.
- `docs/architecture.md`: high-level runtime and startup flow.

## Dependency

`labelprinterkit` is installed via Git SSH in `package.json`:

- `labelprinterkit-web`: `git+ssh://git@github.com/SunboX/labelprinterkit.git`

Make sure your SSH key has access to GitHub before installing.

## Run

```bash
npm install
cp .env.example .env
# set OPENAI_API_KEY in .env if you use the AI assistant
npm start
```

Open:

- `http://localhost:3000/`

## Test

```bash
npm test
```

App-level tests are in `tests/`.

## Notes

- The app uses an import map in `src/index.html` to resolve `labelprinterkit-web` in the browser.
- Worker paths are direct replacements with runtime capability checks and automatic in-thread fallback (no feature flag).
- Preview/print raster hotspots (image, icon, QR, barcode) use workers when available and fall back to in-thread rendering per request on failure.
- Multi-row print jobs use a print-page worker pool when snapshot constraints are met; unsupported layouts fall back page-by-page to the existing sequential renderer.
- Spreadsheet parsing and large parameter validation/preview computations use workers when available, with unchanged user-facing error messaging.
- Device access (WebUSB/WebBluetooth) still requires a user gesture and secure context (`localhost` or HTTPS).
