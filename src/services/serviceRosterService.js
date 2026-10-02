import { supabase } from '@/lib/supabase'

const FORBIDDEN_SCHEDULE_MANAGER_ROLES = new Set(['Admin', 'Super Admin', 'Gembala'])

function monthRange(month) {
  const [year, number] = month.split('-').map(Number)
  const start = `${month}-01`
  const end = new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10)
  return [start, end]
}

const rosterSelect = `
  *,
  ministries(name),
  service_roster_slots(
    slot_id, ministry_id, position_id, slot_no, user_id,
    ministry_service_positions(name, sort_order),
    users(name, photo_url)
  )
`

function sortRoster(roster) {
  const slots = [...(roster.service_roster_slots || [])].sort((a, b) => {
    const orderA = a.ministry_service_positions?.sort_order || 0
    const orderB = b.ministry_service_positions?.sort_order || 0
    return orderA - orderB || a.slot_no - b.slot_no
  })
  return { ...roster, service_roster_slots: slots }
}

export const serviceRosterService = {
  async getById(rosterId) {
    const { data, error } = await supabase
      .from('service_rosters')
      .select(rosterSelect)
      .eq('roster_id', rosterId)
      .single()
    if (error) throw error
    return sortRoster(data)
  },

  async listManagedMinistries(profile) {
    if (['Admin', 'Super Admin'].includes(profile?.role)) {
      const { data: allowed, error: permissionError } = await supabase.rpc('auth_admin_can', {
        p_page: '/admin/jadwal-pelayanan',
      })
      if (permissionError) throw permissionError
      if (!allowed) return []
      const { data, error } = await supabase
        .from('ministries')
        .select('ministry_id, name')
        .order('name')
      if (error) throw error
      return (data || []).map(item => ({ ...item, manager_role: 'Admin' }))
    }
    if (FORBIDDEN_SCHEDULE_MANAGER_ROLES.has(profile?.role)
      || FORBIDDEN_SCHEDULE_MANAGER_ROLES.has(profile?.role_secondary)) return []
    const { data, error } = await supabase
      .from('ministry_schedule_managers')
      .select('manager_role, ministries(ministry_id, name)')
      .eq('user_id', profile?.user_id)
      .eq('is_active', true)
    if (error) throw error
    return (data || []).map(row => ({ ...row.ministries, manager_role: row.manager_role })).filter(Boolean)
  },

  async listPublished(month) {
    const [start, end] = monthRange(month)
    const { data, error } = await supabase
      .from('service_rosters')
      .select(rosterSelect)
      .in('status', ['Terbit', 'Dibatalkan'])
      .gte('service_date', start)
      .lt('service_date', end)
      .order('service_date')
      .order('start_time')
    if (error) throw error
    return (data || []).map(sortRoster)
  },

  async listMine(userId, month = null) {
    let query = supabase
      .from('service_roster_slots')
      .select(`
        roster_id,
        service_rosters(
          *, ministries(name),
          service_roster_slots(
            slot_id, ministry_id, position_id, slot_no, user_id,
            ministry_service_positions(name, sort_order),
            users(name, photo_url)
          )
        )
      `)
      .eq('user_id', userId)
    const { data, error } = await query
    if (error) throw error
    const unique = new Map()
    for (const row of data || []) {
      const roster = row.service_rosters
      if (!roster || !['Terbit', 'Dibatalkan'].includes(roster.status)) continue
      if (month && !String(roster.service_date || '').startsWith(month)) continue
      unique.set(roster.roster_id, sortRoster(roster))
    }
    return [...unique.values()].sort((a, b) =>
      String(a.service_date).localeCompare(String(b.service_date))
      || String(a.start_time).localeCompare(String(b.start_time))
    )
  },

  async listManaged(month, ministryId) {
    const [start, end] = monthRange(month)
    const { data, error } = await supabase
      .from('service_rosters')
      .select(rosterSelect)
      .eq('ministry_id', ministryId)
      .gte('service_date', start)
      .lt('service_date', end)
      .order('service_date')
      .order('start_time')
    if (error) throw error
    return (data || []).map(sortRoster)
  },

  async create(payload) {
    const { data, error } = await supabase.rpc('create_service_roster', {
      p_ministry_id: payload.ministry_id,
      p_source_type: payload.source_type,
      p_event_id: payload.event_id || null,
      p_class_id: payload.class_id || null,
      p_class_session_no: payload.class_session_no || null,
      p_title: payload.title,
      p_service_date: payload.service_date,
      p_start_time: payload.start_time,
      p_end_time: payload.end_time || null,
      p_location: payload.location || null,
      p_dress_code: payload.dress_code || null,
      p_notes: payload.notes || null,
    })
    if (error) throw error
    return data
  },

  async updateDraft(rosterId, updates) {
    const { data, error } = await supabase
      .from('service_rosters')
      .update(updates)
      .eq('roster_id', rosterId)
      .eq('status', 'Draft')
      .select(rosterSelect)
      .single()
    if (error) throw error
    return sortRoster(data)
  },

  async removeDraft(rosterId) {
    const { error } = await supabase
      .from('service_rosters')
      .delete()
      .eq('roster_id', rosterId)
      .eq('status', 'Draft')
    if (error) throw error
  },

  async setSlot(slotId, userId, allowConflict = false) {
    const { data, error } = await supabase.rpc('assign_service_roster_slot', {
      p_slot_id: slotId,
      p_user_id: userId || null,
      p_allow_conflict: allowConflict,
    })
    if (error) throw error
    return data
  },

  async publish(rosterId, allowIncomplete = false) {
    const { data, error } = await supabase.rpc('publish_service_roster', {
      p_roster_id: rosterId,
      p_allow_incomplete: allowIncomplete,
    })
    if (error) throw error
    return data
  },

  async cancel(rosterId) {
    const { data, error } = await supabase.rpc('cancel_service_roster', {
      p_roster_id: rosterId,
    })
    if (error) throw error
    return data
  },

  async notify(rosterId, kind) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Sesi login tidak tersedia.')
    const response = await fetch('/api/notify-service-roster', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ rosterId, kind }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || 'Notifikasi gagal dikirim.')
    return result
  },

  async listPositions(ministryId, { includeInactive = false } = {}) {
    let query = supabase
      .from('ministry_service_positions')
      .select('*')
      .eq('ministry_id', ministryId)
      .order('sort_order')
      .order('name')
    if (!includeInactive) query = query.eq('is_active', true)
    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  async savePosition(position) {
    const payload = {
      ministry_id: position.ministry_id,
      name: position.name.trim(),
      default_slots: Number(position.default_slots) || 1,
      sort_order: Number(position.sort_order) || 0,
      is_active: position.is_active !== false,
      created_by: position.created_by || null,
    }
    const query = position.position_id
      ? supabase.from('ministry_service_positions').update(payload).eq('position_id', position.position_id)
      : supabase.from('ministry_service_positions').insert(payload)
    const { data, error } = await query.select().single()
    if (error) throw error
    return data
  },

  async removePosition(positionId) {
    const { error } = await supabase
      .from('ministry_service_positions')
      .update({ is_active: false })
      .eq('position_id', positionId)
    if (error) throw error
  },

  async listMinistryMembers(ministryId, query = '') {
    let request = supabase
      .from('user_ministries')
      .select('user_id, users!user_id!inner(user_id, name, photo_url, status)')
      .eq('ministry_id', ministryId)
      .eq('users.status', 'Aktif')
    // INNER join menyaring keanggotaan sebelum batas hasil, bukan hanya data users yang di-embed.
    if (query.trim()) request = request.ilike('users.name', `%${query.trim()}%`)
    const { data, error } = await request.limit(50)
    if (error) throw error
    return (data || [])
      .map(row => row.users)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'id'))
  },

  async searchActiveUsers(query = '') {
    let request = supabase
      .from('users')
      .select('user_id, name, photo_url, role, role_secondary, status')
      .eq('status', 'Aktif')
      .not('role', 'in', '("Admin","Super Admin","Gembala")')
      .order('name')
      .limit(50)
    if (query.trim()) request = request.ilike('name', `%${query.trim()}%`)
    const { data, error } = await request
    if (error) throw error
    return (data || []).filter(user => !FORBIDDEN_SCHEDULE_MANAGER_ROLES.has(user.role_secondary))
  },

  async listManagers(ministryId) {
    const { data, error } = await supabase
      .from('ministry_schedule_managers')
      .select('*, users!ministry_schedule_managers_user_id_fkey(user_id, name, photo_url, role, status)')
      .eq('ministry_id', ministryId)
      .eq('is_active', true)
      .order('manager_role')
    if (error) throw error
    return data || []
  },

  async grantManager({ ministryId, userId, managerRole }) {
    const { data, error } = await supabase
      .from('ministry_schedule_managers')
      .upsert({
        ministry_id: ministryId,
        user_id: userId,
        manager_role: managerRole,
        is_active: true,
      }, { onConflict: 'ministry_id,user_id' })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async revokeManager(ministryId, userId) {
    const { error } = await supabase
      .from('ministry_schedule_managers')
      .delete()
      .eq('ministry_id', ministryId)
      .eq('user_id', userId)
    if (error) throw error
  },

  async findConflicts(userId, rosterId, slotId = null) {
    if (!userId || !rosterId) return []
    const { data, error } = await supabase.rpc('get_service_roster_conflicts', {
      p_user_id: userId,
      p_roster_id: rosterId,
      p_slot_id: slotId,
    })
    if (error) throw error
    return data || []
  },
}
