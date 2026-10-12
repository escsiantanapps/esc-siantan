import { supabase } from '@/lib/supabase'
import { fetchApi } from '@/lib/utils'

async function fetchByIds(table, fields, column, ids) {
  const rows = []
  for (let from = 0; from < ids.length; from += 100) {
    const { data, error } = await supabase.from(table).select(fields).in(column, ids.slice(from, from + 100))
    if (error) throw error
    rows.push(...(data || []))
  }
  return rows
}

export const coldArchiveService = {
  async getResponsesBefore(cutoffDate) {
    const { data, error } = await supabase.from('form_responses').select('*')
      .lt('submitted_at', `${cutoffDate}T00:00:00+07:00`).order('submitted_at')
      .order('response_id').range(0, 249)
    if (error) throw error
    return data || []
  },
  async downloadResponseFile(path) {
    const { data, error } = await supabase.storage.from('task-files').download(path)
    if (error) throw error
    return data.arrayBuffer()
  },
  // Snapshot ini membuat arsip tetap bisa dibaca manusia ketika form diubah
  // atau dihapus setelah responsnya dipindahkan dari Supabase.
  async getArchiveContext(responses) {
    const formIds = [...new Set((responses || []).map(row => row.form_id).filter(Boolean))]
    const userIds = [...new Set((responses || []).map(row => row.volunteer_id).filter(Boolean))]
    const [forms, users] = await Promise.all([
      fetchByIds('form_templates', 'form_id, title, period, weekly_goal, fields_json', 'form_id', formIds),
      fetchByIds('users', 'user_id, name, photo_url, role', 'user_id', userIds),
    ])
    return { version: 1, forms, users }
  },
  async record(archiveId, manifest) { return this.call({ action: 'record', archiveId, manifest }) },
  async purge(archiveId, verifiedSha256) { return this.call({ action: 'purge', archiveId, verifiedSha256 }) },
  async call(body) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Sesi tidak ditemukan.')
    const res = await fetchApi('/api/cron-backup?action=cold-response', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || 'Gagal memproses arsip data dingin.')
    return json
  },
}
