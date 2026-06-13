import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, MapPin, ChevronRight } from 'lucide-react'
import { eventsService } from '@/services/contentService'
import { Card, Spinner, EmptyState, GradientHeader, StatusBadge } from '@/components/ui'
import { formatDate } from '@/lib/utils'

const TABS = ['Aktif', 'Selesai', 'Semua']

export default function EventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Aktif')

  useEffect(() => {
    eventsService.getAll().then(setEvents).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (tab === 'Semua') return events
    return events.filter(ev => ev.status === tab)
  }, [events, tab])

  return (
    <div className="pb-4">
      <GradientHeader title="Events & Kegiatan" subtitle="Acara dan kegiatan gereja" />

      <div className="px-4 -mt-2 pt-4">
        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition ${
                tab === t ? 'gradient-main text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {loading && <div className="flex justify-center py-8"><Spinner /></div>}

        {!loading && filtered.length === 0 && (
          <EmptyState icon={Calendar} title="Belum ada event" description="Belum ada kegiatan untuk kategori ini." />
        )}

        <div className="space-y-2.5">
          {filtered.map(ev => (
            <Link key={ev.event_id} to={`/events/${ev.event_id}`}>
              <Card className="p-3.5 flex items-start gap-3">
                {ev.thumbnail_url ? (
                  <img src={ev.thumbnail_url} alt={ev.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                    <Calendar size={20} className="text-red-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{ev.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(ev.event_date)}{ev.event_time ? ` · ${ev.event_time}` : ''}</p>
                  {ev.location && (
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><MapPin size={11} /> {ev.location}</p>
                  )}
                </div>
                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                  <StatusBadge status={ev.status} />
                  <ChevronRight size={16} className="text-gray-300" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
