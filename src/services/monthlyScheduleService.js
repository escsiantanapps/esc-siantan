import { supabase } from '@/lib/supabase'
import { serviceRosterService } from '@/services/serviceRosterService'
import { eventsService, classesService } from '@/services/contentService'

export function normalizeMonthlySchedule(data, positions = [], ministries = []) {
  const names = new Map(ministries.map(item => [item.ministry_id, item.name]))
  const catalog = new Map(positions.map(item => [item.position_id, item]))
  const sections = (data.sections || data.month?.definition?.sections || []).map(section => ({
    ...section,
    key: section.section_id || section.key,
    positions: section.positions || (section.parts || []).flatMap(part => (part.positions || []).map(item => {
      const position = catalog.get(item.position_id)
      return { ...item, ministry_id: part.ministry_id, name: position?.name || item.name || '-',
        ministry_name: names.get(part.ministry_id) || position?.ministries?.name || '-',
        slots: item.capacity, sort_order: position?.sort_order || 0 }
    })),
  }))
  return { ...data, sections, month: { ...data.month, month: data.month?.month_date },
    occurrences: (data.occurrences || []).map(item => ({ ...item, section_key: item.section_id || item.section_key })),
    parts: (data.parts || []).map(item => ({ ...item, ministry_name: names.get(item.ministry_id) || '-' })),
    rosters: data.rosters || [] }
}

async function rpc(name, parameters) {
  const { data, error } = await supabase.rpc(name, parameters)
  if (error) throw error
  return data
}

export const monthlyScheduleService = {
  listManagedMinistries: profile => serviceRosterService.listManagedMinistries(profile),
  listManagers: ministryId => serviceRosterService.listManagers(ministryId),
  grantManager: payload => serviceRosterService.grantManager(payload),
  revokeManager: (ministryId, userId) => serviceRosterService.revokeManager(ministryId, userId),
  searchActiveUsers: query => serviceRosterService.searchActiveUsers(query),
  savePosition: payload => serviceRosterService.savePosition(payload),
  removePosition: positionId => serviceRosterService.removePosition(positionId),
  listEvents: () => eventsService.getAll(),
  listClasses: () => classesService.getAll(),
  notify: (rosterId, kind) => serviceRosterService.notify(rosterId, kind),
  notifyMonth: (monthId, kind) => serviceRosterService.notifyMonth(monthId, kind),
  findConflicts: (userId, rosterId, slotId) => serviceRosterService.findConflicts(userId, rosterId, slotId),
  listMembers: (ministryId, query, canManageAll) => canManageAll
    ? serviceRosterService.searchActiveUsers(query)
    : serviceRosterService.listMinistryMembers(ministryId, query),
  async listMinistries() {
    const { data, error } = await supabase.from('ministries')
      .select('ministry_id, name, head_user_id, head:users!head_user_id(user_id, name, photo_url, role, role_secondary, status)').order('name')
    if (error) {
      if (!['42703', 'PGRST200', 'PGRST204'].includes(error.code)) throw error
      // Sebelum v99, jadwal Admin tetap dapat dibuka tanpa menampilkan sumber MH.
      const fallback = await supabase.from('ministries').select('ministry_id, name').order('name')
      if (fallback.error) throw fallback.error
      return fallback.data || []
    }
    return data || []
  },
  async listPositions() {
    const { data, error } = await supabase.from('ministry_service_positions').select('*, ministries(name)').order('sort_order').order('name')
    if (error) throw error
    return data || []
  },
  async listTemplates() {
    const { data, error } = await supabase.from('service_schedule_templates').select('*').eq('is_active', true).order('name')
    if (error) throw error
    return data || []
  },
  saveTemplate: payload => rpc('save_service_schedule_template', {
    p_template_id: payload.template_id || null, p_name: payload.name, p_definition: payload.definition,
  }),
  async listMonths(month) {
    const { data, error } = await supabase.from('service_schedule_months').select('*').eq('month_date', `${month.slice(0, 7)}-01`).order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },
  async resolveRosterMonth(rosterId) {
    const { data, error } = await supabase.from('service_schedule_parts')
      .select('service_schedule_occurrences!occurrence_id(month_id, service_schedule_months!month_id(month_date))')
      .eq('roster_id', rosterId).maybeSingle()
    if (error) throw error
    const occurrence = data?.service_schedule_occurrences
    if (!occurrence) return null
    return { month_id: occurrence.month_id, month_date: occurrence.service_schedule_months.month_date }
  },
  async getMonth(monthId) {
    const [data, positions, ministries] = await Promise.all([
      rpc('get_service_schedule_month', { p_month_id: monthId }), this.listPositions(), this.listMinistries(),
    ])
    return normalizeMonthlySchedule(data, positions, ministries)
  },
  createMonth: ({ templateId, month, dates }) => rpc('create_service_schedule_month', {
    p_template_id: templateId, p_month: `${month.slice(0, 7)}-01`, p_dates: dates,
  }),
  setPosition: ({ rosterId, positionId, userIds, expectedUserIds }) => rpc('set_service_schedule_position', {
    p_roster_id: rosterId, p_position_id: positionId, p_user_ids: userIds, p_expected_user_ids: expectedUserIds,
  }),
  updateOccurrence: (occurrenceId, data) => rpc('update_service_schedule_occurrence', { p_occurrence_id: occurrenceId, p_data: data }),
  updatePart: (rosterId, data) => rpc('update_service_schedule_part', {
    p_roster_id: rosterId, p_team_name: data.team_name || null, p_material: data.material || null, p_notes: data.notes || null,
  }),
  publishMonth: (monthId, allowIncomplete = false) => rpc('publish_service_schedule_month', { p_month_id: monthId, p_allow_incomplete: allowIncomplete }),
  cancelMonth: monthId => rpc('cancel_service_schedule_month', { p_month_id: monthId }),
}
