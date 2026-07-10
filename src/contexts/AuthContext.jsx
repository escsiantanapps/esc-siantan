import { createContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchApi } from '@/lib/utils'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Lacak id user yang profilnya sedang/sudah diambil agar getSession dan
    // onAuthStateChange tidak men-fetch profil dua kali untuk user yang sama.
    let fetchedFor = null

    // Cek session awal
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          // Guard: onAuthStateChange mungkin sudah memulai fetchProfile lebih dulu
          if (fetchedFor !== session.user.id) {
            fetchedFor = session.user.id
            fetchProfile(session.user)
          }
          // jika fetchedFor sudah sama → fetchProfile sedang berjalan, tidak perlu ulang
        } else {
          setLoading(false)
        }
      })
      .catch(() => {
        // getSession gagal (localStorage corrupt, jaringan, dsb.)
        // Jangan biarkan app terjebak di loading selamanya → munculkan login
        setLoading(false)
      })

    // Listen perubahan auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        if (fetchedFor === session.user.id) return // sudah/ sedang di-fetch
        fetchedFor = session.user.id
        fetchProfile(session.user)
      } else { fetchedFor = null; setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(authUser) {
    try {
      let { data, error } = await supabase
        .from('users')
        .select('*, user_ministries(ministry_id)')
        .eq('auth_id', authUser.id)
        .maybeSingle()

      if (error) throw error
      if (data) data.ministry_ids = (data.user_ministries || []).map(r => r.ministry_id)

      // Akun auth ada tapi baris profil belum ada (mis. gagal saat registrasi) -> buat otomatis
      if (!data) {
        const { data: created, error: insertErr } = await supabase
          .from('users')
          .insert({
            auth_id: authUser.id,
            name: authUser.email?.split('@')[0] || 'Jemaat',
            email: authUser.email,
            role: 'Jemaat',
            status: 'Menunggu Persetujuan',
            sp_level: 'Aman',
          })
          .select()
          .maybeSingle()
        if (insertErr) throw insertErr
        data = created
      }

      setProfile(data)
    } catch {
      // Gagal memuat profil (mis. jaringan putus). Jangan biarkan user terjebak
      // di layar spinner — biarkan profile null agar UI bisa menampilkan login.
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  // Login dengan email ATAU nomor telepon. Bila bukan email, nomor diresolusi
  // ke akun lewat serverless (service role) lalu sesi di-set di klien.
  async function login(identifier, password) {
    const id = String(identifier || '').trim()
    if (id.includes('@')) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: id, password })
      if (error) throw error
      return data
    }
    const res = await fetchApi('/api/login-phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: id, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Gagal masuk.')
    const { error } = await supabase.auth.setSession({
      access_token: data.access_token, refresh_token: data.refresh_token,
    })
    if (error) throw error
    return data
  }

  async function register(formData) {
    // Cek duplikat nomor HP DAN email sebelum membuat akun (gagal-aman:
    // lanjut bila endpoint bermasalah — signUp tetap menolak email ganda di
    // auth.users sebagai jaring pengaman terakhir).
    try {
      const r = await fetchApi('/api/check-phone', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formData.phone, email: formData.email }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        if (j.emailTaken) throw new Error('EMAIL_TAKEN')
        if (j.phoneTaken || j.available === false) throw new Error('PHONE_TAKEN')
      }
    } catch (e) {
      if (e.message === 'PHONE_TAKEN' || e.message === 'EMAIL_TAKEN') throw e
      // error jaringan endpoint → abaikan, lanjutkan registrasi
    }

    const { data, error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
    })
    if (error) throw error

    const orNull = v => (v === '' || v === undefined ? null : v)

    // Simpan data profil ke tabel users, termasuk data diri dari step 2.
    // UPSERT (bukan INSERT) pada auth_id: signUp memicu onAuthStateChange →
    // fetchProfile yang, bila baris belum ada, membuat profil MINIMAL (nama dari
    // email) sebagai jaring pengaman. Kalau auto-create itu menang balapan,
    // INSERT biasa di sini akan gagal (auth_id UNIQUE) dan biodata step-2 HILANG.
    // Dengan upsert, biodata lengkap tetap tertulis (menimpa baris minimal itu).
    const { error: profileError } = await supabase.from('users').upsert({
      auth_id: data.user.id,
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      role: 'Jemaat',
      status: 'Menunggu Persetujuan',
      sp_level: 'Aman',
      gender: orNull(formData.gender),
      birth_date: orNull(formData.birth_date),
      birth_place: orNull(formData.birth_place),
      address: orNull(formData.address),
      blood_type: orNull(formData.blood_type),
      social_media: orNull(formData.social_media),
    }, { onConflict: 'auth_id' })
    if (profileError) throw profileError
    return data
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  // Kirim email berisi kode OTP pemulihan (template email memuat {{ .Token }}).
  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) throw error
  }

  // Verifikasi kode OTP pemulihan → membuat sesi sementara untuk ganti sandi.
  async function verifyResetOtp(email, token) {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' })
    if (error) throw error
  }

  async function updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  }

  async function updateProfile(updates) {
    // ministry_ids bukan kolom tabel (dinormalisasi ke user_ministries) — jangan
    // dikirim ke update users, tapi tetap pakai untuk menyegarkan state lokal.
    const { ministry_ids, user_ministries, ...scalar } = updates
    const { error } = await supabase
      .from('users')
      .update(scalar)
      .eq('auth_id', user.id)
    if (error) throw error
    setProfile(prev => ({ ...prev, ...updates }))
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user)
  }

  const isAdmin = profile?.role === 'Admin' || profile?.role === 'Super Admin'
  const isPKS = profile?.is_pks === true || profile?.role === 'PKS'
  // Volunteer via role utama ATAU role kedua (mis. Admin yang juga Volunteer).
  const isVolunteer = profile?.role === 'Volunteer' || profile?.role_secondary === 'Volunteer'
  // Gembala — peran fokus: broadcast pesan + lihat data (read-only). Sengaja
  // TERPISAH dari isAdmin agar tidak ikut membuka afordance khusus Admin.
  const isGembala = profile?.role === 'Gembala'

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      login, register, logout, updateProfile, refreshProfile,
      resetPassword, verifyResetOtp, updatePassword,
      isAdmin, isPKS, isVolunteer, isGembala,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
