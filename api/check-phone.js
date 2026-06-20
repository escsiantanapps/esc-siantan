// Cek ketersediaan nomor telepon saat registrasi (cocok lintas format).
export const config = { runtime: 'nodejs' }

function core(p) {
  let d = String(p || '').replace(/\D/g, '')
  if (d.startsWith('62')) d = d.slice(2)
  else if (d.startsWith('0')) d = d.slice(1)
  return d
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const { createClient } = await import('@supabase/supabase-js')
    const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Konfigurasi server belum lengkap.' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const wanted = core(body.phone)
    if (!wanted) return res.status(400).json({ error: 'Nomor telepon wajib diisi.' })

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const { data: rows } = await admin.from('users').select('phone').not('phone', 'is', null)
    const taken = (rows || []).some(r => core(r.phone) === wanted)
    return res.status(200).json({ available: !taken })
  } catch (e) {
    return res.status(500).json({ error: 'Terjadi kesalahan: ' + (e?.message || 'unknown') })
  }
}
