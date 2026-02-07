# Architecture

## Purpose

This repository is the label printer application (editor/UI) and references `labelprinterkit` as an external dependency.

## Structure

- `src/index.html`: app shell + import map
- `src/main.mjs`: app controller and wiring
- `src/ui/`: UI modules (`ItemsEditor`, `PreviewRenderer`, `PrintController`)
- `src/*-utils.mjs`: app utility modules
- `src/server.mjs`: local development static server
- `tests/`: app-focused unit and manual-test docs

## External Library

Printer/runtime APIs are imported from:

- `labelprinterkit-web/src/index.mjs`

The package is sourced from:

- `git@github.com:SunboX/labelprinterkit.git`

## Migration Summary

- Removed local toolkit implementation from this repo.
- Removed old `examples/` structure.
- Promoted the former `examples/complex_label_with_frontend` app into `src/`.
