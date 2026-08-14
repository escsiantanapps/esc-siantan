import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Calendar, ClipboardList, AlertTriangle, Droplets, Heart, ChevronRight, CheckCircle2, Clock, XCircle, UserPlus, Cake, Database, BarChart3 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { evaluationService } from '@/services/evaluationService'
import { storageService } from '@/services/storageService'
import { Card, PageHeader, Spinner, Skeleton, StatusBadge } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import MemberStats from '@/components/MemberStats'

export default function AdminDashboardPage() {
  const { profile } = useAuth()
  const { t, lang } = useLang()
  const [stats, setStats] = useState({ members: 0, events: 0, tasks: 0, sp: 0, baptism: 0, wedding: 0, pendingUsers: 0 })
  const [recentMembers, setRecentMembers] = useState([])
  const [pendingRegs, setPendingRegs] = useState([])
  const [birthdays, setBirthdays] = useState([])
  const [bdayMonth, setBdayMonth] = useState(new Date().getMonth()) // 0-11, default bulan ini
  const [evalSummary, setEvalSummary] = useState({ TERPENUHI: 0, PROSES: 0, KOSONG: 0 })
  const [evalTrend, setEvalTrend] = useState([])
  const [evalLoading, setEvalLoading] = useState(true)
  const [evalTrendError, setEvalTrendError] = useState(false)
  const [storage, setStorage] = useState(null) // { total } byte terpakai (Super Admin)
  const [loading, setLoading] = useState(true)

  const isSuperAdmin = profile?.role === 'Super Admin'

  useEffect(() => { loadDashboard(); loadEvaluation() }, [])

  useEffect(() => {
    if (!isSuperAdmin) return
    storageService.getUsage().then(setStorage).catch(() => {})
  }, [isSuperAdmin])

  async function loadDashboard() {
    try {
      const [members, events, tasks, spUsers, baptism, wedding, pendingUsers, newMembers, pending, bdays] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('events').select('*', { count: 'exact', head: true }).in('status', ['Mulai', 'Sedang Berlangsung']),
        supabase.from('form_templates').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*', { count: 'exact', head: true }).neq('sp_level', 'Aman'),
        supabase.from('baptism_registrations').select('*', { count: 'exact', head: true }).eq('status', 'Menunggu'),
        supabase.from('wedding_registrations').select('*', { count: 'exact', head: true }).eq('status', 'Menunggu'),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('status', 'Menunggu Persetujuan'),
        supabase.from('users').select('name, role, status, created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('baptism_registrations').select('baptism_id, full_name, status, created_at').eq('status', 'Menunggu').limit(3),
        supabase.from('users').select('user_id, name, photo_url, birth_date').not('birth_date', 'is', null),
      ])
      setStats({
        members: members.count || 0,
        events: events.count || 0,
        tasks: tasks.count || 0,
        sp: spUsers.count || 0,
        baptism: baptism.count || 0,
        wedding: wedding.count || 0,
        pendingUsers: pendingUsers.count || 0,
      })
      setRecentMembers(newMembers.data || [])
      setPendingRegs(pending.data || [])
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
    { label: t('adash.totalMembers'),  value: stats.members,     icon: Users,         color: 'text-brand-500', bg: 'bg-brand-50', to: '/admin/jemaat' },
    { label: t('adash.newAccounts'),   value: stats.pendingUsers, icon: UserPlus,      color: 'text-amber-500',  bg: 'bg-amber-50',  to: '/admin/jemaat?status=Menunggu+Persetujuan' },
    { label: t('adash.activeEvents'),  value: stats.events,      icon: Calendar,      color: 'text-red-500',    bg: 'bg-red-50',    to: '/admin/events' },
    { label: t('adash.taskForms'),     value: stats.tasks,       icon: ClipboardList, color: 'text-blue-500',   bg: 'bg-blue-50',   to: '/admin/tugas' },
    { label: t('adash.hasSP'),         value: stats.sp,          icon: AlertTriangle, color: 'text-amber-500',  bg: 'bg-amber-50',  to: '/admin/sp' },
    { label: t('adash.baptismQueue'),  value: stats.baptism,     icon: Droplets,      color: 'text-teal-500',   bg: 'bg-teal-50',   to: '/admin/baptisan' },
    { label: t('adash.weddingQueue'),  value: stats.wedding,     icon: Heart,         color: 'text-pink-500',   bg: 'bg-pink-50',   to: '/admin/nikah' },
  ]

  // Ulang tahun pada bulan terpilih. Parse string 'YYYY-MM-DD' langsung agar
  // bebas dari pergeseran zona waktu.
  const monthBirthdays = birthdays
    .filter(m => m.birth_date && Number(m.birth_date.slice(5, 7)) - 1 === bdayMonth)
    .sort((a, b) => Number(a.birth_date.slice(8, 10)) - Number(b.birth_date.slice(8, 10)))
  const monthNames = Array.from({ length: 12 }, (_, i) => formatDate(new Date(2000, i, 1), 'MMMM'))

  // Pemakaian storage (Super Admin). Kuota free tier Supabase = 1 GB.
  const STORAGE_LIMIT = 1024 ** 3
  const fmtBytes = (b) =>
    b >= 1024 ** 3 ? (b / 1024 ** 3).toFixed(2) + ' GB'
    : b >= 1024 ** 2 ? (b / 1024 ** 2).toFixed(1) + ' MB'
    : b >= 1024 ? (b / 1024).toFixed(0) + ' KB'
    : (b || 0) + ' B'
  const storagePct = storage ? Math.min((storage.total / STORAGE_LIMIT) * 100, 100) : 0
  const storageColor = storagePct >= 90 ? 'red' : storagePct >= 70 ? 'amber' : 'green'
  const SC = {
    green: { bar: 'bg-green-500', text: 'text-green-600', bg: 'bg-green-50', icon: 'text-green-500', msg: t('adash.storageOk') },
    amber: { bar: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-50', icon: 'text-amber-500', msg: t('adash.storageWarn') },
    red:   { bar: 'bg-red-500',   text: 'text-red-600',   bg: 'bg-red-50',   icon: 'text-red-500',   msg: t('adash.storageFull') },
  }[storageColor]
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
    <div>
      <PageHeader
        title={t('adash.hello', { name: profile?.name?.split(' ')[0] || 'Admin' })}
        subtitle={t('adash.subtitle')}
      />

      {/* Stats grid — kartu pertama tampil sebagai hero (gaya bento Stitch) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6 stagger-children">
        {statCards.map(({ label, value, icon: Icon, color, bg, to }, idx) => {
          const hero = idx === 0
          return (
            <Link key={label} to={to} className={hero ? 'col-span-2 lg:col-span-1' : ''}>
              <Card lift className={`p-4 h-full relative overflow-hidden ${hero ? 'gradient-main border-transparent!' : 'hover:border-gray-200'}`}>
                {/* Glow dekoratif kartu hero */}
                {hero && <div aria-hidden="true" className="pointer-events-none absolute -top-10 -right-8 w-32 h-32 rounded-full bg-white/15 blur-2xl" />}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${hero ? 'bg-white/20' : bg}`}>
                  <Icon size={20} className={hero ? 'text-white' : color} strokeWidth={1.5} />
                </div>
                <p className={`font-display text-3xl font-bold tabular-nums tracking-tight ${hero ? 'text-white' : color}`}>{value}</p>
                <p className={`text-xs mt-0.5 ${hero ? 'text-white/75' : 'text-gray-500'}`}>{label}</p>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Indikator penyimpanan Supabase — khusus Super Admin */}
      {isSuperAdmin && (
        <Card className="p-4 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${SC.bg}`}>
              <Database size={18} className={SC.icon} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">{t('adash.storage')}</h3>
              <p className="text-xs text-gray-400">
                {storage ? t('adash.storageUsed', { used: fmtBytes(storage.total), total: '1 GB' }) : '…'}
              </p>
            </div>
            {storage && <span className={`text-sm font-bold ${SC.text}`}>{Math.round(storagePct)}%</span>}
          </div>
          <div className="h-2.5 bg-control rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${SC.bar}`} style={{ width: `${storagePct}%` }} />
          </div>
          {storage && <p className={`text-xs mt-2 ${SC.text}`}>{SC.msg}</p>}
        </Card>
      )}

      {/* Statistik umur & gender jemaat */}
      <MemberStats />

      {/* Ulang Tahun pada bulan terpilih */}
      <Card className="p-4 mb-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-pink-50 flex items-center justify-center shrink-0">
              <Cake size={18} className="text-pink-500" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">{t('adash.birthdays')}</h3>
              <p className="text-xs text-gray-400">{t('adash.birthdaysN', { n: monthBirthdays.length })}</p>
            </div>
          </div>
          <select
            value={bdayMonth}
            onChange={e => setBdayMonth(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-surface text-gray-700"
          >
            {monthNames.map((name, i) => <option key={i} value={i}>{name}</option>)}
          </select>
        </div>
        {monthBirthdays.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">{t('adash.noBirthdays')}</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {monthBirthdays.map(m => (
              <Link key={m.user_id} to={`/admin/jemaat/${m.user_id}`} className="flex items-center gap-3 group">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-pink-100 flex items-center justify-center text-pink-600 text-xs font-bold shrink-0">
                  {m.photo_url
                    ? <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover" />
                    : (m.name?.slice(0, 2).toUpperCase())}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate group-hover:text-brand-600 transition-colors">{m.name}</p>
                  <p className="text-xs text-gray-400">{formatDate(m.birth_date, 'd MMMM')}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Evaluasi Minggu Ini */}
      <Card className="p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">{t('adash.evalThisWeek')}</h3>
          <Link to="/admin/evaluasi" className="text-xs text-brand-500 flex items-center gap-0.5">
            {t('adash.detail')} <ChevronRight size={13} />
          </Link>
        </div>
        {evalLoading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="w-9 h-9 mx-auto rounded-xl bg-green-50 flex items-center justify-center mb-2">
                <CheckCircle2 size={18} className="text-green-500" />
              </div>
              <p className="text-xl font-bold text-green-600">{evalSummary.TERPENUHI}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t('adash.fulfilled')}</p>
            </div>
            <div className="text-center">
              <div className="w-9 h-9 mx-auto rounded-xl bg-amber-50 flex items-center justify-center mb-2">
                <Clock size={18} className="text-amber-500" />
              </div>
              <p className="text-xl font-bold text-amber-600">{evalSummary.PROSES}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t('adash.inProgress')}</p>
            </div>
            <div className="text-center">
              <div className="w-9 h-9 mx-auto rounded-xl bg-red-50 flex items-center justify-center mb-2">
                <XCircle size={18} className="text-red-500" />
              </div>
              <p className="text-xl font-bold text-red-600">{evalSummary.KOSONG}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t('adash.empty')}</p>
            </div>
          </div>
        )}
      </Card>

      {/* Batang berkelompok memudahkan admin membandingkan setiap status per minggu. */}
      <Card className="p-4 mb-6">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <BarChart3 size={18} className="text-brand-500" strokeWidth={1.75} />
            </div>
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
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Jemaat terbaru */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">{t('adash.recentMembers')}</h3>
            <Link to="/admin/jemaat" className="text-xs text-brand-500 flex items-center gap-0.5">
              {t('adash.all')} <ChevronRight size={13} />
            </Link>
          </div>
          <div className="space-y-3">
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

        {/* Pendaftaran masuk */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">{t('adash.regQueue')}</h3>
            <Link to="/admin/baptisan" className="text-xs text-brand-500 flex items-center gap-0.5">
              {t('adash.view')} <ChevronRight size={13} />
            </Link>
          </div>
          {pendingRegs.length === 0
            ? <p className="text-sm text-gray-400 text-center py-4">{t('adash.noQueue')}</p>
            : (
              <div className="space-y-3">
                {pendingRegs.map((r, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                      <Droplets size={15} className="text-teal-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.full_name}</p>
                      <p className="text-xs text-gray-400">{formatDate(r.created_at)}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            )
          }
        </Card>
      </div>
    </div>
  )
}
