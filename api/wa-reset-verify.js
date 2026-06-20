// Lupa password via WhatsApp OTP — langkah 2: verifikasi kode & set password baru.
export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { createClient } = await import('@supabase/supabase-js')
    const { createHash } = await import('crypto')

    const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Konfigurasi Supabase belum lengkap.' })

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const email = String(body.email || '').trim().toLowerCase()
    const code = String(body.code || '').trim()
    const newPassword = String(body.newPassword || '')
    if (!email || !code) return res.status(400).json({ error: 'Email dan kode wajib diisi.' })
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter.' })

    const { data: row } = await admin
      .from('password_reset_otp').select('*').eq('email', email).maybeSingle()
    if (!row) return res.status(400).json({ error: 'Kode tidak ditemukan. Minta kode baru.' })
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await admin.from('password_reset_otp').delete().eq('email', email)
      return res.status(400).json({ error: 'Kode kedaluwarsa. Minta kode baru.' })
    }
    if ((row.attempts || 0) >= 5) {
      await admin.from('password_reset_otp').delete().eq('email', email)
      return res.status(429).json({ error: 'Terlalu banyak percobaan. Minta kode baru.' })
    }

    const codeHash = createHash('sha256').update(code + email).digest('hex')
    if (codeHash !== row.code_hash) {
      await admin.from('password_reset_otp').update({ attempts: (row.attempts || 0) + 1 }).eq('email', email)
      return res.status(400).json({ error: 'Kode salah.' })
    }

    const { data: user } = await admin
      .from('users').select('auth_id').ilike('email', email).maybeSingle()
    if (!user?.auth_id) return res.status(404).json({ error: 'Akun tidak ditemukan.' })

    const { error: upErr } = await admin.auth.admin.updateUserById(user.auth_id, { password: newPassword })
    if (upErr) return res.status(500).json({ error: 'Gagal menyetel password: ' + upErr.message })

    await admin.from('password_reset_otp').delete().eq('email', email)
    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: 'Terjadi kesalahan: ' + (e?.message || 'unknown') })
  }
}
