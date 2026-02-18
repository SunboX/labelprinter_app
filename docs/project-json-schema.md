# Project JSON Schema (Practical Reference)

This document describes the project JSON payload saved/loaded by the app.

It is a practical schema reference based on `src/ProjectIoUtils.mjs` normalization behavior.

## Top-Level Object

Project root must be a JSON object with at least an `items` array.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `appVersion` | `string` | no | App version from `package.json` used when payload was saved/shared |
| `meta` | `object` | no | Serialization metadata (for example editor identity) |
| `media` | `string` | no | Tape/media id (for example `W9`, `W24`) |
| `mediaLengthMm` | `number \| null` | no | `null` = auto length |
| `zoom` | `number` | no | Clamped by app zoom limits |
| `resolution` | `string` | no | Resolution id (for example `LOW`) |
| `orientation` | `'horizontal' \| 'vertical'` | no | Invalid values fallback to default |
| `backend` | `'usb' \| 'ble'` | no | Invalid values fallback to default |
| `printer` | `string` | no | Printer model id (`P700`, `P750W`, `E500`, `E550W`, `H500`) |
| `ble` | `object` | no | BLE backend settings |
| `parameters` | `array` | no | Parameter definitions |
| `parameterDataRows` | `array` | no | Array of row objects |
| `parameterDataSourceName` | `string` | no | UI metadata only |
| `parameterDataRaw` | `string` | no | Raw JSON text when present |
| `customFontLinks` | `array` | no | Google Fonts CSS URLs |
| `items` | `array` | yes | Label objects (see union below) |

## `meta` Object

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `editor` | `object` | no | Editor source metadata |

### `meta.editor` Object

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | `string` | no | Editor/app name (for example `labelprinter-app`) |
| `url` | `string` | no | Editor URL used for save/share origin |

## `ble` Object

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `serviceUuid` | `string` | no | Required at runtime for BLE printing |
| `writeCharacteristicUuid` | `string` | no | Required at runtime for BLE printing |
| `notifyCharacteristicUuid` | `string` | no | Optional depending on profile |
| `namePrefix` | `string` | no | Optional BLE device filter |

## `parameters` Entries

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | `string` | no | Trimmed by normalization |
| `defaultValue` | `string` | no | Coerced to string |

## `parameterDataRows` Entries

Each row must be an object. Non-object rows are discarded by normalization.

## `customFontLinks`

Array of strings. Duplicates and empty values are normalized out.

## `items` Union

All items share:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | no | Missing/duplicate ids are re-seeded |
| `type` | `string` | yes | One of `text`, `qr`, `shape`, `image`, `icon`, `barcode` |
| `xOffset` | `number` | no | Coerced to number with defaults |
| `yOffset` | `number` | no | Coerced to number with defaults |
| `rotation` | `number` | no | Normalized to degrees range |

### `text` Item

| Field | Type | Notes |
| --- | --- | --- |
| `text` | `string` | Supports `{{parameter_name}}` placeholders |
| `fontFamily` | `string` | |
| `fontSize` | `number` | |
| `textBold` | `boolean` | Bold style |
| `textItalic` | `boolean` | Italic style |
| `textUnderline` | `boolean` | Underline style |
| `height` | `number` | Layout span |

### `qr` Item

| Field | Type | Notes |
| --- | --- | --- |
| `data` | `string` | Supports `{{parameter_name}}` placeholders |
| `size` | `number` | QR side length |
| `height` | `number` | Stored for compatibility; normalized to `size` |
| `qrErrorCorrectionLevel` | `string` | `L`, `M`, `Q`, `H` |
| `qrVersion` | `number` | `0` = auto |
| `qrEncodingMode` | `string` | `auto`, `byte`, `alphanumeric`, `numeric` |

Legacy QR aliases are also normalized:

- `errorCorrectionLevel` -> `qrErrorCorrectionLevel`
- `version` -> `qrVersion`
- `encodingMode` -> `qrEncodingMode`

### `shape` Item

| Field | Type | Notes |
| --- | --- | --- |
| `shapeType` | `string` | `rect`, `roundRect`, `oval`, `polygon`, `line`, `triangle`, `diamond`, `arrowRight`, `arrowLeft`, `plus`, `dot` |
| `width` | `number` | |
| `height` | `number` | |
| `strokeWidth` | `number` | |
| `cornerRadius` | `number` | Used by `roundRect` |
| `sides` | `number` | Used by `polygon` |

### `image` Item

| Field | Type | Notes |
| --- | --- | --- |
| `imageData` | `string` | Data URL |
| `imageName` | `string` | Original filename |
| `width` | `number` | Minimum constrained |
| `height` | `number` | Minimum constrained |
| `imageDither` | `string` | `threshold`, `floyd-steinberg`, `ordered` |
| `imageThreshold` | `number` | `0..255` |
| `imageSmoothing` | `string` | `off`, `low`, `medium`, `high` |
| `imageInvert` | `boolean` | |

### `icon` Item

| Field | Type | Notes |
| --- | --- | --- |
| `iconId` | `string` | Unknown ids fallback to default icon |
| `width` | `number` | Minimum constrained |
| `height` | `number` | Minimum constrained |

### `barcode` Item

| Field | Type | Notes |
| --- | --- | --- |
| `data` | `string` | Supports `{{parameter_name}}` placeholders |
| `width` | `number` | Minimum constrained |
| `height` | `number` | Minimum constrained |
| `barcodeFormat` | `string` | JsBarcode format |
| `barcodeShowText` | `boolean` | Human-readable text |
| `barcodeModuleWidth` | `number` | Module width |
| `barcodeMargin` | `number` | Quiet zone |

Legacy barcode aliases are also normalized:

- `format` -> `barcodeFormat`
- `displayValue` -> `barcodeShowText`
- `moduleWidth` -> `barcodeModuleWidth`
- `margin` -> `barcodeMargin`

## Runtime Fields Removed On Save

Any item key starting with `_` is stripped from saved payloads.

Example: `_qrCache`, `_barcodeCache`, and other runtime helpers are never persisted.
