import { supabase } from '@/lib/supabase'
import { fetchApi } from '@/lib/utils'

async function call(action, payload = {}) {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session?.access_token) throw new Error('Sesi tidak ditemukan.')
  const request = import.meta.env.DEV ? fetch : fetchApi
  const response = await request('/api/storage-cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, ...payload }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const failure = new Error(body.error || 'Gagal memproses file Storage.')
    failure.status = response.status
    failure.retryAfterSeconds = Number(response.headers?.get?.('Retry-After')) || 60
    throw failure
  }
  return body
}

export const storageCleanupService = {
  scan() { return call('scan') },
  delete(paths) { return call('delete', { paths }) },
  scanResponses(filter = {}) { return call('scan-responses', { filter }) },
  prepareResponseBulk(filter = {}) { return call('prepare-response-bulk', { filter }) },
  deleteResponseFiles(paths, filter = {}) { return call('delete-response-files', { paths, filter }) },
}
