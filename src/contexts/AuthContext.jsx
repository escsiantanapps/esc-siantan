import { createContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) { fetchedFor = session.user.id; fetchProfile(session.user) }
      else setLoading(false)
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

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function register(formData) {
    const { data, error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
    })
    if (error) throw error

    const orNull = v => (v === '' || v === undefined ? null : v)

    // Simpan data profil ke tabel users, termasuk data diri dari step 2
    const { error: profileError } = await supabase.from('users').insert({
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
    })
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
    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('auth_id', user.id)
    if (error) throw error
    setProfile(prev => ({ ...prev, ...updates }))
  }

  const isAdmin = profile?.role === 'Admin' || profile?.role === 'Super Admin'
  const isPKS = profile?.is_pks === true || profile?.role === 'PKS'

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      login, register, logout, updateProfile,
      resetPassword, verifyResetOtp, updatePassword,
      isAdmin, isPKS,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
