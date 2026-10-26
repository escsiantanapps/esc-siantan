import { checkRateLimit } from '../_lib/rate-limit.js'

const BUCKET = 'task-files'
const FOLDER = 'news'
const PAGE = 1000
const MAX_SCAN = 10000
const MAX_DELETE = 20
const MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000
const RESPONSE_FOLDER = 'responses'
const RESPONSE_BATCH = 10

async function listFiles(admin, root) {
  const files = []
  const folders = [root]
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

async function listNewsFiles(admin) { return listFiles(admin, FOLDER) }

async function listJsonRows(admin, table, fields, id) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from(table).select(fields).order(id).range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

function responsePath(value) {
  if (typeof value !== 'string') return null
  const marker = '/storage/v1/object/public/task-files/'
  const index = value.indexOf(marker)
  if (index < 0) return null
  try {
    const path = decodeURIComponent(value.slice(index + marker.length).split(/[?#]/)[0])
    return path.startsWith(`${RESPONSE_FOLDER}/`) ? path : null
  } catch { return null }
}

function pathsIn(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach(item => pathsIn(item, found))
  else if (value && typeof value === 'object') Object.values(value).forEach(item => pathsIn(item, found))
  else {
    const path = responsePath(value)
    if (path) found.add(path)
  }
  return found
}

function withoutPath(value, path) {
  if (Array.isArray(value)) return value.map(item => withoutPath(item, path))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withoutPath(item, path)]))
  }
  return responsePath(value) === path ? null : value
}

export async function scanResponseFiles(admin, now = Date.now()) {
  const [files, responses, prerequisites] = await Promise.all([
    listFiles(admin, RESPONSE_FOLDER),
    listJsonRows(admin, 'form_responses', 'response_id, volunteer_id, form_id, data_json', 'response_id'),
    listJsonRows(admin, 'registration_prerequisites', 'id, data_json', 'id'),
  ])
  const prerequisitePaths = new Set(prerequisites.flatMap(row => [...pathsIn(row.data_json)]))
  const references = new Map()
  for (const row of responses) {
    for (const path of pathsIn(row.data_json)) {
      const refs = references.get(path) || []
      refs.push(row)
      references.set(path, refs)
    }
  }
  // File dengan referensi bersama tidak dihapus otomatis agar prasyarat dan
  // respons lain tetap utuh; satu unggahan normalnya hanya punya satu respons.
  const candidates = files.filter(file => {
    if (file.size <= 0 || prerequisitePaths.has(file.path)) return false
    const refs = references.get(file.path) || []
    if (refs.length === 1) return true
    if (refs.length > 1) return false
    const created = Date.parse(file.createdAt || '')
    return Number.isFinite(created) && now - created >= MIN_AGE_MS
  })
    .map(file => {
      const row = references.get(file.path)?.[0]
      return { ...file, orphan: !row, responseId: row?.response_id || null,
        userId: row?.volunteer_id || null, formId: row?.form_id || null }
    })
    .sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
  return { candidates, scannedFiles: files.length, references }
}

export async function deleteResponseFiles(admin, paths, caller, now = Date.now()) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > RESPONSE_BATCH
    || new Set(paths).size !== paths.length
    || paths.some(path => typeof path !== 'string' || path.length > 500
      || !/^responses\/[^/.]+\/[^/]+$/.test(path))) {
    return { status: 400, body: { error: 'Daftar lampiran tidak valid.' } }
  }
  const { candidates, references } = await scanResponseFiles(admin, now)
  const byPath = new Map(candidates.map(file => [file.path, file]))
  if (paths.some(path => !byPath.has(path))) {
    return { status: 409, body: { error: 'Daftar lampiran berubah. Periksa ulang sebelum menghapus.' } }
  }
  const deleted = []
  const failed = []
  const auditFailed = []
  const restoreFailed = []
  for (const path of paths) {
    const row = references.get(path)?.[0]
    if (!row) {
      const { error: removeError } = await admin.storage.from(BUCKET).remove([path])
      if (removeError) { failed.push(path); continue }
      deleted.push(path)
      const { error: auditError } = await admin.from('audit_log').insert({
        actor_user_id: caller.user_id, actor_name: caller.name, actor_role: caller.role,
        action: 'DELETE', table_name: 'storage.objects', record_id: path,
        old_data: { attachment_path: path, attachment_bytes: byPath.get(path).size, orphan: true },
      })
      if (auditError) { console.error('[storage-cleanup] gagal mencatat audit', auditError); auditFailed.push(path) }
      continue
    }
    const originalJson = row.data_json
    const nextJson = withoutPath(originalJson, path)
    const { data: updated, error: updateError } = await admin.from('form_responses')
      .update({ data_json: nextJson }).eq('response_id', row.response_id)
      .eq('data_json', JSON.stringify(originalJson)).select('response_id')
    if (updateError || updated?.length !== 1) { failed.push(path); continue }

    const { error: removeError } = await admin.storage.from(BUCKET).remove([path])
    if (removeError) {
      // File masih ada; pulihkan tautan agar jawaban tidak kehilangan lampiran.
      const { data: restored, error: restoreError } = await admin.from('form_responses')
        .update({ data_json: originalJson }).eq('response_id', row.response_id)
        .eq('data_json', JSON.stringify(nextJson)).select('response_id')
      if (restoreError || restored?.length !== 1) {
        console.error('[storage-cleanup] gagal memulihkan referensi', row.response_id, restoreError)
        restoreFailed.push(path)
      }
      failed.push(path)
      continue
    }
    deleted.push(path)
    const { error: auditError } = await admin.from('audit_log').insert({
      actor_user_id: caller.user_id, actor_name: caller.name, actor_role: caller.role,
      action: 'UPDATE', table_name: 'form_responses', record_id: row.response_id,
      changed_fields: ['data_json'],
      old_data: { attachment_path: path, attachment_bytes: byPath.get(path).size },
      new_data: { attachment_removed: true },
    })
    if (auditError) { console.error('[storage-cleanup] gagal mencatat audit', auditError); auditFailed.push(path) }
  }
  return { status: 200, body: { deleted, failed, auditFailed, restoreFailed,
    freedBytes: deleted.reduce((sum, path) => sum + byPath.get(path).size, 0) } }
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
      .select('user_id, name, role, status').eq('auth_id', authData.user.id).maybeSingle()
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
    if (body.action === 'scan-responses') {
      const result = await scanResponseFiles(admin)
      return res.status(200).json({
        files: result.candidates.slice(0, 200),
        candidateCount: result.candidates.length,
        candidateBytes: result.candidates.reduce((sum, file) => sum + file.size, 0),
        scannedFiles: result.scannedFiles,
      })
    }
    if (body.action === 'delete-response-files') {
      const result = await deleteResponseFiles(admin, body.paths, caller)
      return res.status(result.status).json(result.body)
    }
    return res.status(400).json({ error: 'Aksi tidak valid.' })
  } catch (error) {
    console.error('[storage-cleanup]', error)
    return res.status(500).json({ error: 'Gagal memeriksa atau menghapus file Storage.' })
  }
}
