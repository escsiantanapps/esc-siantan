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


function monthDateRange(ym) {
  const [y, m] = ym.split('-').map(Number)
  const start = `${ym}-01`
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
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

  // Kandidat roster sesi = SEMUA jemaat aktif (keputusan operator 2026-07-12:
  // filter peran pelayanan dicabut — admin memasukkan "nama siapa saja yang
  // melayani/hadir", jemaat biasa pun bisa ditugaskan agar dapat scan QR
  // ESC-VOLUNTEER). Akses scan tetap dijaga RLS matt_self_insert: hanya yang
  // ada di roster + tanggal hari ini yang bisa insert kehadiran. `query`
  // opsional untuk filter nama (limit 50 → wajib cari nama pada jemaat banyak).
  async listAssignableUsers(query = '') {
    let q = supabase
      .from('users')
      .select('user_id, name, photo_url, role, role_secondary, is_pks')
      .eq('status', 'Aktif')
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

  // Rekap semua sesi pada satu tanggal. Status terlambat tetap memakai nilai
  // dari database; halaman hanya menyusun data lintas sesi untuk kebutuhan
  // pemantauan Admin dan tidak menghitung ulang aturan grace period di klien.
  async getDateRecap(date) {
    const schedules = await this.listByDate(date)
    if (schedules.length === 0) {
      return {
        schedules: [],
        rows: [],
        lateRows: [],
        notYetRows: [],
        stats: { sessions: 0, assigned: 0, attended: 0, onTime: 0, late: 0, notYet: 0 },
      }
    }

    const scheduleIds = schedules.map(s => s.schedule_id)
    const [{ data: assignments, error: assignmentError }, { data: attendance, error: attendanceError }] = await Promise.all([
      supabase
        .from('ministry_schedule_assignments')
        .select('schedule_id, user_id, users(name, photo_url)')
        .in('schedule_id', scheduleIds),
      supabase
        .from('ministry_attendance')
        .select('attendance_id, schedule_id, user_id, scanned_at, status, users(name, photo_url)')
        .in('schedule_id', scheduleIds)
        .order('scanned_at', { ascending: true }),
    ])
    if (assignmentError) throw assignmentError
    if (attendanceError) throw attendanceError

    const scheduleMap = Object.fromEntries(schedules.map(s => [s.schedule_id, s]))
    const attendanceRows = attendance || []
    const attendanceMap = Object.fromEntries(
      attendanceRows.map(row => [`${row.schedule_id}:${row.user_id}`, row]),
    )

    const assignedRows = (assignments || []).map(row => ({
      ...row,
      schedule: scheduleMap[row.schedule_id],
      attendance: attendanceMap[`${row.schedule_id}:${row.user_id}`] || null,
      user: row.users,
    }))

    // Penugasan dapat diganti setelah scan. Kehadiran historis tetap perlu
    // terlihat di daftar telat walaupun baris penugasannya sudah dihapus.
    const assignedKeys = new Set(assignedRows.map(row => `${row.schedule_id}:${row.user_id}`))
    const historicalRows = attendanceRows
      .filter(row => !assignedKeys.has(`${row.schedule_id}:${row.user_id}`))
      .map(row => ({
        ...row,
        schedule: scheduleMap[row.schedule_id],
        attendance: row,
        user: row.users,
      }))
    const rows = [...assignedRows, ...historicalRows]
    const lateRows = attendanceRows
      .filter(row => row.status === 'Terlambat')
      .map(row => ({ ...row, schedule: scheduleMap[row.schedule_id], user: row.users }))
    const notYetRows = assignedRows.filter(row => !row.attendance)

    return {
      schedules,
      rows,
      lateRows,
      notYetRows,
      stats: {
        sessions: schedules.length,
        assigned: (assignments || []).length,
        attended: attendanceRows.length,
        onTime: attendanceRows.filter(row => row.status === 'Tepat Waktu').length,
        late: lateRows.length,
        notYet: notYetRows.length,
      },
    }
  },

  // Rekap bulanan berdasarkan tanggal pelayanan. Sumber periode adalah
  // ministry_schedules.service_date, bukan waktu scan, agar sesi yang jatuh
  // pada bulan tersebut tetap masuk walau timestamp disimpan UTC.
  async getMonthlyRecap(ym) {
    const [start, end] = monthDateRange(ym)
    const { data: schedules, error: scheduleError } = await supabase
      .from('ministry_schedules')
      .select('*, ministries(name)')
      .gte('service_date', start)
      .lt('service_date', end)
      .order('service_date', { ascending: true })
      .order('start_time', { ascending: true })
    if (scheduleError) throw scheduleError
    if (!schedules || schedules.length === 0) {
      return {
        schedules: [], rows: [], lateRows: [], notYetRows: [], lateLeaders: [],
        stats: { sessions: 0, assigned: 0, attended: 0, onTime: 0, late: 0, notYet: 0 },
      }
    }

    const scheduleIds = schedules.map(s => s.schedule_id)
    const [{ data: assignments, error: assignmentError }, { data: attendance, error: attendanceError }] = await Promise.all([
      supabase
        .from('ministry_schedule_assignments')
        .select('schedule_id, user_id, users(name, photo_url)')
        .in('schedule_id', scheduleIds),
      supabase
        .from('ministry_attendance')
        .select('attendance_id, schedule_id, user_id, scanned_at, status, users(name, photo_url)')
        .in('schedule_id', scheduleIds)
        .order('scanned_at', { ascending: true }),
    ])
    if (assignmentError) throw assignmentError
    if (attendanceError) throw attendanceError

    const scheduleMap = Object.fromEntries(schedules.map(s => [s.schedule_id, s]))
    const attendanceRows = attendance || []
    const attendanceMap = Object.fromEntries(
      attendanceRows.map(row => [`${row.schedule_id}:${row.user_id}`, row]),
    )
    const assignedRows = (assignments || []).map(row => ({
      ...row,
      schedule: scheduleMap[row.schedule_id],
      attendance: attendanceMap[`${row.schedule_id}:${row.user_id}`] || null,
      user: row.users,
    }))
    const assignedKeys = new Set(assignedRows.map(row => `${row.schedule_id}:${row.user_id}`))
    const historicalRows = attendanceRows
      .filter(row => !assignedKeys.has(`${row.schedule_id}:${row.user_id}`))
      .map(row => ({ ...row, schedule: scheduleMap[row.schedule_id], attendance: row, user: row.users }))
    const rows = [...assignedRows, ...historicalRows]
    const lateRows = attendanceRows
      .filter(row => row.status === 'Terlambat')
      .map(row => ({ ...row, schedule: scheduleMap[row.schedule_id], user: row.users }))
    const notYetRows = assignedRows.filter(row => !row.attendance)

    const leaderMap = {}
    function getLeader(userId, user) {
      if (!leaderMap[userId]) {
        leaderMap[userId] = {
          user_id: userId, user: user || { name: '-', photo_url: null },
          assignedCount: 0, attendedCount: 0, lateCount: 0, lateSessions: [],
        }
      } else if (!leaderMap[userId].user?.name && user?.name) {
        leaderMap[userId].user = user
      }
      return leaderMap[userId]
    }
    for (const row of assignedRows) {
      const leader = getLeader(row.user_id, row.user)
      leader.assignedCount += 1
      if (!row.attendance) continue
      leader.attendedCount += 1
      if (row.attendance.status === 'Terlambat') {
        leader.lateCount += 1
        leader.lateSessions.push({ label: row.schedule?.label || '-', date: row.schedule?.service_date })
      }
    }
    for (const row of historicalRows) {
      const leader = getLeader(row.user_id, row.user)
      leader.attendedCount += 1
      if (row.attendance.status === 'Terlambat') {
        leader.lateCount += 1
        leader.lateSessions.push({ label: row.schedule?.label || '-', date: row.schedule?.service_date })
      }
    }

    const lateLeaders = Object.values(leaderMap)
      .filter(row => row.lateCount > 0)
      .sort((a, b) => b.lateCount - a.lateCount || a.user.name.localeCompare(b.user.name, 'id'))
      .slice(0, 10)

    return {
      schedules, rows, lateRows, notYetRows, lateLeaders,
      stats: {
        sessions: schedules.length, assigned: (assignments || []).length,
        attended: attendanceRows.length,
        onTime: attendanceRows.filter(row => row.status === 'Tepat Waktu').length,
        late: lateRows.length, notYet: notYetRows.length,
      },
    }
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

  // Self-scan volunteer (dipanggil dari AttendanceScanPage). Status telat
  // dihitung trigger DB. Geolocation dihapus (keputusan operator 2026-07-11).
  async checkIn(scheduleId, userId) {
    const { data, error } = await supabase
      .from('ministry_attendance')
      .insert({ schedule_id: scheduleId, user_id: userId })
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
