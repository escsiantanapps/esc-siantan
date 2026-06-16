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

// Ratakan relasi template_ministries jadi array allowed_ministry pada template.
function withAllowedMinistry(t) {
  if (!t) return t
  return { ...t, allowed_ministry: (t.template_ministries || []).map(r => r.ministry_id) }
}

export const tasksService = {
  // Form Templates.
  // Pembatasan ministry tidak lagi dilakukan lewat query yang rapuh — gunakan
  // canAccessTemplate() di sisi pemanggil (mis. TasksPage) untuk menyaring, agar
  // tugas terbuka (allowed_ministry kosong) tidak ikut tersaring keluar.
  async getTemplates() {
    const { data, error } = await supabase
      .from('form_templates').select('*, template_ministries(ministry_id)').order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map(withAllowedMinistry)
  },

  async getTemplateById(id) {
    const { data, error } = await supabase
      .from('form_templates').select('*, template_ministries(ministry_id)').eq('form_id', id).single()
    if (error) throw error
    return withAllowedMinistry(data)
  },

  async createTemplate(template) {
    const { allowed_ministry, ...payload } = template
    const { data, error } = await supabase
      .from('form_templates').insert(payload).select().single()
    if (error) throw error
    await this.setTemplateMinistries(data.form_id, allowed_ministry || [])
    return { ...data, allowed_ministry: allowed_ministry || [] }
  },

  async updateTemplate(id, updates) {
    const { allowed_ministry, template_ministries, ...payload } = updates
    const { data, error } = await supabase
      .from('form_templates').update(payload).eq('form_id', id).select().single()
    if (error) throw error
    if (allowed_ministry !== undefined) await this.setTemplateMinistries(id, allowed_ministry)
    return { ...data, allowed_ministry: allowed_ministry ?? [] }
  },

  // Selaraskan ministry yang boleh mengakses sebuah template.
  async setTemplateMinistries(formId, ids = []) {
    const { data: existing } = await supabase
      .from('template_ministries').select('ministry_id').eq('form_id', formId)
    const have = new Set((existing || []).map(r => r.ministry_id))
    const want = new Set(ids)
    const toAdd = ids.filter(x => !have.has(x))
    const toRemove = [...have].filter(x => !want.has(x))
    if (toRemove.length) {
      await supabase.from('template_ministries').delete().eq('form_id', formId).in('ministry_id', toRemove)
    }
    if (toAdd.length) {
      await supabase.from('template_ministries').insert(toAdd.map(ministry_id => ({ form_id: formId, ministry_id })))
    }
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
      .select('*, users(name, role)', { count: 'exact' })
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
