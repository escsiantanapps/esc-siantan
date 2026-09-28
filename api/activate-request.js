// Aktivasi profil jemaat yang dibuat Admin tetapi belum memiliki akun login.
// Email asli wajib diisi; OTP selalu dikirim ke WhatsApp yang tersimpan.
export const config = { runtime: 'nodejs' }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INTERNAL_EMAIL_SUFFIX = '@wa.esc-siantan.app'

function phoneCore(phone) {
  let digits = String(phone || '').replace(/\D/g, '')
  if (digits.startsWith('62')) digits = digits.slice(2)
  else if (digits.startsWith('0')) digits = digits.slice(1)
  return digits
}

function waTarget(phone) {
  const core = phoneCore(phone)
  return core ? `62${core}` : ''
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end()
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { checkRateLimit } = await import('./_lib/rate-limit.js')
    if (checkRateLimit(req, res, { endpoint: 'activate-request', max: 5 })) return

    const { createClient } = await import('@supabase/supabase-js')
    const { createHash, randomInt } = await import('crypto')
    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    const fonnteToken = (process.env.FONNTE_TOKEN || '').trim()
    if (!supabaseUrl || !serviceRoleKey || !fonnteToken) {
      console.error('[activate-request] Konfigurasi server tidak lengkap.')
      return res.status(500).json({ code: 'INTERNAL', error: 'Konfigurasi server belum lengkap.' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const wantedPhone = phoneCore(body.phone)
    const email = String(body.email || '').trim().toLowerCase()
    if (wantedPhone.length < 9) return res.status(400).json({ code: 'PHONE_INVALID', error: 'Nomor telepon tidak valid.' })
    if (!EMAIL_PATTERN.test(email) || email.length > 254 || email.endsWith(INTERNAL_EMAIL_SUFFIX)) {
      return res.status(400).json({ code: 'EMAIL_INVALID', error: 'Masukkan email asli yang valid.' })
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const { data: rows, error: rowsError } = await admin
      .from('users')
      .select('user_id, phone, email, auth_id, status')
      .not('phone', 'is', null)
    if (rowsError) throw rowsError

    const matches = (rows || []).filter((row) => phoneCore(row.phone) === wantedPhone)
    if (matches.length !== 1) {
      return res.status(404).json({ code: 'PROFILE_NOT_FOUND', error: 'Data jemaat tidak ditemukan atau nomor terdaftar lebih dari sekali. Hubungi admin.' })
    }
    const target = matches[0]
    if (target.status !== 'Aktif') return res.status(403).json({ code: 'ACCOUNT_INACTIVE', error: 'Akun belum aktif. Hubungi admin.' })
    if (target.auth_id) return res.status(409).json({ code: 'ALREADY_ACTIVE', error: 'Akun sudah memiliki login. Silakan masuk atau gunakan Lupa Kata Sandi.' })

    const { data: duplicateEmail, error: duplicateError } = await admin
      .from('users')
      .select('user_id')
      .ilike('email', email)
      .neq('user_id', target.user_id)
      .limit(1)
      .maybeSingle()
    if (duplicateError) throw duplicateError
    if (duplicateEmail) return res.status(409).json({ code: 'EMAIL_TAKEN', error: 'Email sudah digunakan akun lain.' })

    const { data: existing, error: existingError } = await admin
      .from('activation_otp')
      .select('created_at')
      .eq('phone', wantedPhone)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing && Date.now() - new Date(existing.created_at).getTime() < 60_000) {
      return res.status(429).json({ code: 'RATE_LIMITED', error: 'Tunggu sebentar sebelum meminta kode lagi.' })
    }

    const code = String(randomInt(100000, 1000000))
    // Email ikut di-hash agar kode tidak dapat dipakai untuk email berbeda.
    const codeHash = createHash('sha256').update(code + wantedPhone + email).digest('hex')
    const { error: otpError } = await admin.from('activation_otp').upsert({
      phone: wantedPhone,
      code_hash: codeHash,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      attempts: 0,
      created_at: new Date().toISOString(),
    }, { onConflict: 'phone' })
    if (otpError) throw otpError

    const destination = waTarget(target.phone)
    const message = `*ESC Siantan*\nKode aktivasi akun Anda: *${code}*\nBerlaku 10 menit. Jangan bagikan kode ini kepada siapa pun.`
    const fonnteResponse = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { Authorization: fonnteToken, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ target: destination, message }),
    })
    const fonnteResult = await fonnteResponse.json().catch(() => ({}))
    if (!fonnteResponse.ok || fonnteResult.status === false) {
      await admin.from('activation_otp').delete().eq('phone', wantedPhone)
      return res.status(502).json({ code: 'SEND_FAILED', error: 'Kode WhatsApp belum dapat dikirim. Coba lagi atau hubungi admin.' })
    }

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      ok: true,
      masked: `${destination.slice(0, 4)}****${destination.slice(-4)}`,
    })
  } catch (error) {
    console.error('[activate-request]', error?.message || 'unknown')
    return res.status(500).json({ code: 'INTERNAL', error: 'Terjadi kesalahan internal.' })
  }
}
