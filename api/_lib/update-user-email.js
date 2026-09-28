// Sinkronkan email profil dan Supabase Auth. Hanya Super Admin yang boleh
// mengubah identitas login jemaat melalui endpoint ini.
export const config = { runtime: 'nodejs' }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INTERNAL_EMAIL_SUFFIX = '@wa.esc-siantan.app'

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end()
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { createClient } = await import('@supabase/supabase-js')
    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      console.error('[update-user-email] Konfigurasi Supabase tidak lengkap.')
      return res.status(500).json({ error: 'Konfigurasi server belum lengkap.' })
    }

    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return res.status(401).json({ error: 'Unauthorized' })

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData?.user) return res.status(401).json({ error: 'Unauthorized' })

    const { data: caller, error: callerError } = await admin
      .from('users')
      .select('user_id, role')
      .eq('auth_id', authData.user.id)
      .single()
    if (callerError || caller?.role !== 'Super Admin') {
      return res.status(403).json({ error: 'Hanya Super Admin yang dapat mengubah email akun.' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const userId = String(body.userId || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    if (!/^[a-zA-Z0-9-]+$/.test(userId)) return res.status(400).json({ error: 'Format userId tidak valid.' })
    if (!EMAIL_PATTERN.test(email) || email.length > 254 || email.endsWith(INTERNAL_EMAIL_SUFFIX)) {
      return res.status(400).json({ error: 'Email tidak valid.' })
    }

    const { data: target, error: targetError } = await admin
      .from('users')
      .select('user_id, auth_id, email')
      .eq('user_id', userId)
      .single()
    if (targetError || !target) return res.status(404).json({ error: 'Jemaat tidak ditemukan.' })

    const { data: duplicate, error: duplicateError } = await admin
      .from('users')
      .select('user_id')
      .ilike('email', email)
      .neq('user_id', userId)
      .limit(1)
      .maybeSingle()
    if (duplicateError) throw duplicateError
    if (duplicate) return res.status(409).json({ error: 'Email sudah digunakan akun lain.' })

    const oldEmail = target.email || null
    let oldAuthEmail = null
    if (target.auth_id) {
      const { data: currentAuth, error: currentAuthError } = await admin.auth.admin.getUserById(target.auth_id)
      if (currentAuthError || !currentAuth?.user) {
        return res.status(409).json({ error: 'Akun login jemaat tidak ditemukan.' })
      }
      oldAuthEmail = currentAuth.user.email || null
    }

    const profileAlreadyMatches = oldEmail?.trim().toLowerCase() === email
    const authAlreadyMatches = !target.auth_id || oldAuthEmail?.trim().toLowerCase() === email
    if (profileAlreadyMatches && authAlreadyMatches) {
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json({ ok: true, email })
    }

    const authNeedsUpdate = target.auth_id && !authAlreadyMatches
    if (authNeedsUpdate) {
      const { error: updateAuthError } = await admin.auth.admin.updateUserById(target.auth_id, {
        email,
        email_confirm: true,
      })
      if (updateAuthError) {
        if (/already|registered|exists|unique/i.test(updateAuthError.message || '')) {
          return res.status(409).json({ error: 'Email sudah digunakan akun lain.' })
        }
        console.error('[update-user-email] Gagal memperbarui Auth:', updateAuthError.message)
        return res.status(500).json({ error: 'Gagal memperbarui email akun.' })
      }
    }

    // Pakai token pemanggil untuk update profil agar trigger audit mencatat
    // Super Admin yang melakukan perubahan, bukan service role anonim.
    const callerClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: updatedProfile, error: profileError } = await callerClient
      .from('users')
      .update({ email })
      .eq('user_id', userId)
      .select('email')
      .maybeSingle()

    // RLS yang menolak UPDATE dapat menghasilkan nol baris tanpa error. Baca
    // ulang dengan service role agar keadaan parsial tidak dianggap berhasil.
    let profileSaved = !profileError && updatedProfile?.email?.trim().toLowerCase() === email
    if (!profileSaved) {
      const { data: verifiedProfile } = await admin
        .from('users')
        .select('email')
        .eq('user_id', userId)
        .maybeSingle()
      profileSaved = verifiedProfile?.email?.trim().toLowerCase() === email
    }

    if (!profileSaved) {
      // Jangan biarkan profil dan Auth berbeda. Rollback identitas Auth bila
      // penulisan profil gagal; kegagalan rollback hanya dicatat di server.
      if (authNeedsUpdate && oldAuthEmail) {
        const { error: rollbackError } = await admin.auth.admin.updateUserById(target.auth_id, {
          email: oldAuthEmail,
          email_confirm: true,
        })
        if (rollbackError) console.error('[update-user-email] Rollback Auth gagal:', rollbackError.message)
      }
      console.error('[update-user-email] Gagal memperbarui profil:', profileError?.message || 'update ditolak')
      return res.status(500).json({ error: 'Gagal memperbarui email akun.' })
    }

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ ok: true, email })
  } catch (error) {
    console.error('[update-user-email]', error?.message || 'unknown')
    return res.status(500).json({ error: 'Terjadi kesalahan internal.' })
  }
}
