import { useEffect, useState } from 'react'
import { Button, Input, Skeleton } from '@/components/ui'
import { useLang } from '@/hooks/useLang'
import { storageService } from '@/services/storageService'

const GB = 1000 ** 3
const METRICS = [
  { key: 'egress_bytes', label: 'adash.egress', limit: 5 * GB },
  { key: 'cached_egress_bytes', label: 'adash.cachedEgress', limit: 5 * GB },
  { key: 'log_ingest_bytes', label: 'adash.logIngest', limit: GB },
  { key: 'log_query_bytes', label: 'adash.logQuery', limit: 100 * GB },
]

function todayWib() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function formatBytes(value) {
  const bytes = Number(value) || 0
  if (bytes >= GB / 100) return `${(bytes / GB).toFixed(3)} GB`
  if (bytes >= 1000 ** 2) return `${(bytes / 1000 ** 2).toFixed(1)} MB`
  if (bytes >= 1000) return `${(bytes / 1000).toFixed(1)} KB`
  return `${Math.round(bytes)} B`
}

function dateLabel(date, lang) {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

function dailyChange(current, previous, key) {
  if (!previous || Date.parse(`${current.snapshot_date}T00:00:00Z`) - Date.parse(`${previous.snapshot_date}T00:00:00Z`) !== 86400000) return null
  const change = Number(current[key]) - Number(previous[key])
  return change < 0 ? 'reset' : change
}

export default function SupabaseManualUsage() {
  const { t, lang } = useLang()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [date, setDate] = useState(todayWib)
  const [values, setValues] = useState({})

  useEffect(() => {
    let active = true
    storageService.getManualDailyUsage()
      .then(data => {
        if (!active) return
        setRows(data)
        const today = data.find(row => row.snapshot_date === todayWib())
        if (today) setValues(Object.fromEntries(METRICS.map(metric => [metric.key, String(Number(today[metric.key]) / GB)])))
      })
      .catch(() => { if (active) setError(t('adash.manualLoadError')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [t])

  function chooseDate(nextDate) {
    setDate(nextDate)
    const existing = rows.find(row => row.snapshot_date === nextDate)
    setValues(existing ? Object.fromEntries(METRICS.map(metric => [metric.key, String(Number(existing[metric.key]) / GB)])) : {})
    setError('')
    setSaved(false)
  }

  async function save(event) {
    event.preventDefault()
    const row = { snapshot_date: date, recorded_at: new Date().toISOString() }
    for (const metric of METRICS) {
      const value = Number(String(values[metric.key] ?? '').replace(',', '.'))
      if (!String(values[metric.key] ?? '').trim() || !Number.isFinite(value) || value < 0 || value * GB > Number.MAX_SAFE_INTEGER) {
        setError(t('adash.manualInvalid'))
        setSaved(false)
        return
      }
      row[metric.key] = Math.round(value * GB)
    }
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await storageService.saveManualDailyUsage(row)
      setRows(await storageService.getManualDailyUsage())
      setSaved(true)
    } catch {
      setError(t('adash.manualSaveError'))
    } finally {
      setSaving(false)
    }
  }

  const latest = rows[0]
  return <section className="mt-5 border-t border-gray-200 pt-4">
    <h4 className="text-sm font-semibold text-gray-900">{t('adash.manualTitle')}</h4>
    <p className="mt-1 text-xs text-gray-500">{t('adash.manualDesc')}</p>
    {loading ? <Skeleton className="mt-3 h-32 rounded-lg" /> : <>
      <p className="mt-2 text-[11px] text-gray-500">{t('adash.manualLimitNote')}</p>
      {latest ? <>
        <p className="mt-3 text-xs text-gray-500">{t('adash.manualLatest', { date: dateLabel(latest.snapshot_date, lang) })}</p>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {METRICS.map(metric => {
            const percent = Math.round(Number(latest[metric.key]) / metric.limit * 100)
            const bar = percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-500' : 'bg-green-500'
            return <div key={metric.key} className="min-w-0 rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-700">{t(metric.label)}</span>
                <strong className="text-xs text-gray-900 tabular-nums">{percent}%</strong>
              </div>
              <p className="mt-1 text-xs text-gray-500 tabular-nums">{t('adash.storageUsed', { used: formatBytes(latest[metric.key]), total: formatBytes(metric.limit) })}</p>
              <div className="mt-2 h-2 rounded-full bg-control overflow-hidden">
                <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(percent, 100)}%` }} />
              </div>
            </div>
          })}
        </div>
      </> : <p className="mt-3 text-xs text-gray-500">{t('adash.manualEmpty')}</p>}
      {rows.length > 0 && <div className="mt-4">
        <h5 className="text-xs font-semibold text-gray-900">{t('adash.manualHistory')}</h5>
        <p className="mt-0.5 text-xs text-gray-500">{t('adash.manualHistoryDesc')}</p>
        <div className="mt-2 space-y-2">
          {rows.slice(0, 7).map((row, index) => <div key={row.snapshot_date} className="rounded-lg border border-gray-200 p-2.5">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-gray-700">
              <span>{dateLabel(row.snapshot_date, lang)}</span>
              <span>{t('adash.manualChange')}</span>
            </div>
            <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-gray-600 tabular-nums">
              {METRICS.map(metric => {
                const change = dailyChange(row, rows[index + 1], metric.key)
                const label = change === null ? '—' : change === 'reset' ? t('adash.manualReset') : `+${formatBytes(change)}`
                return <span key={metric.key}>{t(metric.label)}: {label}</span>
              })}
            </div>
          </div>)}
        </div>
      </div>}
      <form onSubmit={save} className="mt-4 border-t border-gray-200 pt-4 space-y-3">
        <h5 className="text-xs font-semibold text-gray-900">{t('adash.manualFormTitle')}</h5>
        <p className="text-xs text-gray-500">{t('adash.manualFormDesc')}</p>
        <Input type="date" label={t('adash.usageDate')} value={date} onChange={event => chooseDate(event.target.value)} required max={todayWib()} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {METRICS.map(metric => <Input key={metric.key} type="text" inputMode="decimal"
            label={`${t(metric.label)} (GB)`} value={values[metric.key] ?? ''} required
            onChange={event => { setValues(current => ({ ...current, [metric.key]: event.target.value })); setSaved(false) }}
            placeholder="0.000" />)}
        </div>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        {saved && <p role="status" className="text-xs text-green-700">{t('adash.manualSaved')}</p>}
        <Button type="submit" size="sm" loading={saving}>{t('adash.manualSave')}</Button>
      </form>
    </>}
  </section>
}
