import { supabase } from '@/lib/supabase'
import { serviceRosterService } from '@/services/serviceRosterService'
import { eventsService, classesService } from '@/services/contentService'

export function normalizeMonthlySchedule(data, positions = [], ministries = []) {
  const ministryCatalog = new Map(ministries.map(item => [item.ministry_id, item]))
  const catalog = new Map(positions.map(item => [item.position_id, item]))
  const sections = (data.sections || data.month?.definition?.sections || []).map(section => ({
    ...section,
    key: section.section_id || section.key,
    positions: (section.positions || (section.parts || []).flatMap(part => (part.positions || [])
      .map(item => ({ ...item, ministry_id: part.ministry_id, slots: item.capacity })))).map(item => {
      const position = catalog.get(item.position_id)
      const ministry = ministryCatalog.get(item.ministry_id)
      return { ...item, name: item.name || position?.name || '-',
        ministry_name: item.ministry_name || ministry?.name || position?.ministries?.name || '-',
        sort_order: position?.sort_order ?? item.sort_order ?? 0,
        ministry_sort_order: ministry?.schedule_order ?? null }
    }),
  }))
  return { ...data, sections, month: { ...data.month, month: data.month?.month_date },
    occurrences: (data.occurrences || []).map(item => ({ ...item, section_key: item.section_id || item.section_key })),
    parts: (data.parts || []).map(item => ({ ...item, ministry_name: ministryCatalog.get(item.ministry_id)?.name || '-' })),
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
  revokeManager: (ministryId, userId, adminAccess) => serviceRosterService.revokeManager(ministryId, userId, adminAccess),
  searchActiveUsers: query => serviceRosterService.searchActiveUsers(query),
  listManagerCandidates: () => serviceRosterService.listManagerCandidates(),
  savePosition: payload => serviceRosterService.savePosition(payload),
  removePosition: positionId => serviceRosterService.removePosition(positionId),
  reorderPositions: (ministryId, positionIds) => rpc('reorder_service_schedule_positions_v122', {
    p_ministry_id: ministryId, p_position_ids: positionIds,
  }),
  reorderMinistries: ministryIds => rpc('reorder_service_schedule_ministries_v122', {
    p_ministry_ids: ministryIds,
  }),
  listEvents: () => eventsService.getAll(),
  listClasses: () => classesService.getAll(),
  notify: (rosterId, kind) => serviceRosterService.notify(rosterId, kind),
  notifyMonth: (monthId, kind) => serviceRosterService.notifyMonth(monthId, kind),
  findConflicts: (userId, rosterId, slotId) => rpc('get_service_roster_conflicts_v130', {
    p_user_id: userId, p_roster_id: rosterId, p_slot_id: slotId,
  }),
  listMembers: (ministryId, query, canManageAll) => serviceRosterService.listMinistryMembers(ministryId, query, canManageAll),
  listOwnedScheduleFields: month => rpc('list_owned_service_schedule_fields_v125', { p_month_date: `${month}-01` }),
  updateOwnedScheduleField: (occurrenceId, field, value, expectedValue) => rpc('update_owned_service_schedule_field_v125', {
    p_occurrence_id: occurrenceId, p_field: field, p_value: value, p_expected_value: expectedValue,
  }),
  async listMinistries() {
    const { data, error } = await supabase.from('ministries')
      .select('ministry_id, name, head_user_id, head:users!head_user_id(user_id, name, photo_url, role, role_secondary, status)').order('name')
    if (error) {
      if (!['42703', 'PGRST200', 'PGRST204'].includes(error.code)) throw error
      // Sebelum v99, jadwal Admin tetap dapat dibuka tanpa menampilkan sumber MH.
      const fallback = await supabase.from('ministries').select('ministry_id, name').order('name')
      if (fallback.error) throw fallback.error
      return this.withScheduleOrder(fallback.data || [])
    }
    return this.withScheduleOrder(data || [])
  },
  async withScheduleOrder(ministries) {
    const { data, error } = await supabase.from('service_schedule_ministry_order')
      .select('ministry_id, sort_order')
    // Klien lama tetap dapat membuka jadwal sebelum Migrasi v122 dijalankan.
    if (error && !['42P01', 'PGRST205'].includes(error.code)) throw error
    const orders = new Map((data || []).map(item => [item.ministry_id, item.sort_order]))
    return ministries.map(item => ({ ...item, schedule_order: orders.get(item.ministry_id) ?? null }))
      .sort((a, b) => (a.schedule_order ?? Number.MAX_SAFE_INTEGER)
        - (b.schedule_order ?? Number.MAX_SAFE_INTEGER))
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
  async listCopySources() {
    const { data, error } = await supabase.from('service_schedule_months')
      .select('month_id, month_date, name, status, created_at')
      .order('month_date', { ascending: false }).order('created_at', { ascending: false }).limit(36)
    if (error) throw error
    return data || []
  },
  async findNextMonth(month) {
    const { data, error } = await supabase.from('service_schedule_months').select('month_date')
      .gt('month_date', `${month.slice(0, 7)}-01`).order('month_date').limit(1)
    if (error) throw error
    return data?.[0]?.month_date?.slice(0, 7) || null
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
      rpc('get_service_schedule_month_v128', { p_month_id: monthId }), this.listPositions(), this.listMinistries(),
    ])
    const { data: emptyReasons, error } = await supabase.from('service_schedule_empty_reasons')
      .select('roster_id, position_id, reason')
      .in('roster_id', (data.rosters || []).map(item => item.roster_id).length
        ? (data.rosters || []).map(item => item.roster_id) : [''])
    if (error) throw error
    return normalizeMonthlySchedule({ ...data, emptyReasons: emptyReasons || [] }, positions, ministries)
  },
  createMonth: ({ templateId, month, dates }) => rpc('create_service_schedule_month', {
    p_template_id: templateId, p_month: `${month.slice(0, 7)}-01`, p_dates: dates,
  }),
  createMonthDirect: ({ month, entries }) => rpc('create_service_schedule_month_direct', {
    p_month: `${month.slice(0, 7)}-01`, p_entries: entries,
  }),
  updateMonthDraft: (monthId, expectedVersion, entries, expectedRemovedAssignments, confirmation) => rpc('update_service_schedule_month_draft_v124', {
    p_month_id: monthId, p_expected_version: expectedVersion, p_entries: entries,
    p_expected_removed_assignments: expectedRemovedAssignments, p_confirmation: confirmation,
  }),
  copyMonth: ({ sourceMonthId, targetMonth, dateMap, sourceLinks, copyAssignments }) => rpc('copy_service_schedule_month_v122', {
    p_source_month_id: sourceMonthId, p_target_month: `${targetMonth.slice(0, 7)}-01`,
    p_date_map: dateMap, p_source_links: sourceLinks, p_copy_assignments: copyAssignments,
  }),
  clearMonthAssignments: (monthId, expectedVersion, expectedAssigned, confirmation) => rpc('clear_service_schedule_assignments_v122', {
    p_month_id: monthId, p_expected_version: expectedVersion,
    p_expected_assigned: expectedAssigned, p_confirmation: confirmation,
  }),
  setPosition: ({ rosterId, positionId, userIds, expectedUserIds, notes, emptyReason, overrideUserIds }) => rpc('set_service_schedule_position_v130', {
    p_roster_id: rosterId, p_position_id: positionId, p_user_ids: userIds, p_expected_user_ids: expectedUserIds,
    p_notes: notes, p_empty_reason: emptyReason || null, p_override_user_ids: overrideUserIds || [],
  }),
  addMinistryToSection: (monthId, sectionId, ministryId, expectedVersion) => rpc('add_service_schedule_ministry_to_section_v123', {
    p_month_id: monthId, p_section_id: sectionId, p_ministry_id: ministryId, p_expected_version: expectedVersion,
  }),
  updateOccurrence: (occurrenceId, data) => rpc('update_service_schedule_occurrence', { p_occurrence_id: occurrenceId, p_data: data }),
  updatePart: (rosterId, data) => rpc('update_service_schedule_part', {
    p_roster_id: rosterId, p_team_name: data.team_name || null, p_material: data.material || null, p_notes: data.notes || null,
  }),
  publishMonth: monthId => rpc('publish_service_schedule_month_v111', { p_month_id: monthId }),
  cancelMonth: monthId => rpc('cancel_service_schedule_month', { p_month_id: monthId }),
  returnMonthToDraft: monthId => rpc('return_service_schedule_month_to_draft_v121', { p_month_id: monthId }),
  syncDraftPositions: (monthId, expectedVersion, expectedCatalog) => rpc('sync_service_schedule_draft_positions', {
    p_month_id: monthId, p_expected_version: expectedVersion, p_expected_catalog: expectedCatalog,
  }),
  reassignAndSyncDraftPositions: (monthId, expectedVersion, expectedCatalog, moves) => rpc('reassign_and_sync_service_schedule_draft_positions_v111', {
    p_month_id: monthId, p_expected_version: expectedVersion, p_expected_catalog: expectedCatalog, p_moves: moves,
  }),
  deleteMonthDraft: (monthId, expectedAssigned) => rpc('delete_service_schedule_month_draft', {
    p_month_id: monthId, p_expected_assigned: expectedAssigned,
  }),
}
