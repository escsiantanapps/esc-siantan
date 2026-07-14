import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Calendar, BookOpen, Droplets, Heart, Baby, Church, HandCoins, WifiOff, RefreshCw, Star, Library, CreditCard } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { newsService, appSettingsService } from '@/services/contentService'
import { Skeleton, SkeletonCard, SectionHeader, EmptyState } from '@/components/ui'
import NotificationBell from '@/components/NotificationBell'
import OnboardingPrompt from '@/components/OnboardingPrompt'
import SopNudgeCard from '@/components/SopNudgeCard'
import BirthdayMessageCard from '@/components/BirthdayMessageCard'
import PastoralMessageCard from '@/components/PastoralMessageCard'
import MembershipCard from '@/components/MembershipCard'
import MyMinistryScheduleCard from '@/components/MyMinistryScheduleCard'
import PointsProgressCard from '@/components/PointsProgressCard'
import AttendanceSummaryCard from '@/components/AttendanceSummaryCard'
import Carousel from '@/components/Carousel'
import { spColor } from '@/lib/utils'

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
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [baptismOpen, setBaptismOpen] = useState(true)

  function loadData() {
    setLoading(true)
    setFetchError(false)
    let anyFailed = false
    Promise.all([
      newsService.getAll().then(setNews).catch(() => { anyFailed = true }),
      appSettingsService.get('baptism_status').then(s => setBaptismOpen(s !== 'closed')).catch(() => {}),
    ]).finally(() => {
      setLoading(false)
      if (anyFailed) setFetchError(true)
    })
  }

  useEffect(() => { loadData() }, [profile?.user_id])

  const quickLinks = [
    { to: '/persembahan',        icon: HandCoins,     label: t('home.q.offering'), color: 'bg-emerald-600/15 text-emerald-600' },
    { to: '/events',             icon: Calendar,      label: t('home.q.events'),   color: 'bg-red-600/15 text-red-600' },
    { to: '/kelas',              icon: BookOpen,      label: t('home.q.classes'),  color: 'bg-blue-600/15 text-blue-600' },
    { to: '/baca',               icon: Library,       label: t('home.q.book'),     color: 'bg-cyan-600/15 text-cyan-600' },
    ...(baptismOpen ? [{ to: '/baptisan', icon: Droplets, label: t('home.q.baptism'), color: 'bg-teal-600/15 text-teal-600' }] : []),
    { to: '/pemberkatan-nikah',  icon: Heart,         label: t('home.q.wedding'),  color: 'bg-pink-600/15 text-pink-600' },
    { to: '/penyerahan-anak',    icon: Baby,          label: t('home.q.dedication'), color: 'bg-amber-600/15 text-amber-600' },
    { to: '/ktj',                icon: CreditCard,    label: t('home.q.ktj'),      color: 'bg-indigo-600/15 text-indigo-600' },
    { to: '/status-pendaftaran', icon: Bell,          label: t('home.q.status'),   color: 'bg-purple-600/15 text-purple-600' },
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
            <Link to="/poin" className="flex items-center gap-1.5 rounded-full pl-2 pr-3 py-1 bg-gradient-to-r from-amber-300 to-yellow-400 border border-amber-400/60 text-amber-950 active:scale-95 transition-transform">
              <Star size={14} className="fill-amber-600 text-amber-600" />
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

        {/* Pesan/pengumuman broadcast dari Gembala, kalau ada yang belum ditutup */}
        <PastoralMessageCard />

        {/* Pesan ulang tahun personal dari PKS, kalau ada yang belum dibaca */}
        <BirthdayMessageCard />



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

        {/* Isi info di beranda dipusatkan ke pengumuman terbaru */}
        {news.length > 0 && (
          <section>
            <SectionHeader title={t('info.announcements')} to="/informasi" />
            <Carousel
              items={news.slice(0, 6)}
              getKey={item => item.news_id}
              renderItem={item => (
                <Link to={`/informasi/${item.news_id}`} className="block">
                  <div className="rounded-3xl overflow-hidden ambient-shadow bg-surface active:scale-[0.99] transition-transform">
                    <div className="relative h-36">
                      {item.thumbnail_url
                        ? <img src={item.thumbnail_url} alt={item.title} className="w-full h-full object-cover" />
                        : (
                          <div className="w-full h-full gradient-main flex items-center justify-center">
                            <Bell size={32} className="text-white/85" strokeWidth={1.5} />
                          </div>
                        )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                      <span className="absolute top-3 left-3 bg-surface/90 text-brand-600 text-[11px] font-semibold px-2.5 py-1 rounded-full">
                        {t('info.announcementTag')}
                      </span>
                    </div>
                    <div className="p-3.5">
                      <p className="text-sm font-semibold text-gray-900 line-clamp-1">{item.title}</p>
                      {item.content && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.content}</p>}
                    </div>
                  </div>
                </Link>
              )}
            />
          </section>
        )}

        {!loading && news.length === 0 && (
          <section>
            <SectionHeader title={t('info.announcements')} to="/informasi" />
            <EmptyState
              icon={Bell}
              title={t('info.noAnnouncements')}
              description={t('info.noAnnouncementsDesc')}
            />
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

        {/* Jadwal pelayanan Volunteer (self-gating; pindah ke bawah Menu Cepat) */}
        <MyMinistryScheduleCard />

        {/* Ringkasan poin + progres hadiah */}
        <PointsProgressCard />

        {/* Ringkasan kehadiran bulan ini */}
        <AttendanceSummaryCard />
      </div>
    </div>
  )
}
