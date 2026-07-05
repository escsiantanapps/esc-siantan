import { useEffect } from 'react'
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
    <NavLink to={to} replace className="flex-1 flex flex-col items-center gap-0.5 py-2 px-0.5">
      <Icon size={22} className={active ? 'text-brand-500' : 'text-gray-400'} strokeWidth={active ? 2 : 1.5} />
      <span className={`text-[10px] font-medium leading-tight whitespace-nowrap ${active ? 'text-brand-500' : 'text-gray-400'}`}>{t(labelKey)}</span>
    </NavLink>
  )
}

export default function UserLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { t } = useLang()
  const { profile } = useAuth()

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

  // Roadmap Pemuridan "selalu muncul saat membuka aplikasi" selama jumlah
  // tayang di perangkat masih di bawah batas admin — dicek sekali per sesi
  // browser (login lewat LoginPage sudah punya cek sendiri).
  useEffect(() => {
    try {
      if (sessionStorage.getItem(ROADMAP_SESSION_CHECK)) return
      sessionStorage.setItem(ROADMAP_SESSION_CHECK, '1')
    } catch { return }
    shouldShowOnboarding()
      .then(show => { if (show) navigate('/onboarding') })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Panel PKS tampil layar penuh tanpa navbar jemaat — sama seperti panel
  // admin. Kembali ke app jemaat lewat tombol back di header panel.
  const inPanel = location.pathname.startsWith('/pks')

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative">
      {/* Main content */}
      <main className={`flex-1 overflow-y-auto ${inPanel ? 'pb-6' : 'pb-24'}`}>
        <Outlet />
      </main>

      {/* Bottom navigation — bar mengambang dengan tombol Scan menonjol (FAB) */}
      {!inPanel && (
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-surface rounded-t-[1.75rem] shadow-[0_-4px_24px_rgba(2,32,71,0.08)] z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-end px-2">
          {LEFT_ITEMS.map(item => <NavItem key={item.to} {...item} />)}

          {/* Tombol Scan: FAB melayang di tengah ala app modern (myBCA/Telkomsel) */}
          <NavLink
            to="/scan"
            replace
            aria-label="Scan QR Absensi"
            className="flex-1 flex flex-col items-center gap-1 py-2 group"
          >
            <div className="-mt-9 w-16 h-16 rounded-full gradient-main text-white flex items-center justify-center border-[5px] border-surface shadow-[0_10px_22px_-6px_rgba(244,81,30,0.6)] group-active:scale-95 transition-transform">
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
