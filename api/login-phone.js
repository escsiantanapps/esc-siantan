// Login dengan nomor telepon. Cari email akun berdasarkan users.phone (service
// role, pra-auth), lalu sign-in dengan anon key dan kembalikan sesi.
export const config = { runtime: 'nodejs' }

// Ambil "inti" nomor (tanpa kode negara / 0 depan) agar cocok lintas format.
function core(p) {
  let d = String(p || '').replace(/\D/g, '')
  if (d.startsWith('62')) d = d.slice(2)
  else if (d.startsWith('0')) d = d.slice(1)
  return d
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { checkRateLimit } = await import('./_lib/rate-limit.js')
    // Rate limit ketat: 5 attempt/menit — anti brute-force password.
    if (checkRateLimit(req, res, { endpoint: 'login-phone', max: 5 })) return

    const { createClient } = await import('@supabase/supabase-js')
    const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    const ANON_KEY = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
      return res.status(500).json({ error: 'Konfigurasi server belum lengkap.' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const phone = String(body.phone || '').trim()
    const password = String(body.password || '')
    const wanted = core(phone)
    if (!wanted || !password) return res.status(400).json({ error: 'Nomor telepon dan kata sandi wajib diisi.' })

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    // Ambil kandidat (skala kecil) lalu cocokkan inti nomornya — tahan beda format.
    const { data: rows } = await admin
      .from('users').select('email, phone').not('phone', 'is', null).not('email', 'is', null)
    const match = (rows || []).find(r => core(r.phone) === wanted)
    // Pesan generik agar tidak membocorkan apakah nomor terdaftar.
    if (!match) return res.status(401).json({ error: 'Nomor telepon atau kata sandi salah.' })

    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
    const { data, error } = await anon.auth.signInWithPassword({ email: match.email, password })
    if (error || !data?.session) return res.status(401).json({ error: 'Nomor telepon atau kata sandi salah.' })

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })
  } catch (e) {
    console.error('[login-phone]', e)
    return res.status(500).json({ error: 'Terjadi kesalahan internal.' })
  }
}
