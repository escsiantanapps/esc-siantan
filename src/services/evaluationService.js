import { supabase } from '@/lib/supabase'

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
    let tmplQuery = supabase.from('form_templates').select('*')
    if (formId) tmplQuery = tmplQuery.eq('form_id', formId)
    const { data: templates, error: tErr } = await tmplQuery
    if (tErr) throw tErr

    let userQuery = supabase.from('users')
      .select('user_id, name, role, ministry_ids, komsel_id, photo_url, sp_level')
      .eq('status', 'Aktif')
    userQuery = role ? userQuery.eq('role', role) : userQuery.in('role', ['Volunteer', 'Jemaat', 'PKS'])
    if (ministryId) userQuery = userQuery.contains('ministry_ids', [ministryId])
    if (komselId) userQuery = userQuery.eq('komsel_id', komselId)
    const { data: users, error: uErr } = await userQuery.order('name')
    if (uErr) throw uErr

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

    const start = new Date(startDate), end = new Date(endDate)
    const rows = []
    for (const u of users) {
      for (const t of templates) {
        const allowed = t.allowed_ministry || []
        if (allowed.length > 0 && !allowed.some(m => (u.ministry_ids || []).includes(m))) continue
        const filled = responses.filter(r => r.volunteer_id === u.user_id && r.form_id === t.form_id).length
        const periods = this.periodsInRange(start, end, t.period)
        const target = (t.weekly_goal || 1) * periods
        const minLulus = Math.max(1, Math.round(target * 0.8))
        rows.push({ user: u, form: t, filled, target, minLulus, status: this.computeStatus(filled, target) })
      }
    }
    return rows
  },
}
