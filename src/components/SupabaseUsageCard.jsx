import { useEffect, useState } from 'react'
import { Database, ExternalLink } from 'lucide-react'
import { Card, Skeleton } from '@/components/ui'
import { useLang } from '@/hooks/useLang'
import { storageService } from '@/services/storageService'

const SUPABASE_USAGE_URL = 'https://supabase.com/dashboard/org/_/usage'

const GB = 1000 ** 3
const LIMITS = { storage_bytes: GB, database_bytes: GB / 2 }

function formatBytes(value) {
  const bytes = Math.abs(Number(value) || 0)
  if (bytes >= GB / 100) return `${(bytes / GB).toFixed(3)} GB`
  if (bytes >= 1000 ** 2) return `${(bytes / 1000 ** 2).toFixed(1)} MB`
  if (bytes >= 1000) return `${(bytes / 1000).toFixed(1)} KB`
  return `${Math.round(bytes)} B`
}

function dailyChange(current, previous, key) {
  if (!previous || Date.parse(`${current.snapshot_date}T00:00:00Z`) - Date.parse(`${previous.snapshot_date}T00:00:00Z`) !== 86400000) return null
  return Number(current[key]) - Number(previous[key])
}

export default function SupabaseUsageCard() {
  const { t, lang } = useLang()
  const [usage, setUsage] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([storageService.getUsage(), storageService.getDailyUsage()])
      .then(([current, rows]) => { if (active) { setUsage(current); setHistory(rows) } })
      .catch(() => { if (active) setError(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const metrics = [
    { key: 'storage_bytes', label: t('adash.storage'), limit: LIMITS.storage_bytes },
    { key: 'database_bytes', label: t('adash.database'), limit: LIMITS.database_bytes },
  ]
  const dateLabel = date => new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'id-ID', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
  const deltaLabel = value => value === null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatBytes(value)}`

  return <Card className="admin-panel p-4 min-w-0">
    <div className="flex items-start gap-3 mb-4">
      <Database size={19} className="text-green-600 shrink-0 mt-0.5" aria-hidden="true" />
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{t('adash.usageTitle')}</h3>
        <p className="text-xs text-gray-500">{t('adash.usageDesc')}</p>
      </div>
    </div>
    {loading ? <Skeleton className="h-44 rounded-lg" /> : error || !usage ? (
      <p className="text-xs text-red-600">{t('adash.usageError')}</p>
    ) : <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {metrics.map(metric => {
          const percent = Math.round(Number(usage[metric.key]) / metric.limit * 100)
          const bar = percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-500' : 'bg-green-500'
          return <div key={metric.key} className="min-w-0 rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gray-700">{metric.label}</span>
              <strong className="text-xs text-gray-900 tabular-nums">{percent}%</strong>
            </div>
            <p className="mt-1 text-xs text-gray-500 tabular-nums">{t('adash.storageUsed', { used: formatBytes(usage[metric.key]), total: formatBytes(metric.limit) })}</p>
            <div className="mt-2 h-2 rounded-full bg-control overflow-hidden">
              <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(percent, 100)}%` }} />
            </div>
          </div>
        })}
      </div>
      <div className="mt-4 border-t border-gray-200 pt-3">
        <h4 className="text-xs font-semibold text-gray-900">{t('adash.usageHistory')}</h4>
        <p className="mt-0.5 text-xs text-gray-500">{t('adash.usageHistoryDesc')}</p>
        {history.length === 0 ? <p className="mt-3 text-xs text-gray-500">{t('adash.usageEmpty')}</p> : (
          <div className="mt-3 space-y-1">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 text-[11px] font-semibold text-gray-500">
              <span>{t('adash.usageDate')}</span><span>{t('adash.storage')}</span><span>{t('adash.database')}</span>
            </div>
            {history.slice(0, 7).map((row, index) => <div key={row.snapshot_date}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 border-t border-gray-200 py-2 text-[11px] tabular-nums text-gray-700">
              <span>{dateLabel(row.snapshot_date)}</span>
              <span>{deltaLabel(dailyChange(row, history[index + 1], 'storage_bytes'))}</span>
              <span>{deltaLabel(dailyChange(row, history[index + 1], 'database_bytes'))}</span>
            </div>)}
          </div>
        )}
      </div>
      <p className="mt-3 text-[11px] text-gray-500">{t('adash.usageNote')}</p>
    </>}
    <section className="mt-5 border-t border-gray-200 pt-4">
      <h4 className="text-sm font-semibold text-gray-900">{t('adash.officialUsageTitle')}</h4>
      <p className="mt-1 text-sm text-gray-600">{t('adash.officialUsageDesc')}</p>
      <p className="mt-2 text-xs text-gray-500">{t('adash.officialUsageScope')}</p>
      <a
        href={SUPABASE_USAGE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-control px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-control-hover focus:outline-2 focus:outline-offset-2 focus:outline-brand-500"
      >
        {t('adash.officialUsageAction')}
        <ExternalLink size={16} aria-hidden="true" />
      </a>
    </section>
  </Card>
}
