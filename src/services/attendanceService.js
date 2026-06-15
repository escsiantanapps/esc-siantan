import { supabase } from '@/lib/supabase'

// ─── Absensi Kelas (QR Code) ───────────────────────────────
export const classAttendanceService = {
  // Catat kehadiran hari ini (UNIQUE class_id+user_id+attendance_date mencegah duplikat)
  async checkIn(classId, userId) {
    const { data, error } = await supabase
      .from('class_attendance')
      .insert({ class_id: classId, user_id: userId })
      .select()
      .single()
    if (error) {
      if (error.code === '23505') {
        throw new Error('Kamu sudah absen untuk kelas ini hari ini.')
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

  // Daftar kehadiran untuk satu kelas (admin), opsional filter tanggal
  async getByClass(classId, { date = '' } = {}) {
    let query = supabase
      .from('class_attendance')
      .select('*, users(name, phone)')
      .eq('class_id', classId)
      .order('scanned_at', { ascending: false })
    if (date) query = query.eq('attendance_date', date)
    const { data, error } = await query
    if (error) throw error
    return data
  },
}
