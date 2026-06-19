import { supabase } from '@/lib/supabase'

const LOGIN_BG_KEY = 'login_background'

// Pengaturan aplikasi (key/value) di tabel app_settings.
// Dapat dibaca anonim (halaman Login pra-auth); ditulis hanya Super Admin (RLS).
export const settingsService = {
  async getLoginBackground() {
    const { data, error } = await supabase
      .from('app_settings').select('value').eq('key', LOGIN_BG_KEY).maybeSingle()
    if (error) throw error
    return data?.value ?? null
  },

  async setLoginBackground(value) {
    const { error } = await supabase.from('app_settings').upsert(
      { key: LOGIN_BG_KEY, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
    if (error) throw error
  },

  async uploadLoginBackground(file) {
    const ext = file.name.split('.').pop()
    const path = `app/login-bg-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('profile-photos').upload(path, file, { upsert: true })
    if (error) throw error
    return supabase.storage.from('profile-photos').getPublicUrl(path).data.publicUrl
  },
}
