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
    return { occurrence, position, part, roster, slots, assigned, hidden, capacity, filled: assigned.length }
  }
  const sections = (schedule.sections || [])
    .filter(section => !activityFilter || sectionKey(section) === activityFilter)
    .map(section => {
      const positions = (section.positions || [])
        .filter(position => !ministryFilter || position.ministry_id === ministryFilter)
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
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
  const dateHeaders = matrix.dates.map(date => `<th>${escapeHtml(formatScheduleDate(date, locale, { weekday: 'short' }))}</th>`).join('')
  const tables = matrix.sections.map(section => {
    const sectionHeader = `<tr class="activity"><th scope="row">${escapeHtml(section.title)}</th>${matrix.dates.map(date => {
      const occurrence = section.occurrencesByDate.get(date)
      if (!occurrence) return '<td>-</td>'
      return `<td><strong>${escapeHtml(formatScheduleTime(occurrence.start_time, occurrence.end_time))}</strong>${occurrence.location ? `<br>${escapeHtml(occurrence.location)}` : ''}${occurrence.pic ? `<br>${tr('schedMonth.pic')}: ${escapeHtml(occurrence.pic)}` : ''}</td>`
    }).join('')}</tr>`
    const ministryRows = section.ministries.map(ministry => {
      const divider = `<tr class="ministry"><th scope="row">${escapeHtml(ministry.ministry_name)}</th>${matrix.dates.map(date => {
        const occurrence = section.occurrencesByDate.get(date)
        if (!matrix.isParticipating(occurrence, ministry.ministry_id)) return '<td>-</td>'
        if (matrix.getCell(occurrence, ministry.positions[0]).hidden) return `<td>${tr('schedMonth.restricted')}</td>`
        return '<td></td>'
      }).join('')}</tr>`
      const positions = ministry.positions.map(position => `<tr><th scope="row">${escapeHtml(position.name)}</th>${matrix.dates.map(date => {
        const cell = matrix.getCell(section.occurrencesByDate.get(date), position)
        if (!cell.occurrence) return '<td>-</td>'
        if (cell.hidden) return `<td>${tr('schedMonth.restricted')}</td>`
        const names = cell.assigned.map(slot => escapeHtml(slot.users?.name || t('schedMonth.unavailableMember'))).join('<br>')
        const empty = Math.max(0, cell.capacity - cell.filled)
        return `<td>${names}${empty ? `<small>${tr('schedMonth.emptyCount', { count: empty })}</small>` : ''}</td>`
      }).join('')}</tr>`).join('')
      return divider + positions
    }).join('')
    const dressCode = `<tr class="notes"><th scope="row">${tr('schedMonth.dressCode')}</th>${matrix.dates.map(date => `<td>${escapeHtml(section.occurrencesByDate.get(date)?.dress_code || '-')}</td>`).join('')}</tr>`
    const activityNotes = `<tr class="notes"><th scope="row">${tr('schedMonth.activityNotes')}</th>${matrix.dates.map(date => `<td>${escapeHtml(section.occurrencesByDate.get(date)?.notes || '-')}</td>`).join('')}</tr>`
    return `<table class="activity-group"><colgroup><col style="width: 16%">${matrix.dates.map(() => '<col>').join('')}</colgroup><thead><tr><th>${tr('schedMonth.position')}</th>${dateHeaders}</tr>${sectionHeader}</thead><tbody>${ministryRows}${dressCode}${activityNotes}</tbody></table>`
  }).join('')
  const title = `${t('schedMonth.title')} - ${formatScheduleMonth(schedule.month, locale)}`
  const statusKey = { Draft: 'schedMonth.draft', Terbit: 'schedMonth.published', Dibatalkan: 'schedMonth.cancelled' }[schedule.month?.status]
  return `<!doctype html><html lang="${locale === 'en' ? 'en' : 'id'}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page { size: A3 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 20px; font-family: Arial, sans-serif; color: #20242a; }
    h1 { font-size: 20px; margin: 0 0 5px; }
    p { margin: 0 0 14px; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; margin-bottom: 12px; }
    .activity-group { break-inside: avoid-page; page-break-inside: avoid; }
    .activity-group-long { break-inside: auto; page-break-inside: auto; }
    th,td { border: 1px solid #d2d5d9; padding: 5px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    thead th { background: #fff0cc; } thead { display: table-header-group; }
    tr { break-inside: avoid; } th { font-weight: 600; }
    .activity th,.activity td { background: #e6f3ef; } .ministry { background: #f3f4f6; }
    .notes { color: #525861; } small { display: block; color: #8d3d22; margin-top: 3px; }
    @media print { body { margin: 0; } }
  </style></head><body><h1>${escapeHtml(title)}</h1><p>ESC Siantan | ${escapeHtml(statusKey ? t(statusKey) : '')}</p>${tables}</body></html>`
}

export function printMonthlySchedule(schedule, options) {
  const popup = window.open('', '_blank')
  if (!popup) return false
  popup.document.write(buildMonthlySchedulePrintDocument(schedule, options))
  popup.document.close()
  prepareMonthlySchedulePrint(popup.document)
  popup.focus()
  setTimeout(() => popup.print(), 350)
  return true
}

export function prepareMonthlySchedulePrint(document) {
  const body = document.body
  if (!body) return
  const previousWidth = body.style.width
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;visibility:hidden;height:277mm;width:0;'
  body.appendChild(probe)
  // A3 landscape dikurangi margin 10 mm: ukur pada lebar cetak, bukan lebar popup.
  body.style.width = '400mm'
  const pageHeight = probe.getBoundingClientRect().height
  for (const table of document.querySelectorAll('.activity-group')) {
    table.classList.toggle('activity-group-long', table.getBoundingClientRect().height > pageHeight)
  }
  body.style.width = previousWidth
  probe.remove()
}
