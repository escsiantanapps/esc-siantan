// Aktivasi akun jemaat lama (data impor tanpa login) — langkah 1: kirim OTP WA.
export const config = { runtime: 'nodejs' }

function core(p) {
  let d = String(p || '').replace(/\D/g, '')
  if (d.startsWith('62')) d = d.slice(2)
  else if (d.startsWith('0')) d = d.slice(1)
  return d
}
function waTarget(c) { return c ? '62' + c : '' }

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
    const wanted = core(body.phone)
    if (!wanted) return res.status(400).json({ error: 'Nomor telepon wajib diisi.' })

    const { data: rows } = await admin.from('users').select('user_id, phone, auth_id').not('phone', 'is', null)
    const match = (rows || []).find(r => core(r.phone) === wanted)
    if (!match) return res.status(404).json({ error: 'Nomor tidak terdaftar. Hubungi admin gereja.' })
    if (match.auth_id) return res.status(400).json({ error: 'Akun sudah aktif. Silakan masuk, atau pakai Lupa Password.' })

    // Cooldown 60 detik.
    const { data: ex } = await admin.from('activation_otp').select('created_at').eq('phone', wanted).maybeSingle()
    if (ex && (Date.now() - new Date(ex.created_at).getTime()) < 60_000) {
      return res.status(429).json({ error: 'Tunggu sebentar sebelum meminta kode lagi.' })
    }

    const codeVal = String(Math.floor(100000 + Math.random() * 900000))
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
    return res.status(200).json({ ok: true, masked: t.slice(0, 4) + '****' + t.slice(-4) })
  } catch (e) {
    return res.status(500).json({ error: 'Terjadi kesalahan: ' + (e?.message || 'unknown') })
  }
}
