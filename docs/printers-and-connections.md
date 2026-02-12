# Printers, Setup, And Connections

This document explains supported printer models, required setup, and both connection methods (`WebUSB` and `WebBluetooth`).

## Supported Printer Models

The app currently exposes these model classes in the UI:

- `P700`
- `P750W`
- `E500`
- `E550W`
- `H500`

Select the model in the **Printer model** dropdown before printing.

## Model/Backend Support Matrix

The app exposes all listed models for both backends. Actual device compatibility still depends on hardware/firmware capabilities.

| Printer model (UI) | WebUSB (USB) | WebBluetooth (BLE) | Notes |
| --- | --- | --- | --- |
| `P700` | Supported by app | Supported by app | BLE requires correct GATT UUIDs and a BLE-capable target device/profile |
| `P750W` | Supported by app | Supported by app | BLE support depends on firmware/profile availability |
| `E500` | Supported by app | Supported by app | BLE support depends on firmware/profile availability |
| `E550W` | Supported by app | Supported by app | BLE support depends on firmware/profile availability |
| `H500` | Supported by app | Supported by app | BLE support depends on firmware/profile availability |

Important:

- The app does not ship model-specific BLE UUID presets.
- You must provide valid UUID values for your exact BLE profile/device.

## Browser And Environment Requirements

Printing requires browser device APIs:

- `WebUSB` for USB-connected devices.
- `WebBluetooth` for BLE devices.

Requirements:

- Secure context: `https://` or `http://localhost`.
- Chromium-based browser with device API support.
- User gesture for device selection (clicking **Print** triggers the permission flow).

## Connection Method 1: WebUSB (USB)

Best for direct USB cable printing.

How to configure:

1. Connect printer via USB.
2. In the app, set **Backend** to `WebUSB (USB)`.
3. Select the correct **Printer model**.
4. Click **Print** and choose the printer in the browser dialog.

Implementation detail:

- Device request uses USB class filter `classCode: 7`.

## Connection Method 2: WebBluetooth (BLE)

Use for BLE-capable devices/adapters.

How to configure:

1. Power on printer and enable Bluetooth pairing/advertising.
2. In the app, set **Backend** to `WebBluetooth (BLE)`.
3. Fill BLE fields:
   - `Service UUID` (required)
   - `Write characteristic UUID` (required)
   - `Notify characteristic UUID` (optional, but commonly needed)
   - `Name prefix` (optional filter, e.g. `PT-`)
4. Select the correct **Printer model**.
5. Click **Print** and select the BLE device in the browser dialog.

Important:

- The default BLE UUID values in the UI are placeholders and must be replaced with values for your target device/profile.
- If service/write UUIDs are wrong or missing, connection will fail.

## Printer/Media Settings In The Left Panel

These settings affect generated print data:

- **Backend**: connection method (`WebUSB` or `WebBluetooth`).
- **Printer model**: protocol shim class used for print output.
- **Width**: tape/media width profile (`W*` media IDs).
- **Resolution**: raster resolution profile.
- **Orientation**: horizontal/vertical layout direction.
- **Media length (mm)**:
  - empty = auto length from content/items
  - value set = fixed length override in millimeters

## Typical Print Flow

1. Choose backend and model.
2. Configure media settings.
3. For BLE: enter UUIDs/prefix.
4. Build label content.
5. Click **Print**.
6. Approve browser device prompt.

If parameter rows are loaded, the app prints one label per row and may ask for confirmation if more than 10 labels are queued (unless disabled via URL flags).

## Troubleshooting

- **No device dialog appears**:
  - Ensure secure context (`localhost`/HTTPS).
  - Retry via explicit button click (user gesture).
- **USB device not listed**:
  - Check cable/driver/device mode.
  - Ensure printer exposes a compatible USB interface.
- **BLE device not listed**:
  - Verify printer is advertising/pairable.
  - Check `Name prefix` filter is not too restrictive.
  - Confirm correct `Service UUID`.
- **BLE connect/write fails**:
  - Verify service/write/notify characteristic UUIDs.
  - Remove optional notify UUID temporarily for diagnostics.
- **Print sent but output wrong size**:
  - Recheck media width, resolution, orientation, and media length settings.
