const DAY_MS = 86400000

export function toWibDateKey(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function dateKeyToDay(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS)
}

// Setiap pengajuan yang sudah disetujui bernilai satu pemenuhan. Izin umum
// (form_id kosong) berlaku ke semua form; izin dengan form_id hanya ke form itu.
// Pemeriksaan irisan tanggal dipertahankan di helper agar hasil tetap benar saat
// dipakai di luar query getEvaluation.
export function countLeaveCredits({ startDate, endDate, leaves = [], formId }) {
  const startKey = toWibDateKey(startDate)
  const endKey = toWibDateKey(endDate)
  if (!startKey || !endKey) return 0

  const startDay = dateKeyToDay(startKey)
  const endDay = dateKeyToDay(endKey)
  if (endDay < startDay) return 0

  return leaves.filter(leave => {
    if (leave.form_id && String(leave.form_id) !== String(formId)) return false
    const leaveStart = dateKeyToDay(toWibDateKey(leave.start_date))
    const leaveEnd = dateKeyToDay(toWibDateKey(leave.end_date))
    return Number.isFinite(leaveStart) && Number.isFinite(leaveEnd)
      && leaveStart <= endDay && leaveEnd >= startDay
  }).length
}

export function getEvaluationResult({ filled, target, leaveCount }) {
  const counted = Math.max(0, Number(filled) || 0) + Math.max(0, Number(leaveCount) || 0)
  const normalizedTarget = Math.max(1, Number(target) || 1)
  const minLulus = Math.max(1, Math.round(normalizedTarget * 0.8))
  const status = counted <= 0 ? 'KOSONG' : counted >= minLulus ? 'TERPENUHI' : 'PROSES'
  return { counted, minLulus, status }
}
