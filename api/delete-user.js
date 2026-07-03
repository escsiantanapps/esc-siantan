// Hapus akun jemaat secara permanen (auth + profil). Hanya untuk Admin/Super Admin.
// Paksa runtime Node (butuh service role key & admin API Supabase).
export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const { createClient } = await import('@supabase/supabase-js')

    const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return res.status(500).json({
        error: 'Environment variable belum lengkap.',
        missing: {
          SUPABASE_URL: !SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !SERVICE_ROLE_KEY,
        },
      })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

    // Verifikasi pemanggil: harus user login dengan role Admin/Super Admin.
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const { data: userData, error: uErr } = await admin.auth.getUser(token)
    if (uErr || !userData?.user) return res.status(401).json({ error: 'Unauthorized' })

    const { data: caller } = await admin
      .from('users').select('user_id, role, auth_id').eq('auth_id', userData.user.id).single()
    if (!caller || !['Admin', 'Super Admin'].includes(caller.role)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const { userId } = body
    if (!userId) return res.status(400).json({ error: 'userId wajib diisi.' })

    // Ambil target.
    const { data: target, error: tErr } = await admin
      .from('users').select('user_id, role, auth_id').eq('user_id', userId).single()
    if (tErr || !target) return res.status(404).json({ error: 'Jemaat tidak ditemukan.' })

    // Larangan: tidak boleh menghapus diri sendiri (cegah lockout).
    if (target.user_id === caller.user_id) {
      return res.status(400).json({ error: 'Tidak dapat menghapus akun Anda sendiri.' })
    }
    // Hanya Super Admin yang boleh menghapus akun Admin / Super Admin.
    if (['Admin', 'Super Admin'].includes(target.role) && caller.role !== 'Super Admin') {
      return res.status(403).json({ error: 'Hanya Super Admin yang dapat menghapus akun admin.' })
    }

    // Hapus akun auth lebih dulu agar user langsung tidak bisa login (mencegah
    // profil ter-recreate otomatis saat login berikutnya).
    if (target.auth_id) {
      const { error: aErr } = await admin.auth.admin.deleteUser(target.auth_id)
      // Abaikan bila user auth memang sudah tidak ada.
      if (aErr && !/not found/i.test(aErr.message || '')) {
        return res.status(500).json({ error: 'Gagal menghapus akun auth: ' + aErr.message })
      }
    }

    // Hapus baris profil. Bila gagal karena relasi (FK), akun auth sudah dihapus
    // sehingga user tetap tidak bisa mengakses aplikasi — laporkan dengan jelas.
    const { error: dErr } = await admin.from('users').delete().eq('user_id', userId)
    if (dErr) {
      return res.status(500).json({
        error: 'Akun login sudah dihapus, tetapi data profil tidak dapat dihapus karena masih terkait data lain (' + dErr.message + ').',
        partial: true,
      })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: 'Terjadi kesalahan internal.' })
  }
}
