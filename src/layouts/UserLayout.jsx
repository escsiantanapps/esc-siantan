import { useEffect, useRef, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Home, Newspaper, ClipboardList, User, ScanLine } from 'lucide-react'
import { useLang } from '@/hooks/useLang'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'
import { useExitConfirm } from '@/hooks/useExitConfirm'
import { usersService } from '@/services/usersService'
import { shouldShowOnboarding } from '@/pages/OnboardingPage'

const ROADMAP_SESSION_CHECK = 'esc-roadmap-checked'

// Item kiri & kanan; tombol Scan disisipkan menonjol di tengah.
const LEFT_ITEMS = [
  { to: '/',          icon: Home,      labelKey: 'nav.home', exact: true },
  { to: '/informasi', icon: Newspaper, labelKey: 'nav.info' },
]
const RIGHT_ITEMS = [
  { to: '/tugas',     icon: ClipboardList, labelKey: 'nav.tasks' },
  { to: '/profil',    icon: User,          labelKey: 'nav.profile' },
]

function NavItem({ to, icon: Icon, labelKey, exact }) {
  const location = useLocation()
  const { t } = useLang()
  const active = exact ? location.pathname === to : location.pathname.startsWith(to)
  return (
    // replace: pindah antar tab utama tidak menumpuk riwayat, sehingga tombol
    // back tidak membawa ke tab yang dibuka sebelumnya (rasa native).
    <NavLink to={to} replace className="flex-1 flex flex-col items-center gap-0.5 py-2 px-0.5 group">
      {/* key={active} me-remount ikon saat tab berubah jadi aktif → animasi pop jalan lagi */}
      <span key={active ? 'on' : 'off'} className={active ? 'animate-nav-pop' : 'transition-transform group-active:scale-90'}>
        <Icon size={22} className={active ? 'text-brand-500' : 'text-gray-400'} strokeWidth={active ? 2.2 : 1.5} />
      </span>
      <span className={`text-[10px] leading-tight whitespace-nowrap transition-colors ${active ? 'text-brand-500 font-semibold' : 'text-gray-400 font-medium'}`}>{t(labelKey)}</span>
      {/* Titik indikator tab aktif */}
      <span aria-hidden="true" className={`w-1 h-1 rounded-full transition-all duration-300 ${active ? 'bg-brand-500 scale-100' : 'bg-transparent scale-0'}`} />
    </NavLink>
  )
}

export default function UserLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { t } = useLang()
  const { profile } = useAuth()
  const [roadmapChecking, setRoadmapChecking] = useState(true)
  const roadmapCheckStarted = useRef(false)
  const roadmapCheckMounted = useRef(false)

  // Heartbeat kehadiran online: perbarui last_seen_at saat app dibuka lalu
  // tiap 2 menit selama app aktif. Dipakai indikator online/offline di admin.
  useEffect(() => {
    const uid = profile?.user_id
    if (!uid) return
    usersService.heartbeat(uid).catch(() => {})
    const timer = setInterval(() => usersService.heartbeat(uid).catch(() => {}), 120000)
    return () => clearInterval(timer)
  }, [profile?.user_id])
  // Konfirmasi keluar hanya di Beranda (root). Tab lain pakai replace, jadi
  // back dari tab kembali ke Beranda dulu, baru dari Beranda minta konfirmasi.
  useExitConfirm(location.pathname === '/', () => toast.info(t('app.exitConfirm')))

  // Roadmap Pemuridan diperiksa dari satu tempat saja. Selama keputusan belum
  // selesai, tahan render halaman agar Beranda tidak sempat muncul lalu lompat
  // ke onboarding. Ref juga mencegah effect ganda React menjalankan request 2x.
  useEffect(() => {
    roadmapCheckMounted.current = true
    if (roadmapCheckStarted.current) {
      return () => { roadmapCheckMounted.current = false }
    }
    roadmapCheckStarted.current = true

    try {
      if (sessionStorage.getItem(ROADMAP_SESSION_CHECK)) {
        setRoadmapChecking(false)
        return
      }
      sessionStorage.setItem(ROADMAP_SESSION_CHECK, '1')
    } catch { /* private mode: tetap lakukan pengecekan in-memory */ }

    shouldShowOnboarding()
      .then(show => {
        if (!roadmapCheckMounted.current) return
        if (show) navigate('/onboarding', { replace: true })
        else setRoadmapChecking(false)
      })
      .catch(() => { if (roadmapCheckMounted.current) setRoadmapChecking(false) })
    return () => { roadmapCheckMounted.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Panel PKS tampil layar penuh tanpa navbar jemaat — sama seperti panel
  // admin. Kembali ke app jemaat lewat tombol back di header panel.
  const inPanel = location.pathname.startsWith('/pks')

  if (roadmapChecking) {
    return (
      <div className="min-h-svh bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative">
      {/* Main content */}
      <main className={`flex-1 overflow-y-auto ${inPanel ? 'pb-6' : 'pb-[calc(7.5rem+env(safe-area-inset-bottom))]'}`}>
        <Outlet />
      </main>

      {/* Bottom navigation — bar mengambang dengan tombol Scan menonjol (FAB) */}
      {!inPanel && (
      <nav className="user-bottom-nav fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-surface/85 backdrop-blur-xl border-t border-gray-100/60 rounded-t-[1.75rem] shadow-[0_-4px_24px_rgba(2,32,71,0.08)] z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-end px-2">
          {LEFT_ITEMS.map(item => <NavItem key={item.to} {...item} />)}

          {/* Tombol Scan: FAB melayang di tengah ala app modern (myBCA/Telkomsel) */}
          <NavLink
            to="/scan"
            replace
            aria-label="Scan QR Absensi"
            className="flex-1 flex flex-col items-center gap-1 py-2 group"
          >
            <div className="-mt-9 w-16 h-16 rounded-full gradient-main text-white flex items-center justify-center border-[5px] border-surface shadow-[0_10px_22px_-6px_rgba(244,81,30,0.6)] group-active:scale-95 transition-all group-hover:shadow-[0_12px_26px_-6px_rgba(244,81,30,0.75)]">
              <ScanLine size={26} strokeWidth={2.2} />
            </div>
            <span className="text-[10px] font-semibold text-brand-500">{t('nav.scan')}</span>
          </NavLink>

          {RIGHT_ITEMS.map(item => <NavItem key={item.to} {...item} />)}
        </div>
      </nav>
      )}
    </div>
  )
}
