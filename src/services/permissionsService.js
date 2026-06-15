import { supabase } from '@/lib/supabase'

export const permissionsService = {
  // null = belum ada konfigurasi -> dianggap akses penuh (default)
  async getAdminPermissions() {
    const { data, error } = await supabase
      .from('admin_permissions').select('*').eq('role', 'Admin').maybeSingle()
    if (error) throw error
    return data?.allowed_pages ?? null
  },

  async updateAdminPermissions(allowedPages) {
    const { data, error } = await supabase
      .from('admin_permissions')
      .upsert({ role: 'Admin', allowed_pages: allowedPages, updated_at: new Date().toISOString() })
      .select().single()
    if (error) throw error
    return data
  },
}
