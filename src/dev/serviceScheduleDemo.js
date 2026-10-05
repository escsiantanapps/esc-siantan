// Adapter lokal sengaja tidak mengimpor Supabase, fetch, atau data jemaat sungguhan.
const copy = value => structuredClone(value)
export const demoProfiles = {
  admin: { user_id: 'DEMO-ADMIN', name: 'Admin Lokal', role: 'Admin', role_secondary: 'Volunteer', status: 'Aktif' },
  mh: { user_id: 'DEMO-MH', name: 'MH Musik Lokal', role: 'Volunteer', status: 'Aktif', ministry_ids: ['DEMO-M1'] },
  volunteer: { user_id: 'DEMO-BIMA', name: 'Bima', role: 'Volunteer', status: 'Aktif' },
  empty: { user_id: 'DEMO-EMPTY', name: 'Anggota Tanpa Jadwal', role: 'Volunteer', status: 'Aktif' },
}
const ministries = ['Worship', 'Musik', 'Kids', 'Multimedia', 'Frontline'].map((name, index) => ({ ministry_id: `DEMO-M${index}`, name }))
const positionRows = [
  ['WL', 'Worship Leader', 0, 1], ['SINGER', 'Singer', 0, 2],
  ['DRUM', 'Drum', 1, 1], ['BASS', 'Bass', 1, 1], ['GITAR', 'Gitar', 1, 1],
  ['PENGAJAR', 'Pengajar', 2, 1], ['PERAGA', 'Peraga', 2, 2], ['HOST', 'Host', 2, 1],
  ['SOUND', 'Sound', 3, 1], ['LIGHTING', 'Lighting', 3, 1], ['OPERATOR', 'Operator Media', 3, 1],
  ['PINTU', 'Buka Pintu', 4, 1], ['PERSEMBAHAN', 'Jemput Persembahan', 4, 1],
]
const positions = positionRows.map(([id, name, ministry, default_slots], sort_order) => ({ position_id: `DEMO-POS-${id}`, ministry_id: ministries[ministry].ministry_id, name, sort_order, default_slots, is_active: true, ministries: { name: ministries[ministry].name } }))
const memberRows = [
  ['ALYA', 'Alya', [0]], ['REINA', 'Reina', [0]], ['NADIA', 'Nadia', [0]],
  ['BIMA', 'Bima', [1, 3]], ['RAKA', 'Raka', [1]], ['NICO', 'Nico', [1]], ['DIKA', 'Dika', [1]], ['GILANG', 'Gilang', [1]],
  ['ELIN', 'Elin', [2]], ['FANI', 'Fani', [2]], ['VERA', 'Vera', [2]], ['NIA', 'Nia', [2]],
  ['DONI', 'Doni', [3]], ['ANDRA', 'Andra', [3]], ['MIKA', 'Mika', [3]], ['RENA', 'Rena', [3]],
  ['INA', 'Ina', [4]], ['TOMI', 'Tomi', [4]], ['YANI', 'Yani', [4]],
]
const members = memberRows.map(([id, name, groups]) => ({ user_id: `DEMO-${id}`, name, photo_url: null, role: 'Volunteer', status: 'Aktif', ministry_ids: groups.map(index => ministries[index].ministry_id) }))
const part = (index, ids) => ({ ministry_id: ministries[index].ministry_id, positions: ids.map(id => ({ position_id: `DEMO-POS-${id}`, capacity: positions.find(item => item.position_id === `DEMO-POS-${id}`).default_slots })) })
const sections = [
  { section_id: 'kids', title: 'Ibadah Kids', source_type: 'Ibadah', start_time: '08:00', end_time: '09:00', location: 'Ruang Kids', pic: 'Elin', parts: [part(0, ['WL', 'SINGER']), part(2, ['PENGAJAR', 'PERAGA', 'HOST']), part(1, ['DRUM', 'BASS', 'GITAR']), part(3, ['SOUND', 'OPERATOR']), part(4, ['PINTU'])] },
  { section_id: 'pagi', title: 'Ibadah Pagi', source_type: 'Ibadah', start_time: '09:00', end_time: '10:30', location: 'Ruang Utama', pic: 'Alya', parts: [part(0, ['WL', 'SINGER']), part(1, ['DRUM', 'BASS', 'GITAR']), part(3, ['SOUND', 'LIGHTING', 'OPERATOR']), part(4, ['PINTU', 'PERSEMBAHAN'])] },
  { section_id: 'nextgen', title: 'Ibadah Nextgen', source_type: 'Ibadah', start_time: '11:00', end_time: '12:30', location: 'Ruang Utama', pic: 'Reina', parts: [part(0, ['WL', 'SINGER']), part(1, ['DRUM', 'BASS', 'GITAR']), part(3, ['SOUND', 'LIGHTING', 'OPERATOR'])] },
  { section_id: 'kelas', title: 'Kelas Pelayanan', source_type: 'Kelas', class_id: 'DEMO-CLASS', class_session_no: 1, start_time: '14:00', end_time: '15:00', location: 'Ruang Kelas', pic: 'Fani', parts: [part(2, ['PENGAJAR']), part(3, ['OPERATOR'])] },
].map(item => ({ event_id: null, class_id: null, class_session_no: null, dress_code: '', notes: '', ...item }))
function fail(message, code = '22023') { const error = new Error(message); error.code = code; throw error }
function monthKey(value) {
  const result = String(value).slice(0, 7)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(result)) fail('Bulan tidak valid.')
  return result
}
const uniqueSorted = values => [...new Set(values || [])].sort()
const validTime = (start, end) => /^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(start) && /^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(end) && start < end
const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date

export function createServiceScheduleDemo({ profile = demoProfiles.admin, seed = true } = {}) {
  let caller = copy(profile)
  let serial = 0
  let state
  const id = prefix => `DEMO-${prefix}-${++serial}`
  const isAdmin = () => ['Admin', 'Super Admin'].includes(caller?.role) && caller.status === 'Aktif'
  const eligibleManager = user => user?.status === 'Aktif' && ['Jemaat', 'Volunteer', 'PKS'].includes(user.role) && !['Admin', 'Super Admin', 'Gembala'].includes(user.role_secondary)
  const eligibleHead = user => user?.status === 'Aktif' && (user.role === 'Admin' || eligibleManager(user) && user.role === 'Volunteer')
  const managedGrants = user => eligibleManager(user) ? state.managers.filter(grant => grant.user_id === user.user_id && grant.is_active && (grant.manager_role === 'Wakil' || grant.manager_role === 'Ministry Head' && eligibleHead(user) && eligibleHead(findUser(user.user_id)) && findUser(user.user_id)?.ministry_ids?.includes(grant.ministry_id) && state.ministries.some(ministry => ministry.ministry_id === grant.ministry_id && ministry.head_user_id === user.user_id))) : []
  const managedIds = () => managedGrants(caller).map(grant => grant.ministry_id)
  const canManage = ministryId => isAdmin() || managedIds().includes(ministryId)
  const demandAdmin = () => { if (!isAdmin()) fail('Hanya Admin berakses yang dapat mengubah struktur atau menerbitkan bulan.', '42501') }
  const findUser = userId => state.users.find(user => user.user_id === userId)
  const demandMinistry = ministryId => { const ministry = state.ministries.find(item => item.ministry_id === ministryId); if (!ministry) fail('Ministry tidak ditemukan.'); return ministry }
  const ministryWithHead = ministry => ({ ...ministry, head: copy(findUser(ministry.head_user_id) || null) })
  const demandMonth = monthId => { const month = state.months.find(item => item.month_id === monthId); if (!month) fail('Lembar bulanan tidak ditemukan.'); return month }
  const demandDraft = monthId => { const month = demandMonth(monthId); if (month.status !== 'Draft') fail('Lembar yang sudah diterbitkan tidak dapat diedit langsung.'); return month }
  function demandRoster(rosterId) {
    const roster = state.rosters.find(item => item.roster_id === rosterId)
    if (!roster) fail('Bagian pelayanan tidak ditemukan.')
    if (!canManage(roster.ministry_id)) fail('Tidak memiliki akses untuk ministry ini.', '42501')
    demandDraft(roster.month_id)
    return roster
  }
  function validateDefinition(definition) {
    if (!Array.isArray(definition?.sections) || !definition.sections.length) fail('Template memerlukan kegiatan.')
    const seen = new Set()
    for (const section of definition.sections) {
      if (!section.section_id || seen.has(section.section_id) || !section.title?.trim()) fail('Identitas kegiatan tidak valid.')
      seen.add(section.section_id)
      if (!validTime(section.start_time, section.end_time)) fail('Jam mulai dan selesai kegiatan wajib valid.')
      if (!['Ibadah', 'Kelas', 'Event'].includes(section.source_type)) fail('Jenis kegiatan tidak valid.')
      const seenPositions = new Set()
      for (const item of section.parts || []) {
        if (!state.ministries.some(ministry => ministry.ministry_id === item.ministry_id)) fail('Ministry tidak ditemukan.')
        for (const entry of item.positions || []) {
          const position = state.positions.find(value => value.position_id === entry.position_id && value.ministry_id === item.ministry_id && value.is_active)
          if (!position || seenPositions.has(entry.position_id)) fail('Posisi tidak sesuai ministry atau berulang.')
          if (!Number.isInteger(entry.capacity) || entry.capacity < 1 || entry.capacity > 20) fail('Kapasitas posisi harus 1 sampai 20.')
          seenPositions.add(entry.position_id)
        }
      }
      if (!seenPositions.size) fail('Kegiatan memerlukan posisi pelayanan.')
    }
  }
  function buildMonth(template, month, dates) {
    validateDefinition(template.definition)
    if (!dates?.length || dates.some(date => !validDate(date) || !date.startsWith(`${monthKey(month)}-`))) fail('Tanggal harus berada pada bulan yang dipilih.')
    if (new Set(dates).size !== dates.length) fail('Tanggal tidak boleh berulang.')
    const monthId = id('MONTH')
    state.months.push({ month_id: monthId, template_id: template.template_id, month_date: `${monthKey(month)}-01`, month: `${monthKey(month)}-01`, name: template.name, definition: copy(template.definition), status: 'Draft', version: 0, created_by: caller.user_id })
    for (const date of [...dates].sort()) for (const section of template.definition.sections) {
      if (section.participation && !section.participation[date]?.length) continue
      const day = { ...section, ...(section.occurrence_details?.[date] || {}) }
      const occurrence = { ...copy(day), parts: undefined, occurrence_details: undefined, occurrence_id: id('OCC'), month_id: monthId, section_key: section.section_id, service_date: date }
      state.occurrences.push(occurrence)
      for (const item of section.parts) {
        if (section.participation && !section.participation[date].includes(item.ministry_id)) continue
        const rosterId = id('ROSTER')
        state.parts.push({ part_id: id('PART'), occurrence_id: occurrence.occurrence_id, ministry_id: item.ministry_id, roster_id: rosterId, team_name: '', material: '', notes: '' })
        const slots = []
        for (const entry of item.positions) {
          const position = state.positions.find(value => value.position_id === entry.position_id)
          for (let number = 1; number <= entry.capacity; number += 1) slots.push({ slot_id: id('SLOT'), ministry_id: item.ministry_id, position_id: entry.position_id, slot_no: number, user_id: null, users: null, ministry_service_positions: { name: position.name, sort_order: position.sort_order } })
        }
        state.rosters.push({ roster_id: rosterId, month_id: monthId, occurrence_id: occurrence.occurrence_id, ministry_id: item.ministry_id, ministries: { name: state.ministries.find(value => value.ministry_id === item.ministry_id).name }, source_type: day.source_type, title: day.title, service_date: date, start_time: day.start_time, end_time: day.end_time, location: day.location, dress_code: day.dress_code, notes: day.notes, status: 'Draft', version: 0, service_roster_slots: slots })
      }
    }
    return monthId
  }
  function buildDirectMonth(month, entries) {
    const key = monthKey(month)
    if (!Array.isArray(entries) || !entries.length || entries.length > 124) fail('Daftar kegiatan tidak valid.')
    const sectionsById = new Map()
    for (const entry of entries) {
      if (!validDate(entry.service_date) || !entry.service_date.startsWith(key + '-') || !validTime(entry.start_time, entry.end_time)) fail('Tanggal atau jam kegiatan tidak valid.')
      if (!entry.section_id || !entry.title?.trim() || !['Ibadah', 'Kelas', 'Event'].includes(entry.source_type)) fail('Identitas kegiatan tidak valid.')
      if (entry.source_type === 'Kelas' && !entry.class_id || entry.source_type === 'Event' && !entry.event_id) fail('Kelas atau event wajib dipilih.')
      if (!Array.isArray(entry.ministry_ids) || !entry.ministry_ids.length || entry.ministry_ids.length > 20 || new Set(entry.ministry_ids).size !== entry.ministry_ids.length) fail('Pilih Ministry yang melayani.')
      let section = sectionsById.get(entry.section_id)
      if (!section) {
        section = { section_id: entry.section_id, title: entry.title.trim(), source_type: entry.source_type,
          event_id: entry.event_id || null, class_id: entry.class_id || null, class_session_no: entry.class_session_no || null,
          start_time: entry.start_time, end_time: entry.end_time, location: entry.location || '', dress_code: entry.dress_code || '',
          pic: entry.pic || '', notes: entry.notes || '', parts: [], participation: {}, occurrence_details: {} }
        sectionsById.set(entry.section_id, section)
      } else if (section.title !== entry.title.trim() || section.source_type !== entry.source_type
        || section.event_id !== (entry.event_id || null) || section.class_id !== (entry.class_id || null)) {
        fail('Identitas kegiatan yang disalin harus sama.')
      }
      if (section.participation[entry.service_date]) fail('Kegiatan tidak boleh berulang pada tanggal yang sama.')
      section.participation[entry.service_date] = [...entry.ministry_ids]
      section.occurrence_details[entry.service_date] = {
        start_time: entry.start_time, end_time: entry.end_time, location: entry.location || '',
        dress_code: entry.dress_code || '', pic: entry.pic || '', notes: entry.notes || '',
        class_session_no: entry.class_session_no || null,
      }
      for (const ministryId of entry.ministry_ids) {
        demandMinistry(ministryId)
        const available = state.positions.filter(position => position.is_active && position.ministry_id === ministryId)
        if (!available.length) fail('Ministry yang dipilih belum memiliki posisi aktif.')
        if (!section.parts.some(item => item.ministry_id === ministryId)) section.parts.push({
          ministry_id: ministryId,
          positions: available.map(position => ({ position_id: position.position_id, capacity: position.default_slots || 1 })),
        })
      }
    }
    if (sectionsById.size > 12) fail('Terlalu banyak jenis kegiatan.')
    const definition = { sections: [...sectionsById.values()] }
    return buildMonth({ template_id: 'SSTPL-DIRECT-V102', name: 'Jadwal ' + key.slice(5, 7) + '/' + key.slice(0, 4), definition },
      key, uniqueSorted(entries.map(entry => entry.service_date)))
  }
  function conflicts(userId, target, excludePosition) {
    return state.rosters.filter(roster => roster.status !== 'Dibatalkan' && roster.service_date === target.service_date && roster.start_time < target.end_time && target.start_time < roster.end_time && roster.service_roster_slots.some(slot => slot.user_id === userId && !(roster.roster_id === target.roster_id && slot.position_id === excludePosition)))
  }
  function reset() {
    serial = 0
    state = { ministries: ministries.map(ministry => ({ ...ministry, head_user_id: ministry.ministry_id === 'DEMO-M1' ? demoProfiles.mh.user_id : null })), positions: copy(positions), users: [...copy(members), copy(demoProfiles.mh), copy(demoProfiles.empty), copy(demoProfiles.admin)].map(user => ({ role_secondary: null, ...user })), managers: [{ ministry_id: 'DEMO-M1', user_id: demoProfiles.mh.user_id, manager_role: 'Ministry Head', is_active: true, approved_by: demoProfiles.admin.user_id }], templates: [{ template_id: 'DEMO-TEMPLATE', name: 'Template Pelayanan Mingguan', definition: { sections: copy(sections) }, is_active: true }], months: [], occurrences: [], parts: [], rosters: [], notifications: [] }
    if (!seed) return
    const monthId = buildMonth(state.templates[0], '2026-10', ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'])
    for (const roster of state.rosters.filter(item => item.month_id === monthId)) {
      const pool = members.filter(member => member.ministry_ids.includes(roster.ministry_id) && !(roster.ministry_id === 'DEMO-M3' && member.user_id === 'DEMO-BIMA'))
      let index = 0
      for (const slot of roster.service_roster_slots) {
        if (slot.position_id === 'DEMO-POS-LIGHTING') continue
        const member = pool[index++ % pool.length]
        slot.user_id = member.user_id
        slot.users = { user_id: member.user_id, name: member.name, photo_url: null }
      }
    }
  }
  reset()
  return {
    setProfile(value) { caller = copy(value) }, reset, exportState() { return copy(state) },
    async listTemplates() { return isAdmin() || managedIds().length ? copy(state.templates) : [] },
    async saveTemplate(payload) {
      demandAdmin(); validateDefinition(payload.definition)
      if (!payload.name?.trim()) fail('Nama template wajib diisi.')
      const existing = state.templates.find(item => item.template_id === payload.template_id)
      if (payload.template_id && !existing) fail('Template tidak ditemukan.')
      const value = { ...copy(payload), template_id: existing?.template_id || id('TEMPLATE'), name: payload.name.trim(), is_active: true }
      if (existing) Object.assign(existing, value)
      else state.templates.push(value)
      return copy(value)
    },
    async listMonths(month) { return copy(state.months.filter(item => (!month || item.month_date.startsWith(monthKey(month))) && (item.status !== 'Draft' || isAdmin() || managedIds().length))) },
    async getMonth(monthId) {
      const month = demandMonth(monthId)
      if (month.status === 'Draft' && !isAdmin() && !managedIds().length) fail('Draft tidak tersedia untuk anggota.', '42501')
      const rosters = state.rosters.filter(item => item.month_id === monthId && (month.status !== 'Draft' || canManage(item.ministry_id)))
      const ids = new Set(rosters.map(item => item.roster_id))
      return copy({ month, sections: month.definition.sections.map(section => ({ ...section, key: section.section_id, positions: section.parts.flatMap(item => item.positions.map(entry => ({ ...state.positions.find(value => value.position_id === entry.position_id), ministry_name: state.ministries.find(value => value.ministry_id === item.ministry_id).name, slots: entry.capacity }))) })), occurrences: state.occurrences.filter(item => item.month_id === monthId), parts: state.parts.filter(item => ids.has(item.roster_id)), rosters })
    },
    async createMonth({ templateId, month, dates }) {
      demandAdmin()
      const template = state.templates.find(item => item.template_id === templateId)
      if (!template) fail('Template tidak ditemukan.')
      if (state.months.some(item => item.month_date.startsWith(monthKey(month)) && item.status !== 'Dibatalkan')) fail('Lembar bulan ini sudah ada.')
      return buildMonth(template, month, dates)
    },
    async createMonthDirect({ month, entries }) {
      demandAdmin()
      if (state.months.some(item => item.month_date.startsWith(monthKey(month)) && item.status !== 'Dibatalkan')) fail('Lembar bulan ini sudah ada.')
      return buildDirectMonth(month, entries)
    },
    async deleteMonthDraft(monthId, expectedAssigned) {
      demandAdmin()
      demandDraft(monthId)
      const rosters = state.rosters.filter(item => item.month_id === monthId)
      const assigned = rosters.reduce((count, roster) => count + roster.service_roster_slots.filter(slot => slot.user_id).length, 0)
      if (!Number.isInteger(expectedAssigned) || expectedAssigned !== assigned) fail('schedule_stale', '40001')
      const rosterIds = new Set(rosters.map(item => item.roster_id))
      state.parts = state.parts.filter(item => !rosterIds.has(item.roster_id))
      state.rosters = state.rosters.filter(item => item.month_id !== monthId)
      state.occurrences = state.occurrences.filter(item => item.month_id !== monthId)
      state.months = state.months.filter(item => item.month_id !== monthId)
      return assigned
    },
    async setPosition({ rosterId, positionId, userIds, expectedUserIds }) {
      const roster = demandRoster(rosterId)
      const slots = roster.service_roster_slots.filter(slot => slot.position_id === positionId)
      if (!slots.length) fail('Posisi tidak ditemukan dalam bagian ini.')
      if (JSON.stringify(uniqueSorted(slots.map(slot => slot.user_id).filter(Boolean))) !== JSON.stringify(uniqueSorted(expectedUserIds))) fail('Penugasan telah berubah. Muat ulang sebelum menyimpan.', '40001')
      if (!Array.isArray(userIds) || userIds.length > slots.length || uniqueSorted(userIds).length !== userIds.length) fail('Jumlah pelayan melebihi kapasitas atau berulang.')
      for (const userId of userIds) {
        const member = state.users.find(item => item.user_id === userId && eligibleManager(item))
        if (!member) fail('Pelayan yang dipilih harus berstatus Aktif.')
        if (!isAdmin() && !member.ministry_ids.includes(roster.ministry_id)) fail('MH hanya dapat memilih anggota aktif ministry ini.', '42501')
        const clash = conflicts(userId, roster, positionId)[0]
        if (clash) fail(`Jadwal bentrok: ${member.name}, ${clash.title}, ${clash.service_date}, ${clash.start_time}-${clash.end_time}.`, '23P01')
      }
      // Semua kandidat diperiksa dahulu agar penyimpanan beberapa nama bersifat atomik.
      slots.forEach((slot, index) => { const member = findUser(userIds[index]); slot.user_id = member?.user_id || null; slot.users = member ? { user_id: member.user_id, name: member.name, photo_url: member.photo_url } : null })
      return copy(slots)
    },
    async findConflicts(userId, rosterId, slotId = null) {
      const target = state.rosters.find(item => item.roster_id === rosterId)
      if (!target || !canManage(target.ministry_id)) fail('Tidak memiliki akses untuk ministry ini.', '42501')
      return copy(conflicts(userId, target, null).flatMap(roster => roster.service_roster_slots.filter(slot => slot.user_id === userId && slot.slot_id !== slotId).map(slot => ({ roster_id: roster.roster_id, slot_id: slot.slot_id, position_id: slot.position_id, title: roster.title, source_type: roster.source_type, ministry_name: roster.ministries.name, position_name: slot.ministry_service_positions.name, position_names: slot.ministry_service_positions.name, service_date: roster.service_date, start_time: roster.start_time, end_time: roster.end_time, status: roster.status, same_roster: roster.roster_id === rosterId }))))
    },
    async updateOccurrence(occurrenceId, data) {
      demandAdmin()
      const occurrence = state.occurrences.find(item => item.occurrence_id === occurrenceId)
      if (!occurrence) fail('Kegiatan tidak ditemukan.')
      demandDraft(occurrence.month_id)
      const rosters = state.rosters.filter(item => item.occurrence_id === occurrenceId)
      const target = { ...occurrence, ...data }
      if (!validDate(target.service_date) || !target.service_date.startsWith(monthKey(demandMonth(occurrence.month_id).month_date))) fail('Tanggal harus berada pada bulan yang dipilih.')
      if (!validTime(target.start_time, target.end_time)) fail('Jam mulai dan selesai kegiatan wajib valid.')
      if (['service_date', 'start_time', 'end_time'].some(key => target[key] !== occurrence[key]) && rosters.some(item => item.service_roster_slots.some(slot => slot.user_id))) fail('Kosongkan seluruh pelayan sebelum mengubah tanggal atau jam kegiatan.')
      for (const key of ['title', 'service_date', 'start_time', 'end_time', 'location', 'dress_code', 'notes', 'pic']) if (Object.hasOwn(data, key)) { occurrence[key] = data[key]; for (const roster of rosters) if (key !== 'pic') roster[key] = data[key] }
      return copy(occurrence)
    },
    async updatePart(rosterId, data) { demandRoster(rosterId); const value = state.parts.find(item => item.roster_id === rosterId); for (const key of ['team_name', 'material', 'notes']) if (Object.hasOwn(data, key)) value[key] = data[key] || ''; return copy(value) },
    async publishMonth(monthId, allowIncomplete = false) {
      demandAdmin()
      const month = demandDraft(monthId)
      const rosters = state.rosters.filter(item => item.month_id === monthId)
      if (!rosters.some(item => item.service_roster_slots.some(slot => slot.user_id))) fail('Isi minimal satu pelayan sebelum menerbitkan.')
      if (!allowIncomplete && rosters.some(item => item.service_roster_slots.some(slot => !slot.user_id))) fail('Masih ada posisi pelayanan yang kosong.')
      for (const roster of rosters) for (const slot of roster.service_roster_slots) if (slot.user_id && conflicts(slot.user_id, roster, slot.position_id).length) fail('Bulan tidak dapat diterbitkan karena jadwal bentrok.', '23P01')
      month.status = 'Terbit'; month.version += 1; month.published_by = caller.user_id
      for (const roster of rosters) { roster.status = 'Terbit'; roster.version += 1 }
      return rosters.map(item => item.roster_id)
    },
    async cancelMonth(monthId) { demandAdmin(); const month = demandMonth(monthId); if (month.status !== 'Terbit') fail('Hanya bulan Terbit yang dapat dibatalkan.'); month.status = 'Dibatalkan'; month.version += 1; const rosters = state.rosters.filter(item => item.month_id === monthId); for (const roster of rosters) { roster.status = 'Dibatalkan'; roster.version += 1 } return rosters.map(item => item.roster_id) },
    async listManagedMinistries(value = caller) { if (['Admin', 'Super Admin'].includes(value?.role) && value.status === 'Aktif') return copy(state.ministries.map(item => ({ ...ministryWithHead(item), manager_role: 'Admin' }))); return copy(managedGrants(value).map(grant => ({ ...ministryWithHead(demandMinistry(grant.ministry_id)), manager_role: grant.manager_role }))) },
    async listMinistries() { return copy(state.ministries.map(ministryWithHead)) }, async listPositions() { return copy(state.positions) },
    async listManagers(ministryId) { demandAdmin(); demandMinistry(ministryId); return copy(state.managers.filter(grant => grant.ministry_id === ministryId && grant.is_active).map(grant => ({ ...grant, users: findUser(grant.user_id) }))) },
    async searchActiveUsers(query = '') { demandAdmin(); return copy(state.users.filter(user => eligibleManager(user) && user.name.toLowerCase().includes(query.toLowerCase().trim())).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50)) },
    async grantManager({ ministryId, userId, managerRole }) {
      demandAdmin()
      const ministry = demandMinistry(ministryId)
      if (!['Ministry Head', 'Wakil'].includes(managerRole)) fail('Jabatan pengelola tidak valid.')
      if (!eligibleManager(findUser(userId))) fail('Pengelola harus anggota aktif dengan role yang diizinkan.', '42501')
      if (managerRole === 'Ministry Head' && (!eligibleHead(findUser(userId)) || !findUser(userId)?.ministry_ids?.includes(ministryId) || ministry.head_user_id !== userId)) fail('Ministry Head harus Volunteer aktif dan anggota Ministry sesuai data MH di menu Ministry.', '42501')
      const payload = { ministry_id: ministryId, user_id: userId, manager_role: managerRole, is_active: true, approved_by: caller.user_id }
      const existing = state.managers.find(grant => grant.ministry_id === ministryId && grant.user_id === userId)
      if (existing) Object.assign(existing, payload)
      else state.managers.push(payload)
      return copy(payload)
    },
    async revokeManager(ministryId, userId) { demandAdmin(); demandMinistry(ministryId); state.managers = state.managers.filter(grant => grant.ministry_id !== ministryId || grant.user_id !== userId) },
    async setMinistryHead(ministryId, userId) {
      demandAdmin()
      const ministry = demandMinistry(ministryId)
      const nextId = userId || null
      if (nextId && !eligibleHead(findUser(nextId))) fail('MH harus Volunteer atau Admin aktif.')
      if (nextId && !findUser(nextId)?.ministry_ids?.includes(ministryId)) fail('MH harus anggota aktif di Ministry ini.')
      if (ministry.head_user_id !== nextId) {
        for (const grant of state.managers) if (grant.ministry_id === ministryId && grant.manager_role === 'Ministry Head' && grant.user_id !== nextId) grant.is_active = false
        ministry.head_user_id = nextId
      }
      return copy(ministryWithHead(ministry))
    },
    async setUserMinistries(userId, ministryIds) {
      demandAdmin()
      const user = findUser(userId)
      if (!user) fail('Pengguna tidak ditemukan.')
      if (!Array.isArray(ministryIds) || ministryIds.some(ministryId => !state.ministries.some(item => item.ministry_id === ministryId))) fail('Daftar Ministry tidak valid.')
      user.ministry_ids = [...new Set(ministryIds)]
      for (const ministry of state.ministries) {
        if (ministry.head_user_id !== userId || user.ministry_ids.includes(ministry.ministry_id)) continue
        ministry.head_user_id = null
        for (const grant of state.managers) if (grant.ministry_id === ministry.ministry_id && grant.user_id === userId && grant.manager_role === 'Ministry Head') grant.is_active = false
      }
      return copy(user)
    },
    async savePosition(position) {
      demandAdmin()
      const ministry = demandMinistry(position.ministry_id)
      const name = position.name?.trim()
      const defaultSlots = Number(position.default_slots ?? 1)
      const sortOrder = Number(position.sort_order ?? 0)
      if (!name) fail('Nama posisi wajib diisi.')
      if (!Number.isInteger(defaultSlots) || defaultSlots < 1 || defaultSlots > 20) fail('Kapasitas posisi harus 1 sampai 20.')
      if (!Number.isInteger(sortOrder)) fail('Urutan posisi harus bilangan bulat.')
      const existing = state.positions.find(item => item.position_id === position.position_id)
      if (position.position_id && !existing) fail('Posisi pelayanan tidak ditemukan.')
      if (existing && existing.ministry_id !== ministry.ministry_id) fail('Ministry posisi pelayanan tidak dapat dipindahkan.')
      if (state.positions.some(item => item.position_id !== position.position_id && item.ministry_id === ministry.ministry_id && item.name === name)) fail('Nama posisi sudah digunakan pada ministry ini.', '23505')
      if (existing && existing.name !== name && state.rosters.some(roster => roster.status !== 'Draft' && roster.service_roster_slots.some(slot => slot.position_id === existing.position_id))) fail('Nama posisi yang sudah dipakai roster Terbit tidak dapat diubah.')
      const payload = { position_id: existing?.position_id || id('POS'), ministry_id: ministry.ministry_id, name, default_slots: defaultSlots, sort_order: sortOrder, is_active: position.is_active !== false, ministries: { name: ministry.name } }
      if (existing) Object.assign(existing, payload)
      else state.positions.push(payload)
      return copy(payload)
    },
    async removePosition(positionId) { demandAdmin(); const position = state.positions.find(item => item.position_id === positionId); if (!position) fail('Posisi pelayanan tidak ditemukan.'); position.is_active = false; return copy(position) },
    async listMembers(ministryId, query = '', canManageAll = false) { if (!canManage(ministryId)) fail('Tidak memiliki akses untuk ministry ini.', '42501'); return copy(state.users.filter(item => eligibleManager(item) && (isAdmin() && canManageAll || item.ministry_ids?.includes(ministryId)) && item.name.toLowerCase().includes(query.toLowerCase().trim()))) },
    async listEvents() { return [{ event_id: 'DEMO-EVENT', title: 'Acara Lokal', status: 'Mulai' }] },
    async listClasses() { return [{ class_id: 'DEMO-CLASS', title: 'Kelas Pelayanan', name: 'Kelas Pelayanan', status: 'Mulai' }] },
    async notify(rosterId, kind) { const roster = state.rosters.find(item => item.roster_id === rosterId); if (!roster || !canManage(roster.ministry_id) || roster.status === 'Draft') fail('Tidak dapat mengirim pengingat untuk bagian ini.', '42501'); state.notifications.push({ roster_id: rosterId, kind }); return { sent: 0, demo: true } },
  }
}
