// Aktivasi akun jemaat lama (data impor tanpa login) — langkah 1: kirim OTP.
// Jalur utama: email OTP via Supabase Auth (gratis).
// Fallback: WhatsApp OTP via Fonnte jika tidak ada email nyata atau email gagal.
export const config = { runtime: 'nodejs' }

function core(p) {
  let d = String(p || '').replace(/\D/g, '')
  if (d.startsWith('62')) d = d.slice(2)
  else if (d.startsWith('0')) d = d.slice(1)
  return d
}
function waTarget(c) { return c ? '62' + c : '' }
function hasRealEmail(email) {
  return typeof email === 'string' && email.includes('@') && !email.endsWith('@wa.esc-siantan.app')
}
function maskEmail(email) {
  const [local, domain] = email.split('@')
  return local.slice(0, 1) + '***@' + domain
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { checkRateLimit } = await import('./_lib/rate-limit.js')
    // Rate limit ketat (5/menit) — mempersulit enumeration nomor terdaftar.
    if (checkRateLimit(req, res, { endpoint: 'activate-request', max: 5 })) return

    const { createClient } = await import('@supabase/supabase-js')
    const { createHash, randomInt } = await import('crypto')

    const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    const ANON_KEY = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()
    const FONNTE_TOKEN = (process.env.FONNTE_TOKEN || '').trim()
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Konfigurasi Supabase belum lengkap.' })

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const wanted = core(body.phone)
    if (!wanted) return res.status(400).json({ error: 'Nomor telepon wajib diisi.' })

    const { data: match } = await admin.from('users').select('user_id, phone, auth_id, email').eq('phone', waTarget(wanted)).maybeSingle()
    // Fallback: scan semua format nomor (lintas format lama)
    let matchRow = match
    if (!matchRow) {
      const { data: rows } = await admin.from('users').select('user_id, phone, auth_id, email').not('phone', 'is', null)
      matchRow = (rows || []).find(r => core(r.phone) === wanted)
    }
    // Pesan generik: jangan bocorkan apakah nomor terdaftar/status aktivasi.
    if (!matchRow || matchRow.auth_id) {
      return res.status(200).json({ ok: true, message: 'Jika nomor terdaftar dan belum aktif, kode verifikasi akan dikirim.' })
    }

    // Cooldown 60 detik (berlaku untuk jalur WA; jalur email dikendalikan Supabase).
    const { data: ex } = await admin.from('activation_otp').select('created_at').eq('phone', wanted).maybeSingle()
    if (ex && (Date.now() - new Date(ex.created_at).getTime()) < 60_000) {
      return res.status(429).json({ error: 'Tunggu sebentar sebelum meminta kode lagi.' })
    }

    // ── Jalur email (utama) ───────────────────────────────────────────────────
    if (hasRealEmail(matchRow.email) && ANON_KEY) {
      const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
      const { error: otpErr } = await anon.auth.signInWithOtp({
        email: matchRow.email,
        options: { shouldCreateUser: true },
      })
      if (!otpErr) {
        return res.status(200).json({ ok: true, method: 'email', masked: maskEmail(matchRow.email) })
      }
      // Email gagal → lanjut ke fallback WA
      console.error('Email OTP gagal, fallback ke WA:', otpErr.message)
    }

    // ── Jalur WhatsApp (fallback) ─────────────────────────────────────────────
    if (!FONNTE_TOKEN) return res.status(500).json({ error: 'FONNTE_TOKEN belum diatur di server.' })

    const codeVal = String(randomInt(100000, 1000000))
    const codeHash = createHash('sha256').update(codeVal + wanted).digest('hex')
    await admin.from('activation_otp').upsert(
      { phone: wanted, code_hash: codeHash, expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), attempts: 0, created_at: new Date().toISOString() },
      { onConflict: 'phone' },
    )

    const message = `*ESC Siantan*\nKode aktivasi akun Anda: *${codeVal}*\nBerlaku 10 menit. Jangan bagikan kode ini.`
    const fr = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { Authorization: FONNTE_TOKEN, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ target: waTarget(wanted), message, countryCode: '62' }),
    })
    const fj = await fr.json().catch(() => ({}))
    if (!fr.ok || fj.status === false) return res.status(502).json({ error: 'Gagal mengirim WhatsApp. Coba lagi atau hubungi admin.' })

    const t = waTarget(wanted)
    return res.status(200).json({ ok: true, method: 'whatsapp', masked: t.slice(0, 4) + '****' + t.slice(-4) })
  } catch (e) {
    console.error('[activate-request]', e)
    return res.status(500).json({ error: 'Terjadi kesalahan internal.' })
  }
}
