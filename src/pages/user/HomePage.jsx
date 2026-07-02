import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, ChevronRight, Calendar, BookOpen, Droplets, Heart, Baby, Clock, MapPin, Church, HandCoins, WifiOff, RefreshCw, Sparkles } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { newsService, eventsService, classesService, appSettingsService } from '@/services/contentService'
import { Card, Spinner } from '@/components/ui'
import NotificationBell from '@/components/NotificationBell'
import OnboardingPrompt from '@/components/OnboardingPrompt'
import BirthdayMessageCard from '@/components/BirthdayMessageCard'
import MembershipCard from '@/components/MembershipCard'
import EventCarousel from '@/components/EventCarousel'
import { formatDate, spColor } from '@/lib/utils'

export default function HomePage() {
  const { profile } = useAuth()
  const { t } = useLang()
  const [news, setNews] = useState([])
  const [events, setEvents] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [baptismOpen, setBaptismOpen] = useState(true)

  function loadData() {
    setLoading(true)
    setFetchError(false)
    let anyFailed = false
    // Beranda menampilkan yang belum selesai (status Mulai / Sedang Berlangsung).
    const ongoing = list => (list || []).filter(x => ['Mulai', 'Sedang Berlangsung'].includes(x.status))
    Promise.all([
      newsService.getAll().then(setNews).catch(() => { anyFailed = true }),
      eventsService.getAll().then(list => setEvents(ongoing(list))).catch(() => { anyFailed = true }),
      classesService.getAll().then(list => setClasses(ongoing(list))).catch(() => { anyFailed = true }),
      appSettingsService.get('baptism_status').then(s => setBaptismOpen(s !== 'closed')).catch(() => {}),
    ]).finally(() => {
      setLoading(false)
      if (anyFailed) setFetchError(true)
    })
  }

  useEffect(() => { loadData() }, [])

  const quickLinks = [
    { to: '/persembahan',        icon: HandCoins,     label: t('home.q.offering'), color: 'bg-emerald-100 text-emerald-600' },
    { to: '/events',             icon: Calendar,      label: t('home.q.events'),   color: 'bg-red-100 text-red-600' },
    { to: '/kelas',              icon: BookOpen,      label: t('home.q.classes'),  color: 'bg-blue-100 text-blue-600' },
    ...(baptismOpen ? [{ to: '/baptisan', icon: Droplets, label: t('home.q.baptism'), color: 'bg-teal-100 text-teal-600' }] : []),
    { to: '/pemberkatan-nikah',  icon: Heart,         label: t('home.q.wedding'),  color: 'bg-pink-100 text-pink-600' },
    { to: '/penyerahan-anak',    icon: Baby,          label: t('home.q.dedication'), color: 'bg-amber-100 text-amber-600' },
    { to: '/status-pendaftaran', icon: Bell,          label: t('home.q.status'),   color: 'bg-purple-100 text-purple-600' },
  ]

  return (
    <div className="pb-4">
      {/* Top AppBar ala Stitch */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-gray-100">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full gradient-main flex items-center justify-center text-white">
              <Church size={18} />
            </div>
            <span className="font-display font-bold text-brand-500 text-base">ESC Siantan</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/poin" className="flex items-center gap-1 bg-brand-50 text-brand-600 rounded-full pl-2 pr-2.5 py-1 active:scale-95 transition-transform">
              <Sparkles size={14} />
              <span className="text-xs font-bold">{profile?.points ?? 0}</span>
            </Link>
            <NotificationBell />
          </div>
        </div>
      </header>

      <div className="px-4 pt-4">
        {/* Welcome */}
        <section className="mb-5 animate-fade-in-up">
          <h1 className="text-2xl font-bold text-gray-900">
            Shalom, <span className="text-brand-500">{profile?.name?.split(' ')[0] || 'Jemaat'}</span> 👋
          </h1>
          <p className="text-sm text-gray-500 mt-1 italic">
            {t('home.welcomeQuote')}
          </p>
        </section>

        {/* Pesan ulang tahun personal dari PKS, kalau ada yang belum dibaca */}
        <BirthdayMessageCard />

        {/* Kartu Jemaat (tampil hanya bila sudah diunggah admin) */}
        {profile?.membership_card_url && (
          <div className="mb-5 animate-fade-in-up">
            <MembershipCard profile={profile} />
          </div>
        )}

        {/* Panduan akun baru: lengkapi data & aktifkan notifikasi */}
        <OnboardingPrompt />

        {/* Status SP */}
        {profile?.sp_level && profile.sp_level !== 'Aman' && (
          <div
            className={`rounded-2xl px-4 py-3 mb-5 text-sm font-medium animate-fade-in-up ${spColor(profile.sp_level)}`}
            style={{ animationDelay: '60ms' }}
          >
            {t('home.spStatus', { level: profile.sp_level })}
          </div>
        )}

        {loading && <div className="flex justify-center py-8"><Spinner /></div>}

        {/* Peringatan gagal memuat (jaringan putus / error server) */}
        {!loading && fetchError && (
          <div className="rounded-2xl bg-orange-50 border border-orange-100 px-4 py-3 mb-5 flex items-center gap-3 animate-fade-in">
            <WifiOff size={18} className="text-orange-400 flex-shrink-0" />
            <p className="text-sm text-orange-700 flex-1">{t('home.fetchError') || 'Gagal memuat konten. Periksa koneksi internet kamu.'}</p>
            <button
              onClick={loadData}
              className="flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-800 transition-colors"
            >
              <RefreshCw size={13} /> Coba lagi
            </button>
          </div>
        )}

        {/* Event — carousel yang bisa digeser */}
        {events.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">{t('home.event')}</h3>
              <Link to="/events" className="text-xs text-brand-500 flex items-center gap-0.5">
                {t('common.all')} <ChevronRight size={13} />
              </Link>
            </div>
            <EventCarousel events={events.slice(0, 6)} />
          </section>
        )}

        {/* Quick actions */}
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('home.quickMenu')}</h3>
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
              <h3 className="text-sm font-semibold text-gray-900">{t('home.announcements')}</h3>
              <Link to="/informasi" className="text-xs text-brand-500 flex items-center gap-0.5">
                {t('common.all')} <ChevronRight size={13} />
              </Link>
            </div>
            <div className="space-y-2.5">
              {news.slice(0, 3).map(item => (
                <Link key={item.news_id} to={`/informasi/${item.news_id}`} className="block">
                  <Card glass className="p-3.5 flex items-start gap-3 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300">
                    <div className="w-11 h-11 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
                      <Bell size={18} className="text-brand-500" />
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

        {/* Kelas tersedia */}
        {classes.length > 0 && (
          <section className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">{t('home.availableClasses')}</h3>
              <Link to="/kelas" className="text-xs text-brand-500 flex items-center gap-0.5">
                {t('common.all')} <ChevronRight size={13} />
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
            <p className="text-sm text-gray-400">{t('home.empty')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
