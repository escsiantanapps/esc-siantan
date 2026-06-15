import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, ChevronRight, Calendar, ClipboardList, BookOpen, Droplets, Heart, Clock, MapPin, Church } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { newsService, eventsService, classesService } from '@/services/contentService'
import { Card, Spinner, Badge } from '@/components/ui'
import NotificationBell from '@/components/NotificationBell'
import { formatDate, spColor } from '@/lib/utils'

export default function HomePage() {
  const { profile } = useAuth()
  const [news, setNews] = useState([])
  const [events, setEvents] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      newsService.getAll().then(setNews).catch(() => {}),
      eventsService.getAll({ status: 'Aktif' }).then(setEvents).catch(() => {}),
      classesService.getAll({ status: 'Aktif' }).then(setClasses).catch(() => {}),
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

  const featured = events[0]
  const otherEvents = events.slice(1)

  return (
    <div className="pb-4">
      {/* Top AppBar ala Stitch */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-gray-100">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full gradient-main flex items-center justify-center text-white">
              <Church size={18} />
            </div>
            <span className="font-display font-bold text-orange-500 text-base">ESC Siantan</span>
          </div>
          <NotificationBell />
        </div>
      </header>

      <div className="px-4 pt-4">
        {/* Welcome */}
        <section className="mb-5 animate-fade-in-up">
          <h1 className="text-2xl font-bold text-gray-900">
            Shalom, <span className="text-orange-500">{profile?.name?.split(' ')[0] || 'Jemaat'}</span> 👋
          </h1>
          <p className="text-sm text-gray-500 mt-1 italic">
            "Selamat datang. Kiranya damai sejahtera menyertaimu hari ini."
          </p>
        </section>

        {/* Status SP */}
        {profile?.sp_level && profile.sp_level !== 'Aman' && (
          <div
            className={`rounded-2xl px-4 py-3 mb-5 text-sm font-medium animate-fade-in-up ${spColor(profile.sp_level)}`}
            style={{ animationDelay: '60ms' }}
          >
            Status Surat Peringatan: {profile.sp_level}. Hubungi admin/PKS untuk informasi lebih lanjut.
          </div>
        )}

        {loading && <div className="flex justify-center py-8"><Spinner /></div>}

        {/* Featured event ala Stitch */}
        {featured && (
          <Link to={`/events/${featured.event_id}`} className="block mb-6 animate-fade-in-up" style={{ animationDelay: '90ms' }}>
            <div className="relative rounded-3xl overflow-hidden ambient-shadow active:scale-[0.99] transition-transform">
              {featured.thumbnail_url
                ? <img src={featured.thumbnail_url} alt={featured.name} className="w-full h-44 object-cover" />
                : <div className="w-full h-44 gradient-main" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
              <span className="absolute top-3 left-3 bg-surface/90 text-orange-600 text-[11px] font-semibold px-2.5 py-1 rounded-full">
                EVENT TERDEKAT
              </span>
              <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                <p className="text-xs flex items-center gap-1 text-white/85">
                  <Calendar size={12} /> {formatDate(featured.event_date)}{featured.event_time ? ` · ${featured.event_time}` : ''}
                </p>
                <h2 className="text-lg font-bold mt-0.5 text-white">{featured.name}</h2>
                {featured.location && (
                  <p className="text-xs flex items-center gap-1 text-white/85 mt-0.5">
                    <MapPin size={12} /> {featured.location}
                  </p>
                )}
              </div>
            </div>
          </Link>
        )}

        {/* Quick actions */}
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Menu Cepat</h3>
          <div className="grid grid-cols-3 gap-3">
            {quickLinks.map(({ to, icon: Icon, label, color }) => (
              <Link
                key={to}
                to={to}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-surface border border-gray-100 ambient-shadow active:scale-95 transition-transform"
              >
                <div className={`w-11 h-11 rounded-full ${color} flex items-center justify-center`}>
                  <Icon size={20} strokeWidth={1.5} />
                </div>
                <span className="text-xs text-gray-600 font-medium text-center">{label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Pengumuman */}
        {news.length > 0 && (
          <section className="mb-6 animate-fade-in-up" style={{ animationDelay: '120ms' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Pengumuman</h3>
              <Link to="/informasi" className="text-xs text-orange-500 flex items-center gap-0.5">
                Semua <ChevronRight size={13} />
              </Link>
            </div>
            <div className="space-y-2.5">
              {news.slice(0, 3).map(item => (
                <Link key={item.news_id} to={`/informasi/${item.news_id}`} className="block">
                  <Card glass className="p-3.5 flex items-start gap-3 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300">
                    <div className="w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                      <Bell size={18} className="text-orange-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(item.created_at)}</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 flex-shrink-0 mt-1" />
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Event lainnya */}
        {otherEvents.length > 0 && (
          <section className="mb-6 animate-fade-in-up" style={{ animationDelay: '160ms' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Event Berlangsung</h3>
              <Link to="/events" className="text-xs text-orange-500 flex items-center gap-0.5">
                Semua <ChevronRight size={13} />
              </Link>
            </div>
            <div className="space-y-2.5">
              {otherEvents.slice(0, 3).map(ev => (
                <Link key={ev.event_id} to={`/events/${ev.event_id}`} className="block">
                  <Card glass className="p-3.5 flex items-start gap-3 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300">
                    <div className="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                      <Calendar size={18} className="text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{ev.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 flex-wrap">
                        <span className="flex items-center gap-1"><Clock size={11} /> {formatDate(ev.event_date)}</span>
                        {ev.location && <span className="flex items-center gap-1"><MapPin size={11} /> {ev.location}</span>}
                      </p>
                    </div>
                    <Badge color="orange">Daftar</Badge>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Kelas tersedia */}
        {classes.length > 0 && (
          <section className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Kelas Tersedia</h3>
              <Link to="/kelas" className="text-xs text-orange-500 flex items-center gap-0.5">
                Semua <ChevronRight size={13} />
              </Link>
            </div>
            <div className="space-y-2.5">
              {classes.slice(0, 3).map(cls => (
                <Link key={cls.class_id} to={`/kelas/${cls.class_id}`} className="block">
                  <Card glass className="p-3.5 flex items-start gap-3 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300">
                    <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <BookOpen size={18} className="text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{cls.name}</p>
                      {cls.schedule && (
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><Clock size={11} /> {cls.schedule}</p>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-gray-300 flex-shrink-0 mt-1" />
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {!loading && news.length === 0 && events.length === 0 && classes.length === 0 && (
          <div className="text-center py-10 animate-fade-in">
            <p className="text-sm text-gray-400">Belum ada informasi, event, atau kelas saat ini.</p>
          </div>
        )}
      </div>
    </div>
  )
}
