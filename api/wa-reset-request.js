// Lupa password via WhatsApp OTP — langkah 1: kirim kode ke WhatsApp terdaftar.
// Identitas dipakai = email (login). Kode dikirim ke users.phone via Fonnte.
export const config = { runtime: 'nodejs' }

function waTarget(phone) {
  let d = String(phone || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('0')) d = '62' + d.slice(1)
  else if (d.startsWith('8')) d = '62' + d
  return d
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { createClient } = await import('@supabase/supabase-js')
    const { createHash } = await import('crypto')

    const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    const FONNTE_TOKEN = (process.env.FONNTE_TOKEN || '').trim()
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Konfigurasi Supabase belum lengkap.' })
    if (!FONNTE_TOKEN) return res.status(500).json({ error: 'FONNTE_TOKEN belum diatur di server.' })

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const email = String(body.email || '').trim().toLowerCase()
    if (!email) return res.status(400).json({ error: 'Email wajib diisi.' })

    const { data: user } = await admin
      .from('users').select('user_id, phone, auth_id').ilike('email', email).maybeSingle()
    if (!user || !user.auth_id) {
      return res.status(404).json({ error: 'Akun dengan email tersebut tidak ditemukan.' })
    }
    const target = waTarget(user.phone)
    if (!target) {
      return res.status(400).json({ error: 'Nomor WhatsApp belum terdaftar untuk akun ini. Hubungi admin.' })
    }

    // Cooldown 60 detik: jangan kirim ulang terlalu cepat.
    const { data: existing } = await admin
      .from('password_reset_otp').select('created_at').eq('email', email).maybeSingle()
    if (existing && (Date.now() - new Date(existing.created_at).getTime()) < 60_000) {
      return res.status(429).json({ error: 'Tunggu sebentar sebelum meminta kode lagi.' })
    }

    const code = String(Math.floor(100000 + Math.random() * 900000))
    const codeHash = createHash('sha256').update(code + email).digest('hex')
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
    const { error: upErr } = await admin.from('password_reset_otp').upsert(
      { email, code_hash: codeHash, expires_at: expiresAt, attempts: 0, created_at: new Date().toISOString() },
      { onConflict: 'email' },
    )
    if (upErr) return res.status(500).json({ error: 'Gagal menyiapkan kode.' })

    const message = `*ESC Siantan*\nKode OTP reset password Anda: *${code}*\nBerlaku 10 menit. Jangan bagikan kode ini kepada siapa pun.`
    const fr = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { Authorization: FONNTE_TOKEN, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ target, message, countryCode: '62' }),
    })
    const fj = await fr.json().catch(() => ({}))
    if (!fr.ok || fj.status === false) {
      return res.status(502).json({ error: 'Gagal mengirim WhatsApp. Coba lagi atau hubungi admin.' })
    }

    // Samarkan nomor untuk ditampilkan (mis. 6281****1234).
    const masked = target.slice(0, 4) + '****' + target.slice(-4)
    return res.status(200).json({ ok: true, masked })
  } catch (e) {
    return res.status(500).json({ error: 'Terjadi kesalahan: ' + (e?.message || 'unknown') })
  }
}
