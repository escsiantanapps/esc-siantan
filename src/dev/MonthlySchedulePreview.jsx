import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { CalendarDays, Moon, RotateCcw, Sun } from 'lucide-react'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { useLang } from '@/hooks/useLang'
import { useTheme } from '@/hooks/useTheme'
import { Badge, Button, EmptyState, Input, Select, Spinner } from '@/components/ui'
import { MonthlyScheduleWorkspace } from '@/pages/admin/MonthlyScheduleWorkspace'
import { createServiceScheduleDemo, demoProfiles } from '@/dev/serviceScheduleDemo'
import '@/index.css'

const roleLabels = { admin: 'demoAdmin', mh: 'demoManager', volunteer: 'demoVolunteer', empty: 'demoEmpty' }

function PersonalSchedule({ api, profile, initialMonth }) {
  const { t, lang } = useLang()
  const [month, setMonth] = useState(initialMonth)
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    setLoading(true)
    api.listMonths(month).then(rows => Promise.all(rows.map(row => api.getMonth(row.month_id))))
      .then(rows => { if (active) setSchedules(rows) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, month, profile])
  const duties = schedules.flatMap(schedule => schedule.rosters.flatMap(roster => {
    const mine = roster.service_roster_slots.filter(slot => slot.user_id === profile.user_id)
    if (!mine.length) return []
    const part = schedule.parts.find(item => item.roster_id === roster.roster_id)
    return [{ ...roster, roles: mine.map(slot => slot.ministry_service_positions.name), team_name: part?.team_name }]
  })).sort((a, b) => a.service_date.localeCompare(b.service_date) || a.start_time.localeCompare(b.start_time))
  return <section data-testid="personal-schedule">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <h1 className="text-xl font-semibold text-gray-900">{t('sched.mySchedule')}</h1>
      <Input type="month" aria-label={t('sched.month')} value={month} onChange={event => event.target.value && setMonth(event.target.value)} />
    </div>
    {loading ? <Spinner /> : !duties.length ? <EmptyState icon={CalendarDays} title={t('sched.emptyTitle')} description={t('sched.emptyMine')} /> : <div className="divide-y divide-gray-200">
      {duties.map(duty => <article key={duty.roster_id} className="py-4 flex flex-col gap-1" data-testid="personal-duty">
        <div className="flex flex-wrap justify-between gap-2"><h2 className="text-base font-semibold text-gray-900">{duty.title}</h2><Badge color={duty.status === 'Terbit' ? 'green' : 'red'}>{t(`sched.status.${duty.status}`)}</Badge></div>
        <p className="text-sm text-gray-600">{new Date(`${duty.service_date}T00:00:00Z`).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', { dateStyle: 'full', timeZone: 'UTC' })}</p>
        <p className="text-sm text-gray-600">{duty.start_time.slice(0, 5)} - {duty.end_time.slice(0, 5)} | {duty.location}</p>
        <p className="text-sm font-medium text-gray-900">{duty.roles.join(', ')} | {duty.ministries.name}{duty.team_name ? ` | ${duty.team_name}` : ''}</p>
        {duty.dress_code && <p className="text-sm text-gray-600">{t('sched.dressCode')}: {duty.dress_code}</p>}
      </article>)}
    </div>}
  </section>
}

function LocalPreview() {
  const { t } = useLang()
  const { theme, toggleTheme } = useTheme()
  const api = useMemo(() => createServiceScheduleDemo(), [])
  const [role, setRole] = useState('admin')
  const [revision, setRevision] = useState(0)
  const profile = demoProfiles[role]
  function changeRole(value) { api.setProfile(demoProfiles[value]); setRole(value) }
  function reset() { api.reset(); api.setProfile(profile); setRevision(value => value + 1) }
  return <div className="min-h-screen bg-gray-50">
    <header className="border-b border-gray-200 bg-surface">
      <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
        <img src="/icons/icon-192.png" alt="ESC Siantan" width="36" height="36" />
        <span className="text-sm font-semibold text-gray-900">{t('schedMonth.localPreview')}</span>
        <Badge color="amber">{t('schedMonth.demoData')}</Badge>
        <div className="flex flex-wrap gap-2 items-center ml-auto">
          <Select aria-label={t('schedMonth.demoRole')} value={role} onChange={event => changeRole(event.target.value)} data-testid="demo-role">
            {Object.entries(roleLabels).map(([value, key]) => <option key={value} value={value}>{t(`schedMonth.${key}`)}</option>)}
          </Select>
          <Button variant="outline" onClick={reset} aria-label={t('schedMonth.demoReset')} title={t('schedMonth.demoReset')} data-testid="demo-reset"><RotateCcw size={18} /></Button>
          <Button variant="outline" onClick={toggleTheme} aria-label={t('schedMonth.demoTheme')} title={t('schedMonth.demoTheme')} data-testid="demo-theme">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</Button>
        </div>
      </div>
    </header>
    <main className="max-w-[1600px] mx-auto p-4 sm:p-6" key={`${role}-${revision}`}>
      {role === 'admin' || role === 'mh' ? <MonthlyScheduleWorkspace api={api} profile={profile} initialMonth="2026-10" /> : <PersonalSchedule api={api} profile={profile} initialMonth="2026-10" />}
    </main>
  </div>
}

// Entri terpisah tidak masuk build production; guard juga menolak pemuatan di luar Vite dev.
if (import.meta.env.DEV) {
  createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeProvider><LanguageProvider><ToastProvider><LocalPreview /></ToastProvider></LanguageProvider></ThemeProvider></BrowserRouter>)
}
