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
    // Pakai tasksService.getTemplates() supaya bentuk allowed_ministry &
    // category_ministry_ids KONSISTEN dgn semua tempat lain (TasksPage, dll).
    // Sebelumnya evaluationService menulis join sendiri, dan meskipun kelihatan
    // sama, ada risiko bentuk `task_categories` beda (object vs array) atau
    // field terlewat — akibatnya user yg mestinya lolos gerbang ministry
    // (mis. Bryan Lighting) muncul di form ministry lain (CV, Music, dst).
    const allTemplates = await tasksService.getTemplates()
    const templates = formId ? allTemplates.filter(t => t.form_id === formId) : allTemplates

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
      const { data, error } = await supabase.from('form_responses')
        .select('form_id, volunteer_id, submitted_at')
        .in('form_id', formIds).in('volunteer_id', userIds)
        .gte('submitted_at', startDate).lte('submitted_at', endDate)
      if (error) throw error
      responses = data
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
}
