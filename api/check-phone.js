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
    const { checkRateLimit } = await import('./_lib/rate-limit.js')
    // Rate limit ketat: 5/menit — mempersulit enumeration daftar jemaat.
    if (checkRateLimit(req, res, { endpoint: 'check-phone', max: 5 })) return
    const { createClient } = await import('@supabase/supabase-js')
    const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Konfigurasi server belum lengkap.' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const wanted = core(body.phone)
    const email = String(body.email || '').trim().toLowerCase()
    if (!wanted) return res.status(400).json({ error: 'Nomor telepon wajib diisi.' })

    // Endpoint ini SENGAJA hanya dipakai saat registrasi (klien sudah pegang
    // nomor & email sendiri). Tetap kembalikan status supaya UX registrasi baik,
    // tapi rate-limit ketat (di atas) menghalangi enumeration massal.
    // TODO jangka menengah: pindahkan cek ini menjadi unique constraint DB
    // yang dilempar sebagai error saat submit registrasi, lalu hapus endpoint.
    //
    // Cek DUA-duanya: nomor HP (cocok lintas format via core()) DAN email
    // (case-insensitive). Email diperiksa terhadap tabel `users` — mencakup
    // baris ber-auth_id NULL (jemaat impor / tambahan admin) yang TIDAK
    // terdeteksi supabase.auth.signUp (itu hanya melihat auth.users).
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const { data: rows } = await admin.from('users').select('phone, email, auth_id')
    const phoneRow = (rows || []).find(r => r.phone && core(r.phone) === wanted) || null
    const emailRow = email
      ? (rows || []).find(r => (r.email || '').trim().toLowerCase() === email) || null
      : null
    const phoneTaken = !!phoneRow
    const emailTaken = !!emailRow
    // needsActivation: nomor cocok dgn baris jemaat lama yang BELUM punya login
    // (auth_id NULL) — jemaat impor/tambahan admin. Alur Daftar mengarahkan
    // mereka ke verifikasi OTP WhatsApp (aktivasi), bukan membuat akun ganda.
    const needsActivation = !!(phoneRow && !phoneRow.auth_id)
    // hasLogin: nomor ATAU email sudah tertaut akun login (auth_id) → arahkan ke Masuk.
    const hasLogin = !!((phoneRow && phoneRow.auth_id) || (emailRow && emailRow.auth_id))
    // `available` dipertahankan (= ketersediaan NOMOR) demi kompatibilitas
    // pemanggil lama (usersService "Tambah Jemaat"). Flag baru granular.
    return res.status(200).json({ available: !phoneTaken, phoneTaken, emailTaken, needsActivation, hasLogin })
  } catch (e) {
    return res.status(500).json({ error: 'Terjadi kesalahan: ' + (e?.message || 'unknown') })
  }
}
