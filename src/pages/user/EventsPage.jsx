import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, MapPin, Clock } from 'lucide-react'
import { eventsService } from '@/services/contentService'
import { Card, Spinner, EmptyState, GradientHeader, StatusBadge } from '@/components/ui'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { formatDate } from '@/lib/utils'

// Siklus status event: Mulai (belum mulai) → Sedang Berlangsung → Selesai.
// Event Selesai otomatis pindah ke tab riwayat "Selesai".
const TABS = [
  { value: 'Mulai', key: 'status.Mulai' },
  { value: 'Sedang Berlangsung', key: 'status.Sedang Berlangsung' },
  { value: 'Selesai', key: 'events.tabDone' },
]

export default function EventsPage() {
  const { toast } = useToast()
  const { t } = useLang()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Mulai')

  useEffect(() => {
    eventsService.getAll().then(setEvents)
      .catch(err => toast.error(err.message || t('events.loadFailed')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => events.filter(ev => ev.status === tab), [events, tab])

  const featured = filtered[0]
  const rest = filtered.slice(1)

  return (
    <div className="pb-4">
      <GradientHeader title={t('events.title')} subtitle={t('events.subtitle')} />

      <div className="px-4 -mt-2 pt-4">
        {/* Tabs */}
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
          <EmptyState icon={Calendar} title={t('events.empty')} description={t('events.emptyDesc')} />
        )}

        {/* Featured event ala Stitch */}
        {featured && (
          <Link to={`/events/${featured.event_id}`} className="block mb-5">
            <div className="relative rounded-3xl overflow-hidden ambient-shadow h-56 active:scale-[0.99] transition-transform">
              {featured.thumbnail_url
                ? <img src={featured.thumbnail_url} alt={featured.name} className="absolute inset-0 w-full h-full object-cover" />
                : <div className="absolute inset-0 gradient-main" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute top-3 right-3"><StatusBadge status={featured.status} /></div>
              <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                <span className="inline-block px-2.5 py-1 rounded-full bg-surface/90 text-brand-600 text-[11px] font-semibold mb-2">
                  {t('events.featured')}
                </span>
                <h3 className="text-xl font-bold text-white">{featured.name}</h3>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-white/90 text-xs">
                  <span className="flex items-center gap-1">
                    <Calendar size={13} /> {formatDate(featured.event_date)}{featured.event_time ? ` · ${featured.event_time.slice(0, 5)}` : ''}
                  </span>
                  {featured.location && <span className="flex items-center gap-1"><MapPin size={13} /> {featured.location}</span>}
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* Daftar event lain — kartu dengan tile tanggal */}
        <div className="space-y-2.5">
          {rest.map(ev => (
            <Link key={ev.event_id} to={`/events/${ev.event_id}`} className="block">
              <Card glass className="p-3 flex items-stretch gap-3 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300">
                <div className="w-16 shrink-0 rounded-xl gradient-main text-white flex flex-col items-center justify-center leading-none py-2">
                  <span className="text-[11px] font-semibold uppercase">{formatDate(ev.event_date, 'EEE')}</span>
                  <span className="text-2xl font-bold mt-1">{formatDate(ev.event_date, 'd')}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">{ev.name}</p>
                    <StatusBadge status={ev.status} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    <Clock size={11} /> {ev.event_time ? ev.event_time.slice(0, 5) : formatDate(ev.event_date)}
                  </p>
                  {ev.location && (
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><MapPin size={11} /> {ev.location}</p>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
