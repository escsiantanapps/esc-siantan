import { useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { ministryScheduleService } from '@/services/ministryScheduleService'
import { Card, Badge } from '@/components/ui'
import { formatDate } from '@/lib/utils'

// Kartu Beranda "Jadwal Pelayanan Saya" — hanya render bila Volunteer ini
// ditugaskan pada jadwal pelayanan mendatang (self-gating: kalau tidak ada,
// tidak menampilkan apa-apa). Menampilkan jadwal mendatang + status kehadiran
// sendiri, plus pengingat lembut kalau sudah 3x telat bulan ini (reset per
// bulan — keputusan operator). Scan tetap lewat menu Scan (ESC-VOLUNTEER).

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
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!profile?.user_id) return
    ministryScheduleService.listMySchedules(profile.user_id)
      .then(setSchedules)
      .catch(() => setSchedules([]))
      .finally(() => setLoaded(true))
  }, [profile?.user_id])

  const today = todayStr()
  const ym = today.slice(0, 7)
  // Mendatang & hari ini (soonest first).
  const upcoming = schedules
    .filter(s => (s.service_date || '') >= today)
    .sort((a, b) => (a.service_date || '').localeCompare(b.service_date || ''))
  const lateThisMonth = schedules.filter(
    s => s.attendance?.status === 'Terlambat' && (s.service_date || '').slice(0, 7) === ym
  ).length

  if (!loaded || (upcoming.length === 0 && lateThisMonth < 3)) return null

  return (
    <div className="mb-5 animate-fade-in-up">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
            <CalendarClock size={16} className="text-brand-500" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">{t('mypel.title')}</h2>
        </div>

        {lateThisMonth >= 3 && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl px-3 py-2.5 mb-3 leading-relaxed">
            {t('mypel.late3Warn')}
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
                    <p className="text-sm font-medium text-gray-900 truncate">{s.ministries?.name || '-'}</p>
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
        ) : (
          <p className="text-xs text-gray-400">{t('mypel.noUpcoming')}</p>
        )}
      </Card>
    </div>
  )
}
