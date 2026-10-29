const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function utcDate(value) {
  if (!DATE_PATTERN.test(String(value || ''))) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date
}

export function scheduleMonthDate(month) {
  const raw = typeof month === 'object' ? month?.month_date || month?.month : month
  const value = String(raw || '').slice(0, 7)
  return utcDate(`${value}-01`) ? `${value}-01` : null
}

export function shiftScheduleMonth(month, offset) {
  const value = scheduleMonthDate(month)
  if (!value || !Number.isInteger(offset)) return null
  const date = utcDate(value)
  date.setUTCMonth(date.getUTCMonth() + offset)
  return date.toISOString().slice(0, 10)
}

// DATE dari PostgreSQL memakai UTC; hasil tetap sama pada perangkat di zona lain.
export function getMonthDates(month) {
  const value = scheduleMonthDate(month)
  if (!value) return []
  const date = utcDate(value)
  const monthIndex = date.getUTCMonth()
  const dates = []
  while (date.getUTCMonth() === monthIndex) {
    if (date.getUTCDay() === 0) dates.push(date.toISOString().slice(0, 10))
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return dates
}

export function getScheduleDates(schedule) {
  const month = scheduleMonthDate(schedule?.month)
  const dates = [...new Set((schedule?.occurrences || []).map(item => item.service_date)
    .filter(date => utcDate(date) && (!month || date.slice(0, 7) === month.slice(0, 7))))].sort()
  return dates.length ? dates : getMonthDates(schedule?.month)
}

export function formatScheduleDate(date, locale = 'id', options = {}) {
  const parsed = utcDate(date)
  if (!parsed) return '-'
  return parsed.toLocaleDateString(locale === 'en' ? 'en-GB' : 'id-ID', {
    day: 'numeric', month: 'short', timeZone: 'UTC', ...options,
  })
}

export function formatScheduleMonth(month, locale = 'id') {
  const parsed = utcDate(scheduleMonthDate(month))
  if (!parsed) return '-'
  return parsed.toLocaleDateString(locale === 'en' ? 'en-GB' : 'id-ID', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

export function formatScheduleTime(start, end) {
  const first = String(start || '').slice(0, 5)
  const last = String(end || '').slice(0, 5)
  return first && last ? `${first} - ${last}` : '-'
}

function sectionKey(item) {
  return item?.key || item?.section_id || item?.section_key
}

function positionCapacity(position) {
  const value = Number(position.slots ?? position.capacity ?? 1)
  return Number.isInteger(value) && value > 0 ? value : 1
}

export function buildScheduleMatrix(schedule = {}, { ministryFilter = '', activityFilter = '' } = {}) {
  const dates = getScheduleDates(schedule)
  const sectionsByKey = new Map((schedule.sections || []).map(section => [sectionKey(section), section]))
  const parts = new Map((schedule.parts || []).map(part => [`${part.occurrence_id}:${part.ministry_id}`, part]))
  const rosters = new Map((schedule.rosters || []).map(roster => [roster.roster_id, roster]))
  const emptyReasons = new Map((schedule.emptyReasons || []).map(item => [`${item.roster_id}:${item.position_id}`, item.reason]))
  const rostersByOccurrence = new Map((schedule.rosters || [])
    .filter(roster => roster.occurrence_id)
    .map(roster => [`${roster.occurrence_id}:${roster.ministry_id}`, roster]))
  const isParticipating = (occurrence, ministryId) => {
    if (!occurrence) return false
    const key = `${occurrence.occurrence_id}:${ministryId}`
    // Bagian aktual tetap benar ketika tanggal kegiatan Draft dipindahkan.
    if (parts.has(key) || rostersByOccurrence.has(key)) return true
    const participation = sectionsByKey.get(sectionKey(occurrence))?.participation
    if (!participation || typeof participation !== 'object' || Array.isArray(participation)) return true
    return Array.isArray(participation[occurrence.service_date])
      && participation[occurrence.service_date].includes(ministryId)
  }
  const getPart = (occurrence, ministryId) => occurrence ? parts.get(`${occurrence.occurrence_id}:${ministryId}`) || null : null
  const getCell = (occurrence, position) => {
    const capacity = positionCapacity(position)
    if (!isParticipating(occurrence, position.ministry_id)) {
      return { occurrence: null, position, part: null, roster: null, slots: [], assigned: [], hidden: false, capacity, filled: 0 }
    }
    const part = getPart(occurrence, position.ministry_id)
    const roster = (part && rosters.get(part.roster_id)) || (occurrence && rostersByOccurrence.get(`${occurrence.occurrence_id}:${position.ministry_id}`)) || null
    const slots = (roster?.service_roster_slots || []).filter(slot => slot.position_id === position.position_id)
      .sort((a, b) => Number(a.slot_no || 0) - Number(b.slot_no || 0))
    const assigned = slots.filter(slot => slot.user_id)
    const hidden = !!occurrence && !part && !roster && schedule.month?.status === 'Draft'
    return { occurrence, position, part, roster, slots, assigned, hidden, capacity, filled: assigned.length,
      emptyReason: roster ? emptyReasons.get(`${roster.roster_id}:${position.position_id}`) || '' : '' }
  }
  const sections = (schedule.sections || [])
    .filter(section => !activityFilter || sectionKey(section) === activityFilter)
    .map(section => {
      const positions = (section.positions || [])
        .filter(position => !ministryFilter || position.ministry_id === ministryFilter)
        .sort((a, b) => {
          const ministryOrder = (a.ministry_sort_order ?? Number.MAX_SAFE_INTEGER)
            - (b.ministry_sort_order ?? Number.MAX_SAFE_INTEGER)
          if (ministryOrder) return ministryOrder
          const ministryName = String(a.ministry_name || '').localeCompare(String(b.ministry_name || ''))
          if (ministryName) return ministryName
          const ministryId = String(a.ministry_id || '').localeCompare(String(b.ministry_id || ''))
          if (ministryId) return ministryId
          return Number(a.sort_order || 0) - Number(b.sort_order || 0)
            || String(a.name || '').localeCompare(String(b.name || ''))
            || String(a.position_id || '').localeCompare(String(b.position_id || ''))
        })
      const ministries = []
      for (const position of positions) {
        let ministry = ministries.find(item => item.ministry_id === position.ministry_id)
        if (!ministry) {
          ministry = { ministry_id: position.ministry_id, ministry_name: position.ministry_name || '', positions: [] }
          ministries.push(ministry)
        }
        ministry.positions.push(position)
      }
      const occurrencesByDate = new Map((schedule.occurrences || [])
        .filter(occurrence => sectionKey(occurrence) === sectionKey(section) && dates.includes(occurrence.service_date))
        .map(occurrence => [occurrence.service_date, occurrence]))
      return { ...section, key: sectionKey(section), ministries, occurrencesByDate }
    }).filter(section => section.ministries.length)
  const stats = { assigned: 0, capacity: 0, empty: 0, hidden: 0 }
  for (const section of sections) for (const ministry of section.ministries) for (const position of ministry.positions) for (const date of dates) {
    const occurrence = section.occurrencesByDate.get(date)
    if (!occurrence) continue
    const cell = getCell(occurrence, position)
    if (!cell.occurrence) continue
    if (cell.hidden) { stats.hidden += cell.capacity; continue }
    stats.assigned += cell.filled
    stats.capacity += cell.capacity
    stats.empty += Math.max(0, cell.capacity - cell.filled)
  }
  return { dates, sections, getCell, getPart, isParticipating, stats }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char])
}

export function buildMonthlySchedulePrintDocument(schedule, { t = key => key, locale = 'id', ministryFilter = '', activityFilter = '' } = {}) {
  const matrix = buildScheduleMatrix(schedule, { ministryFilter, activityFilter })
  const tr = (key, params) => escapeHtml(t(key, params))
  const dateHeaders = matrix.dates.map(date => `<th scope="col">${escapeHtml(formatScheduleDate(date, locale, { weekday: 'short' }))}</th>`).join('')
  const tables = matrix.sections.map((section, index) => {
    const sectionHeader = `<tr class="activity"><th colspan="${matrix.dates.length + 1}"><span class="activity-number">${String(index + 1).padStart(2, '0')}</span>${escapeHtml(section.title)}</th></tr>`
    const scheduleRow = `<tr class="schedule-row"><th scope="row">${tr('schedMonth.serviceInfo')}</th>${matrix.dates.map(date => {
      const occurrence = section.occurrencesByDate.get(date)
      if (!occurrence) return '<td class="muted">-</td>'
      return `<td><strong>${escapeHtml(formatScheduleTime(occurrence.start_time, occurrence.end_time))}</strong>${occurrence.location ? `<span>${escapeHtml(occurrence.location)}</span>` : ''}${occurrence.pic ? `<span>${tr('schedMonth.pic')}: ${escapeHtml(occurrence.pic)}</span>` : ''}</td>`
    }).join('')}</tr>`
    const ministryRows = section.ministries.map(ministry => {
      const divider = `<tr class="ministry"><th colspan="${matrix.dates.length + 1}">${escapeHtml(ministry.ministry_name)}</th></tr>`
      const positions = ministry.positions.map(position => `<tr class="position"><th scope="row">${escapeHtml(position.name)}</th>${matrix.dates.map(date => {
        const cell = matrix.getCell(section.occurrencesByDate.get(date), position)
        if (!cell.occurrence) return '<td class="muted">-</td>'
        if (cell.hidden) return `<td class="muted">${tr('schedMonth.restricted')}</td>`
        const names = cell.assigned.map(slot => `<span class="person">${escapeHtml(slot.users?.name || t('schedMonth.unavailableMember'))}${slot.assignment_note ? `<small>${escapeHtml(slot.assignment_note)}</small>` : ''}</span>`).join('')
        const empty = Math.max(0, cell.capacity - cell.filled)
        return `<td>${names}${empty ? `<span class="empty">${tr('schedMonth.emptyCount', { count: empty })}</span>` : ''}${!cell.filled && (cell.emptyReason || schedule.month?.status === 'Draft') ? `<small class="empty-reason">${cell.emptyReason ? `${tr('schedMonth.emptyReasonDisplay')}: ${escapeHtml(cell.emptyReason)}` : tr('schedMonth.emptyReasonMissing')}</small>` : ''}</td>`
      }).join('')}</tr>`).join('')
      return divider + positions
    }).join('')
    const noteRow = (field, label) => matrix.dates.some(date => section.occurrencesByDate.get(date)?.[field])
      ? `<tr class="notes"><th scope="row">${tr(label)}</th>${matrix.dates.map(date => `<td>${escapeHtml(section.occurrencesByDate.get(date)?.[field] || '-')}</td>`).join('')}</tr>`
      : ''
    return `<table class="activity-group"><colgroup><col style="width: 20%">${matrix.dates.map(() => '<col>').join('')}</colgroup><thead>${sectionHeader}<tr class="dates"><th scope="col">${tr('schedMonth.position')}</th>${dateHeaders}</tr>${scheduleRow}</thead><tbody>${ministryRows}${noteRow('dress_code', 'schedMonth.dressCode')}${noteRow('notes', 'schedMonth.activityNotes')}</tbody></table>`
  }).join('')
  const title = `${t('schedMonth.title')} - ${formatScheduleMonth(schedule.month, locale)}`
  const statusKey = { Draft: 'schedMonth.draft', Terbit: 'schedMonth.published', Dibatalkan: 'schedMonth.cancelled' }[schedule.month?.status]
  return `<!doctype html><html lang="${locale === 'en' ? 'en' : 'id'}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page { size: A3 landscape; margin: 10mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 20px; font-family: Arial, sans-serif; color: #243041; }
    .masthead { display: flex; align-items: end; justify-content: space-between; border-top: 5px solid #d84a2f; border-bottom: 1px solid #d8dee4; padding: 15px 0 16px; margin-bottom: 20px; }
    .brand { color: #a7442c; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px; }
    h1 { font-size: 24px; line-height: 1.15; margin: 0; letter-spacing: -.35px; }
    .status { border: 1px solid #e8b3a5; color: #a7442c; border-radius: 20px; padding: 6px 12px; font-size: 10px; font-weight: 700; white-space: nowrap; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; margin-bottom: 18px; border: 1px solid #d8dee4; }
    .activity-group { break-inside: auto; page-break-inside: auto; }
    th, td { padding: 7px 9px; text-align: left; vertical-align: top; overflow-wrap: anywhere; border-right: 1px solid #e1e5e9; border-bottom: 1px solid #e1e5e9; line-height: 1.32; }
    th:last-child, td:last-child { border-right: 0; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .activity th { background: #26384b; color: #fff; font-size: 14px; padding: 9px 11px; letter-spacing: .1px; }
    .activity-number { display: inline-block; color: #ffb88e; font-size: 11px; letter-spacing: 1px; margin-right: 12px; }
    .dates th { background: #fff0e8; color: #90412e; font-size: 10px; font-weight: 700; }
    .schedule-row th, .schedule-row td { background: #f5f8fa; color: #526171; font-size: 9px; }
    .schedule-row strong { display: block; color: #243041; font-size: 10px; }
    .schedule-row span { display: block; }
    .ministry th { background: #e8eef2; color: #33475a; font-size: 9px; letter-spacing: .6px; text-transform: uppercase; padding: 6px 9px; border-top: 1px solid #bdcbd5; }
    .position th { font-weight: 600; color: #344354; }
    .person { display: block; margin-bottom: 2px; }
    .person:last-child { margin-bottom: 0; }
    .person small { display: block; color: #6c7b88; font-size: 9px; }
    .empty { display: inline-block; margin-top: 2px; color: #a7442c; font-size: 9px; font-weight: 600; }
    .empty-reason { display: block; margin-top: 2px; color: #6c7b88; font-size: 9px; }
    .muted { color: #8b98a3; }
    .notes th, .notes td { background: #fffaf4; color: #685342; font-size: 9px; }
    .notes th { font-weight: 700; }
    @media print { body { margin: 0; } }
  </style></head><body><header class="masthead"><div><div class="brand">ESC Siantan</div><h1>${escapeHtml(title)}</h1></div><span class="status">${escapeHtml(statusKey ? t(statusKey) : '')}</span></header>${tables}</body></html>`
}

export function printMonthlySchedule(schedule, options) {
  const popup = window.open('', '_blank')
  if (!popup) return false
  popup.document.write(buildMonthlySchedulePrintDocument(schedule, options))
  popup.document.close()
  popup.focus()
  setTimeout(() => popup.print(), 350)
  return true
}
