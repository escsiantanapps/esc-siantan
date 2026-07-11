import { useEffect, useState } from 'react'
import { CalendarCheck, Church, BookOpen, CalendarDays } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { attendanceSummaryService } from '@/services/attendanceService'
import { Card } from '@/components/ui'

// Widget dashboard: ringkasan jumlah kehadiran bulan berjalan (ibadah, kelas,
// event). Motivasi kedisiplinan hadir. Data dari tabel kehadiran yang sudah
// ada; RLS mengizinkan jemaat membaca barisnya sendiri.
export default function AttendanceSummaryCard() {
  const { profile } = useAuth()
  const { t } = useLang()
  const [sum, setSum] = useState(null)

  useEffect(() => {
    if (!profile?.user_id) return
    attendanceSummaryService.getMyMonthlySummary(profile.user_id)
      .then(setSum).catch(() => setSum(null))
  }, [profile?.user_id])

  if (!sum) return null

  const items = [
    { icon: Church,       label: t('home.att.ibadah'), val: sum.ibadah, bg: 'bg-brand-100', fg: 'text-brand-500' },
    { icon: BookOpen,     label: t('home.att.kelas'),  val: sum.kelas,  bg: 'bg-blue-100',  fg: 'text-blue-500' },
    { icon: CalendarDays, label: t('home.att.event'),  val: sum.event,  bg: 'bg-red-100',   fg: 'text-red-500' },
  ]

  return (
    <section className="mb-6 animate-fade-in-up">
      <div className="flex items-center gap-2 mb-3">
        <CalendarCheck size={16} className="text-brand-500" />
        <h2 className="text-sm font-semibold text-gray-900">{t('home.att.title')}</h2>
      </div>
      {sum.total === 0 ? (
        <Card glass className="p-4">
          <p className="text-xs text-gray-400 text-center">{t('home.att.empty')}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {items.map(({ icon: Icon, label, val, bg, fg }) => (
            <Card key={label} glass className="p-3 flex flex-col items-center gap-1.5">
              <div className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center`}>
                <Icon size={18} className={fg} />
              </div>
              <p className="text-lg font-bold text-gray-900 leading-none">{val}</p>
              <p className="text-[11px] text-gray-400">{label}</p>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
