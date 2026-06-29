import { supabase } from '@/lib/supabase'

// Cek apakah role user cocok dengan salah satu role target. User dapat punya
// role utama (role) dan role kedua (role_secondary) — keduanya dipertimbangkan.
// PKS dikenali lewat penanda is_pks ATAU role/role_secondary = 'PKS'.
function userHasRole(profile, role) {
  if (role === 'PKS') {
    return profile?.is_pks === true || profile?.role === 'PKS' || profile?.role_secondary === 'PKS'
  }
  return profile?.role === role || profile?.role_secondary === role
}

// Cek apakah seorang user berhak mengakses sebuah template tugas.
// Setiap batasan yang DIISI harus terpenuhi; batasan kosong diabaikan:
//  - Admin/Super Admin selalu boleh (mereka mengelola tugas).
//  - allowed_roles: bila diisi, role user harus termasuk salah satunya.
//  - allowed_ministry: bila diisi, salah satu ministry user harus cocok.
//  - category_ministry_ids: gerbang TAMBAHAN dari Kategori Tugas (Super Admin) —
//    bila kategori tugas ini dibatasi ke ministry tertentu, salah satu ministry
//    user harus cocok. Kategori tanpa batasan (mis. "Umum") meloloskan semua,
//    sehingga tugas lama yang dibackfill ke kategori "Umum" tidak terdampak.
export function canAccessTemplate(template, profile) {
  if (['Admin', 'Super Admin'].includes(profile?.role)) return true

  const roles = template?.allowed_roles || []
  if (roles.length > 0 && !roles.some(r => userHasRole(profile, r))) return false

  const allowed = template?.allowed_ministry || []
  if (allowed.length > 0) {
    const mine = (profile?.ministry_ids || []).map(String)
    if (!allowed.map(String).some(m => mine.includes(m))) return false
  }

  const catAllowed = template?.category_ministry_ids || []
  if (catAllowed.length > 0) {
    const mine = (profile?.ministry_ids || []).map(String)
    if (!catAllowed.map(String).some(m => mine.includes(m))) return false
  }

  return true
}

// Ratakan relasi template_ministries jadi array allowed_ministry pada template,
// dan relasi task_categories->task_category_ministries jadi category_ministry_ids.
function withAllowedMinistry(t) {
  if (!t) return t
  return {
    ...t,
    allowed_ministry: (t.template_ministries || []).map(r => r.ministry_id),
    category_name: t.task_categories?.name || '',
    category_ministry_ids: (t.task_categories?.task_category_ministries || []).map(r => r.ministry_id),
  }
}

export const tasksService = {
  // Form Templates.
  // Pembatasan ministry tidak lagi dilakukan lewat query yang rapuh — gunakan
  // canAccessTemplate() di sisi pemanggil (mis. TasksPage) untuk menyaring, agar
  // tugas terbuka (allowed_ministry kosong) tidak ikut tersaring keluar.
  async getTemplates() {
    const { data, error } = await supabase
      .from('form_templates')
      .select('*, template_ministries(ministry_id), task_categories(name, task_category_ministries(ministry_id))')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map(withAllowedMinistry)
  },

  async getTemplateById(id) {
    const { data, error } = await supabase
      .from('form_templates')
      .select('*, template_ministries(ministry_id), task_categories(name, task_category_ministries(ministry_id))')
      .eq('form_id', id).single()
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
    const { data: tmpl } = await supabase
      .from('form_templates').select('once_per_day').eq('form_id', response.form_id).single()
    if (tmpl?.once_per_day) {
      const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
      const { data: existing } = await supabase
        .from('form_responses').select('response_id')
        .eq('form_id', response.form_id).eq('volunteer_id', response.volunteer_id)
        .gte('submitted_at', startToday.toISOString()).limit(1)
      if (existing && existing.length > 0) {
        throw new Error('Tugas ini hanya dapat diisi 1x per hari. Coba lagi besok.')
      }
    }
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

  async uploadFormBackground(file) {
    const ext = file.name.split('.').pop()
    const path = `form-bg/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('task-files').upload(path, file, { upsert: true })
    if (error) throw error
    return supabase.storage.from('task-files').getPublicUrl(path).data.publicUrl
  },
}

// Kategori Tugas — dibuat & dikelola Super Admin saja (lebih ketat dari
// Kategori Komsel yang bisa dikelola Admin biasa). Tiap kategori opsional
// dibatasi ke sejumlah ministry lewat task_category_ministries.
function withCategoryMinistries(c) {
  if (!c) return c
  return { ...c, ministry_ids: (c.task_category_ministries || []).map(r => r.ministry_id) }
}

export const taskCategoriesService = {
  async getAll() {
    const { data, error } = await supabase
      .from('task_categories')
      .select('*, task_category_ministries(ministry_id)')
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data || []).map(withCategoryMinistries)
  },

  async create({ name, ministry_ids = [] }) {
    const { data, error } = await supabase
      .from('task_categories').insert({ name }).select().single()
    if (error) throw error
    await this.setCategoryMinistries(data.category_id, ministry_ids)
    return { ...data, ministry_ids }
  },

  async update(id, { name, ministry_ids }) {
    const { data, error } = await supabase
      .from('task_categories').update({ name }).eq('category_id', id).select().single()
    if (error) throw error
    if (ministry_ids !== undefined) await this.setCategoryMinistries(id, ministry_ids)
    return { ...data, ministry_ids: ministry_ids ?? [] }
  },

  async delete(id) {
    const { error } = await supabase.from('task_categories').delete().eq('category_id', id)
    if (error) throw error
  },

  async setCategoryMinistries(categoryId, ids = []) {
    const { data: existing } = await supabase
      .from('task_category_ministries').select('ministry_id').eq('category_id', categoryId)
    const have = new Set((existing || []).map(r => r.ministry_id))
    const want = new Set(ids)
    const toAdd = ids.filter(x => !have.has(x))
    const toRemove = [...have].filter(x => !want.has(x))
    if (toRemove.length) {
      await supabase.from('task_category_ministries').delete().eq('category_id', categoryId).in('ministry_id', toRemove)
    }
    if (toAdd.length) {
      await supabase.from('task_category_ministries').insert(toAdd.map(ministry_id => ({ category_id: categoryId, ministry_id })))
    }
  },
}
