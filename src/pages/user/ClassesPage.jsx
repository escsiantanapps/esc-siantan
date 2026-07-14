import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, MapPin, Clock, QrCode } from 'lucide-react'
import { classesService, eventsService } from '@/services/contentService'
import { Card, Skeleton, EmptyState, GradientHeader, StatusBadge, SectionHeader } from '@/components/ui'
import EventCarousel from '@/components/EventCarousel'
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
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Mulai')

  useEffect(() => {
    const ongoing = list => (list || []).filter(x => ['Mulai', 'Sedang Berlangsung'].includes(x.status))
    Promise.all([
      classesService.getAll().then(setClasses),
      eventsService.getAll().then(list => setEvents(ongoing(list))).catch(() => {}),
    ])
      .catch(err => toast.error(err.message || t('classes.loadFailed')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => (Array.isArray(classes) ? classes : []).filter(c => c.status === tab), [classes, tab])

  return (
    <div className="pb-4">
      <GradientHeader title={t('classes.title')} subtitle={t('classes.subtitle')}>
        <Link to="/kelas/absen" className="mt-3 inline-flex items-center gap-2 bg-white/20 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-white/30 transition-colors">
          <QrCode size={16} /> {t('classes.scanAttendance')}
        </Link>
      </GradientHeader>

      <div className="px-4 -mt-2 pt-4">
        {!loading && events.length > 0 && (
          <section className="mb-5">
            <SectionHeader title={t('home.event')} to="/events" />
            <EventCarousel events={events.slice(0, 6)} />
          </section>
        )}

        {/* Tabs status */}
        <div className="flex gap-2 mb-4">
          {TABS.map(({ value, key }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 ${
                tab === value
                  ? 'gradient-main text-white shadow-[0_4px_12px_-4px_rgba(244,81,30,0.55)]'
                  : 'bg-control text-gray-500 hover:bg-control-hover'
              }`}
            >
              {t(key)}
            </button>
          ))}
        </div>

        {loading && (
          <div className="space-y-3.5 animate-fade-in">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-surface border border-gray-100 rounded-2xl overflow-hidden">
                <Skeleton className="h-28 rounded-none" />
                <div className="p-3.5 space-y-2">
                  <Skeleton className="h-3.5 w-2/3 rounded-md" />
                  <Skeleton className="h-3 w-1/3 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <EmptyState icon={BookOpen} title={t('classes.empty')} description={t('classes.emptyDesc')} />
        )}

        {/* Kartu kelas dengan cover ala Stitch */}
        <div className="space-y-3.5 stagger-children">
          {filtered.map(cls => (
            <Link key={cls.class_id} to={`/kelas/${cls.class_id}`} className="block">
              <Card glass lift className="overflow-hidden">
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
