# Labelprinter App

Web-based label editor application built on top of `labelprinterkit`.

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
- Placeholders work in text items (`text`) and QR items (`data`).
- Define parameters with optional defaults in the inspector.
- Load a JSON file with an array of objects to print one label per row.
- The app validates uploaded JSON and highlights parse or row-level issues.
- Printing asks for confirmation before large runs (>10 labels).

## Dependency

`labelprinterkit` is installed via Git SSH in `package.json`:

- `labelprinterkit-web`: `git+ssh://git@github.com/SunboX/labelprinterkit.git`

Make sure your SSH key has access to GitHub before installing.

## Run

```bash
npm install
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
- Device access (WebUSB/WebBluetooth) still requires a user gesture and secure context (`localhost` or HTTPS).
