// Aktivasi akun jemaat lama — langkah 2: verifikasi OTP, buat akun login,
// hubungkan ke data lama, lalu kembalikan sesi (auto login).
// Mendukung 2 jalur: method='email' (Supabase OTP) & method='whatsapp' (Fonnte).
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

    // Rate-limit IP untuk mencegah brute-force OTP lintas nomor. Terpisah
    // dari 5-attempt limit per baris activation_otp.
    const { checkRateLimit } = await import('./_lib/rate-limit.js')
    if (checkRateLimit(req, res, { endpoint: 'activate-verify', max: 20 })) return

    const { createClient } = await import('@supabase/supabase-js')
    const { createHash, timingSafeEqual } = await import('crypto')
    const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    const ANON_KEY = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) return res.status(500).json({ error: 'Konfigurasi server belum lengkap.' })

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const wanted = core(body.phone)
    const codeVal = String(body.code || '').trim()
    const password = String(body.password || '')
    const method = String(body.method || 'whatsapp')
    if (!wanted || !codeVal) return res.status(400).json({ error: 'Nomor dan kode wajib diisi.' })
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password))
      return res.status(400).json({ error: 'Password minimal 8 karakter, harus ada huruf dan angka.' })

    // ── Jalur email (Supabase Auth OTP) ───────────────────────────────────────
    if (method === 'email') {
      const { data: rows } = await admin.from('users').select('user_id, phone, auth_id, email').not('phone', 'is', null)
      const match = (rows || []).find(r => core(r.phone) === wanted)
      if (!match) return res.status(404).json({ error: 'Akun tidak ditemukan.' })
      if (match.auth_id) return res.status(400).json({ error: 'Akun sudah aktif. Silakan masuk.' })

      const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
      const { data: v, error: vErr } = await anon.auth.verifyOtp({
        email: match.email,
        token: codeVal,
        type: 'email',
      })
      if (vErr || !v?.user) return res.status(400).json({ error: 'Kode salah atau sudah kedaluwarsa.' })

      const { error: uErr } = await admin.from('users').update({ auth_id: v.user.id, email: match.email }).eq('user_id', match.user_id)
      if (uErr) return res.status(500).json({ error: 'Gagal menghubungkan akun: ' + uErr.message })

      const { error: pwErr } = await admin.auth.admin.updateUserById(v.user.id, { password })
      if (pwErr) return res.status(500).json({ error: 'Gagal menyetel password: ' + pwErr.message })

      const { data: si } = await anon.auth.signInWithPassword({ email: match.email, password })
      return res.status(200).json({
        ok: true,
        access_token: si?.session?.access_token || null,
        refresh_token: si?.session?.refresh_token || null,
      })
    }

    // ── Jalur WhatsApp (OTP tabel custom) ─────────────────────────────────────
    const { data: row } = await admin.from('activation_otp').select('*').eq('phone', wanted).maybeSingle()
    if (!row) return res.status(400).json({ error: 'Kode tidak ditemukan. Minta kode baru.' })
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await admin.from('activation_otp').delete().eq('phone', wanted)
      return res.status(400).json({ error: 'Kode kedaluwarsa. Minta kode baru.' })
    }
    if ((row.attempts || 0) >= 5) {
      await admin.from('activation_otp').delete().eq('phone', wanted)
      return res.status(429).json({ error: 'Terlalu banyak percobaan. Minta kode baru.' })
    }
    const codeHash = createHash('sha256').update(codeVal + wanted).digest('hex')
    // timingSafeEqual — hindari kebocoran informasi via variasi waktu compare.
    const a = Buffer.from(codeHash, 'hex')
    const b = Buffer.from(row.code_hash || '', 'hex')
    const equal = a.length === b.length && timingSafeEqual(a, b)
    if (!equal) {
      await admin.from('activation_otp').update({ attempts: (row.attempts || 0) + 1 }).eq('phone', wanted)
      return res.status(400).json({ error: 'Kode salah.' })
    }

    const { data: rows } = await admin.from('users').select('user_id, phone, auth_id, email').not('phone', 'is', null)
    const match = (rows || []).find(r => core(r.phone) === wanted)
    if (!match) return res.status(404).json({ error: 'Akun tidak ditemukan.' })
    if (match.auth_id) return res.status(400).json({ error: 'Akun sudah aktif. Silakan masuk.' })

    const email = match.email || `${wanted}@wa.esc-siantan.app`
    const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (cErr || !created?.user) return res.status(500).json({ error: 'Gagal membuat akun: ' + (cErr?.message || '') })

    const { error: uErr } = await admin.from('users').update({ auth_id: created.user.id, email }).eq('user_id', match.user_id)
    if (uErr) return res.status(500).json({ error: 'Gagal menghubungkan akun: ' + uErr.message })
    await admin.from('activation_otp').delete().eq('phone', wanted)

    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
    const { data: si } = await anon.auth.signInWithPassword({ email, password })
    return res.status(200).json({
      ok: true,
      access_token: si?.session?.access_token || null,
      refresh_token: si?.session?.refresh_token || null,
    })
  } catch (e) {
    return res.status(500).json({ error: 'Terjadi kesalahan: ' + (e?.message || 'unknown') })
  }
}
