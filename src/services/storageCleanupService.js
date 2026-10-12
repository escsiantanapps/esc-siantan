import { supabase } from '@/lib/supabase'
import { fetchApi } from '@/lib/utils'

async function call(action, paths) {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session?.access_token) throw new Error('Sesi tidak ditemukan.')
  const request = import.meta.env.DEV ? fetch : fetchApi
  const response = await request('/api/storage-cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, ...(paths ? { paths } : {}) }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Gagal memproses file Storage.')
  return body
}

export const storageCleanupService = {
  scan() { return call('scan') },
  delete(paths) { return call('delete', paths) },
}
