import { checkRateLimit } from '../_lib/rate-limit.js'

const BUCKET = 'task-files'
const FOLDER = 'news'
const PAGE = 1000
const MAX_SCAN = 10000
const MAX_DELETE = 20
const MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000

async function listNewsFiles(admin) {
  const files = []
  const folders = [FOLDER]
  while (folders.length) {
    const folder = folders.pop()
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await admin.storage.from(BUCKET).list(folder, {
        limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw error
      for (const item of data || []) {
        const path = `${folder}/${item.name}`
        if (item.id === null) folders.push(path)
        else files.push({ path, size: Number(item.metadata?.size) || 0, createdAt: item.created_at })
      }
      if (files.length + folders.length > MAX_SCAN) throw new Error('Batas pemeriksaan file terlampaui.')
      if (!data || data.length < PAGE) break
    }
  }
  return files
}

async function listNewsRows(admin) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from('news').select('*').order('news_id').range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

export function isReferencedByNews(path, serializedRows) {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return serializedRows.some(row => row.includes(path) || row.includes(encoded))
}

export async function scanUnusedNews(admin, now = Date.now()) {
  const [files, newsRows] = await Promise.all([listNewsFiles(admin), listNewsRows(admin)])
  const references = newsRows.map(row => JSON.stringify(row))
  const candidates = files.filter(file => {
    const created = Date.parse(file.createdAt || '')
    return Number.isFinite(created) && now - created >= MIN_AGE_MS
      && !isReferencedByNews(file.path, references)
  }).sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
  return { candidates, scannedFiles: files.length }
}

export async function deleteUnusedNews(admin, paths, now = Date.now()) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > MAX_DELETE
    || new Set(paths).size !== paths.length
    || paths.some(path => typeof path !== 'string' || !/^news\/(?:[^./][^/]*\/)*[^./][^/]*$/.test(path))) {
    return { status: 400, body: { error: 'Daftar file tidak valid.' } }
  }
  const { candidates } = await scanUnusedNews(admin, now)
  const byPath = new Map(candidates.map(file => [file.path, file]))
  if (paths.some(path => !byPath.has(path))) {
    return { status: 409, body: { error: 'Daftar kandidat berubah. Periksa ulang sebelum menghapus.' } }
  }
  const deleted = []
  const failed = []
  for (const path of paths) {
    const { error } = await admin.storage.from(BUCKET).remove([path])
    if (error) failed.push(path)
    else deleted.push(path)
  }
  return { status: 200, body: {
    deleted, failed,
    freedBytes: deleted.reduce((sum, path) => sum + byPath.get(path).size, 0),
  } }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    if (checkRateLimit(req, res, { max: 10, windowMs: 60_000, endpoint: 'storage-cleanup' })) return
    const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    if (!url || !key) return res.status(500).json({ error: 'Konfigurasi server belum lengkap.' })

    const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const { createClient } = await import('@supabase/supabase-js')
    const admin = createClient(url, key, { auth: { persistSession: false } })
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData?.user) return res.status(401).json({ error: 'Unauthorized' })
    const { data: caller, error: callerError } = await admin.from('users')
      .select('role, status').eq('auth_id', authData.user.id).maybeSingle()
    if (callerError) throw callerError
    if (caller?.role !== 'Super Admin' || caller.status !== 'Aktif') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    let body
    try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}) }
    catch { return res.status(400).json({ error: 'Permintaan tidak valid.' }) }
    res.setHeader('Cache-Control', 'no-store')
    if (body.action === 'scan') {
      const result = await scanUnusedNews(admin)
      return res.status(200).json({
        files: result.candidates.slice(0, 200),
        candidateCount: result.candidates.length,
        candidateBytes: result.candidates.reduce((sum, file) => sum + file.size, 0),
        scannedFiles: result.scannedFiles,
      })
    }
    if (body.action === 'delete') {
      const result = await deleteUnusedNews(admin, body.paths)
      return res.status(result.status).json(result.body)
    }
    return res.status(400).json({ error: 'Aksi tidak valid.' })
  } catch (error) {
    console.error('[storage-cleanup]', error)
    return res.status(500).json({ error: 'Gagal memeriksa atau menghapus file Storage.' })
  }
}
