import { createContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Cek session awal
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user)
      else setLoading(false)
    })

    // Listen perubahan auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(authUser) {
    let { data } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authUser.id)
      .maybeSingle()

    // Akun auth ada tapi baris profil belum ada (mis. gagal saat registrasi) -> buat otomatis
    if (!data) {
      const { data: created } = await supabase
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
      data = created
    }

    setProfile(data)
    setLoading(false)
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

  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
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
      resetPassword, updatePassword,
      isAdmin, isPKS,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
