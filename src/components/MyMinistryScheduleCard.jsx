import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { ministryScheduleService } from '@/services/ministryScheduleService'
import { serviceRosterService } from '@/services/serviceRosterService'
import { Card, Badge } from '@/components/ui'
import { formatDate } from '@/lib/utils'

// Ringkasan jadwal Volunteer tetap terlihat saat belum ada penugasan.
// Riwayat absensi lama dan roster baru ditampilkan bersama.

function todayStr() {
  // Tanggal hari ini waktu perangkat (≈ WIB utk jemaat setempat) sbagai
  // 'YYYY-MM-DD' untuk dibandingkan dengan kolom DATE service_date.
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function MyMinistryScheduleCard() {
  const { profile } = useAuth()
  const { t } = useLang()
  const [schedules, setSchedules] = useState([])
  const [rosters, setRosters] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    if (!profile?.user_id) return undefined
    let active = true
    setLoaded(false)
    setLoadFailed(false)

    Promise.allSettled([
      ministryScheduleService.listMySchedules(profile.user_id),
      serviceRosterService.listMine(profile.user_id),
    ]).then(([legacyResult, rosterResult]) => {
      if (!active) return
      setSchedules(legacyResult.status === 'fulfilled' ? legacyResult.value : [])
      setRosters(rosterResult.status === 'fulfilled' ? rosterResult.value : [])
      setLoadFailed(legacyResult.status === 'rejected' || rosterResult.status === 'rejected')
      setLoaded(true)
    })

    return () => { active = false }
  }, [profile?.user_id])

  const today = todayStr()
  const ym = today.slice(0, 7)
  // Mendatang & hari ini (soonest first).
  const upcoming = schedules
    .filter(s => (s.service_date || '') >= today)
    .sort((a, b) => (a.service_date || '').localeCompare(b.service_date || ''))
  const upcomingRosters = rosters
    .filter(s => (s.service_date || '') >= today)
    .sort((a, b) => (a.service_date || '').localeCompare(b.service_date || ''))
    .slice(0, 3)
  const lateThisMonth = schedules.filter(
    s => s.attendance?.status === 'Terlambat' && (s.service_date || '').slice(0, 7) === ym
  ).length

  if (!loaded) return null

  return (
    <div className="mb-5 animate-fade-in-up">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
            <CalendarClock size={16} className="text-brand-500" />
          </div>
          <h2 className="flex-1 text-sm font-semibold text-gray-900">{t('mypel.title')}</h2>
          <Link to="/jadwal-pelayanan" className="flex min-h-11 items-center text-xs font-semibold text-brand-600">{t('common.all')}</Link>
        </div>

        {lateThisMonth >= 3 && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl px-3 py-2.5 mb-3 leading-relaxed">
            {t('mypel.late3Warn')}
          </div>
        )}

        {loadFailed && (
          <p role="alert" className="mb-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-700">
            {t('sched.loadFailed')}
          </p>
        )}

        {upcomingRosters.length > 0 && (
          <div className="mb-2 space-y-2">
            {upcomingRosters.map(roster => {
              const own = (roster.service_roster_slots || []).filter(slot => slot.user_id === profile.user_id)
              return (
                <Link key={roster.roster_id} to="/jadwal-pelayanan" className="flex min-h-14 items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 hover:bg-control">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{roster.title}</p>
                    <p className="mt-0.5 truncate text-xs text-gray-400">
                      {formatDate(roster.service_date)} · {own.map(slot => slot.ministry_service_positions?.name).filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <Badge color={roster.status === 'Dibatalkan' ? 'red' : 'green'}>{t(`sched.status.${roster.status}`)}</Badge>
                </Link>
              )
            })}
          </div>
        )}

        {upcoming.length > 0 ? (
          <div className="space-y-2">
            {upcoming.map(s => {
              const time = (s.start_time || '').slice(0, 5)
              const st = s.attendance?.status
              return (
                <div key={s.schedule_id} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{s.label || s.ministries?.name || '-'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDate(s.service_date)}{time ? ` · ${t('apel.startAt', { time })}` : ''}
                    </p>
                  </div>
                  {st === 'Terlambat' ? (
                    <Badge color="red">{t('mypel.late')}</Badge>
                  ) : st === 'Tepat Waktu' ? (
                    <Badge color="green">{t('mypel.onTime')}</Badge>
                  ) : (
                    <Badge color="gray">{t('mypel.notYet')}</Badge>
                  )}
                </div>
              )
            })}
          </div>
        ) : upcomingRosters.length === 0 && !loadFailed ? (
          <p className="text-xs text-gray-400">{t('mypel.noUpcoming')}</p>
        ) : null}
      </Card>
    </div>
  )
}
