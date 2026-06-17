import { supabase } from '@/lib/supabase'

export const permissionsService = {
  // Hak akses milik SATU admin. null = belum diatur -> akses penuh (default).
  async getMyPermissions(userId) {
    const { data, error } = await supabase
      .from('admin_user_permissions').select('allowed_pages').eq('user_id', userId).maybeSingle()
    if (error) throw error
    return data?.allowed_pages ?? null
  },

  // Daftar admin (role 'Admin') + hak akses masing-masing (null = penuh).
  async getAdmins() {
    const { data: admins, error } = await supabase
      .from('users').select('user_id, name, photo_url, status').eq('role', 'Admin').order('name')
    if (error) throw error
    const { data: perms } = await supabase
      .from('admin_user_permissions').select('user_id, allowed_pages')
    const map = Object.fromEntries((perms || []).map(p => [p.user_id, p.allowed_pages]))
    return (admins || []).map(a => ({ ...a, allowed_pages: a.user_id in map ? map[a.user_id] : null }))
  },

  // Simpan hak akses seorang admin.
  async setUserPermissions(userId, allowedPages) {
    const { error } = await supabase.from('admin_user_permissions').upsert({
      user_id: userId, allowed_pages: allowedPages, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (error) throw error
  },

  // Jadikan seorang user sebagai Admin.
  async grantAdmin(userId) {
    const { error } = await supabase.from('users').update({ role: 'Admin' }).eq('user_id', userId)
    if (error) throw error
  },

  // Cabut akses admin: kembalikan ke Jemaat + hapus hak aksesnya.
  async revokeAdmin(userId) {
    const { error } = await supabase.from('users').update({ role: 'Jemaat' }).eq('user_id', userId)
    if (error) throw error
    await supabase.from('admin_user_permissions').delete().eq('user_id', userId)
  },

  // Cari user aktif yang BUKAN admin/super admin (untuk dijadikan admin).
  async searchCandidates(query = '') {
    let q = supabase.from('users')
      .select('user_id, name, photo_url, role')
      .eq('status', 'Aktif')
      .not('role', 'in', '("Admin","Super Admin")')
      .order('name').limit(20)
    if (query) q = q.ilike('name', `%${query}%`)
    const { data, error } = await q
    if (error) throw error
    return data
  },
}
