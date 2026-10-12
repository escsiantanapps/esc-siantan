// Cron harian: backup OTOMATIS seluruh tabel jemaat ke bucket privat `backups`.
// Melengkapi backup manual in-app (AdminBackupPage) — supaya ada arsip terjadwal
// tanpa admin harus ingat menekan tombol. Dilindungi CRON_SECRET (fail-closed).
//
// PENTING (keputusan operator): arsip disimpan di Supabase Storage bucket PRIVAT
// `backups/` (JSON fidelitas penuh, sama seperti tombol "Unduh JSON"). Ini MELINDUNGI
// dari DELETE massal / drift / salah edit — risiko terbesar app. TAPI karena satu
// project dengan DB-nya, ini BUKAN pelindung bencana total (project hilang = arsip
// ikut hilang). Untuk itu tetap jalankan skrip lokal `scripts/backup-esc.mjs`
// berkala agar ada salinan OFFLINE di luar Supabase.
//
// Prasyarat manual (sekali): buat bucket PRIVAT bernama `backups` di Supabase
// Dashboard > Storage. Tanpa itu upload gagal (dilaporkan di response, tidak crash).
export const config = { runtime: 'nodejs' }

// Sumber tunggal daftar tabel (dipakai bareng halaman in-app & skrip lokal).
import { BACKUP_TABLES } from '../../src/lib/backupTables.js'
import { createHash } from 'node:crypto'
import { isAllowedResponseArchiveCutoff, responseSnapshotPayload } from '../../src/lib/archiveRetention.js'

const KEEP = 30 // simpan 30 arsip harian terakhir (rotasi otomatis)
const PAGE = 1000 // batas baris per request PostgREST; tabel besar dipaginasi
const RESPONSE_BATCH_SIZE = 100 // Hindari URL PostgREST terlalu panjang saat arsip ribuan respons.

function chunks(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))
}

function responseFilePaths(value, paths = new Set()) {
  if (Array.isArray(value)) value.forEach(v => responseFilePaths(v, paths))
  else if (value && typeof value === 'object') Object.values(value).forEach(v => responseFilePaths(v, paths))
  else if (typeof value === 'string') {
    const marker = '/storage/v1/object/public/task-files/'
    const index = value.indexOf(marker)
    if (index >= 0) {
      const path = decodeURIComponent(value.slice(index + marker.length).split('?')[0])
      if (path.startsWith('responses/')) paths.add(path)
    }
  }
  return paths
}

// Jalur admin ini digabung dengan endpoint cron agar paket Hobby tetap di bawah
// batas 12 fungsi. Ia tetap memakai token login Super Admin, bukan CRON_SECRET.
async function handleColdResponses(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { createClient } = await import('@supabase/supabase-js')
  const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Konfigurasi server belum lengkap.' })
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const { data: authData, error: authError } = await admin.auth.getUser(token)
  if (authError || !authData?.user) return res.status(401).json({ error: 'Unauthorized' })
  const { data: caller } = await admin.from('users').select('user_id, role, status').eq('auth_id', authData.user.id).maybeSingle()
  if (!caller || caller.role !== 'Super Admin' || caller.status !== 'Aktif') return res.status(403).json({ error: 'Forbidden' })

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const { action, archiveId } = body
  if (!/^COLD-[A-Za-z0-9-]{12,100}$/.test(String(archiveId || ''))) {
    return res.status(400).json({ error: 'ID arsip tidak valid.' })
  }

  if (action === 'record') {
    const { manifest } = body
    if (!manifest || !Array.isArray(manifest.responseIds) || manifest.responseIds.length === 0 || manifest.responseIds.length > 250) {
      return res.status(400).json({ error: 'Manifest arsip tidak valid.' })
    }
    if (!isAllowedResponseArchiveCutoff(manifest.cutoffDate)) {
      return res.status(400).json({ error: 'Respons harus berusia lebih dari 6 bulan untuk diarsipkan.' })
    }
    if (!/^[a-f0-9]{64}$/i.test(String(manifest.sha256 || ''))
      || !/^[a-f0-9]{64}$/i.test(String(manifest.responseSha256 || ''))) {
      return res.status(400).json({ error: 'Checksum arsip tidak valid.' })
    }
    const cleanIds = [...new Set(manifest.responseIds)].filter(id => typeof id === 'string' && id.length <= 100)
    const cleanFiles = [...new Set(Array.isArray(manifest.filePaths) ? manifest.filePaths : [])]
      .filter(path => typeof path === 'string' && path.startsWith('responses/') && path.length <= 500)
    if (cleanIds.length !== manifest.responseIds.length) return res.status(400).json({ error: 'Daftar respons tidak valid.' })
    const { data: existing } = await admin.from('cold_archives').select('status').eq('archive_id', archiveId).maybeSingle()
    if (existing?.status === 'Dipindahkan') return res.status(409).json({ error: 'Arsip yang sudah dipindahkan tidak dapat dicatat ulang.' })
    const { error } = await admin.from('cold_archives').upsert({
      archive_id: archiveId,
      archive_type: 'form_responses',
      cutoff_date: manifest.cutoffDate,
      response_ids: cleanIds,
      file_paths: cleanFiles,
      local_filename: String(manifest.filename || '').slice(0, 200),
      sha256: `${manifest.sha256}:${manifest.responseSha256}`,
      status: 'Siap Dihapus',
      created_by: caller.user_id,
    }, { onConflict: 'archive_id' })
    if (error) throw error
    return res.status(200).json({ ok: true })
  }

  if (action === 'purge') {
    const { data: archive, error } = await admin.from('cold_archives').select('*').eq('archive_id', archiveId).maybeSingle()
    if (error) throw error
    if (!archive || archive.status !== 'Siap Dihapus') return res.status(409).json({ error: 'Arsip belum siap dihapus atau sudah diproses.' })
    const [zipHash, responseHash] = String(archive.sha256 || '').split(':')
    if (!isAllowedResponseArchiveCutoff(archive.cutoff_date)
      || !/^[a-f0-9]{64}$/i.test(zipHash || '')
      || !/^[a-f0-9]{64}$/i.test(responseHash || '')
      || zipHash !== body.verifiedSha256) {
      return res.status(409).json({ error: 'Arsip lokal belum terverifikasi atau batas enam bulan belum terpenuhi.' })
    }
    const ids = Array.isArray(archive.response_ids) ? archive.response_ids : []
    const cutoff = `${archive.cutoff_date}T00:00:00+07:00`
    const rows = []
    for (const responseIds of chunks(ids, RESPONSE_BATCH_SIZE)) {
      const { data, error: rowsError } = await admin.from('form_responses')
        .select('response_id, form_id, volunteer_id, submitted_at, data_json').in('response_id', responseIds)
      if (rowsError) throw rowsError
      rows.push(...(data || []))
    }
    if (rows.length !== ids.length
      || createHash('sha256').update(responseSnapshotPayload(rows)).digest('hex') !== responseHash) {
      return res.status(409).json({ error: 'Respons berubah sejak arsip dibuat. Buat arsip ulang.' })
    }
    if (rows.some(row => row.submitted_at >= cutoff)) return res.status(409).json({ error: 'Manifest memuat respons yang belum melewati tanggal batas.' })
    const paths = [...new Set(rows.flatMap(row => [...responseFilePaths(row.data_json)]))]
    const archivedPaths = new Set(Array.isArray(archive.file_paths) ? archive.file_paths : [])
    if (paths.some(path => !archivedPaths.has(path))) {
      return res.status(409).json({ error: 'Lampiran respons berubah sejak arsip dibuat. Buat arsip ulang.' })
    }
    const sharedPaths = new Set()
    if (paths.length) {
      const pathSet = new Set(paths)
      const archivedIds = new Set(ids)
      for (let from = 0; ; from += PAGE) {
        const { data, error: refsError } = await admin.from('form_responses')
          .select('response_id, data_json').order('response_id').range(from, from + PAGE - 1)
        if (refsError) throw refsError
        for (const row of data || []) {
          if (archivedIds.has(row.response_id)) continue
          for (const path of responseFilePaths(row.data_json)) {
            if (pathSet.has(path)) sharedPaths.add(path)
          }
        }
        if (!data || data.length < PAGE) break
      }
    }

    // Validasi seluruh batch lebih dahulu. Setelah lolos, hapus bertahap agar
    // query PostgREST tidak melewati batas panjang URL untuk manifest besar.
    for (const responseIds of chunks(rows.map(row => row.response_id), RESPONSE_BATCH_SIZE)) {
      const { error: deleteError } = await admin.from('form_responses').delete().in('response_id', responseIds)
      if (deleteError) throw deleteError
    }

    let fileErrors = 0
    const removablePaths = paths.filter(path => !sharedPaths.has(path))
    for (const filePaths of chunks(removablePaths, RESPONSE_BATCH_SIZE)) {
      const { error: storageError } = await admin.storage.from('task-files').remove(filePaths)
      if (storageError) fileErrors += filePaths.length
    }
    const { error: updateError } = await admin.from('cold_archives').update({
      status: 'Dipindahkan', deleted_at: new Date().toISOString(), deleted_by: caller.user_id,
    }).eq('archive_id', archiveId)
    if (updateError) throw updateError
    return res.status(200).json({
      ok: true, deletedResponses: rows.length,
      deletedFiles: removablePaths.length - fileErrors, fileErrors, retainedFiles: sharedPaths.size,
    })
  }
  return res.status(400).json({ error: 'Aksi tidak valid.' })
}

export default async function handler(req, res) {
  try {
    if (req.query?.action === 'cold-response') return await handleColdResponses(req, res)

    // Fail-closed: CRON_SECRET wajib (samakan pola cron-birthdays.js).
    const CRON_SECRET = (process.env.CRON_SECRET || '').trim()
    if (!CRON_SECRET) return res.status(500).json({ error: 'CRON_SECRET belum diatur di server.' })
    const { timingSafeEqual } = await import('crypto')
    const authVal = (req.headers.authorization || '').startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : ''
    const secretBuf = Buffer.from(CRON_SECRET)
    const authBuf = Buffer.from(authVal)
    if (secretBuf.length !== authBuf.length || !timingSafeEqual(secretBuf, authBuf)) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const { createClient } = await import('@supabase/supabase-js')
    const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Environment variable belum lengkap.' })
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

    // Tarik semua baris tiap tabel (paginasi 1000 agar tabel besar tidak terpotong).
    async function fetchAll(table) {
      const rows = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin.from(table).select('*').range(from, from + PAGE - 1)
        if (error) throw error
        rows.push(...(data || []))
        if (!data || data.length < PAGE) break
      }
      return rows
    }

    const tables = {}
    const errors = {}
    let totalRows = 0
    for (const { table } of BACKUP_TABLES) {
      try {
        const rows = await fetchAll(table)
        tables[table] = rows
        totalRows += rows.length
      } catch (e) {
        errors[table] = e.message || String(e)
      }
    }

    const payload = {
      meta: {
        app: 'ESC Siantan',
        generatedAt: new Date().toISOString(),
        source: 'cron-backup',
        tableCount: Object.keys(tables).length,
        totalRows,
        errors,
      },
      tables,
    }

    // Nama file pakai tanggal WIB (bukan UTC) agar cocok dengan "hari" operator.
    const dateWib = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
    const path = `auto/backup-${dateWib}.json`

    const { error: upErr } = await admin.storage
      .from('backups')
      .upload(path, JSON.stringify(payload), { contentType: 'application/json', upsert: true })
    if (upErr) {
      // Kemungkinan besar bucket `backups` belum dibuat — laporkan jelas, jangan crash.
      return res.status(500).json({
        error: 'Gagal mengunggah backup. Pastikan bucket privat `backups` sudah dibuat di Supabase Storage.',
        detail: upErr.message || String(upErr),
        tableCount: Object.keys(tables).length,
        totalRows,
      })
    }

    // Rotasi: simpan KEEP arsip harian terakhir, sisanya dihapus (nama = tanggal → urut leksikal).
    let deleted = 0
    const { data: files } = await admin.storage.from('backups').list('auto', {
      limit: 1000, sortBy: { column: 'name', order: 'asc' },
    })
    const arsip = (files || []).filter(f => f.name.startsWith('backup-'))
    if (arsip.length > KEEP) {
      const toDelete = arsip.slice(0, arsip.length - KEEP).map(f => `auto/${f.name}`)
      const { error: rmErr } = await admin.storage.from('backups').remove(toDelete)
      if (!rmErr) deleted = toDelete.length
    }

    return res.status(200).json({
      ok: true,
      file: path,
      tableCount: Object.keys(tables).length,
      totalRows,
      tablesWithError: Object.keys(errors),
      rotated: deleted,
    })
  } catch (e) {
    // Detail tetap hanya di log server; klien menerima pesan generik agar tidak
    // membocorkan struktur database maupun data jemaat.
    console.error('[cron-backup]', {
      name: e?.name,
      message: e?.message,
      code: e?.code,
      details: e?.details,
      hint: e?.hint,
    })
    return res.status(500).json({ error: 'Terjadi kesalahan internal.' })
  }
}
