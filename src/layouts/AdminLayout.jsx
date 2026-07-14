import { Outlet, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom'
import {
  LogOut, ChevronRight, Smartphone, ShieldCheck, Menu, X, KeyRound, Tag, HardDrive, ScrollText,
  MessageSquare, Users, BarChart3, LayoutDashboard, MessageSquareText, LayoutList, UsersRound, Droplet,
  Gift, Coins
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { ThemeToggle, Spinner } from '@/components/ui'
import { permissionsService } from '@/services/permissionsService'
import { useBackClose } from '@/hooks/useBackClose'
import { useExitConfirm } from '@/hooks/useExitConfirm'
import { ADMIN_PAGES, matchAdminPage } from '@/config/adminPages'
import { notificationService } from '@/services/notificationService'

// Item menu Pesan Gembala — dipakai Gembala (menu inti) & Super Admin.
const PESAN_ITEM = { to: '/admin/pesan', icon: MessageSquare, labelKey: 'admin.nav.pesan' }

function buildMenu(isSuperAdmin, isGembala, allowedPages) {
  // Gembala = peran fokus: menu terkurasi (Dashboard + Pesan + laporan),
  // tanpa akses ke konfigurasi sistem/master data.
  if (isGembala) {
    return [
      { to: '/admin',          icon: LayoutDashboard, label: 'Dashboard',        section: 'Utama', labelKey: 'admin.nav.dashboard', sectionKey: 'admin.sec.Utama', exact: true },
      { to: '/admin/pesan',    icon: MessageSquare,   label: 'Pesan Gembala', section: 'Utama', labelKey: 'admin.nav.pesan', sectionKey: 'admin.sec.Utama' },
      { to: '/admin/evaluasi', icon: BarChart3,       label: 'Evaluasi & Laporan', section: 'Utama', labelKey: 'admin.nav.evaluasi', sectionKey: 'admin.sec.Utama' },
      { to: '/admin/komsel',   icon: UsersRound,      label: 'Laporan Komsel', section: 'Utama', labelKey: 'admin.nav.komsel', sectionKey: 'admin.sec.Utama' },
    ]
  }

  const items = []

  // Dashboard sekarang jadi entri ADMIN_PAGES pertama (bisa dicabut Super
  // Admin). Filter yang sama berlaku untuknya.
  let lastSection = null
  for (const page of ADMIN_PAGES) {
    if (!isSuperAdmin && allowedPages && !allowedPages.includes(page.to)) continue
    if (page.section !== lastSection) {
      items.push({ section: page.section, sectionKey: page.sectionKey })
      lastSection = page.section
    }
    // Dashboard butuh flag `exact` supaya NavLink tidak tetap aktif saat berada
    // di sub-halaman /admin/*.
    items.push(page.to === '/admin' ? { ...page, exact: true } : page)
  }

  if (isSuperAdmin) {
    items.push({ section: 'Komunikasi', sectionKey: 'admin.sec.Komunikasi' })
    items.push(PESAN_ITEM)
    items.push({ section: 'Sistem', sectionKey: 'admin.sec.Sistem' })
    items.push({ to: '/admin/tukar-poin', icon: Gift, labelKey: 'admin.nav.tukarPoin' })
    items.push({ to: '/admin/distribusi-poin', icon: Coins, labelKey: 'admin.nav.distribusiPoin' })
    items.push({ to: '/admin/hak-akses', icon: KeyRound, labelKey: 'admin.nav.hakAkses' })
    items.push({ to: '/admin/kategori-tugas', icon: Tag, labelKey: 'admin.nav.kategoriTugas' })
    items.push({ to: '/admin/backup', icon: HardDrive, labelKey: 'admin.nav.backup' })
    items.push({ to: '/admin/audit', icon: ScrollText, labelKey: 'admin.nav.audit' })
  }

  return items
}

// Halaman yang boleh diakses Gembala di panel admin (sisanya diarahkan ke Dashboard).
// Khusus untuk Dashboard (/admin), pengecekannya exact match di bawah.
const GEMBALA_ALLOWED = ['/admin/pesan', '/admin/evaluasi', '/admin/komsel']

export default function AdminLayout() {
  const [open, setOpen] = useState(false)
  useBackClose(open, () => setOpen(false)) // back menutup sidebar mobile dulu
  const { profile, logout } = useAuth()
  const { toast, confirm } = useToast()
  const { t } = useLang()
  const navigate = useNavigate()
  const location = useLocation()
  // Konfirmasi keluar saat back di dashboard admin (root panel). Bila akses
  // Dashboard dicabut, halaman ini tidak akan pernah tampil untuk admin ybs
  // (guard di bawah), jadi hook ini tetap aman didaftarkan.
  useExitConfirm(location.pathname === '/admin', () => toast.info(t('app.exitConfirm')))

  const isSuperAdmin = profile?.role === 'Super Admin'
  const isGembala = profile?.role === 'Gembala'
  const isAdminOnly = profile?.role === 'Admin'
  const isPKS = profile?.is_pks === true || profile?.role === 'PKS'
  const isVolunteerSecondary = profile?.role_secondary === 'Volunteer'
  const hasSecondaryAccess = isPKS || isVolunteerSecondary
  const [allowedPages, setAllowedPages] = useState(null)
  const [permLoading, setPermLoading] = useState(!isSuperAdmin)
  const [pendingCounts, setPendingCounts] = useState({
    pendingUsers: 0, pendingClasses: 0, pendingEvents: 0, pendingEvaluations: 0
  })

  useEffect(() => {
    if (profile?.role) {
      notificationService.getAdminPendingCounts(profile.role)
        .then(setPendingCounts)
        .catch(console.error)
    }
  }, [profile?.role])

  useEffect(() => {
    if (isSuperAdmin || !profile?.user_id) { setPermLoading(false); return }
    setPermLoading(true)
    permissionsService.getMyPermissions(profile.user_id)
      .then(setAllowedPages)
      .catch(() => setAllowedPages(null))
      .finally(() => setPermLoading(false))
  }, [isSuperAdmin, profile?.user_id])

  async function handleLogout() {
    const ok = await confirm({
      title: t('admin.logoutTitle'),
      message: t('admin.logoutMsg'),
      confirmText: t('admin.logout'),
      danger: true,
    })
    if (!ok) return
    await logout()
    navigate('/login')
  }

  if (permLoading) return (
    <div className="flex items-center justify-center h-screen">
      <Spinner size="lg" />
    </div>
  )

  // Tentukan tujuan fallback ketika Admin mencoba masuk halaman yang tidak
  // diizinkan. Prioritas: Dashboard jika masih diizinkan, kalau tidak ambil
  // halaman pertama yang diizinkan. Bila SEMUA dicabut → kembalikan ke root.
  function fallbackPath() {
    if (isSuperAdmin) return '/admin'
    if (!allowedPages || allowedPages.includes('/admin')) return '/admin'
    const first = ADMIN_PAGES.find(p => allowedPages.includes(p.to))
    return first ? first.to : '/'
  }

  // Gembala: kunci ke halaman terkurasi saja.
  // Sisanya diarahkan ke Dashboard (karena Gembala sekarang punya Dashboard).
  if (isGembala) {
    const p = location.pathname
    const ok = p === '/admin' || GEMBALA_ALLOWED.some(base => p === base || p.startsWith(base + '/'))
    if (!ok) return <Navigate to="/admin" replace />
  }

  // Halaman khusus Super Admin (Hak Akses, Kategori Tugas, Backup, Audit, Tukar Poin, Distribusi Poin)
  if (['/admin/hak-akses', '/admin/kategori-tugas', '/admin/backup', '/admin/audit', '/admin/tukar-poin', '/admin/distribusi-poin'].includes(location.pathname) && !isSuperAdmin) {
    return <Navigate to={fallbackPath()} replace />
  }

  // Batasi akses Admin ke halaman yang belum diizinkan Super Admin — termasuk
  // Dashboard '/admin' itu sendiri (sekarang bagian dari ADMIN_PAGES).
  // Gembala dikecualikan: aksesnya sudah diatur GEMBALA_ALLOWED di atas.
  if (!isSuperAdmin && !isGembala && allowedPages) {
    const page = matchAdminPage(location.pathname)
    if (page && !allowedPages.includes(page.to)) {
      return <Navigate to={fallbackPath()} replace />
    }
  }

  const MENU = buildMenu(isSuperAdmin, isGembala, allowedPages)

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar desktop */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-60 bg-surface border-r border-gray-100
        flex flex-col transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:flex
      `}>
        {/* Logo */}
        <div className="p-4 border-b border-gray-100" style={{paddingTop: 'calc(var(--safe-top, 28px) + 1rem)'}}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl gradient-main flex items-center justify-center">
              <span className="text-white text-sm font-bold">ES</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">ESC Siantan</p>
              <p className="text-xs text-gray-500">{t('admin.panel')}</p>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Panel switcher */}
        {(!isAdminOnly || hasSecondaryAccess) && (
          <div className="p-3 border-b border-gray-100">
            <div className="flex items-center gap-1 p-1 bg-control rounded-xl">
              <NavLink
                to="/"
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Smartphone size={14} strokeWidth={1.5} />
                {t('admin.switchApp')}
              </NavLink>
              <span className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold bg-surface text-brand-600 shadow-sm">
                <ShieldCheck size={14} strokeWidth={2} />
                {t('admin.adminTab')}
              </span>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {MENU.map((item, i) => {
            if (!item.to) return (
              <p key={i} className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 pt-4 pb-1">
                {item.sectionKey ? t(item.sectionKey) : item.section}
              </p>
            )
            const { to, icon: Icon, labelKey, label, exact } = item
            let badge = 0
            if (to === '/admin/jemaat') badge = pendingCounts.pendingUsers
            else if (to === '/admin/kelas') badge = pendingCounts.pendingClasses
            else if (to === '/admin/events') badge = pendingCounts.pendingEvents
            else if (to === '/admin/evaluasi') badge = pendingCounts.pendingEvaluations

            return (
              <NavLink key={to} to={to} end={exact}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200
                  ${isActive
                    ? 'bg-brand-50 text-brand-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:translate-x-0.5'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Bar aksen gradient di sisi kiri item aktif */}
                    {isActive && <span aria-hidden="true" className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full gradient-main" />}
                    <Icon size={17} strokeWidth={isActive ? 2 : 1.5} />
                    <span className="flex-1">{labelKey ? t(labelKey) : label}</span>
                    {badge > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                    {isActive && badge === 0 && <ChevronRight size={14} />}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* User & logout */}
        <div className="p-3 border-t border-gray-100">
          <div className="flex items-center gap-2.5 px-2 py-1.5 mb-1">
            <div className="w-8 h-8 rounded-full gradient-main flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {profile?.name?.slice(0, 2).toUpperCase() || 'AD'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 truncate">{profile?.name || 'Admin'}</p>
              <p className="text-[10px] text-gray-500">{profile?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors"
          >
            <LogOut size={16} />
            {t('admin.logout')}
          </button>
        </div>
      </aside>

      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-30 lg:hidden animate-fade-in"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar mobile */}
        <header className="lg:hidden bg-surface/90 backdrop-blur-md border-b border-gray-100 px-4 pb-3 flex items-center gap-3 sticky top-0 z-20" style={{paddingTop: 'calc(var(--safe-top, 28px) + 0.75rem)'}}>
          <button onClick={() => setOpen(true)} className="p-1 text-gray-500 active:scale-90 transition-transform">
            <Menu size={22} />
          </button>
          <span className="font-semibold text-gray-900 text-sm flex-1">{t('admin.appShort')}</span>
          <ThemeToggle />
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
