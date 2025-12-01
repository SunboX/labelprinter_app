### Labelprinterkit (JavaScript, WebUSB/WebBluetooth)

Browser-ready label printing toolkit for Brother P-Touch devices. Everything is ESM (`.mjs`) and async/await friendly. Backends: WebUSB and WebBluetooth (for BLE-capable models or adapters).

#### Quickstart

```js
// main.mjs (served over https or localhost)
import {
    P700,
    Job,
    Media,
    Resolution,
    Label,
    TextItem,
    BoxItem,
    WebUSBBackend,
    WebBluetoothBackend
} from './src/index.mjs'

async function connectBackend(mode = 'usb') {
    if (mode === 'usb') {
        // USB printer class (07h). Must be triggered by a user gesture.
        return WebUSBBackend.requestDevice({ filters: [{ classCode: 7 }] })
    }
    if (mode === 'ble') {
        // Provide the BLE service/characteristic UUIDs for your device.
        return WebBluetoothBackend.requestDevice({
            serviceUuid: '0000xxxx-0000-1000-8000-00805f9b34fb',
            writeCharacteristicUuid: '0000yyyy-0000-1000-8000-00805f9b34fb',
            notifyCharacteristicUuid: '0000zzzz-0000-1000-8000-00805f9b34fb',
            filters: [{ namePrefix: 'PT-' }]
        })
    }
    throw new Error('Unknown backend mode')
}

async function printSample() {
    const backend = await connectBackend('usb') // or "ble"

    const rowA = new BoxItem(45, [new TextItem(45, 'First line', '28px sans-serif')])
    const rowB = new BoxItem(25, [new TextItem(25, 'Second line', '22px sans-serif')])
    const label = new Label(Resolution.LOW, rowA, rowB)

    const job = new Job(Media.W12)
    job.addPage(label)

    const printer = new P700(backend) // P750W/E500/E550W are available shims too
    await printer.print(job)
}

printSample().catch(console.error)
```

For a richer layout with a QR code, see `examples/complex_label_with_qrcode.mjs` (uses the `qrcode` ESM from jsdelivr and exposes `window.printLabel` you can wire to a button). An interactive editor with drag-to-reorder, resizing, font/QR editing, and label size controls lives in `examples/index.html` (served over https/localhost).

## Run the web editor locally

```bash
npm install
PORT=3000 npm start
# then open http://localhost:3000/examples/complex_label_with_frontend/
```

The Express server (`examples/server.mjs`) serves the repo as static files; the editor is under `/examples/complex_label_with_frontend/`. Use a Chromium-based browser with WebUSB/WebBluetooth enabled. When using BLE, populate the UUID fields in the UI for your device. Printing still requires a user gesture (click) to grant device access. You can also set a custom media length (mm) in the UI; it converts to dots using the selected resolution’s Y DPI and enforces the protocol minimums.

#### API highlights

-   `Label`, `TextItem`, `BoxItem` (from `src/label.mjs`): Canvas-based layout helpers. You can also use `Page.fromImageData(...)` if you already have a bitmap.
-   `Job` (from `src/job.mjs`): Validates media width/resolution, supports auto-cut, chain printing, and special tape flags.
-   Printers (from `src/printers.mjs`): Implements the Brother raster protocol with PackBits compression.
-   Backends:
    -   `WebUSBBackend` for USB printer class devices.
    -   `WebBluetoothBackend` for BLE devices when you supply the service/characteristic UUIDs and enable notifications.

#### Notes

-   WebUSB/WebBluetooth require a secure context (https or localhost) and a user gesture to request devices/ports.
-   Fonts come from whatever your page loads; adjust the CSS font stack you pass into `TextItem`.
-   If you need to debug output, use `bitmapToImageData` from `src/page.mjs` to visualize the raster data in a canvas.
