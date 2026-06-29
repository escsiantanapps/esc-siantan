import { supabase } from '@/lib/supabase'

// ─── Events ──────────────────────────────────────────────
export const eventsService = {
  async getAll({ status = '' } = {}) {
    let query = supabase.from('events').select('*').order('event_date', { ascending: true })
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw error
    return data
  },

  async getById(id) {
    const { data, error } = await supabase.from('events').select('*').eq('event_id', id).single()
    if (error) throw error
    return data
  },

  async create(event) {
    const { data, error } = await supabase.from('events').insert(event).select().single()
    if (error) throw error
    return data
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('events').update(updates).eq('event_id', id).select().single()
    if (error) throw error
    return data
  },

  async delete(id) {
    const { error } = await supabase.from('events').delete().eq('event_id', id)
    if (error) throw error
  },

  async register(eventId, userId) {
    const ticketId = `TKT-${Date.now()}`
    const { data, error } = await supabase.from('event_registrations')
      .insert({ ticket_id: ticketId, event_id: eventId, user_id: userId }).select().single()
    if (error) throw error
    return data
  },

  async getRegistrations(eventId) {
    const { data, error } = await supabase.from('event_registrations')
      .select('*, users(name, role, phone)').eq('event_id', eventId)
    if (error) throw error
    return data
  },

  async getMyRegistration(eventId, userId) {
    const { data, error } = await supabase.from('event_registrations')
      .select('*').eq('event_id', eventId).eq('user_id', userId).maybeSingle()
    if (error) throw error
    return data
  },

  async getMyRegistrations(userId) {
    const { data, error } = await supabase.from('event_registrations')
      .select('*, events(*)').eq('user_id', userId).order('registered_at', { ascending: false })
    if (error) throw error
    return data
  },

  async uploadThumbnail(file) {
    const ext = file.name.split('.').pop()
    const path = `events/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('profile-photos').upload(path, file)
    if (error) throw error
    const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
    return data.publicUrl
  },
}

// ─── News ─────────────────────────────────────────────────
export const newsService = {
  async getAll() {
    const { data, error } = await supabase.from('news')
      .select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async getById(id) {
    const { data, error } = await supabase.from('news').select('*').eq('news_id', id).single()
    if (error) throw error
    return data
  },

  async create(news) {
    const { data, error } = await supabase.from('news').insert(news).select().single()
    if (error) throw error
    return data
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('news').update(updates).eq('news_id', id).select().single()
    if (error) throw error
    return data
  },

  async delete(id) {
    const { error } = await supabase.from('news').delete().eq('news_id', id)
    if (error) throw error
  },

  async uploadThumbnail(file) {
    const ext = file.name.split('.').pop()
    const path = `news/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('profile-photos').upload(path, file)
    if (error) throw error
    const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
    return data.publicUrl
  },
}

// ─── Baptism & Wedding Registrations ──────────────────────
// Peta jenis registrasi -> nama tabel & kolom PK, dipakai getById/updateStatus
// generik di bawah supaya menambah jenis baru (mis. penyerahan anak) tidak
// perlu menulis ulang seluruh fungsi.
const REGISTRATION_TABLES = {
  baptism: { table: 'baptism_registrations', idCol: 'baptism_id' },
  wedding: { table: 'wedding_registrations', idCol: 'wedding_id' },
  dedication: { table: 'child_dedication_registrations', idCol: 'dedication_id' },
}

export const registrationService = {
  async submitBaptism(data) {
    const { data: result, error } = await supabase
      .from('baptism_registrations').insert(data).select().single()
    if (error) throw error
    return result
  },

  async submitWedding(data) {
    const { data: result, error } = await supabase
      .from('wedding_registrations').insert(data).select().single()
    if (error) throw error
    return result
  },

  async submitDedication(data) {
    const { data: result, error } = await supabase
      .from('child_dedication_registrations').insert(data).select().single()
    if (error) throw error
    return result
  },

  async getMyRegistrations(userId) {
    const [baptism, wedding, dedication] = await Promise.all([
      supabase.from('baptism_registrations').select('*').eq('user_id', userId),
      supabase.from('wedding_registrations').select('*').eq('user_id', userId),
      supabase.from('child_dedication_registrations').select('*').eq('user_id', userId),
    ])
    return {
      baptism: baptism.data || [],
      wedding: wedding.data || [],
      dedication: dedication.data || [],
    }
  },

  async getAllBaptism({ status = '' } = {}) {
    let query = supabase.from('baptism_registrations')
      .select('*, users(name, phone)').order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw error
    return data
  },

  async getAllWedding({ status = '' } = {}) {
    let query = supabase.from('wedding_registrations')
      .select('*, users(name, phone)').order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw error
    return data
  },

  async getAllDedication({ status = '' } = {}) {
    let query = supabase.from('child_dedication_registrations')
      .select('*, users(name, phone)').order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw error
    return data
  },

  async getById(type, id) {
    const { table, idCol } = REGISTRATION_TABLES[type]
    const { data, error } = await supabase
      .from(table).select('*, users(name, phone, email)').eq(idCol, id).single()
    if (error) throw error
    return data
  },

  async updateStatus(type, id, updates) {
    const { table, idCol } = REGISTRATION_TABLES[type]
    const { data, error } = await supabase
      .from(table).update(updates).eq(idCol, id).select().single()
    if (error) throw error
    return data
  },

  async uploadDocument(folder, file) {
    const path = `${folder}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('documents').upload(path, file)
    if (error) throw error
    const { data } = supabase.storage.from('documents').getPublicUrl(path)
    return data.publicUrl
  },
}

// ─── Classes (Kelas/Pembinaan) ─────────────────────────────
export const classesService = {
  async getAll({ status = '' } = {}) {
    let query = supabase.from('classes').select('*').order('name')
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw error
    return data
  },

  async getById(id) {
    const { data, error } = await supabase.from('classes').select('*').eq('class_id', id).single()
    if (error) throw error
    return data
  },

  async create(cls) {
    const { data, error } = await supabase.from('classes').insert(cls).select().single()
    if (error) throw error
    return data
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('classes').update(updates).eq('class_id', id).select().single()
    if (error) throw error
    return data
  },

  async delete(id) {
    const { error } = await supabase.from('classes').delete().eq('class_id', id)
    if (error) throw error
  },

  // ── Registrasi kelas (opsional -- absensi via QR tetap bisa tanpa daftar dulu) ──
  async register(classId, userId) {
    const registrationId = `CREG-${Date.now()}`
    const { data, error } = await supabase.from('class_registrations')
      .insert({ registration_id: registrationId, class_id: classId, user_id: userId }).select().single()
    if (error) throw error
    return data
  },

  async getRegistrations(classId) {
    const { data, error } = await supabase.from('class_registrations')
      .select('*, users(name, role, phone)').eq('class_id', classId)
    if (error) throw error
    return data
  },

  async getMyRegistration(classId, userId) {
    const { data, error } = await supabase.from('class_registrations')
      .select('*').eq('class_id', classId).eq('user_id', userId).maybeSingle()
    if (error) throw error
    return data
  },
}

// ─── Ministries (CRUD) ──────────────────────────────────────
export const ministriesService = {
  async getAll() {
    const { data, error } = await supabase.from('ministries').select('*').order('name')
    if (error) throw error
    return data
  },

  async create(ministry) {
    const { data, error } = await supabase.from('ministries').insert(ministry).select().single()
    if (error) throw error
    return data
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('ministries').update(updates).eq('ministry_id', id).select().single()
    if (error) throw error
    return data
  },

  async delete(id) {
    const { error } = await supabase.from('ministries').delete().eq('ministry_id', id)
    if (error) throw error
  },
}

// ─── Komsel (CRUD + anggota + absensi) ──────────────────────
// Kategori komsel (mis. Youth, Kids, Dewasa) -- dikelola Admin & Super Admin.
export const komselCategoriesService = {
  async getAll() {
    const { data, error } = await supabase.from('komsel_categories').select('*').order('name')
    if (error) throw error
    return data
  },

  async create(category) {
    const { data, error } = await supabase.from('komsel_categories').insert(category).select().single()
    if (error) throw error
    return data
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('komsel_categories').update(updates).eq('category_id', id).select().single()
    if (error) throw error
    return data
  },

  async delete(id) {
    const { error } = await supabase.from('komsel_categories').delete().eq('category_id', id)
    if (error) throw error
  },
}

export const komselService = {
  async getAll() {
    const { data, error } = await supabase.from('komsel').select('*, komsel_categories(name)').order('name')
    if (error) throw error
    return data
  },

  async create(komsel) {
    const { data, error } = await supabase.from('komsel').insert(komsel).select().single()
    if (error) throw error
    return data
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('komsel').update(updates).eq('komsel_id', id).select().single()
    if (error) throw error
    return data
  },

  async delete(id) {
    const { error } = await supabase.from('komsel').delete().eq('komsel_id', id)
    if (error) throw error
  },

  async getMembers(komselId) {
    const { data, error } = await supabase
      .from('users').select('*').eq('komsel_id', komselId).eq('status', 'Aktif').order('name')
    if (error) throw error
    return data
  },

  // Tetapkan keanggotaan komsel langsung dari halaman Kelola Komsel, tanpa
  // perlu pindah ke AdminMemberDetailPage.
  async assignMember(komselId, userId) {
    const { error } = await supabase.from('users').update({ komsel_id: komselId }).eq('user_id', userId)
    if (error) throw error
  },

  // ── PKS (kepemimpinan komsel, many-to-many lewat komsel_leaders) ──

  // Daftar PKS sebuah komsel.
  async getLeaders(komselId) {
    const { data, error } = await supabase
      .from('komsel_leaders').select('user_id, users(*)').eq('komsel_id', komselId)
    if (error) throw error
    return (data || []).map(r => r.users).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))
  },

  // Komsel-komsel yang dipimpin seorang user (untuk Dashboard PKS).
  async getLedKomsels(userId) {
    const { data, error } = await supabase
      .from('komsel_leaders').select('komsel_id, komsel(*)').eq('user_id', userId)
    if (error) throw error
    return (data || []).map(r => r.komsel).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))
  },

  // Tetapkan user sebagai PKS sebuah komsel + tandai is_pks (penanda cepat).
  async addLeader(komselId, userId) {
    const { error } = await supabase
      .from('komsel_leaders').upsert({ komsel_id: komselId, user_id: userId }, { onConflict: 'komsel_id,user_id' })
    if (error) throw error
    await supabase.from('users').update({ is_pks: true }).eq('user_id', userId)
  },

  // Cabut PKS dari sebuah komsel; matikan is_pks bila tak memimpin komsel lain.
  async removeLeader(komselId, userId) {
    const { error } = await supabase
      .from('komsel_leaders').delete().eq('komsel_id', komselId).eq('user_id', userId)
    if (error) throw error
    const { count } = await supabase
      .from('komsel_leaders').select('*', { count: 'exact', head: true }).eq('user_id', userId)
    if (!count) await supabase.from('users').update({ is_pks: false }).eq('user_id', userId)
  },

  // Peta { komsel_id: [nama PKS, ...] } untuk ditampilkan di daftar komsel.
  async getLeaderNamesByKomsel() {
    const { data, error } = await supabase.from('komsel_leaders').select('komsel_id, users(name)')
    if (error) throw error
    const map = {}
    for (const r of data || []) {
      if (!r.users) continue
      ;(map[r.komsel_id] ||= []).push(r.users.name)
    }
    return map
  },

  // Cari jemaat aktif untuk dipilih sebagai PKS.
  async searchUsers(query = '') {
    let q = supabase.from('users')
      .select('user_id, name, photo_url, role, komsel_id')
      .eq('status', 'Aktif').order('name').limit(20)
    if (query) q = q.ilike('name', `%${query}%`)
    const { data, error } = await q
    if (error) throw error
    return data
  },

  async submitAttendance(records) {
    const { data, error } = await supabase.from('komsel_attendance').insert(records).select()
    if (error) throw error
    return data
  },

  async getAttendanceHistory(komselId) {
    const { data, error } = await supabase
      .from('komsel_attendance').select('*, users(name)')
      .eq('komsel_id', komselId).order('attendance_date', { ascending: false })
    if (error) throw error
    return data
  },

  async getAllAttendance() {
    const { data, error } = await supabase
      .from('komsel_attendance').select('*, users(name), komsel(name)')
      .order('attendance_date', { ascending: false })
    if (error) throw error
    return data
  },
}

// Persembahan kolektif komsel (dicatat PKS saat pertemuan, diverifikasi Admin) --
// berbeda dari `offerings` yang per-individu jemaat.
export const komselOfferingsService = {
  async create({ komselId, category, amount, note, recordedBy }) {
    const { data, error } = await supabase
      .from('komsel_offerings')
      .insert({ komsel_id: komselId, category, amount, note: note || null, recorded_by: recordedBy })
      .select().single()
    if (error) throw error
    return data
  },

  async getByKomsel(komselId) {
    const { data, error } = await supabase
      .from('komsel_offerings').select('*').eq('komsel_id', komselId).order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async getAll({ startDate = null, endDate = null, status = '' } = {}) {
    let q = supabase.from('komsel_offerings').select('*, komsel(name)').order('created_at', { ascending: false })
    if (startDate) q = q.gte('created_at', startDate)
    if (endDate) q = q.lte('created_at', endDate)
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) throw error
    return data
  },

  async setStatus(id, status, verifierId) {
    const updates = { status }
    if (status === 'Terverifikasi') {
      updates.verified_at = new Date().toISOString()
      updates.verified_by = verifierId || null
    }
    const { data, error } = await supabase
      .from('komsel_offerings').update(updates).eq('id', id).select().single()
    if (error) throw error
    return data
  },
}

// ─── Sertifikat (diterbitkan manual oleh Admin) ────────────
export const certificatesService = {
  async issue({ userId, title, fileUrl, issuedBy, note }) {
    const { data, error } = await supabase
      .from('certificates')
      .insert({ user_id: userId, title, file_url: fileUrl, issued_by: issuedBy, note: note || null })
      .select().single()
    if (error) throw error
    return data
  },

  async getMine(userId) {
    const { data, error } = await supabase
      .from('certificates').select('*').eq('user_id', userId).order('issued_at', { ascending: false })
    if (error) throw error
    return data
  },

  async getAll() {
    const { data, error } = await supabase
      .from('certificates').select('*, users(name, phone)').order('issued_at', { ascending: false })
    if (error) throw error
    return data
  },

  async remove(certificateId) {
    const { error } = await supabase.from('certificates').delete().eq('certificate_id', certificateId)
    if (error) throw error
  },
}
