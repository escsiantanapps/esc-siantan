import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, MapPin, Plus, ChevronRight } from 'lucide-react'
import { eventsService } from '@/services/contentService'
import { Card, PageHeader, Button, Spinner, EmptyState, StatusBadge } from '@/components/ui'
import { formatDate } from '@/lib/utils'

export default function AdminEventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    eventsService.getAll().then(setEvents).catch(() => {}).finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <PageHeader
        title="Kelola Events"
        subtitle={`${events.length} event`}
        action={<Link to="/admin/events/baru"><Button size="sm"><Plus size={15} /> Tambah Event</Button></Link>}
      />

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && events.length === 0 && (
        <EmptyState icon={Calendar} title="Belum ada event" description="Tambahkan event pertama untuk jemaat." />
      )}

      {!loading && events.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {events.map(ev => (
            <Link key={ev.event_id} to={`/admin/events/${ev.event_id}/edit`} className="flex items-center gap-3 p-3.5 hover:bg-gray-50 transition-colors">
              {ev.thumbnail_url ? (
                <img src={ev.thumbnail_url} alt={ev.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                  <Calendar size={20} className="text-red-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{ev.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(ev.event_date)}{ev.event_time ? ` · ${ev.event_time}` : ''}</p>
                {ev.location && (
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><MapPin size={11} /> {ev.location}</p>
                )}
              </div>
              <StatusBadge status={ev.status} />
              <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
            </Link>
          ))}
        </Card>
      )}
    </div>
  )
}
