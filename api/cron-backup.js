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
import { BACKUP_TABLES } from '../src/lib/backupTables.js'

const KEEP = 30 // simpan 30 arsip harian terakhir (rotasi otomatis)
const PAGE = 1000 // batas baris per request PostgREST; tabel besar dipaginasi

export default async function handler(req, res) {
  try {
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
    console.error('[cron-backup]', e)
    return res.status(500).json({ error: 'Terjadi kesalahan internal.' })
  }
}
