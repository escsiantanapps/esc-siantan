import { supabase } from '@/lib/supabase'

// ─── Absensi Kelas (QR Code, per sesi) ─────────────────────
export const classAttendanceService = {
  // Catat kehadiran untuk sesi tertentu (UNIQUE class_id+user_id+session_no).
  async checkIn(classId, userId, sessionNo = null) {
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

  // Daftar hadir sebuah event (admin).
  async getByEvent(eventId) {
    const { data, error } = await supabase
      .from('event_attendance')
      .select('*, users(name, phone)')
      .eq('event_id', eventId)
    if (error) throw error
    return data
  },
}
