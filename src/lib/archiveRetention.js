const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
const MONTHS = 6

export function latestResponseArchiveCutoff(now = new Date()) {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS)
  const firstOfMonth = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth() - MONTHS, 1))
  const lastDay = new Date(Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0)).getUTCDate()
  const cutoff = new Date(Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth(), Math.min(wib.getUTCDate(), lastDay)))
  return cutoff.toISOString().slice(0, 10)
}

export function isAllowedResponseArchiveCutoff(value, now = new Date()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value
    && value <= latestResponseArchiveCutoff(now)
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
  }
  return value
}

export function responseSnapshotPayload(rows) {
  return JSON.stringify([...rows].map(row => stable({
    response_id: row.response_id,
    form_id: row.form_id,
    volunteer_id: row.volunteer_id,
    data_json: row.data_json,
    submitted_at: row.submitted_at,
  })).sort((a, b) => a.response_id.localeCompare(b.response_id)))
}
