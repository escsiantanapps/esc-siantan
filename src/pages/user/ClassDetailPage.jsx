import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BookOpen, Clock, MapPin, User, QrCode, CheckCircle2, History } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { classesService } from '@/services/contentService'
import { classAttendanceService } from '@/services/attendanceService'
import { Card, Spinner, GradientHeader, EmptyState, StatusBadge, Button } from '@/components/ui'
import { formatDate } from '@/lib/utils'

export default function ClassDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [cls, setCls] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    classesService.getById(id).then(setCls).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!profile?.user_id) return
    classAttendanceService.getMyHistory(id, profile.user_id).then(setHistory).catch(() => {})
  }, [id, profile?.user_id])

  return (
    <div className="pb-4">
      <GradientHeader title="Detail Kelas" back={() => navigate('/kelas')} />

      <div className="px-4 pt-4 space-y-4">
        {loading && <div className="flex justify-center py-8"><Spinner /></div>}

        {!loading && !cls && (
          <EmptyState icon={BookOpen} title="Kelas tidak ditemukan" />
        )}

        {!loading && cls && (
          <>
            <Card className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-base font-bold text-gray-900">{cls.name}</h1>
                <StatusBadge status={cls.status} />
              </div>

              {cls.description && (
                <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{cls.description}</p>
              )}

              <div className="space-y-2 pt-2 border-t border-gray-100">
                {cls.schedule && (
                  <p className="text-sm text-gray-600 flex items-center gap-2"><Clock size={15} className="text-gray-400" /> {cls.schedule}</p>
                )}
                {cls.location && (
                  <p className="text-sm text-gray-600 flex items-center gap-2"><MapPin size={15} className="text-gray-400" /> {cls.location}</p>
                )}
                {cls.teacher && (
                  <p className="text-sm text-gray-600 flex items-center gap-2"><User size={15} className="text-gray-400" /> {cls.teacher}</p>
                )}
              </div>

              <Button className="w-full" onClick={() => navigate('/kelas/absen')}>
                <QrCode size={16} /> Absen Sekarang
              </Button>
            </Card>

            {/* Riwayat Kehadiran Saya */}
            <Card className="p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <History size={15} className="text-gray-400" /> Riwayat Kehadiran Saya
              </h2>
              {history.length === 0 ? (
                <p className="text-sm text-gray-400">Belum ada riwayat kehadiran untuk kelas ini.</p>
              ) : (
                <div className="space-y-2.5">
                  {history.map(h => (
                    <div key={h.attendance_id} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 size={15} className="text-green-500" />
                      </div>
                      <p className="text-sm text-gray-700">{formatDate(h.attendance_date)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
