const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function validDate(value) {
  if (!DATE_PATTERN.test(String(value || ''))) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date
}

function validMonth(value) {
  const first = `${value}-01`
  return /^\d{4}-\d{2}$/.test(String(value || '')) && validDate(first) ? first : null
}

// Pekan ke-n pada hari yang sama menjaga pola jadwal lintas bulan.
// Pekan kelima yang tidak ada di bulan tujuan harus dipetakan sendiri.
export function defaultMonthCopyDateMap(sourceDates, targetMonth) {
  const firstDay = validMonth(targetMonth)
  if (!firstDay) return {}
  const first = validDate(firstDay)
  return Object.fromEntries(sourceDates.map(sourceDate => {
    const source = validDate(sourceDate)
    if (!source) return [sourceDate, '']
    const occurrence = Math.floor((source.getUTCDate() - 1) / 7)
    const offset = (source.getUTCDay() - first.getUTCDay() + 7) % 7
    const target = new Date(first)
    target.setUTCDate(1 + offset + occurrence * 7)
    return [sourceDate, target.getUTCMonth() === first.getUTCMonth() ? target.toISOString().slice(0, 10) : '']
  }))
}

export function validateMonthCopyDateMap(sourceDates, targetMonth, dateMap) {
  if (!validMonth(targetMonth) || !sourceDates.length) return 'schedMonth.copyDateInvalid'
  const targets = sourceDates.map(date => dateMap[date])
  if (targets.some(date => !date)) return 'schedMonth.copyDateRequired'
  if (targets.some(date => !validDate(date) || date.slice(0, 7) !== targetMonth)) return 'schedMonth.copyDateInvalid'
  if (new Set(targets).size !== targets.length) return 'schedMonth.copyDateDuplicate'
  return ''
}
