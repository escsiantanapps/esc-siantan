import { supabase } from '@/lib/supabase'

// Log audit hanya bisa dibaca Super Admin (dijaga RLS di DB).
export const auditService = {
  // Ambil entri audit dengan filter opsional (tabel & aksi) + pagination.
  async list({ table = null, action = null, limit = 50, offset = 0 } = {}) {
    let q = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (table) q = q.eq('table_name', table)
    if (action) q = q.eq('action', action)
    const { data, error, count } = await q
    if (error) throw error
    return { rows: data || [], count: count || 0 }
  },
}
