import express from 'express'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const app = express()
const port = Number(process.env.PORT) || 3000

app.use('/node_modules', express.static(join(projectRoot, 'node_modules')))
app.use(express.static(__dirname))

app.get(['/src', '/src/'], (_req, res) => {
    res.redirect('/')
})

const server = app.listen(port, () => {
    console.log(`Labelprinter app running at http://localhost:${port}/`)
})

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Set PORT env var to a free port, e.g. PORT=3001 npm start`)
        process.exit(1)
    }
    throw err
})
