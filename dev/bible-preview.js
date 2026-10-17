import { loadEnv } from 'vite'

function reply(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

export function biblePreview() {
  return {
    name: 'bible-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (new URL(req.url || '/', 'http://localhost').pathname !== '/api/bible-chapter') return next()
        if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed' })

        const chunks = []
        let size = 0
        for await (const chunk of req) {
          size += chunk.length
          if (size > 1024) return reply(res, 413, { error: 'Permintaan terlalu besar.' })
          chunks.push(chunk)
        }
        let body
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
        catch { return reply(res, 400, { error: 'Permintaan tidak valid.' }) }

        if (server.config.envFile === false) return reply(res, 503, { error: 'Pratinjau Alkitab tidak tersedia pada server tes.' })
        const env = loadEnv(server.config.mode, server.config.root, '')
        const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
        const key = env.SUPABASE_SERVICE_ROLE_KEY
        if (!url || !key) return reply(res, 500, { error: 'Konfigurasi server lokal belum lengkap.' })
        process.env.SUPABASE_URL = url
        process.env.SUPABASE_SERVICE_ROLE_KEY = key

        const { default: handler } = await import('../api/bible-chapter.js')
        const response = {
          setHeader(name, value) { res.setHeader(name, value); return this },
          status(status) { res.statusCode = status; return this },
          json(payload) { reply(res, res.statusCode || 200, payload); return this },
        }
        try { await handler(Object.assign(req, { body }), response) }
        catch { reply(res, 500, { error: 'Gagal memuat bacaan.' }) }
      })
    },
  }
}
