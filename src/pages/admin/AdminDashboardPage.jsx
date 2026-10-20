import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { ChevronRight, CheckCircle2, BarChart3, Bell } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { evaluationService } from '@/services/evaluationService'
import SupabaseUsageCard from '@/components/SupabaseUsageCard'
import { Card, PageHeader, Spinner, Skeleton, StatusBadge } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import MemberStats from '@/components/MemberStats'
import AdminPendingList from '@/components/AdminPendingList'
import './adminDashboard.css'

export default function AdminDashboardPage() {
  const { profile } = useAuth()
  const { t, lang } = useLang()
  const { pendingItems = [], pendingTotal = 0 } = useOutletContext() || {}
  const [stats, setStats] = useState({ members: 0, events: 0, tasks: 0, sp: 0 })
  const [recentMembers, setRecentMembers] = useState([])
  const [birthdays, setBirthdays] = useState([])
  const [bdayMonth, setBdayMonth] = useState(new Date().getMonth()) // 0-11, default bulan ini
  const [evalSummary, setEvalSummary] = useState({ TERPENUHI: 0, PROSES: 0, KOSONG: 0 })
  const [evalTrend, setEvalTrend] = useState([])
  const [evalLoading, setEvalLoading] = useState(true)
  const [evalTrendError, setEvalTrendError] = useState(false)
  const [loading, setLoading] = useState(true)

  const isSuperAdmin = profile?.role === 'Super Admin'

  useEffect(() => { loadDashboard(); loadEvaluation() }, [])

  async function loadDashboard() {
    try {
      const [members, events, tasks, spUsers, newMembers, bdays] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('events').select('*', { count: 'exact', head: true }).in('status', ['Mulai', 'Sedang Berlangsung']),
        supabase.from('form_templates').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*', { count: 'exact', head: true }).neq('sp_level', 'Aman'),
        supabase.from('users').select('name, role, status, created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('users').select('user_id, name, photo_url, birth_date').not('birth_date', 'is', null),
      ])
      setStats({
        members: members.count || 0,
        events: events.count || 0,
        tasks: tasks.count || 0,
        sp: spUsers.count || 0,
      })
      setRecentMembers(newMembers.data || [])
      setBirthdays(bdays.data || [])
    } finally {
      setLoading(false)
    }
  }

  async function loadEvaluation() {
    try {
      const weeklyTrend = await evaluationService.getWeeklyTrend()
      const currentWeek = weeklyTrend.at(-1) || { TERPENUHI: 0, PROSES: 0, KOSONG: 0 }
      setEvalSummary({
        TERPENUHI: currentWeek.TERPENUHI,
        PROSES: currentWeek.PROSES,
        KOSONG: currentWeek.KOSONG,
      })
      setEvalTrend(weeklyTrend)
    } catch {
      setEvalTrendError(true)
    } finally {
      setEvalLoading(false)
    }
  }

  const statCards = [
    { label: t('adash.totalMembers'), value: stats.members, to: '/admin/jemaat' },
    { label: t('adash.activeEvents'), value: stats.events, to: '/admin/events' },
    { label: t('adash.taskForms'), value: stats.tasks, to: '/admin/tugas' },
    { label: t('adash.hasSP'), value: stats.sp, to: '/admin/sp', alert: stats.sp > 0 },
  ]

  // Ulang tahun pada bulan terpilih. Parse string 'YYYY-MM-DD' langsung agar
  // bebas dari pergeseran zona waktu.
  const monthBirthdays = birthdays
    .filter(m => m.birth_date && Number(m.birth_date.slice(5, 7)) - 1 === bdayMonth)
    .sort((a, b) => Number(a.birth_date.slice(8, 10)) - Number(b.birth_date.slice(8, 10)))
  const monthNames = Array.from({ length: 12 }, (_, i) => formatDate(new Date(2000, i, 1), 'MMMM'))

  const maxWeeklyEvaluation = Math.max(
    ...evalTrend.flatMap(week => [week.TERPENUHI, week.PROSES, week.KOSONG, week.IZIN].map(value => Number(value) || 0)),
    1,
  )
  const weekLabel = start => new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'id-ID', {
    day: 'numeric', month: 'short',
  }).format(new Date(start))
  const trendSeries = [
    { key: 'TERPENUHI', bar: 'bg-green-500', label: t('adash.fulfilled') },
    { key: 'PROSES', bar: 'bg-amber-500', label: t('adash.inProgress') },
    { key: 'KOSONG', bar: 'bg-red-500', label: t('adash.empty') },
    { key: 'IZIN', bar: 'bg-gray-400', label: t('adash.onLeave') },
  ]

  if (loading) return (
    <div className="animate-fade-in">
      <div className="space-y-2 pt-2 mb-6">
        <Skeleton className="h-6 w-56 rounded-lg" />
        <Skeleton className="h-3.5 w-40 rounded-md" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <Skeleton className="col-span-2 lg:col-span-1 h-32 rounded-2xl" />
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>
      <Skeleton className="h-44 rounded-2xl" />
    </div>
  )

  return (
    <div className="admin-dashboard">
      <PageHeader
        title={t('adash.overview')}
        subtitle={new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'id-ID', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        }).format(new Date())}
      />

      <Card className="admin-panel admin-work-queue mb-5 overflow-hidden">
        {pendingTotal > 0 ? <>
          <div className="admin-panel-heading">
            <Bell size={18} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2>{t('admin.pendingTitle')}</h2>
              <p>{t('admin.pendingSummary', { count: pendingTotal })}</p>
            </div>
            <span className="admin-queue-count">{pendingTotal > 99 ? '99+' : pendingTotal}</span>
          </div>
          <AdminPendingList items={pendingItems} />
        </> : <div className="admin-queue-clear">
          <CheckCircle2 size={19} aria-hidden="true" />
          <span>{t('admin.pendingEmpty')}</span>
        </div>}
      </Card>

      <Card className="admin-panel admin-metrics mb-5">
        {statCards.map(({ label, value, to, alert }) => <Link key={label} to={to}
          className={`admin-metric${alert ? ' has-alert' : ''}`}>
          <span className="admin-metric-label">{label}</span>
          <span className="admin-metric-value tabular-nums">{value}</span>
          <ChevronRight size={16} aria-hidden="true" className="admin-metric-arrow" />
        </Link>)}
      </Card>

      {/* Statistik umur & gender jemaat */}
      <MemberStats />

      <div className="admin-dashboard-duo">
      {/* Ulang Tahun pada bulan terpilih */}
      <Card className="admin-panel p-4 mb-5">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">{t('adash.birthdays')}</h3>
            <p className="text-xs text-gray-500">{t('adash.birthdaysN', { n: monthBirthdays.length })}</p>
          </div>
          <select
            value={bdayMonth}
            onChange={e => setBdayMonth(Number(e.target.value))}
            aria-label={t('adash.birthdaysMonth')}
            className="admin-month-select text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-surface text-gray-700"
          >
            {monthNames.map((name, i) => <option key={i} value={i}>{name}</option>)}
          </select>
        </div>
        {monthBirthdays.length === 0 ? (
          <p className="admin-empty-note">{t('adash.noBirthdays')}</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {monthBirthdays.map(m => (
              <Link key={m.user_id} to={`/admin/jemaat/${m.user_id}`} className="admin-person-row flex items-center gap-3 group">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-control flex items-center justify-center text-gray-700 text-xs font-bold shrink-0">
                  {m.photo_url
                    ? <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover" />
                    : (m.name?.slice(0, 2).toUpperCase())}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate group-hover:text-brand-600 transition-colors">{m.name}</p>
                  <p className="text-xs text-gray-500">{formatDate(m.birth_date, 'd MMMM')}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Evaluasi Minggu Ini */}
      <Card className="admin-panel p-4 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">{t('adash.evalThisWeek')}</h3>
          <Link to="/admin/evaluasi" className="text-xs text-brand-500 flex items-center gap-0.5">
            {t('adash.detail')} <ChevronRight size={13} />
          </Link>
        </div>
        {evalLoading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : (
          <div className="admin-eval-summary">
            <div><span>{t('adash.fulfilled')}</span><strong className="tabular-nums">{evalSummary.TERPENUHI}</strong></div>
            <div><span>{t('adash.inProgress')}</span><strong className="tabular-nums">{evalSummary.PROSES}</strong></div>
            <div><span>{t('adash.empty')}</span><strong className="tabular-nums">{evalSummary.KOSONG}</strong></div>
          </div>
        )}
      </Card>
      </div>

      {/* Batang berkelompok memudahkan admin membandingkan setiap status per minggu. */}
      <Card className="admin-panel p-4 mb-5">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <BarChart3 size={18} className="text-gray-500 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            <div className="min-w-0">
              <h3 id="evaluation-trend-title" className="text-sm font-semibold text-gray-900">{t('adash.evalTrend')}</h3>
              <p className="text-xs text-gray-400">{t('adash.evalTrendDesc')}</p>
            </div>
          </div>
          <Link to="/admin/evaluasi" className="text-xs text-brand-500 flex items-center gap-0.5 shrink-0">
            {t('adash.detail')} <ChevronRight size={13} />
          </Link>
        </div>

        {evalLoading ? (
          <Skeleton className="h-44 rounded-xl mt-4" />
        ) : evalTrendError ? (
          <p className="text-sm text-red-600 text-center py-8">{t('adash.evalTrendError')}</p>
        ) : evalTrend.every(week => week.total === 0) ? (
          <p className="text-sm text-gray-400 text-center py-8">{t('adash.evalTrendEmpty')}</p>
        ) : (
          <figure className="mt-4" aria-labelledby="evaluation-trend-title">
            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3 text-xs text-gray-500" aria-label={t('adash.evalTrendLegend')}>
              {trendSeries.map(({ key, bar, label }) => (
                <span key={key} className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className={['w-2.5 h-3 rounded-sm', bar].join(' ')} />
                  {label}
                </span>
              ))}
            </div>

            <div className="border-b border-gray-200 pb-1">
              <div role="img" aria-label={t('adash.evalTrendA11y')} className="relative h-44 px-1">
                <div aria-hidden="true" className="absolute inset-x-1 top-1/4 border-t border-dashed border-gray-200" />
                <div aria-hidden="true" className="absolute inset-x-1 top-1/2 border-t border-dashed border-gray-200" />
                <div aria-hidden="true" className="absolute inset-x-1 top-3/4 border-t border-dashed border-gray-200" />
                <div className="relative z-10 grid h-full grid-cols-6 gap-1 sm:gap-3">
                  {evalTrend.map(week => (
                    <div
                      key={week.start}
                      className="flex h-full items-end gap-0.5 sm:gap-1"
                      title={t('adash.evalTrendWeek', { date: weekLabel(week.start), fulfilled: week.TERPENUHI, progress: week.PROSES, empty: week.KOSONG, leave: week.IZIN })}
                    >
                      {trendSeries.map(series => {
                        const value = Number(week[series.key]) || 0
                        const height = value === 0 ? 0 : Math.max((value / maxWeeklyEvaluation) * 84, 4)
                        return (
                          <div key={series.key} className="relative h-full min-w-0 flex-1">
                            <span
                              aria-hidden="true"
                              className="absolute left-1/2 hidden -translate-x-1/2 text-[10px] font-medium tabular-nums text-gray-500 sm:block"
                              style={{ bottom: String(height + 2) + '%' }}
                            >
                              {value}
                            </span>
                            <span
                              aria-hidden="true"
                              className={['absolute inset-x-0 bottom-0 mx-auto w-full max-w-5 rounded-t-sm transition-[height] duration-300 motion-reduce:transition-none', series.bar].join(' ')}
                              style={{ height: String(height) + '%' }}
                            />
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-6 gap-1 pt-1">
                {evalTrend.map(week => <span key={week.start} className="text-center text-[10px] text-gray-400 whitespace-nowrap">{weekLabel(week.start)}</span>)}
              </div>
            </div>
            <table className="sr-only">
              <caption>{t('adash.evalTrend')}</caption>
              <thead><tr><th>{t('adash.week')}</th><th>{t('adash.fulfilled')}</th><th>{t('adash.inProgress')}</th><th>{t('adash.empty')}</th><th>{t('adash.onLeave')}</th></tr></thead>
              <tbody>{evalTrend.map(week => <tr key={week.start}><th>{weekLabel(week.start)}</th><td>{week.TERPENUHI}</td><td>{week.PROSES}</td><td>{week.KOSONG}</td><td>{week.IZIN}</td></tr>)}</tbody>
            </table>
          </figure>
        )}
      </Card>
      <div className="admin-dashboard-duo">
        <Card className="admin-panel p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">{t('adash.recentMembers')}</h3>
            <Link to="/admin/jemaat" className="text-xs text-brand-500 flex items-center gap-0.5">
              {t('adash.all')} <ChevronRight size={13} />
            </Link>
          </div>
          <div className="space-y-3">
            {recentMembers.length === 0 && <p className="admin-empty-note">{t('adash.noRecentMembers')}</p>}
            {recentMembers.map((m, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full gradient-main flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {m.name?.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                  <p className="text-xs text-gray-400">{m.role}</p>
                </div>
                <StatusBadge status={m.status} />
              </div>
            ))}
          </div>
        </Card>
        {isSuperAdmin && <SupabaseUsageCard />}
      </div>
    </div>
  )
}
