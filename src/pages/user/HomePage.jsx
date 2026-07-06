import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, ChevronRight, Calendar, BookOpen, Droplets, Heart, Baby, Clock, MapPin, Church, HandCoins, WifiOff, RefreshCw, Sparkles, CreditCard } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { newsService, eventsService, classesService, appSettingsService, registrationService } from '@/services/contentService'
import { Card, Skeleton, SkeletonCard, SectionHeader } from '@/components/ui'
import NotificationBell from '@/components/NotificationBell'
import OnboardingPrompt from '@/components/OnboardingPrompt'
import SopNudgeCard from '@/components/SopNudgeCard'
import BirthdayMessageCard from '@/components/BirthdayMessageCard'
import MembershipCard from '@/components/MembershipCard'
import EventCarousel from '@/components/EventCarousel'
import { formatDate, spColor } from '@/lib/utils'

// Sapaan sesuai jam lokal perangkat (pagi/siang/sore/malam)
function greeting(t) {
  const h = new Date().getHours()
  if (h >= 4 && h < 11) return `${t('home.greet.morning')} ☀️`
  if (h >= 11 && h < 15) return `${t('home.greet.afternoon')} 🌤️`
  if (h >= 15 && h < 18) return `${t('home.greet.evening')} 🌅`
  return `${t('home.greet.night')} 🌙`
}

export default function HomePage() {
  const { profile } = useAuth()
  const { t } = useLang()
  const [news, setNews] = useState([])
  const [events, setEvents] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [baptismOpen, setBaptismOpen] = useState(true)
  const [hasActiveKtj, setHasActiveKtj] = useState(false)

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
      // Cek pengajuan KTJ aktif untuk menyembunyikan quick link "Daftar KTJ".
      profile?.user_id
        ? registrationService.getMyRegistrations(profile.user_id)
            .then(r => setHasActiveKtj((r.ktj || []).some(k => k.status !== 'Ditolak')))
            .catch(() => {})
        : Promise.resolve(),
    ]).finally(() => {
      setLoading(false)
      if (anyFailed) setFetchError(true)
    })
  }

  useEffect(() => { loadData() }, [profile?.user_id])

  const quickLinks = [
    { to: '/persembahan',        icon: HandCoins,     label: t('home.q.offering'), color: 'bg-emerald-100 text-emerald-600' },
    { to: '/events',             icon: Calendar,      label: t('home.q.events'),   color: 'bg-red-100 text-red-600' },
    { to: '/kelas',              icon: BookOpen,      label: t('home.q.classes'),  color: 'bg-blue-100 text-blue-600' },
    ...(baptismOpen ? [{ to: '/baptisan', icon: Droplets, label: t('home.q.baptism'), color: 'bg-teal-100 text-teal-600' }] : []),
    { to: '/pemberkatan-nikah',  icon: Heart,         label: t('home.q.wedding'),  color: 'bg-pink-100 text-pink-600' },
    { to: '/penyerahan-anak',    icon: Baby,          label: t('home.q.dedication'), color: 'bg-amber-100 text-amber-600' },
    // Daftar KTJ: sembunyikan bila jemaat sudah punya kartu, atau punya pengajuan
    // aktif (Menunggu/Disetujui/Terjadwal/Selesai — apapun kecuali Ditolak).
    ...(!profile?.membership_card_url && !hasActiveKtj
      ? [{ to: '/ktj', icon: CreditCard, label: t('home.q.ktj'), color: 'bg-indigo-100 text-indigo-600' }]
      : []),
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
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-500/80 mb-1">
            {greeting(t)}
          </p>
          <h1 className="font-display text-2xl font-bold text-gray-900 tracking-tight">
            Shalom, <span className="gradient-text">{profile?.name?.split(' ')[0] || 'Jemaat'}</span> 👋
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

        {/* Pengingat ramah kalau ada SOP yang belum dituntaskan minggu ini */}
        <SopNudgeCard />

        {/* Status SP */}
        {profile?.sp_level && profile.sp_level !== 'Aman' && (
          <div
            className={`rounded-2xl px-4 py-3 mb-5 text-sm font-medium animate-fade-in-up ${spColor(profile.sp_level)}`}
            style={{ animationDelay: '60ms' }}
          >
            {t('home.spStatus', { level: profile.sp_level })}
          </div>
        )}

        {/* Skeleton berbentuk konten selama data dimuat */}
        {loading && (
          <div className="animate-fade-in">
            <Skeleton className="h-40 rounded-3xl mb-5" />
            <div className="grid grid-cols-3 gap-3 mb-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-surface border border-gray-100">
                  <Skeleton className="w-11 h-11 rounded-full" />
                  <Skeleton className="h-2.5 w-12 rounded-md" />
                </div>
              ))}
            </div>
            <Skeleton className="h-3.5 w-32 rounded-md mb-3" />
            <div className="space-y-2.5">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        )}

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
            <SectionHeader title={t('home.event')} to="/events" />
            <EventCarousel events={events.slice(0, 6)} />
          </section>
        )}

        {/* Quick actions */}
        {!loading && (
        <section className="mb-6">
          <SectionHeader title={t('home.quickMenu')} />
          <div className="grid grid-cols-3 gap-3 stagger-children">
            {quickLinks.map(({ to, icon: Icon, label, color }) => (
              <Link
                key={to}
                to={to}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-surface border border-gray-100 ambient-shadow card-lift"
              >
                <div className={`w-11 h-11 rounded-full ${color} flex items-center justify-center`}>
                  <Icon size={20} strokeWidth={1.5} />
                </div>
                <span className="text-xs text-gray-600 font-medium text-center">{label}</span>
              </Link>
            ))}
          </div>
        </section>
        )}

        {/* Pengumuman */}
        {news.length > 0 && (
          <section className="mb-6 animate-fade-in-up" style={{ animationDelay: '120ms' }}>
            <SectionHeader title={t('home.announcements')} to="/informasi" />
            <div className="space-y-2.5 stagger-children">
              {news.slice(0, 3).map(item => (
                <Link key={item.news_id} to={`/informasi/${item.news_id}`} className="block">
                  <Card glass lift className="p-3.5 flex items-start gap-3">
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
            <SectionHeader title={t('home.availableClasses')} to="/kelas" />
            <div className="space-y-2.5 stagger-children">
              {classes.slice(0, 3).map(cls => (
                <Link key={cls.class_id} to={`/kelas/${cls.class_id}`} className="block">
                  <Card glass lift className="p-3.5 flex items-start gap-3">
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
