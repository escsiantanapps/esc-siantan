import { supabase } from '@/lib/supabase'
import { canAccessTemplate, tasksService } from '@/services/tasksService'

export const evaluationService = {
  // jumlah periode (minggu/bulan) dalam rentang tanggal
  periodsInRange(startDate, endDate, period) {
    const diffDays = Math.max(1, Math.round((endDate - startDate) / 86400000) + 1)
    return period === 'bulan' ? Math.max(1, Math.ceil(diffDays / 30)) : Math.max(1, Math.ceil(diffDays / 7))
  },

  computeStatus(filled, target) {
    if (filled <= 0) return 'KOSONG'
    const minLulus = Math.max(1, Math.round(target * 0.8))
    return filled >= minLulus ? 'TERPENUHI' : 'PROSES'
  },

  // baris evaluasi: user x form_template yang relevan untuknya
  async getEvaluation({ startDate, endDate, formId = '', ministryId = '', komselId = '', role = '' }) {
    let queryStart = startDate
    let queryEnd = endDate

    // Jika input hanya YYYY-MM-DD, asumsikan batas hari di zona WIB (Asia/Jakarta)
    if (typeof startDate === 'string' && startDate.length === 10) {
      queryStart = new Date(`${startDate}T00:00:00+07:00`).toISOString()
    }
    if (typeof endDate === 'string' && endDate.length === 10) {
      queryEnd = new Date(`${endDate}T23:59:59.999+07:00`).toISOString()
    }

    // Pakai tasksService.getTemplates() supaya bentuk allowed_ministry &
    // category_ministry_ids KONSISTEN dgn semua tempat lain (TasksPage, dll).
    const allTemplates = await tasksService.getTemplates()
    let templates = formId ? allTemplates.filter(t => t.form_id === formId) : allTemplates
    // Filter form berdasarkan ministry yang dipilih admin — bukan hanya user.
    // Kalau user (mis. Erwin) di 2 ministry (Parking + Lighting) & admin
    // filter Ministry=Lighting, form yang KHUSUS Parking harus disembunyikan
    // walau Erwin qualified via keanggotaan Parking-nya. Form terbuka (tanpa
    // batasan ministry di allowed_ministry & category) tetap ditampilkan.
    if (ministryId) {
      templates = templates.filter(t => {
        // Kategori TIDAK lagi menggerbang akses (lihat canAccessTemplate),
        // jadi filter ministry admin hanya melihat allowed_ministry form.
        const allowed = t.allowed_ministry || []
        if (allowed.length === 0) return true // form terbuka untuk semua ministry
        return allowed.map(String).includes(String(ministryId))
      })
    }

    let userQuery = supabase.from('users')
      .select('user_id, name, role, role_secondary, is_pks, komsel_id, photo_url, sp_level, user_ministries(ministry_id)')
      .eq('status', 'Aktif')
    // Kelayakan tugas dihitung dari role UTAMA + role KEDUA + penanda is_pks —
    // konsisten dgn canAccessTemplate (lihat tasksService.userHasRole).
    // Sebelumnya query hanya melihat role primer, sehingga Admin dgn
    // role_secondary='Volunteer' tidak muncul di evaluasi.
    if (role === 'PKS') {
      userQuery = userQuery.or('role.eq.PKS,role_secondary.eq.PKS,is_pks.eq.true')
    } else if (role) {
      userQuery = userQuery.or(`role.eq.${role},role_secondary.eq.${role}`)
    } else {
      userQuery = userQuery.or('role.in.(Volunteer,Jemaat,PKS),role_secondary.in.(Volunteer,Jemaat,PKS),is_pks.eq.true')
    }
    if (komselId) userQuery = userQuery.eq('komsel_id', komselId)
    if (ministryId) {
      const { data: rows } = await supabase.from('user_ministries').select('user_id').eq('ministry_id', ministryId)
      const ids = (rows || []).map(r => r.user_id)
      userQuery = userQuery.in('user_id', ids.length ? ids : ['__none__'])
    }
    const { data: usersRaw, error: uErr } = await userQuery.order('name')
    if (uErr) throw uErr
    const users = (usersRaw || []).map(u => ({
      ...u, ministry_ids: (u.user_ministries || []).map(r => r.ministry_id),
    }))

    const formIds = templates.map(t => t.form_id)
    const userIds = users.map(u => u.user_id)
    let responses = []
    if (formIds.length && userIds.length) {
      const limit = 1000
      let from = 0
      while (true) {
        const { data, error } = await supabase.from('form_responses')
          .select('form_id, volunteer_id, submitted_at')
          .in('form_id', formIds).in('volunteer_id', userIds)
          .gte('submitted_at', queryStart).lte('submitted_at', queryEnd)
          .range(from, from + limit - 1)
        if (error) throw error
        responses = responses.concat(data)
        if (data.length < limit) break
        from += limit
      }
    }

    // Anggota dengan izin DISETUJUI yang beririsan dengan periode evaluasi →
    // baris di bawah target ditandai "IZIN" (bukan "KOSONG"/"PROSES").
    let leaveUserIds = new Set()
    if (userIds.length) {
      const { data: leaves } = await supabase.from('task_leaves')
        .select('user_id')
        .eq('status', 'Disetujui')
        .in('user_id', userIds)
        .lte('start_date', String(endDate).slice(0, 10))
        .gte('end_date', String(startDate).slice(0, 10))
      leaveUserIds = new Set((leaves || []).map(r => r.user_id))
    }

    const start = new Date(startDate), end = new Date(endDate)
    const rows = []
    for (const u of users) {
      for (const t of templates) {
        // Lewati template yang tidak relevan untuk user ini (batasan role/
        // ministry/kategori). `strict: true` menonaktifkan pintasan Admin —
        // di evaluasi kita ingin melihat kelayakan sebenarnya, bukan "Admin
        // bisa lihat semua" (mis. Admin dgn role_secondary='Volunteer' tapi
        // TIDAK di ministry yang dibatasi form → tidak muncul).
        if (!canAccessTemplate(t, u, { strict: true })) continue
        const filled = responses.filter(r => r.volunteer_id === u.user_id && r.form_id === t.form_id).length
        const periods = this.periodsInRange(start, end, t.period)
        const target = (t.weekly_goal || 1) * periods
        const minLulus = Math.max(1, Math.round(target * 0.8))
        let status = this.computeStatus(filled, target)
        if (status !== 'TERPENUHI' && leaveUserIds.has(u.user_id)) status = 'IZIN'
        rows.push({ user: u, form: t, filled, target, minLulus, status })
      }
    }
    return rows
  },

  // Ringkasan tren dashboard. Setiap minggu memakai aturan evaluasi yang sama
  // dengan halaman Evaluasi agar angka status tidak berbeda antar halaman.
  async getWeeklyTrend({ weeks = 6 } = {}) {
    const now = new Date()
    const currentWeekStart = new Date(now)
    const day = currentWeekStart.getDay() || 7
    currentWeekStart.setDate(currentWeekStart.getDate() - day + 1)
    currentWeekStart.setHours(0, 0, 0, 0)

    const periods = Array.from({ length: weeks }, (_, index) => {
      const start = new Date(currentWeekStart)
      start.setDate(start.getDate() - (weeks - index - 1) * 7)
      const end = index === weeks - 1
        ? now
        : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 - 1, 23, 59, 59, 999)
      return { start, end }
    })

    return Promise.all(periods.map(async ({ start, end }) => {
      const rows = await this.getEvaluation({ startDate: start.toISOString(), endDate: end.toISOString() })
      const summary = rows.reduce((result, row) => {
        if (row.status in result) result[row.status] += 1
        return result
      }, { TERPENUHI: 0, PROSES: 0, KOSONG: 0, IZIN: 0 })
      return { start: start.toISOString(), ...summary, total: rows.length }
    }))
  },
}
