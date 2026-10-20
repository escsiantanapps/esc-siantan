// Catat ukuran Storage dan database pada akhir hari WIB.
export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const secret = (process.env.CRON_SECRET || '').trim()
  if (!secret) return res.status(500).json({ error: 'Konfigurasi server belum lengkap.' })
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const { timingSafeEqual } = await import('node:crypto')
  const expected = Buffer.from(secret)
  const received = Buffer.from(token)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !key) return res.status(500).json({ error: 'Konfigurasi server belum lengkap.' })

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const admin = createClient(url, key, { auth: { persistSession: false } })
    const { error } = await admin.rpc('capture_supabase_usage_daily')
    if (error) throw error
    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error('Gagal mencatat ukuran Supabase:', error)
    return res.status(500).json({ error: 'Gagal mencatat ukuran Supabase.' })
  }
}
