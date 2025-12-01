import QRCode from 'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/+esm'
import {
    Label,
    Job,
    Media,
    Resolution,
    P700,
    P750W,
    E500,
    E550W,
    H500,
    WebUSBBackend,
    WebBluetoothBackend
} from '../../src/index.mjs'

const els = {
    items: document.querySelector('[data-items]'),
    addText: document.querySelector('[data-add-text]'),
    addQr: document.querySelector('[data-add-qr]'),
    print: document.querySelector('[data-print]'),
    status: document.querySelector('[data-status]'),
    mode: document.querySelector('[data-mode]'),
    media: document.querySelector('[data-media]'),
    resolution: document.querySelector('[data-resolution]'),
    mediaLength: document.querySelector('[data-media-length]'),
    printer: document.querySelector('[data-printer]'),
    preview: document.querySelector('[data-preview]'),
    dimensions: document.querySelector('[data-dimensions]'),
    bleFields: document.querySelector('.ble-fields'),
    bleService: document.querySelector('[data-ble-service]'),
    bleWrite: document.querySelector('[data-ble-write]'),
    bleNotify: document.querySelector('[data-ble-notify]'),
    bleFilter: document.querySelector('[data-ble-filter]')
}

const printerMap = { P700, P750W, E500, E550W, H500 }

let idCounter = 1
const nextId = () => `item-${idCounter++}`

const defaultState = {
    media: 'W24',
    mediaLengthMm: null,
    resolution: 'LOW',
    backend: 'usb',
    printer: 'P700',
    ble: {
        serviceUuid: '0000xxxx-0000-1000-8000-00805f9b34fb',
        writeCharacteristicUuid: '0000yyyy-0000-1000-8000-00805f9b34fb',
        notifyCharacteristicUuid: '0000zzzz-0000-1000-8000-00805f9b34fb',
        namePrefix: 'PT-'
    },
    items: [
        { id: nextId(), type: 'text', text: 'Network Port', fontFamily: 'Inter', fontSize: 32, height: 46, xOffset: 4 },
        { id: nextId(), type: 'text', text: 'Room: 1.23', fontFamily: 'Inter', fontSize: 22, height: 28, xOffset: 4 },
        { id: nextId(), type: 'text', text: 'Jack: A12', fontFamily: 'monospace', fontSize: 22, height: 28, xOffset: 4 },
        { id: nextId(), type: 'qr', data: 'https://example.com/device/port-24', size: 180, height: 190, xOffset: 4 }
    ]
}

let state = JSON.parse(JSON.stringify(defaultState))

function setStatus(text, type = 'info') {
    els.status.textContent = text
    els.status.dataset.type = type
}

function populateSelects() {
    Object.values(Media)
        .filter((m) => m.id && m.id.startsWith('W'))
        .forEach((media) => {
            const opt = document.createElement('option')
            opt.value = media.id
            opt.textContent = `${media.id} (${media.width}mm, area ${media.printArea} dots)`
            if (media.id === state.media) opt.selected = true
            els.media.appendChild(opt)
        })

    Object.values(Resolution).forEach((res) => {
        const opt = document.createElement('option')
        opt.value = res.id
        opt.textContent = `${res.id} (${res.dots[0]}x${res.dots[1]} dpi)`
        if (res.id === state.resolution) opt.selected = true
        els.resolution.appendChild(opt)
    })

    if (state.mediaLengthMm) {
        els.mediaLength.value = state.mediaLengthMm
    }
}

function slider(label, value, min, max, step = 1, onInput) {
    const wrap = document.createElement('div')
    wrap.className = 'slider'
    const top = document.createElement('div')
    top.className = 'small'
    top.textContent = `${label}: ${value}`
    const input = document.createElement('input')
    input.type = 'range'
    input.min = min
    input.max = max
    input.step = step
    input.value = value
    input.addEventListener('input', (e) => {
        const v = Number(e.target.value)
        top.textContent = `${label}: ${v}`
        onInput(v)
    })
    wrap.append(top, input)
    return wrap
}

function renderItemsList() {
    els.items.innerHTML = ''
    state.items.forEach((item, index) => {
        const card = document.createElement('div')
        card.className = 'item-card'
        card.draggable = false
        card.dataset.index = index.toString()

        const meta = document.createElement('div')
        meta.className = 'item-meta'
        const tag = document.createElement('div')
        tag.className = 'tag'
        tag.textContent = item.type === 'text' ? 'Text' : 'QR'
        const handle = document.createElement('div')
        handle.className = 'handle'
        handle.textContent = '⇅ drag'
        handle.draggable = true
        handle.dataset.index = index.toString()
        meta.append(tag, handle)

        const contentWrap = document.createElement('div')
        contentWrap.className = 'field'
        const label = document.createElement('label')
        label.textContent = item.type === 'text' ? 'Text' : 'QR content'
        const input = item.type === 'text' ? document.createElement('textarea') : document.createElement('input')
        input.value = item.type === 'text' ? item.text : item.data
        input.rows = 2
        input.addEventListener('input', (e) => {
            if (item.type === 'text') {
                item.text = e.target.value
            } else {
                item.data = e.target.value
                item._qrCache = null
            }
            renderPreview()
        })
        contentWrap.append(label, input)

        const controls = document.createElement('div')
        controls.className = 'controls'

        const heightCtrl = slider('Height', item.height, 20, 280, 1, (v) => {
            item.height = v
            renderPreview()
        })
        controls.appendChild(heightCtrl)

        const offsetCtrl = slider('X offset', item.xOffset ?? 0, 0, 50, 1, (v) => {
            item.xOffset = v
            renderPreview()
        })
        controls.appendChild(offsetCtrl)

        if (item.type === 'text') {
            const fontCtrl = document.createElement('div')
            fontCtrl.className = 'field'
            const fontLabel = document.createElement('label')
            fontLabel.textContent = 'Font family'
            const fontInput = document.createElement('input')
            fontInput.value = item.fontFamily
            fontInput.addEventListener('input', (e) => {
                item.fontFamily = e.target.value
                renderPreview()
            })
            fontCtrl.append(fontLabel, fontInput)

            const sizeCtrl = slider('Font size', item.fontSize, 10, 64, 1, (v) => {
                item.fontSize = v
                renderPreview()
            })

            controls.append(fontCtrl, sizeCtrl)
        } else {
            const sizeCtrl = slider('QR size', item.size, 60, 240, 4, async (v) => {
                item.size = v
                item._qrCache = null
                renderPreview()
            })
            controls.append(sizeCtrl)
        }

        const remove = document.createElement('button')
        remove.textContent = 'Remove'
        remove.addEventListener('click', () => {
            state.items.splice(index, 1)
            renderItemsList()
            renderPreview()
        })

        card.append(meta, contentWrap, controls, remove)
        card.querySelectorAll('input, textarea, select').forEach((el) =>
            el.addEventListener('dragstart', (ev) => {
                ev.stopPropagation()
                ev.preventDefault()
            })
        )
        els.items.appendChild(card)
    })
}

function addTextItem() {
    state.items.push({
        id: nextId(),
        type: 'text',
        text: 'New text',
        fontFamily: 'Inter',
        fontSize: 24,
        height: 40,
        xOffset: 4
    })
    renderItemsList()
    renderPreview()
}

function addQrItem() {
    state.items.push({
        id: nextId(),
        type: 'qr',
        data: 'https://example.com',
        size: 120,
        height: 130,
        xOffset: 4
    })
    renderItemsList()
    renderPreview()
}

function bindDrag() {
    let fromIndex = null
    els.items.addEventListener('dragstart', (e) => {
        const handle = e.target.closest('.handle')
        if (!handle) return
        const card = handle.closest('.item-card')
        if (!card) return
        fromIndex = Number(card.dataset.index)
        e.dataTransfer.effectAllowed = 'move'
    })
    els.items.addEventListener('dragover', (e) => {
        if (fromIndex === null) return
        e.preventDefault()
    })
    els.items.addEventListener('drop', (e) => {
        e.preventDefault()
        const card = e.target.closest('.item-card')
        if (!card || fromIndex === null) return
        const toIndex = Number(card.dataset.index)
        if (toIndex === fromIndex) {
            fromIndex = null
            return
        }
        const [moved] = state.items.splice(fromIndex, 1)
        state.items.splice(toIndex, 0, moved)
        fromIndex = null
        renderItemsList()
        renderPreview()
    })
}

async function buildQrCanvas(data, size) {
    const canvas = document.createElement('canvas')
    await QRCode.toCanvas(canvas, data || '', { errorCorrectionLevel: 'M', margin: 0, width: size })
    return canvas
}

async function buildCanvasFromState() {
    const media = Media[state.media] || Media.W24
    const width = media.printArea || 128
    const totalHeight = state.items.reduce((sum, item) => sum + item.height, 0)
    const res = Resolution[state.resolution] || Resolution.LOW
    const minHeight = res.minLength
    const forcedHeightDots = state.mediaLengthMm
        ? Math.max(minHeight, Math.round((state.mediaLengthMm / 25.4) * res.dots[1]))
        : null
    const height = forcedHeightDots ? Math.max(forcedHeightDots, totalHeight) : Math.max(totalHeight, minHeight)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#000'

    let y = 0
    for (const item of state.items) {
        if (item.type === 'text') {
            ctx.font = `${item.fontSize}px ${item.fontFamily || 'sans-serif'}`
            ctx.textBaseline = 'middle'
            ctx.fillText(item.text || '', item.xOffset || 0, y + item.height / 2)
        } else {
            if (!item._qrCache || item._qrCacheKey !== `${item.data}-${item.size}`) {
                item._qrCache = await buildQrCanvas(item.data, item.size)
                item._qrCacheKey = `${item.data}-${item.size}`
            }
            const qrY = y + Math.max(0, (item.height - item.size) / 2)
            ctx.drawImage(item._qrCache, item.xOffset || 0, qrY, item.size, item.size)
        }
        y += item.height
    }

    return { canvas, width, height }
}

let previewBusy = false
let previewQueued = false
async function renderPreview() {
    if (previewBusy) {
        previewQueued = true
        return
    }
    previewBusy = true
    previewQueued = false
    try {
        const { canvas, width, height } = await buildCanvasFromState()
        const ctx = els.preview.getContext('2d')
        els.preview.width = width
        els.preview.height = height
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(canvas, 0, 0)
        els.dimensions.textContent = `${state.media} • ${width} dots wide • ${height} dots tall`
    } catch (err) {
        console.error(err)
        setStatus('Preview failed. Check your inputs.', 'error')
    } finally {
        previewBusy = false
        if (previewQueued) {
            renderPreview()
        }
    }
}

function toggleBleFields() {
    const isBle = els.mode.value === 'ble'
    els.bleFields.hidden = !isBle
}

function restoreBleState() {
    els.bleService.value = state.ble.serviceUuid
    els.bleWrite.value = state.ble.writeCharacteristicUuid
    els.bleNotify.value = state.ble.notifyCharacteristicUuid
    els.bleFilter.value = state.ble.namePrefix
}

async function connectBackend() {
    const mode = state.backend
    if (mode === 'usb') {
        return WebUSBBackend.requestDevice({ filters: [{ classCode: 7 }] })
    }
    if (mode === 'ble') {
        return WebBluetoothBackend.requestDevice({
            serviceUuid: state.ble.serviceUuid,
            writeCharacteristicUuid: state.ble.writeCharacteristicUuid,
            notifyCharacteristicUuid: state.ble.notifyCharacteristicUuid || undefined,
            filters: state.ble.namePrefix ? [{ namePrefix: state.ble.namePrefix }] : undefined
        })
    }
    throw new Error('Unknown backend mode')
}

async function doPrint() {
    setStatus('Rendering label...', 'info')
    els.print.disabled = true
    try {
        const { canvas } = await buildCanvasFromState()
        const res = Resolution[state.resolution] || Resolution.LOW
        const label = new Label(res, canvas)
        const job = new Job(Media[state.media] || Media.W24)
        job.addPage(label)

        setStatus(`Requesting ${state.backend.toUpperCase()} device...`, 'info')
        const backend = await connectBackend()
        const PrinterClass = printerMap[state.printer] || P700
        const printer = new PrinterClass(backend)
        await printer.print(job)
        setStatus('Print job sent.', 'success')
    } catch (err) {
        console.error(err)
        setStatus(err?.message || 'Failed to print', 'error')
    } finally {
        els.print.disabled = false
    }
}

function bindEvents() {
    els.addText.addEventListener('click', addTextItem)
    els.addQr.addEventListener('click', addQrItem)
    els.print.addEventListener('click', doPrint)

    els.mode.addEventListener('change', () => {
        state.backend = els.mode.value
        toggleBleFields()
    })
    els.media.addEventListener('change', () => {
        state.media = els.media.value
        renderPreview()
    })
    els.mediaLength.addEventListener('input', (e) => {
        const val = e.target.value.trim()
        state.mediaLengthMm = val ? Number(val) : null
        renderPreview()
    })
    els.resolution.addEventListener('change', () => {
        state.resolution = els.resolution.value
    })
    els.printer.addEventListener('change', () => {
        state.printer = els.printer.value
    })

    els.bleService.addEventListener('input', (e) => (state.ble.serviceUuid = e.target.value))
    els.bleWrite.addEventListener('input', (e) => (state.ble.writeCharacteristicUuid = e.target.value))
    els.bleNotify.addEventListener('input', (e) => (state.ble.notifyCharacteristicUuid = e.target.value))
    els.bleFilter.addEventListener('input', (e) => (state.ble.namePrefix = e.target.value))
}

function init() {
    populateSelects()
    restoreBleState()
    els.mode.value = state.backend
    els.printer.value = state.printer
    toggleBleFields()
    renderItemsList()
    bindDrag()
    bindEvents()
    renderPreview()
}

init()
