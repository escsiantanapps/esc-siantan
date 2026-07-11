import { supabase } from '@/lib/supabase'

// ─── Absensi Kelas (QR Code, per sesi) ─────────────────────
export const classAttendanceService = {
  // Catat kehadiran untuk sesi tertentu (UNIQUE class_id+user_id+session_no).
  async checkIn(classId, userId, sessionNo = null) {
    // Check registration first
    const { data: reg } = await supabase
      .from('class_registrations')
      .select('registration_id')
      .eq('class_id', classId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!reg) throw new Error('not_registered')

    const { data, error } = await supabase
      .from('class_attendance')
      .insert({ class_id: classId, user_id: userId, session_no: sessionNo })
      .select()
      .single()
    if (error) {
      if (error.code === '23505') {
        throw new Error('Kamu sudah absen untuk sesi ini.')
      }
      throw error
    }
    return data
  },

  // Riwayat kehadiran milik user untuk satu kelas
  async getMyHistory(classId, userId) {
    const { data, error } = await supabase
      .from('class_attendance')
      .select('*')
      .eq('class_id', classId)
      .eq('user_id', userId)
      .order('attendance_date', { ascending: false })
    if (error) throw error
    return data
  },

  // Daftar kehadiran untuk satu kelas (admin), opsional filter tanggal/sesi
  async getByClass(classId, { date = '', session = '' } = {}) {
    let query = supabase
      .from('class_attendance')
      .select('*, users(name, phone)')
      .eq('class_id', classId)
      .order('scanned_at', { ascending: false })
    if (date) query = query.eq('attendance_date', date)
    if (session !== '' && session != null) query = query.eq('session_no', Number(session))
    const { data, error } = await query
    if (error) throw error
    return data
  },
}

// ─── Absensi Event (QR Code) ───────────────────────────────
export const eventAttendanceService = {
  // Check-in mandiri; hanya boleh bila sudah terdaftar di event (juga ditegakkan RLS).
  async checkIn(eventId, userId) {
    const { data: reg } = await supabase
      .from('event_registrations')
      .select('ticket_id').eq('event_id', eventId).eq('user_id', userId).maybeSingle()
    if (!reg) throw new Error('not_registered')

    const { data, error } = await supabase
      .from('event_attendance')
      .insert({ event_id: eventId, user_id: userId })
      .select()
      .single()
    if (error) {
      if (error.code === '23505') throw new Error('Kamu sudah absen untuk event ini.')
      throw error
    }
    return data
  },

  // Daftar hadir sebuah event (admin), opsional filter tanggal (terhadap recorded_at).
  async getByEvent(eventId, { date = '' } = {}) {
    let query = supabase
      .from('event_attendance')
      .select('*, users(name, phone)')
      .eq('event_id', eventId)
    if (date) query = query.gte('recorded_at', `${date}T00:00:00`).lte('recorded_at', `${date}T23:59:59`)
    const { data, error } = await query
    if (error) throw error
    return data
  },
}

// ─── Ringkasan kehadiran pribadi (widget dashboard) ────────
// Menghitung jumlah kehadiran user pada BULAN berjalan (batas bulan zona WIB)
// dari 3 sumber. RLS SELECT tiap tabel sudah mengizinkan user membaca barisnya
// sendiri, jadi aman dipanggil jemaat biasa.
export const attendanceSummaryService = {
  async getMyMonthlySummary(userId) {
    // Batas bulan WIB: 'YYYY-MM-01' s/d awal bulan berikutnya (eksklusif).
    const nowWib = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
    const ym = nowWib.slice(0, 7)
    const [y, m] = ym.split('-').map(Number)
    const monthStart = `${ym}-01`
    const nextY = m === 12 ? y + 1 : y
    const nextM = m === 12 ? 1 : m + 1
    const nextStart = `${nextY}-${String(nextM).padStart(2, '0')}-01`

    const countRows = async (table, dateCol, isTimestamp) => {
      const lo = isTimestamp ? `${monthStart}T00:00:00` : monthStart
      const hi = isTimestamp ? `${nextStart}T00:00:00` : nextStart
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte(dateCol, lo)
        .lt(dateCol, hi)
      if (error) throw error
      return count || 0
    }

    const [ibadah, kelas, event] = await Promise.all([
      countRows('sunday_attendance', 'attendance_date', false),
      countRows('class_attendance', 'attendance_date', false),
      countRows('event_attendance', 'recorded_at', true),
    ])
    return { ibadah, kelas, event, total: ibadah + kelas + event }
  },
}
