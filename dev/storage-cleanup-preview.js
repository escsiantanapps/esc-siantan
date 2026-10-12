import { loadEnv } from 'vite'

function reply(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

export function storageCleanupPreview() {
  return {
    name: 'storage-cleanup-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (new URL(req.url || '/', 'http://localhost').pathname !== '/api/storage-cleanup') return next()
        if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed' })

        const chunks = []
        let size = 0
        for await (const chunk of req) {
          size += chunk.length
          if (size > 16_384) return reply(res, 413, { error: 'Permintaan terlalu besar.' })
          chunks.push(chunk)
        }
        let body
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
        catch { return reply(res, 400, { error: 'Permintaan tidak valid.' }) }
        if (body?.action !== 'scan') {
          return reply(res, 403, { error: 'Penghapusan tidak aktif di localhost.' })
        }

        if (server.config.envFile === false) {
          return reply(res, 503, { error: 'Pratinjau Storage tidak tersedia pada server tes.' })
        }
        const env = loadEnv(server.config.mode, server.config.root, '')
        const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
        const key = env.SUPABASE_SERVICE_ROLE_KEY
        if (!url || !key) return reply(res, 500, { error: 'Konfigurasi server lokal belum lengkap.' })
        process.env.SUPABASE_URL = url
        process.env.SUPABASE_SERVICE_ROLE_KEY = key
        const { default: handler } = await import('../api/_handlers/storage-cleanup.js')
        const response = {
          setHeader(name, value) { res.setHeader(name, value); return this },
          status(status) { res.statusCode = status; return this },
          json(payload) { reply(res, res.statusCode || 200, payload); return this },
        }
        try { await handler(Object.assign(req, { body }), response) }
        catch {
          reply(res, 500, { error: 'Gagal memeriksa file Storage.' })
        }
      })
    },
  }
}
