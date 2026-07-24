// Arsip data dingin SOP: API ini HANYA mencatat manifest yang sudah disalin
// lokal, lalu menghapus sumber lewat konfirmasi tahap kedua dari Super Admin.
export const config = { runtime: 'nodejs' }

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

export default async function handler(req, res) {
  try {
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
    const { data: caller } = await admin.from('users').select('user_id, role').eq('auth_id', authData.user.id).maybeSingle()
    if (!caller || caller.role !== 'Super Admin') return res.status(403).json({ error: 'Forbidden' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const { action, archiveId } = body
    if (!/^COLD-[A-Za-z0-9-]{12,100}$/.test(String(archiveId || ''))) {
      return res.status(400).json({ error: 'ID arsip tidak valid.' })
    }

    if (action === 'record') {
      const { manifest } = body
      if (!manifest || !Array.isArray(manifest.responseIds) || manifest.responseIds.length === 0 || manifest.responseIds.length > 5000) {
        return res.status(400).json({ error: 'Manifest arsip tidak valid.' })
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(manifest.cutoffDate || ''))) {
        return res.status(400).json({ error: 'Tanggal batas arsip tidak valid.' })
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
        sha256: String(manifest.sha256 || '').slice(0, 128),
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
      const ids = Array.isArray(archive.response_ids) ? archive.response_ids : []
      const cutoff = `${archive.cutoff_date}T00:00:00.000Z`
      const { data: rows, error: rowsError } = await admin.from('form_responses')
        .select('response_id, submitted_at, data_json').in('response_id', ids)
      if (rowsError) throw rowsError
      if ((rows || []).some(row => row.submitted_at >= cutoff)) return res.status(409).json({ error: 'Manifest memuat respons yang belum melewati tanggal batas.' })

      const { error: deleteError } = await admin.from('form_responses').delete().in('response_id', (rows || []).map(r => r.response_id))
      if (deleteError) throw deleteError

      const paths = [...new Set((rows || []).flatMap(row => [...responseFilePaths(row.data_json)]))]
      let fileErrors = 0
      if (paths.length) {
        const { error: storageError } = await admin.storage.from('task-files').remove(paths)
        if (storageError) fileErrors = paths.length
      }
      const { error: updateError } = await admin.from('cold_archives').update({
        status: 'Dipindahkan', deleted_at: new Date().toISOString(), deleted_by: caller.user_id,
      }).eq('archive_id', archiveId)
      if (updateError) throw updateError
      return res.status(200).json({ ok: true, deletedResponses: (rows || []).length, deletedFiles: paths.length - fileErrors, fileErrors })
    }
    return res.status(400).json({ error: 'Aksi tidak valid.' })
  } catch (error) {
    console.error('[cold-responses]', error)
    return res.status(500).json({ error: 'Terjadi kesalahan internal.' })
  }
}
