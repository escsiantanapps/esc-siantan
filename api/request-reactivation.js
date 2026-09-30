// Setelah Supabase Auth memverifikasi kata sandi, akun yang dinonaktifkan
// otomatis dapat meminta persetujuan ulang. Akun Nonaktif manual tidak berubah.
export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const { checkRateLimit } = await import('./_lib/rate-limit.js')
    if (checkRateLimit(req, res, { endpoint: 'request-reactivation', max: 10 })) return

    const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Konfigurasi server belum lengkap.' })
    }

    const authorization = String(req.headers.authorization || '')
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
    if (!token) return res.status(401).json({ error: 'Unauthorized' })

    const { createClient } = await import('@supabase/supabase-js')
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // getUser(token) memverifikasi JWT ke Supabase Auth; user_id dari klien
    // tidak pernah dipercaya.
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData?.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const { data: requested, error } = await admin.rpc('request_inactive_user_reactivation', {
      p_auth_id: authData.user.id,
    })
    if (error) throw error

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ requested: requested === true })
  } catch (error) {
    console.error('[request-reactivation]', error)
    return res.status(500).json({ error: 'Terjadi kesalahan internal.' })
  }
}
