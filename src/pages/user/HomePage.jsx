import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, ChevronRight, Calendar, ClipboardList, BookOpen, Droplets, Heart } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { newsService } from '@/services/contentService'
import { eventsService } from '@/services/contentService'
import { Card, Spinner, Badge } from '@/components/ui'
import { formatDate } from '@/lib/utils'

export default function HomePage() {
  const { profile } = useAuth()
  const [news, setNews] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      newsService.getAll().then(setNews).catch(() => {}),
      eventsService.getAll().then(setEvents).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const quickLinks = [
    { to: '/tugas',              icon: ClipboardList, label: 'Tugas',    color: 'bg-orange-100 text-orange-600' },
    { to: '/events',             icon: Calendar,      label: 'Events',   color: 'bg-red-100 text-red-600' },
    { to: '/kelas',              icon: BookOpen,      label: 'Kelas',    color: 'bg-blue-100 text-blue-600' },
    { to: '/baptisan',           icon: Droplets,      label: 'Baptisan', color: 'bg-teal-100 text-teal-600' },
    { to: '/pemberkatan-nikah',  icon: Heart,         label: 'Nikah',    color: 'bg-pink-100 text-pink-600' },
    { to: '/status-pendaftaran', icon: Bell,          label: 'Status',   color: 'bg-purple-100 text-purple-600' },
  ]

  return (
    <div className="pb-4">
      {/* Greeting header */}
      <div className="gradient-main px-4 pt-12 pb-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/70 text-sm">Shalom,</p>
            <h1 className="text-white text-xl font-bold mt-0.5">{profile?.name?.split(' ')[0] || 'Jemaat'} 👋</h1>
          </div>
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Bell size={18} className="text-white" />
          </div>
        </div>
      </div>

      <div className="px-4 -mt-4">
        {/* Quick links */}
        <Card className="p-4 mb-4">
          <div className="grid grid-cols-3 gap-3">
            {quickLinks.map(({ to, icon: Icon, label, color }) => (
              <Link key={to} to={to} className="flex flex-col items-center gap-1.5">
                <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center`}>
                  <Icon size={22} strokeWidth={1.5} />
                </div>
                <span className="text-xs text-gray-600 font-medium">{label}</span>
              </Link>
            ))}
          </div>
        </Card>

        {loading && <div className="flex justify-center py-8"><Spinner /></div>}

        {/* Pengumuman */}
        {news.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Pengumuman</h2>
              <Link to="/informasi" className="text-xs text-orange-500 flex items-center gap-0.5">
                Semua <ChevronRight size={13} />
              </Link>
            </div>
            <div className="space-y-2.5">
              {news.slice(0, 3).map(item => (
                <Link key={item.news_id} to={`/informasi/${item.news_id}`}>
                  <Card className="p-3.5 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                      <Bell size={17} className="text-orange-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(item.created_at)}</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 flex-shrink-0 mt-0.5" />
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Events mendatang */}
        {events.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Events Mendatang</h2>
              <Link to="/events" className="text-xs text-orange-500 flex items-center gap-0.5">
                Semua <ChevronRight size={13} />
              </Link>
            </div>
            <div className="space-y-2.5">
              {events.slice(0, 3).map(ev => (
                <Link key={ev.event_id} to={`/events/${ev.event_id}`}>
                  <Card className="p-3.5 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                      <Calendar size={17} className="text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{ev.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(ev.event_date)} · {ev.location}</p>
                    </div>
                    <Badge color="orange">Daftar</Badge>
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
