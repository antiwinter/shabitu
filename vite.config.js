import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|avif)$/i
const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
}
const collator = new Intl.Collator('zh', { numeric: true })

function walk(dir, base = '') {
  let out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const rel = base ? `${base}/${entry.name}` : entry.name
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out = out.concat(walk(full, rel))
    else if (entry.isFile() && IMAGE_RE.test(entry.name)) out.push(rel)
  }
  return out
}

function safeResolve(rel) {
  const full = path.resolve(DATA_DIR, rel)
  if (full !== DATA_DIR && !full.startsWith(DATA_DIR + path.sep)) return null
  return full
}

function dataPlugin() {
  return {
    name: 'shabitu-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, 'http://localhost')
        try {
          if (url.pathname === '/api/datasets') {
            const names = fs
              .readdirSync(DATA_DIR, { withFileTypes: true })
              .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
              .map((e) => e.name)
              .sort((a, b) => collator.compare(a, b))
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify(names))
          }
          if (url.pathname === '/api/images') {
            const name = url.searchParams.get('dataset') || ''
            const dir = safeResolve(name)
            if (!name || !dir || !fs.existsSync(dir)) {
              res.statusCode = 404
              return res.end('[]')
            }
            const files = walk(dir)
              .sort((a, b) => collator.compare(a, b))
              .map((f) => `${name}/${f}`)
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify(files))
          }
          if (url.pathname.startsWith('/data/')) {
            const rel = decodeURIComponent(url.pathname.slice('/data/'.length))
            const full = safeResolve(rel)
            if (!full || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
              res.statusCode = 404
              return res.end('Not found')
            }
            res.setHeader(
              'Content-Type',
              MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
            )
            return fs.createReadStream(full).pipe(res)
          }
        } catch (err) {
          res.statusCode = 500
          return res.end(String(err))
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), dataPlugin()],
})
