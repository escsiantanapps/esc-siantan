// Verifikasi OTP WhatsApp, buat akun Auth memakai email asli, lalu tautkan ke
// profil jemaat yang sebelumnya dibuat Admin.
export const config = { runtime: 'nodejs' }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INTERNAL_EMAIL_SUFFIX = '@wa.esc-siantan.app'

function phoneCore(phone) {
  let digits = String(phone || '').replace(/\D/g, '')
  if (digits.startsWith('62')) digits = digits.slice(2)
  else if (digits.startsWith('0')) digits = digits.slice(1)
  return digits
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end()
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { checkRateLimit } = await import('./_lib/rate-limit.js')
    if (checkRateLimit(req, res, { endpoint: 'activate-verify', max: 20 })) return

    const { createClient } = await import('@supabase/supabase-js')
    const { createHash, timingSafeEqual } = await import('crypto')
    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      console.error('[activate-verify] Konfigurasi server tidak lengkap.')
      return res.status(500).json({ code: 'INTERNAL', error: 'Konfigurasi server belum lengkap.' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const wantedPhone = phoneCore(body.phone)
    const email = String(body.email || '').trim().toLowerCase()
    const code = String(body.code || '').trim()
    const password = String(body.password || '')
    if (wantedPhone.length < 9 || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ code: 'INPUT_INVALID', error: 'Nomor telepon atau kode tidak valid.' })
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 254 || email.endsWith(INTERNAL_EMAIL_SUFFIX)) {
      return res.status(400).json({ code: 'EMAIL_INVALID', error: 'Masukkan email asli yang valid.' })
    }
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      return res.status(400).json({ code: 'PASSWORD_WEAK', error: 'Kata sandi minimal 8 karakter dan harus mengandung huruf serta angka.' })
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const { data: otpRow, error: otpQueryError } = await admin
      .from('activation_otp')
      .select('*')
      .eq('phone', wantedPhone)
      .maybeSingle()
    if (otpQueryError) throw otpQueryError
    if (!otpRow) return res.status(400).json({ code: 'OTP_INVALID', error: 'Kode tidak ditemukan. Minta kode baru.' })
    if (new Date(otpRow.expires_at).getTime() < Date.now()) {
      await admin.from('activation_otp').delete().eq('phone', wantedPhone)
      return res.status(400).json({ code: 'OTP_INVALID', error: 'Kode kedaluwarsa. Minta kode baru.' })
    }
    if ((otpRow.attempts || 0) >= 5) {
      await admin.from('activation_otp').delete().eq('phone', wantedPhone)
      return res.status(429).json({ code: 'OTP_INVALID', error: 'Terlalu banyak percobaan. Minta kode baru.' })
    }

    const candidateHash = createHash('sha256').update(code + wantedPhone + email).digest('hex')
    const candidate = Buffer.from(candidateHash, 'hex')
    const expected = Buffer.from(otpRow.code_hash || '', 'hex')
    const validCode = candidate.length === expected.length && timingSafeEqual(candidate, expected)
    if (!validCode) {
      await admin.from('activation_otp').update({ attempts: (otpRow.attempts || 0) + 1 }).eq('phone', wantedPhone)
      return res.status(400).json({ code: 'OTP_INVALID', error: 'Kode salah atau email berbeda dari saat kode diminta.' })
    }

    const { data: rows, error: rowsError } = await admin
      .from('users')
      .select('user_id, phone, auth_id, status')
      .not('phone', 'is', null)
    if (rowsError) throw rowsError
    const matches = (rows || []).filter((row) => phoneCore(row.phone) === wantedPhone)
    if (matches.length !== 1) return res.status(409).json({ code: 'PROFILE_NOT_FOUND', error: 'Data jemaat tidak unik. Hubungi admin.' })
    const target = matches[0]
    if (target.status !== 'Aktif') return res.status(403).json({ code: 'ACCOUNT_INACTIVE', error: 'Akun belum aktif. Hubungi admin.' })
    if (target.auth_id) return res.status(409).json({ code: 'ALREADY_ACTIVE', error: 'Akun sudah memiliki login. Silakan masuk.' })

    const { data: duplicateEmail, error: duplicateError } = await admin
      .from('users')
      .select('user_id')
      .ilike('email', email)
      .neq('user_id', target.user_id)
      .limit(1)
      .maybeSingle()
    if (duplicateError) throw duplicateError
    if (duplicateEmail) return res.status(409).json({ code: 'EMAIL_TAKEN', error: 'Email sudah digunakan akun lain.' })

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError || !created?.user) {
      if (/already|registered|exists|unique/i.test(createError?.message || '')) {
        return res.status(409).json({ code: 'EMAIL_TAKEN', error: 'Email sudah digunakan akun lain.' })
      }
      console.error('[activate-verify] Gagal membuat Auth:', createError?.message || 'unknown')
      return res.status(500).json({ code: 'INTERNAL', error: 'Akun login belum dapat dibuat.' })
    }

    // Service role sengaja dipakai setelah OTP membuktikan kepemilikan nomor.
    // Jika profil gagal ditautkan, Auth baru dihapus agar tidak ada akun yatim.
    const { data: updatedProfile, error: profileError } = await admin
      .from('users')
      .update({ auth_id: created.user.id, email })
      .eq('user_id', target.user_id)
      .is('auth_id', null)
      .select('auth_id, email')
      .maybeSingle()
    const profileLinked = !profileError
      && updatedProfile?.auth_id === created.user.id
      && updatedProfile?.email?.trim().toLowerCase() === email
    if (!profileLinked) {
      await admin.auth.admin.deleteUser(created.user.id)
      console.error('[activate-verify] Gagal menautkan profil:', profileError?.message || 'update ditolak')
      return res.status(500).json({ code: 'INTERNAL', error: 'Akun login belum dapat ditautkan.' })
    }

    await admin.from('activation_otp').delete().eq('phone', wantedPhone)

    const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
    const { data: signIn } = await anon.auth.signInWithPassword({ email, password })
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      ok: true,
      access_token: signIn?.session?.access_token || null,
      refresh_token: signIn?.session?.refresh_token || null,
    })
  } catch (error) {
    console.error('[activate-verify]', error?.message || 'unknown')
    return res.status(500).json({ code: 'INTERNAL', error: 'Terjadi kesalahan internal.' })
  }
}
