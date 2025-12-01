import express from 'express'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const port = Number(process.env.PORT) || 3001

app.use(express.static(join(__dirname, '..')))

app.get('/', (_req, res) => {
    res.redirect('/examples/')
})

const server = app.listen(port, () => {
    console.log(`Labelprinterkit demo running at http://localhost:${port}/examples/`)
})

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Set PORT env var to a free port, e.g. PORT=3001 npm start`)
        process.exit(1)
    }
    throw err
})
