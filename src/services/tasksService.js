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
//
// CATATAN: Kategori Tugas (task_categories + category_ministry_ids) SENGAJA
// TIDAK lagi menggerbang akses. Kategori kini murni pengelompokan visual
// (folder di halaman Tugas). Sebuah form yang tidak dibatasi role/ministry
// harus bisa diisi SEMUA user, meski kategorinya kebetulan punya ministry.
// Ini juga menyelaraskan klien dengan RLS `templates_read_access` yang
// memang tidak pernah menggerbang berdasarkan kategori.
//
// Opsi `strict`: menonaktifkan pintasan Admin. Dipakai untuk evaluasi — di
// sana kita ingin melihat siapa yang BERHAK MENGISI form, bukan siapa yang
// bisa melihatnya (Admin biasa tidak dievaluasi kecuali punya role_secondary
// yang lolos gerbang role + ministry).
export function canAccessTemplate(template, profile, { strict = false } = {}) {
  if (!strict && ['Admin', 'Super Admin'].includes(profile?.role)) return true

  const roles = template?.allowed_roles || []
  if (roles.length > 0 && !roles.some(r => userHasRole(profile, r))) return false

  const allowed = template?.allowed_ministry || []
  if (allowed.length > 0) {
    const mine = (profile?.ministry_ids || []).map(String)
    if (!allowed.map(String).some(m => mine.includes(m))) return false
  }

  return true
}

// Jadwal buka form: active_days (nama hari Indonesia; kosong = setiap hari) +
// open_time/close_time ("HH:MM"; default 00:00–23:59 = sepanjang hari). Semua
// dihitung di zona WIB (Asia/Jakarta), konsisten dgn cron & once_per_day.
// Mengembalikan { open, dayOk, timeOk, hasSchedule, label } — `label` = teks
// jadwal siap tampil (mis. "Senin, Rabu · 08:00–17:00 WIB").
export function getTemplateSchedule(template) {
  const days = (template?.active_days || []).filter(Boolean)
  const openT = template?.open_time || '00:00'
  const closeT = template?.close_time || '23:59'

  const now = new Date()
  const todayName = new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' }).format(now)
  const nowHM = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta' }).format(now)

  const dayOk = days.length === 0 || days.some(d => String(d).toLowerCase() === todayName.toLowerCase())
  // 23:59 (dan 24:00) dianggap "sampai akhir hari".
  const allDay = openT === '00:00' && (closeT === '23:59' || closeT === '24:00')
  let timeOk = true
  if (!allDay) {
    timeOk = openT <= closeT
      ? (nowHM >= openT && nowHM <= closeT)         // jendela normal
      : (nowHM >= openT || nowHM <= closeT)          // jendela lintas tengah malam
  }

  const parts = []
  if (days.length) parts.push(days.join(', '))
  if (!allDay) parts.push(`${openT}–${closeT} WIB`)

  return {
    open: dayOk && timeOk,
    dayOk,
    timeOk,
    hasSchedule: days.length > 0 || !allDay,
    label: parts.join(' · '),
  }
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

  // Respon GLOBAL lintas semua form/SOP — untuk halaman Admin "Respon SOP".
  // Join form_templates (judul + fields_json utk render detail) dan users (nama).
  // Kedua relasi punya satu FK saja dari form_responses → tidak ambigu.
  async getResponsesGlobal({ page = 1, limit = 20, formId = null, startDate = null, endDate = null } = {}) {
    const from = (page - 1) * limit
    let query = supabase
      .from('form_responses')
      .select('*, users(name, role), form_templates(title, fields_json)', { count: 'exact' })
    if (formId) query = query.eq('form_id', formId)
    if (startDate) query = query.gte('submitted_at', startDate)
    if (endDate) query = query.lte('submitted_at', endDate)
    const { data, error, count } = await query
      .order('submitted_at', { ascending: false })
      .range(from, from + limit - 1)
    if (error) throw error
    return { data, count }
  },

  // Hapus satu respon. Digerbang RLS `responses_admin_delete`
  // (auth_admin_can('/admin/respon')) — lihat Migrasi v49.
  async deleteResponse(id) {
    const { error } = await supabase.from('form_responses').delete().eq('response_id', id)
    if (error) throw error
  },

  async uploadResponseFile(userId, file) {
    const path = `responses/${userId}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('task-files').upload(path, file)
    if (error) throw error
    const { data } = supabase.storage.from('task-files').getPublicUrl(path)
    return data.publicUrl
  },

  // Rangkuman SOP yang belum tuntas untuk 1 user. Dipakai kartu nudge Beranda.
  // Mengkomposisi ulang logic cron reminder tapi dari sisi klien (anon key + RLS),
  // reuse canAccessTemplate() + getMyResponses() bawaan file ini — TIDAK
  // menduplikasi query template_ministries/user_ministries manual (versi cron
  // pakai service role sehingga harus manual; klien tidak perlu).
  async getIncompleteSopSummary(profile) {
    if (!profile?.user_id) return []
    const templates = await this.getTemplates().catch(() => [])
    const eligible = templates.filter(t => t.reminder_enabled && canAccessTemplate(t, profile))
    const now = new Date()
    const startOfWeekMonday = () => {
      const d = new Date(now)
      const day = (d.getDay() + 6) % 7
      d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0); return d
    }
    const startOfMonth = () => new Date(now.getFullYear(), now.getMonth(), 1)
    const summary = []
    for (const tpl of eligible) {
      const periodStart = tpl.period === 'bulan' ? startOfMonth() : startOfWeekMonday()
      const resp = await this.getMyResponses(profile.user_id, tpl.form_id, periodStart.toISOString()).catch(() => [])
      const completed = (resp || []).length
      const goal = tpl.weekly_goal || 1
      if (completed < goal) {
        summary.push({ formId: tpl.form_id, formTitle: tpl.title, completed, goal })
      }
    }
    return summary
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
