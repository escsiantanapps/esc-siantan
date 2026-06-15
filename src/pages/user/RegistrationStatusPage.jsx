import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Droplets, Heart, Calendar, ClipboardList } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { registrationService, eventsService } from '@/services/contentService'
import { Card, Spinner, EmptyState, GradientHeader, StatusBadge } from '@/components/ui'
import { formatDate } from '@/lib/utils'

export default function RegistrationStatusPage() {
  const { profile } = useAuth()
  const [baptism, setBaptism] = useState([])
  const [wedding, setWedding] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.user_id) return
    Promise.all([
      registrationService.getMyRegistrations(profile.user_id),
      eventsService.getMyRegistrations(profile.user_id),
    ])
      .then(([reg, evt]) => {
        setBaptism(reg.baptism)
        setWedding(reg.wedding)
        setEvents(evt)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [profile?.user_id])

  const isEmpty = !loading && baptism.length === 0 && wedding.length === 0 && events.length === 0

  return (
    <div className="pb-4">
      <GradientHeader title="Status Pendaftaran" subtitle="Riwayat pendaftaran kamu" />

      <div className="px-4 -mt-2 pt-4 space-y-5">
        {loading && <div className="flex justify-center py-8"><Spinner /></div>}

        {isEmpty && (
          <EmptyState icon={ClipboardList} title="Belum ada pendaftaran" description="Riwayat pendaftaran baptisan, pernikahan, dan event kamu akan muncul di sini." />
        )}

        {!loading && baptism.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Baptisan</h2>
            <div className="space-y-2.5">
              {baptism.map(item => (
                <Card key={item.baptism_id} className="p-3.5 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                    <Droplets size={18} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{item.full_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Diajukan {formatDate(item.created_at)}</p>
                    {item.admin_note && <p className="text-xs text-gray-500 mt-1">Catatan: {item.admin_note}</p>}
                  </div>
                  <StatusBadge status={item.status} />
                </Card>
              ))}
            </div>
          </div>
        )}

        {!loading && wedding.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Pemberkatan Nikah</h2>
            <div className="space-y-2.5">
              {wedding.map(item => (
                <Card key={item.wedding_id} className="p-3.5 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center shrink-0">
                    <Heart size={18} className="text-pink-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{item.groom_name} & {item.bride_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Diajukan {formatDate(item.created_at)}</p>
                    {item.admin_note && <p className="text-xs text-gray-500 mt-1">Catatan: {item.admin_note}</p>}
                  </div>
                  <StatusBadge status={item.status} />
                </Card>
              ))}
            </div>
          </div>
        )}

        {!loading && events.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Event</h2>
            <div className="space-y-2.5">
              {events.map(item => (
                <Link key={item.ticket_id} to={`/events/${item.event_id}`} className="block">
                  <Card className="p-3.5 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
                      <Calendar size={18} className="text-brand-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{item.events?.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(item.events?.event_date)}</p>
                    </div>
                    <StatusBadge status="Terjadwal" />
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
