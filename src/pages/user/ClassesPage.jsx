import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, MapPin, Clock, QrCode } from 'lucide-react'
import { classesService } from '@/services/contentService'
import { Card, Spinner, EmptyState, GradientHeader, StatusBadge } from '@/components/ui'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'

// Siklus status kelas: Mulai → Sedang Berlangsung → Selesai (riwayat).
const TABS = [
  { value: 'Mulai', key: 'status.Mulai' },
  { value: 'Sedang Berlangsung', key: 'status.Sedang Berlangsung' },
  { value: 'Selesai', key: 'status.Selesai' },
]

export default function ClassesPage() {
  const { toast } = useToast()
  const { t } = useLang()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Mulai')

  useEffect(() => {
    classesService.getAll().then(setClasses)
      .catch(err => toast.error(err.message || t('classes.loadFailed')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => classes.filter(c => c.status === tab), [classes, tab])

  return (
    <div className="pb-4">
      <GradientHeader title={t('classes.title')} subtitle={t('classes.subtitle')}>
        <Link to="/kelas/absen" className="mt-3 inline-flex items-center gap-2 bg-white/20 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-white/30 transition-colors">
          <QrCode size={16} /> {t('classes.scanAttendance')}
        </Link>
      </GradientHeader>

      <div className="px-4 -mt-2 pt-4">
        {/* Tabs status */}
        <div className="flex gap-2 mb-4">
          {TABS.map(({ value, key }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition ${
                tab === value ? 'gradient-main text-white' : 'bg-control text-gray-500'
              }`}
            >
              {t(key)}
            </button>
          ))}
        </div>

        {loading && <div className="flex justify-center py-8"><Spinner /></div>}

        {!loading && filtered.length === 0 && (
          <EmptyState icon={BookOpen} title={t('classes.empty')} description={t('classes.emptyDesc')} />
        )}

        {/* Kartu kelas dengan cover ala Stitch */}
        <div className="space-y-3.5">
          {filtered.map(cls => (
            <Link key={cls.class_id} to={`/kelas/${cls.class_id}`} className="block">
              <Card glass className="overflow-hidden hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300">
                <div className="relative h-28">
                  {cls.thumbnail_url
                    ? <img src={cls.thumbnail_url} alt={cls.name} className="w-full h-full object-cover" />
                    : (
                      <div className="w-full h-full gradient-main flex items-center justify-center">
                        <BookOpen size={34} className="text-white/85" strokeWidth={1.5} />
                      </div>
                    )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                  <div className="absolute top-2.5 right-2.5"><StatusBadge status={cls.status} /></div>
                </div>
                <div className="p-3.5">
                  <p className="text-sm font-semibold text-gray-900">{cls.name}</p>
                  <div className="mt-1.5 space-y-0.5">
                    {cls.schedule && (
                      <p className="text-xs text-gray-400 flex items-center gap-1"><Clock size={11} /> {cls.schedule}</p>
                    )}
                    {cls.location && (
                      <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin size={11} /> {cls.location}</p>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
