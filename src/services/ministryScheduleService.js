import { supabase } from '@/lib/supabase'

// Absen Pelayanan Minggu — jadwal pelayanan Volunteer + kehadiran (kedisiplinan
// waktu). Pengelola = Admin (digerbang RLS `msch_write`/`msa_write` via
// auth_admin_can('/admin/pelayanan')). Volunteer scan QR `ESC-VOLUNTEER:<id>`
// lewat halaman /scan biasa → insert ministry_attendance (status telat &
// geolokasi diisi trigger DB, +1 poin via trigger). Lihat Migrasi v55.

function monthRange(ym) {
  // ym = 'YYYY-MM'. Kembalikan [awalISO, akhirISO] (rentang timestamptz kasar,
  // dipakai utk hitung "3x telat" per bulan berjalan).
  const [y, m] = ym.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString()
  const end = new Date(Date.UTC(y, m, 1)).toISOString()
  return [start, end]
}

export const ministryScheduleService = {
  // Jadwal pada satu tanggal (semua ministry).
  async listByDate(date) {
    const { data, error } = await supabase
      .from('ministry_schedules')
      .select('*, ministries(name)')
      .eq('service_date', date)
      .order('start_time', { ascending: true })
    if (error) throw error
    return data || []
  },

  async getById(scheduleId) {
    const { data, error } = await supabase
      .from('ministry_schedules')
      .select('*, ministries(name)')
      .eq('schedule_id', scheduleId)
      .single()
    if (error) throw error
    return data
  },

  // Buka sesi pelayanan berlabel (mis. "Minggu 1"). Sejak v58 lepas dari
  // ministry — ministry_id sengaja NULL, unit organisasi = label + tanggal.
  async create({ label, serviceDate, startTime, createdBy }) {
    const { data, error } = await supabase
      .from('ministry_schedules')
      .insert({ label, ministry_id: null, service_date: serviceDate, start_time: startTime, created_by: createdBy })
      .select('*')
      .single()
    if (error) throw error
    return data
  },

  async updateStartTime(scheduleId, startTime) {
    const { data, error } = await supabase
      .from('ministry_schedules')
      .update({ start_time: startTime })
      .eq('schedule_id', scheduleId)
      .select('*, ministries(name)')
      .single()
    if (error) throw error
    return data
  },

  async remove(scheduleId) {
    const { error } = await supabase.from('ministry_schedules').delete().eq('schedule_id', scheduleId)
    if (error) throw error
  },

  // Kandidat roster sesi = jemaat aktif yang punya peran pelayanan (Volunteer,
  // PKS, Admin, Super Admin — lewat role, role_secondary, atau is_pks). Sejak
  // v58 roster bebas lintas ministry, admin memasukkan "nama siapa saja yang
  // melayani". `query` opsional untuk filter nama.
  async listAssignableUsers(query = '') {
    let q = supabase
      .from('users')
      .select('user_id, name, photo_url, role, role_secondary, is_pks')
      .eq('status', 'Aktif')
      .or('role.in.(Volunteer,PKS,Admin,"Super Admin"),role_secondary.in.(Volunteer,PKS,Admin,"Super Admin"),is_pks.eq.true')
      .order('name', { ascending: true })
      .limit(50)
    if (query) q = q.ilike('name', `%${query}%`)
    const { data, error } = await q
    if (error) throw error
    return data || []
  },

  async getAssignments(scheduleId) {
    const { data, error } = await supabase
      .from('ministry_schedule_assignments')
      .select('user_id')
      .eq('schedule_id', scheduleId)
    if (error) throw error
    return (data || []).map(r => r.user_id)
  },

  // Ganti seluruh daftar penugasan jadwal ini dengan userIds (replace-set).
  async setAssignments(scheduleId, userIds) {
    const { error: delErr } = await supabase
      .from('ministry_schedule_assignments')
      .delete()
      .eq('schedule_id', scheduleId)
    if (delErr) throw delErr
    if (!userIds || userIds.length === 0) return
    const rows = userIds.map(uid => ({ schedule_id: scheduleId, user_id: uid }))
    const { error } = await supabase.from('ministry_schedule_assignments').insert(rows)
    if (error) throw error
  },

  // Rekap kehadiran satu jadwal (join nama).
  async getAttendance(scheduleId) {
    const { data, error } = await supabase
      .from('ministry_attendance')
      .select('*, users(name, phone, photo_url)')
      .eq('schedule_id', scheduleId)
      .order('scanned_at', { ascending: true })
    if (error) throw error
    return data || []
  },

  // Peta { user_id: jumlahTerlambat } dalam bulan `ym` ('YYYY-MM') — untuk
  // badge merah "3x telat" (reset per bulan berjalan, keputusan operator).
  async getMonthlyLateCounts(ym) {
    const [start, end] = monthRange(ym)
    const { data, error } = await supabase
      .from('ministry_attendance')
      .select('user_id')
      .eq('status', 'Terlambat')
      .gte('scanned_at', start)
      .lt('scanned_at', end)
    if (error) throw error
    const map = {}
    for (const r of data || []) map[r.user_id] = (map[r.user_id] || 0) + 1
    return map
  },

  // Jadwal di mana Volunteer ini DITUGASKAN + status kehadirannya sendiri.
  // Dipakai kartu "Jadwal Pelayanan Saya" di Beranda. RLS: msa_read/msch_read
  // (baca bebas login) & matt_select (volunteer hanya lihat kehadiran sendiri).
  async listMySchedules(userId) {
    const { data: asg, error: e1 } = await supabase
      .from('ministry_schedule_assignments')
      .select('schedule_id, ministry_schedules(schedule_id, service_date, start_time, label, ministries(name))')
      .eq('user_id', userId)
    if (e1) throw e1
    const scheds = (asg || []).map(r => r.ministry_schedules).filter(Boolean)
    if (scheds.length === 0) return []
    const { data: att, error: e2 } = await supabase
      .from('ministry_attendance')
      .select('schedule_id, status, scanned_at')
      .eq('user_id', userId)
    if (e2) throw e2
    const attMap = {}
    for (const a of att || []) attMap[a.schedule_id] = a
    return scheds
      .map(s => ({ ...s, attendance: attMap[s.schedule_id] || null }))
      .sort((a, b) => (b.service_date || '').localeCompare(a.service_date || ''))
  },

  // Self-scan volunteer (dipanggil dari AttendanceScanPage). lat/lng opsional
  // (soft-log); status telat & jarak dihitung trigger DB.
  async checkIn(scheduleId, userId, { lat = null, lng = null } = {}) {
    const { data, error } = await supabase
      .from('ministry_attendance')
      .insert({ schedule_id: scheduleId, user_id: userId, lat, lng })
      .select()
      .single()
    if (error) {
      if (error.code === '23505') throw new Error('Kehadiran pelayanan untuk sesi ini sudah tercatat.')
      // 42501 / RLS: tidak terjadwal atau bukan tanggal hari ini.
      if (error.code === '42501' || /row-level security/i.test(error.message || '')) {
        throw new Error('Anda tidak terjadwal melayani pada jadwal ini (atau bukan tanggalnya).')
      }
      throw error
    }
    return data
  },
}
