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

  async removeRegistration(ticketId) {
    const { error } = await supabase.from('event_registrations').delete().eq('ticket_id', ticketId)
    if (error) throw error
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
  ktj: { table: 'ktj_registrations', idCol: 'ktj_id' },
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

  async submitKtj(data) {
    const { data: result, error } = await supabase
      .from('ktj_registrations').insert(data).select().single()
    if (error) throw error
    return result
  },

  async getMyRegistrations(userId) {
    const [baptism, wedding, dedication, ktj] = await Promise.all([
      supabase.from('baptism_registrations').select('*').eq('user_id', userId),
      supabase.from('wedding_registrations').select('*').eq('user_id', userId),
      supabase.from('child_dedication_registrations').select('*').eq('user_id', userId),
      supabase.from('ktj_registrations').select('*').eq('user_id', userId),
    ])
    return {
      baptism: baptism.data || [],
      wedding: wedding.data || [],
      dedication: dedication.data || [],
      ktj: ktj.data || [],
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

  async getAllKtj({ status = '' } = {}) {
    let query = supabase.from('ktj_registrations')
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
    // Sanitasi nama file: hilangkan segmen path (../), spasi & karakter
    // di luar whitelist, plus batasi panjang. Cegah PII bocor ke URL &
    // path traversal.
    const rawName = String(file?.name || 'file').split(/[\\/]/).pop() || 'file'
    const dotIdx = rawName.lastIndexOf('.')
    const base = dotIdx > 0 ? rawName.slice(0, dotIdx) : rawName
    const extRaw = dotIdx > 0 ? rawName.slice(dotIdx + 1) : ''
    const safeBase = base.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'file'
    const safeExt = extRaw.replace(/[^a-zA-Z0-9]+/g, '').slice(0, 8).toLowerCase()
    const filename = safeExt ? `${Date.now()}_${safeBase}.${safeExt}` : `${Date.now()}_${safeBase}`
    const path = `${folder}/${filename}`

    const { error } = await supabase.storage.from('documents').upload(path, file, {
      contentType: file.type || 'application/octet-stream',
    })
    if (error) throw error
    // Bucket 'documents' privat (v38). Pakai signed URL long-lived (1 tahun)
    // agar link tetap valid untuk review admin & jemaat tanpa perlu regen.
    const { data: signed, error: sErr } = await supabase.storage.from('documents')
      .createSignedUrl(path, 60 * 60 * 24 * 365)
    if (sErr) throw sErr
    return signed.signedUrl
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

  async uploadThumbnail(file) {
    const ext = file.name.split('.').pop()
    const path = `classes/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('profile-photos').upload(path, file)
    if (error) throw error
    const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
    return data.publicUrl
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

  async removeRegistration(registrationId) {
    const { error } = await supabase.from('class_registrations').delete().eq('registration_id', registrationId)
    if (error) throw error
  },
}

// ─── Formulir Prasyarat Event/Kelas ─────────────────────────
// Opt-in per Event/Kelas (kolom prerequisite_fields JSONB pada masing2 tabel).
// Bila terisi: user WAJIB submit + admin approve dulu SEBELUM baris registrasi
// dibuat. Delete row prasyarat men-cascade menghapus baris registrasi terkait.
const PREREQ_TABLES = {
  event: { table: 'event_registrations', idCol: 'ticket_id', prefix: 'TKT', fk: 'event_id' },
  class: { table: 'class_registrations', idCol: 'registration_id', prefix: 'CREG', fk: 'class_id' },
}

export const prerequisiteService = {
  async getMine(kind, targetId, userId) {
    const fk = PREREQ_TABLES[kind].fk
    const { data, error } = await supabase.from('registration_prerequisites')
      .select('*').eq(fk, targetId).eq('user_id', userId).maybeSingle()
    if (error) throw error
    return data
  },

  async submit({ kind, targetId, userId, data_json }) {
    const fk = PREREQ_TABLES[kind].fk
    const row = { [fk]: targetId, user_id: userId, data_json: data_json || {} }
    const { data, error } = await supabase.from('registration_prerequisites')
      .insert(row).select().single()
    if (error) throw error
    return data
  },

  async getForTarget(kind, targetId) {
    const fk = PREREQ_TABLES[kind].fk
    const { data, error } = await supabase.from('registration_prerequisites')
      .select('*, users(name, phone)').eq(fk, targetId).order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  // Approve: 2 langkah non-atomik (trade-off didokumentasikan di plan).
  // 1) update status prasyarat → Disetujui
  // 2) insert baris registrasi terkait dg prerequisite_id agar cascade delete
  async approve(id, { kind, targetId, userId, admin_note = '' }) {
    const { error: updErr } = await supabase.from('registration_prerequisites')
      .update({ status: 'Disetujui', admin_note, reviewed_at: new Date().toISOString() })
      .eq('id', id)
    if (updErr) throw updErr

    const cfg = PREREQ_TABLES[kind]
    const newId = `${cfg.prefix}-${Date.now()}`
    const regRow = { [cfg.idCol]: newId, [cfg.fk]: targetId, user_id: userId, prerequisite_id: id }
    const { data, error } = await supabase.from(cfg.table).insert(regRow).select().single()
    if (error) throw error
    return data
  },

  async reject(id, admin_note = '') {
    const { data, error } = await supabase.from('registration_prerequisites')
      .update({ status: 'Ditolak', admin_note, reviewed_at: new Date().toISOString() })
      .eq('id', id).select().single()
    if (error) throw error
    return data
  },

  async remove(id) {
    // FK ON DELETE CASCADE otomatis menghapus baris event/class_registrations terkait.
    const { error } = await supabase.from('registration_prerequisites').delete().eq('id', id)
    if (error) throw error
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
    // Pakai RPC get_komsel_members (v38) supaya kolom NIK tidak keluar ke
    // klien walau pemanggilnya PKS. RPC juga menegakkan otorisasi di server
    // (Admin/Super Admin atau PKS komsel tsb).
    const { data, error } = await supabase.rpc('get_komsel_members', { p_komsel_id: komselId })
    if (error) throw error
    // RPC tidak menyaring status di server — filter di klien agar sesuai
    // perilaku lama (hanya jemaat Aktif).
    return (data || []).filter(m => m.status === 'Aktif').sort((a, b) => a.name.localeCompare(b.name))
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

  // ── Sesi Absensi Komsel (QR: ESC-KOMSEL:<session_id>) ──
  // PKS membuat sesi → QR ditampilkan → jemaat scan utk catat kehadirannya
  // sendiri (+1 poin otomatis via trigger DB).
  async createSession(komselId, title, createdBy) {
    const { data, error } = await supabase.from('komsel_sessions')
      .insert({ komsel_id: komselId, title, created_by: createdBy }).select().single()
    if (error) throw error
    return data
  },

  async getSessions(komselId) {
    const { data, error } = await supabase.from('komsel_sessions')
      .select('*').eq('komsel_id', komselId)
      .order('created_at', { ascending: false }).limit(30)
    if (error) throw error
    return data
  },

  // Sesi absensi dalam satu bulan (ym = 'YYYY-MM') untuk rekap bulanan admin.
  async getSessionsInMonth(komselId, ym) {
    const [y, m] = ym.split('-').map(Number)
    const start = `${ym}-01`
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) // hari terakhir bulan
    const { data, error } = await supabase.from('komsel_sessions')
      .select('*').eq('komsel_id', komselId)
      .gte('session_date', start).lte('session_date', end)
      .order('session_date', { ascending: false })
    if (error) throw error
    return data
  },

  // Semua kehadiran untuk sekumpulan sesi (dipakai agregasi rekap bulanan).
  async getAttendanceForSessions(sessionIds) {
    if (!sessionIds || sessionIds.length === 0) return []
    const { data, error } = await supabase.from('komsel_attendance')
      .select('session_id, user_id, users(name, photo_url)')
      .in('session_id', sessionIds)
    if (error) throw error
    return data
  },

  async getSessionById(sessionId) {
    const { data, error } = await supabase.from('komsel_sessions')
      .select('*, komsel(name)').eq('session_id', sessionId).single()
    if (error) throw error
    return data
  },

  async deleteSession(sessionId) {
    const { error } = await supabase.from('komsel_sessions').delete().eq('session_id', sessionId)
    if (error) throw error
  },

  // Kehadiran satu sesi (untuk PKS memantau siapa saja yang sudah scan).
  async getSessionAttendance(sessionId) {
    const { data, error } = await supabase.from('komsel_attendance')
      .select('*, users(name, photo_url)').eq('session_id', sessionId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  // Jemaat mencatat kehadirannya sendiri lewat scan QR sesi.
  async checkInSession(session, userId) {
    const { data, error } = await supabase.from('komsel_attendance')
      .insert({
        komsel_id: session.komsel_id,
        user_id: userId,
        session_id: session.session_id,
        attendance_date: session.session_date,
        status: 'Hadir',
      }).select().single()
    if (error) {
      if (error.code === '23505') throw new Error('Kehadiran sesi ini sudah tercatat.')
      throw error
    }
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

// ─── Pengaturan aplikasi (app_settings key/value) ──────────
// Dibaca siapa saja (termasuk pra-login); ditulis Super Admin (RLS).
//
// PENTING: kolom `app_settings.value` di DB produksi bertipe TEXT (tabel dibuat
// versi lama; schema.sql menyebut JSONB tapi belum diterapkan). Karena itu nilai
// SELALU disimpan sebagai STRING JSON (stringify saat tulis) dan di-parse saat
// baca. Pola ini aman baik untuk kolom text maupun jsonb — dan data lama yang
// terlanjur tersimpan sebagai teks JSON (mis. '[{...}]', '50') tetap terbaca
// benar lewat parse dengan fallback.
function parseSetting(v) {
  if (typeof v !== 'string') return v ?? null   // sudah objek (bila kolom jsonb)
  try { return JSON.parse(v) } catch { return v } // teks biasa non-JSON → apa adanya
}

export const appSettingsService = {
  async get(key) {
    const { data, error } = await supabase
      .from('app_settings').select('value').eq('key', key).maybeSingle()
    if (error) throw error
    return data ? parseSetting(data.value) : null
  },

  async getMany(keys) {
    const { data, error } = await supabase
      .from('app_settings').select('key, value').in('key', keys)
    if (error) throw error
    return Object.fromEntries((data || []).map(r => [r.key, parseSetting(r.value)]))
  },

  async set(key, value) {
    // Simpan sebagai string JSON (lihat catatan di atas) + .select() untuk
    // mendeteksi tulisan yang diam-diam tersaring RLS (0 baris tersimpan).
    const { data, error } = await supabase
      .from('app_settings')
      .upsert({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .select()
    if (error) throw error
    if (!data || data.length === 0) {
      throw new Error('Perubahan tidak tersimpan (akses ditolak). Hanya Admin/Super Admin yang dapat mengubah pengaturan ini.')
    }
    return data[0]
  },
}

// ─── Upload media (foto/video) utk Kelas, Event, Informasi ──
// Foto → bucket profile-photos (publik, konsisten dgn thumbnail); video →
// bucket task-files (publik, tanpa batasan mime gambar).
export const mediaService = {
  async uploadPhoto(folder, file) {
    const ext = file.name.split('.').pop()
    const path = `${folder}/media/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error } = await supabase.storage.from('profile-photos').upload(path, file)
    if (error) throw error
    return supabase.storage.from('profile-photos').getPublicUrl(path).data.publicUrl
  },

  async uploadVideo(folder, file) {
    const ext = file.name.split('.').pop()
    const path = `${folder}/video/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error } = await supabase.storage.from('task-files').upload(path, file)
    if (error) throw error
    return supabase.storage.from('task-files').getPublicUrl(path).data.publicUrl
  },
}
