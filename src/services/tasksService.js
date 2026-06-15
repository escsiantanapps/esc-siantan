import { supabase } from '@/lib/supabase'

// Cek apakah seorang user berhak mengakses sebuah template tugas.
// Aturan: allowed_ministry kosong = terbuka untuk semua; Admin/Super Admin
// selalu boleh; selain itu, salah satu ministry user harus ada di allowed_ministry.
export function canAccessTemplate(template, profile) {
  const allowed = template?.allowed_ministry || []
  if (allowed.length === 0) return true
  if (['Admin', 'Super Admin'].includes(profile?.role)) return true
  const mine = (profile?.ministry_ids || []).map(String)
  return allowed.map(String).some(m => mine.includes(m))
}

export const tasksService = {
  // Form Templates.
  // Pembatasan ministry tidak lagi dilakukan lewat query yang rapuh — gunakan
  // canAccessTemplate() di sisi pemanggil (mis. TasksPage) untuk menyaring, agar
  // tugas terbuka (allowed_ministry kosong) tidak ikut tersaring keluar.
  async getTemplates() {
    const { data, error } = await supabase
      .from('form_templates').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async getTemplateById(id) {
    const { data, error } = await supabase.from('form_templates').select('*').eq('form_id', id).single()
    if (error) throw error
    return data
  },

  async createTemplate(template) {
    const { data, error } = await supabase
      .from('form_templates').insert(template).select().single()
    if (error) throw error
    return data
  },

  async updateTemplate(id, updates) {
    const { data, error } = await supabase
      .from('form_templates').update(updates).eq('form_id', id).select().single()
    if (error) throw error
    return data
  },

  async deleteTemplate(id) {
    const { error } = await supabase.from('form_templates').delete().eq('form_id', id)
    if (error) throw error
  },

  // Form Responses
  async submitResponse(response) {
    const { data, error } = await supabase
      .from('form_responses').insert(response).select().single()
    if (error) throw error
    return data
  },

  async getMyResponses(userId, formId, weekStart) {
    let query = supabase.from('form_responses')
      .select('*').eq('volunteer_id', userId).eq('form_id', formId)
    if (weekStart) query = query.gte('submitted_at', weekStart)
    const { data, error } = await query
    if (error) throw error
    return data
  },

  async getAllResponses(formId, { page = 1, limit = 30, startDate = null, endDate = null } = {}) {
    const from = (page - 1) * limit
    let query = supabase
      .from('form_responses')
      .select('*, users(name, role, ministry_ids)', { count: 'exact' })
      .eq('form_id', formId)
    if (startDate) query = query.gte('submitted_at', startDate)
    if (endDate) query = query.lte('submitted_at', endDate)
    const { data, error, count } = await query
      .order('submitted_at', { ascending: false })
      .range(from, from + limit - 1)
    if (error) throw error
    return { data, count }
  },

  async uploadResponseFile(userId, file) {
    const path = `responses/${userId}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('task-files').upload(path, file)
    if (error) throw error
    const { data } = supabase.storage.from('task-files').getPublicUrl(path)
    return data.publicUrl
  },
}
