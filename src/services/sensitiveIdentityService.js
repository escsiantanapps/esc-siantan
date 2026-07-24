import { supabase } from '@/lib/supabase'

// NIK tidak pernah diakses langsung dari tabel. RPC di database membatasi baca
// hanya untuk Super Admin dan membolehkan pemohon menyimpan NIK pengajuannya.
export const sensitiveIdentityService = {
  async getNik(scope, subjectId) {
    const { data, error } = await supabase.rpc('get_sensitive_nik', {
      p_scope: scope,
      p_subject_id: subjectId,
    })
    if (error) throw error
    return data || ''
  },

  async setNik(scope, subjectId, nik) {
    const { error } = await supabase.rpc('set_sensitive_nik', {
      p_scope: scope,
      p_subject_id: subjectId,
      p_nik: nik || null,
    })
    if (error) throw error
  },
}
