# Architecture

## Purpose

This repository is the label printer application (editor/UI) and references `labelprinterkit` as an external dependency.

## Structure

- `src/index.html`: app shell + import map
- `src/main.mjs`: app controller and wiring
- `src/ui/`: UI modules (`ItemsEditor`, `PreviewRenderer`, `PrintController`)
- `src/ui/WebMcpBridge.mjs`: browser WebMCP bridge (`navigator.modelContext`) that exposes `labelprinter_action`
- `src/*-utils.mjs`: app utility modules
- `src/i18n/`: locale bundles (`en.json`, `de.json`)
- `src/assets/icons/`: SVG icon catalog used by icon objects
- `src/server.mjs`: local development static server
- `tests/`: app-focused unit and manual-test docs

## Worker Architecture

- Worker RPC transport lives in `src/ui/WorkerRpcClient.mjs` and provides request correlation, timeout handling, and stale-response drop behavior.
- Worker clients in `src/ui/`:
  - `RasterWorkerClient.mjs`: image/icon raster loops
  - `CodeRasterWorkerClient.mjs`: QR/barcode raster generation
  - `ParameterDataWorkerClient.mjs`: spreadsheet parsing (`CSV/XLS/XLSX/ODS`)
  - `ParameterValidationWorkerClient.mjs`: large-row validation + pretty preview computation
  - `PrintPageWorkerPoolClient.mjs`: parallel page rendering for multi-row print jobs
- Worker implementations in `src/workers/`:
  - `RasterWorker.mjs`
  - `CodeRasterWorker.mjs`
  - `ParameterDataWorker.mjs`
  - `ParameterValidationWorker.mjs`
  - `PrintPageWorker.mjs`
- Runtime behavior:
  - Missing `Worker`/`OffscreenCanvas`/`createImageBitmap` disables only the affected worker path.
  - Worker errors trigger per-request fallback to the previous main-thread implementation.
  - QR/barcode output parity is preserved by using the same browser runtimes (`qrcode` and `JsBarcode`) in workers.
  - Multi-row print parallelism is enabled only when at least two labels are queued and snapshot constraints are supported.

## URL-Driven Startup Flow

- `src/ProjectUrlUtils.mjs` resolves URL parameters for:
  - project loading (`project`, `projectUrl`)
  - parameter-row loading (`parameterDataUrl`)
  - print behavior (`autoPrint`, `skipBatchConfirm`)
- `src/ParameterDataFileUtils.mjs` converts parameter data sources (`JSON`, `CSV`, `XLS`, `XLSX`, `ODS`) into JSON array text for shared validation/rendering.
- `src/main.mjs` applies URL sources in this order during init:
  1. Load project from URL (if provided)
  2. Load parameter rows from URL (if provided)
  3. Trigger auto-print (if enabled and project came from URL)
- `src/ui/ParameterPanel.mjs` provides `applyParameterDataRawText(...)` so both file uploads and URL-fetched parameter files use the same validation/rendering pipeline after conversion to JSON.
- `src/I18n.mjs` resolves locale from URL/storage/browser before UI initialization.

## Icon Catalog Runtime

- `src/assets/icons/icon-manifest.mjs` defines icon metadata (`file`, `id`, `category`, `label`).
- `src/IconLibraryUtils.mjs` validates SVG root metadata (`id`, `category`, `label`) on first use.
- Invalid icons are skipped with console warnings, and icon ids fall back to the default catalog icon.

## External Library

Printer/runtime APIs are imported from:

- `labelprinterkit-web/src/index.mjs`

The package is sourced from:

- `git@github.com:SunboX/labelprinterkit.git`

## Migration Summary

- Removed local toolkit implementation from this repo.
- Removed old `examples/` structure.
- Promoted the former `examples/complex_label_with_frontend` app into `src/`.
