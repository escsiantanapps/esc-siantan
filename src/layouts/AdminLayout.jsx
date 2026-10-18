import { Outlet, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom'
import {
  LogOut, Smartphone, Search, Menu, X, KeyRound, HardDrive, ScrollText,
  MessageSquare, Users, BarChart3, LayoutDashboard, MessageSquareText, LayoutList, UsersRound, Droplet,
  Gift, Coins, Bell
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { ThemeToggle, Spinner, Button, Input } from '@/components/ui'
import { permissionsService } from '@/services/permissionsService'
import { useBackClose } from '@/hooks/useBackClose'
import { useExitConfirm } from '@/hooks/useExitConfirm'
import { ADMIN_PAGES, matchAdminPage } from '@/config/adminPages'
import { notificationService } from '@/services/notificationService'
import { serviceRosterService } from '@/services/serviceRosterService'
import AdminPendingList from '@/components/AdminPendingList'
import './adminLayout.css'

// Item menu Pesan Gembala — dipakai Gembala & Super Admin.
const PESAN_ITEM = { to: '/admin/pesan', icon: MessageSquare, labelKey: 'admin.nav.pesan' }

const PENDING_DESTINATIONS = {
  '/admin/jemaat': { key: 'pendingUsers', labelKey: 'admin.pending.users', to: '/admin/jemaat?status=Menunggu+Persetujuan&pengingat=akun' },
  '/admin/events': { key: 'pendingEvents', labelKey: 'admin.pending.events', to: '/admin/events?pengingat=event' },
  '/admin/kelas': { key: 'pendingClasses', labelKey: 'admin.pending.classes', to: '/admin/kelas?pengingat=kelas' },
  '/admin/baptisan': { key: 'pendingBaptism', labelKey: 'admin.pending.baptism', to: '/admin/baptisan?status=Menunggu&pengingat=baptisan' },
  '/admin/nikah': { key: 'pendingWedding', labelKey: 'admin.pending.wedding', to: '/admin/nikah?status=Menunggu&pengingat=nikah' },
  '/admin/penyerahan-anak': { key: 'pendingDedication', labelKey: 'admin.pending.dedication', to: '/admin/penyerahan-anak?status=Menunggu&pengingat=penyerahan' },
  '/admin/ktj': { key: 'pendingKtj', labelKey: 'admin.pending.ktj', to: '/admin/ktj?status=Menunggu&pengingat=ktj' },
  '/admin/izin': { key: 'pendingLeaves', labelKey: 'admin.pending.leaves', to: '/admin/izin?status=Menunggu&pengingat=izin' },
  '/admin/persembahan': { key: 'pendingOfferings', labelKey: 'admin.pending.offerings', to: '/admin/persembahan?status=Menunggu&pengingat=persembahan' },
}

function getPendingDestination(baseTo, counts) {
  const destination = PENDING_DESTINATIONS[baseTo]
  if (!destination) return baseTo
  if (baseTo === '/admin/persembahan' && counts.pendingPersonalOfferings === 0 && counts.pendingKomselOfferings > 0) {
    return '/admin/persembahan?tab=komsel&status=Menunggu&pengingat=persembahan'
  }
  return destination.to
}

const GEMBALA_BLOCKED_ACTIONS = [
  'tambah', 'simpan', 'hapus', 'edit', 'setujui', 'tolak', 'kirim',
  'terbit', 'unggah', 'upload', 'buat', 'buka sesi', 'batalkan', 'nonaktifkan',
]

function buildMenu(isSuperAdmin, isGembala, allowedPages, scopedScheduleAccess = false) {
  const items = []

  // Dashboard sekarang jadi entri ADMIN_PAGES pertama (bisa dicabut Super
  // Admin). Filter yang sama berlaku untuknya.
  let lastSection = null
  for (const page of ADMIN_PAGES) {
    if (isGembala && page.to === '/admin/jadwal-pelayanan') continue
    if (!isSuperAdmin && !isGembala && allowedPages && !allowedPages.includes(page.to)
      && !(scopedScheduleAccess && page.to === '/admin/jadwal-pelayanan')) continue
    if (page.section !== lastSection) {
      items.push({ section: page.section, sectionKey: page.sectionKey })
      lastSection = page.section
    }
    // Dashboard butuh flag `exact` supaya NavLink tidak tetap aktif saat berada
    // di sub-halaman /admin/*.
    items.push(page.to === '/admin' ? { ...page, exact: true } : page)
  }

  if (isSuperAdmin || isGembala) {
    items.push({ section: 'Komunikasi', sectionKey: 'admin.sec.Komunikasi' })
    items.push(PESAN_ITEM)
  }

  if (isSuperAdmin) {
    items.push({ section: 'Sistem', sectionKey: 'admin.sec.Sistem' })
    items.push({ to: '/admin/tukar-poin', icon: Gift, labelKey: 'admin.nav.tukarPoin' })
    items.push({ to: '/admin/distribusi-poin', icon: Coins, labelKey: 'admin.nav.distribusiPoin' })
    items.push({ to: '/admin/hak-akses', icon: KeyRound, labelKey: 'admin.nav.hakAkses' })
    items.push({ to: '/admin/backup', icon: HardDrive, labelKey: 'admin.nav.backup' })
    items.push({ to: '/admin/audit', icon: ScrollText, labelKey: 'admin.nav.audit' })
  }

  return items
}

export default function AdminLayout({ children }) {
  const [open, setOpen] = useState(false)
  const [menuQuery, setMenuQuery] = useState('')
  const [pendingOpen, setPendingOpen] = useState(false)
  const pendingRef = useRef(null)
  useBackClose(open, () => setOpen(false)) // back menutup sidebar mobile dulu
  useBackClose(pendingOpen, () => setPendingOpen(false))
  const { profile, logout } = useAuth()
  const { toast, confirm } = useToast()
  const { t } = useLang()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    function closePending(event) {
      if (pendingRef.current && !pendingRef.current.contains(event.target)) setPendingOpen(false)
    }
    if (pendingOpen) document.addEventListener('mousedown', closePending)
    return () => document.removeEventListener('mousedown', closePending)
  }, [pendingOpen])

  useEffect(() => { setPendingOpen(false) }, [location.pathname])
  // Konfirmasi keluar saat back di dashboard admin (root panel). Bila akses
  // Dashboard dicabut, halaman ini tidak akan pernah tampil untuk admin ybs
  // (guard di bawah), jadi hook ini tetap aman didaftarkan.
  useExitConfirm(location.pathname === '/admin', () => toast.info(t('app.exitConfirm')))

  const isSuperAdmin = profile?.role === 'Super Admin'
  const isGembala = profile?.role === 'Gembala'
  const gembalaReadOnly = isGembala && location.pathname !== '/admin/pesan' && !location.pathname.startsWith('/admin/pesan/')
  const isAdminOnly = profile?.role === 'Admin'
  const isPKS = profile?.is_pks === true || profile?.role === 'PKS'
  const isVolunteerSecondary = profile?.role_secondary === 'Volunteer'
  const hasSecondaryAccess = isPKS || isVolunteerSecondary
  const [allowedPages, setAllowedPages] = useState(null)
  const [scopedScheduleAccess, setScopedScheduleAccess] = useState(false)
  const [scopedScheduleLoading, setScopedScheduleLoading] = useState(false)
  const [permError, setPermError] = useState(false)
  const [permRetry, setPermRetry] = useState(0)
  const [permLoading, setPermLoading] = useState(!isSuperAdmin && !isGembala)
  const [pendingCounts, setPendingCounts] = useState({
    pendingUsers: 0,
    pendingClasses: 0,
    pendingEvents: 0,
    pendingBaptism: 0,
    pendingWedding: 0,
    pendingDedication: 0,
    pendingKtj: 0,
    pendingLeaves: 0,
    pendingOfferings: 0,
    pendingPersonalOfferings: 0,
    pendingKomselOfferings: 0,
  })

  useEffect(() => {
    if (!profile?.role) return undefined
    let active = true
    const load = () => {
      notificationService.getAdminPendingCounts(profile.role)
        .then(counts => { if (active) setPendingCounts(counts) })
        .catch(console.error)
    }
    load()
    window.addEventListener('focus', load)
    window.addEventListener('admin-pending-changed', load)
    return () => {
      active = false
      window.removeEventListener('focus', load)
      window.removeEventListener('admin-pending-changed', load)
    }
  }, [profile?.role])

  useEffect(() => {
    let active = true
    let inFlight = false
    setPermError(false)
    if (isSuperAdmin || isGembala || !profile?.user_id) { setPermLoading(false); return }
    setPermLoading(true)
    const refresh = async () => {
      if (!active || inFlight || document.visibilityState !== 'visible') return
      inFlight = true
      try {
        const pages = await permissionsService.getMyPermissions(profile.user_id)
        if (active) { setAllowedPages(pages); setPermError(false) }
      } catch {
        // Gagal memuat izin harus menutup halaman, termasuk saat pemeriksaan ulang.
        if (active) { setAllowedPages([]); setPermError(true) }
      } finally {
        inFlight = false
        if (active) setPermLoading(false)
      }
    }
    refresh()
    const onVisible = () => { refresh() }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(refresh, 15000)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [isSuperAdmin, isGembala, profile?.user_id, permRetry])

  useEffect(() => {
    if (!isAdminOnly || !profile?.user_id) { setScopedScheduleAccess(false); return undefined }
    let active = true
    setScopedScheduleLoading(true)
    serviceRosterService.listManagedMinistries(profile)
      .then(rows => { if (active) setScopedScheduleAccess(rows.some(row => row.manager_role === 'Ministry Head')) })
      .catch(() => { if (active) setScopedScheduleAccess(false) })
      .finally(() => { if (active) setScopedScheduleLoading(false) })
    return () => { active = false }
  }, [isAdminOnly, profile?.user_id, permRetry])

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

  function handleReadOnlyCapture(event) {
    if (!gembalaReadOnly) return
    const target = event.target?.closest?.('button, a, input, textarea, select, [role="button"]')
    if (!target) return
    if (target.closest('[data-readonly-allow]')) return

    const tag = target.tagName?.toLowerCase()
    const text = (target.textContent || target.getAttribute('aria-label') || target.getAttribute('title') || '').trim().toLowerCase()
    const href = target.getAttribute?.('href') || ''
    const isWriteLink = /\/(baru|edit)(\/|$)/.test(href)
    const isWriteButton = tag === 'button' && GEMBALA_BLOCKED_ACTIONS.some(word => text.includes(word))
    const isFormSubmit = event.type === 'submit'

    if (!isWriteLink && !isWriteButton && !isFormSubmit) return
    event.preventDefault()
    event.stopPropagation()
    toast.info('Mode Gembala hanya baca. Input tetap tersedia di menu Pesan Gembala.')
  }

  if (permLoading || scopedScheduleLoading) return (
    <div className="flex items-center justify-center h-screen">
      <Spinner size="lg" />
    </div>
  )

  const noAllowedPages = !isSuperAdmin && !isGembala && Array.isArray(allowedPages) && allowedPages.length === 0 && !scopedScheduleAccess
  // Admin murni tanpa halaman tidak diarahkan ke '/' karena rute itu kembali ke '/admin'.
  if (permError || noAllowedPages) return (
    <main className="min-h-svh bg-gray-50 flex items-center justify-center p-6">
      <div role="alert" className="max-w-md bg-surface border border-gray-200 rounded-2xl p-6 space-y-4">
        <h1 className="text-xl font-bold text-gray-900">{t(permError ? 'aperm.loadFailedTitle' : 'aperm.noPagesTitle')}</h1>
        <p className="text-gray-600">{t(permError ? 'aperm.loadFailedDesc' : 'aperm.noPagesDesc')}</p>
        <div className="flex flex-wrap gap-3">
          <Button className="min-h-11" onClick={() => setPermRetry(value => value + 1)}>{t('quality.retry')}</Button>
          {hasSecondaryAccess && <Button className="min-h-11" variant="outline" onClick={() => navigate('/')}>{t('admin.switchApp')}</Button>}
          <Button className="min-h-11" variant="outline" onClick={handleLogout}>{t('admin.logout')}</Button>
        </div>
      </div>
    </main>
  )

  // Tentukan tujuan fallback ketika Admin mencoba masuk halaman yang tidak
  // diizinkan. Prioritas: Dashboard jika masih diizinkan, kalau tidak ambil
  // halaman pertama yang diizinkan. Izin kosong ditangani oleh pesan di atas.
  function fallbackPath() {
    if (isSuperAdmin) return '/admin'
    if (!allowedPages || allowedPages.includes('/admin')) return '/admin'
    const first = ADMIN_PAGES.find(p => allowedPages.includes(p.to))
    return first ? first.to : scopedScheduleAccess ? '/admin/jadwal-pelayanan' : '/'
  }

  // Halaman bagian Sistem khusus Super Admin (Hak Akses, Kategori Tugas,
  // Backup, Audit, Tukar Poin, Distribusi Poin). Gembala boleh seluruh
  // halaman admin lain, tetapi tetap tidak masuk bagian Sistem.
  if (['/admin/hak-akses', '/admin/backup', '/admin/audit', '/admin/tukar-poin', '/admin/distribusi-poin'].includes(location.pathname) && !isSuperAdmin) {
    return <Navigate to={fallbackPath()} replace />
  }

  // Batasi akses Admin ke halaman yang belum diizinkan Super Admin — termasuk
  // Dashboard '/admin' itu sendiri (sekarang bagian dari ADMIN_PAGES).
  // Gembala dikecualikan: aksesnya sudah diatur GEMBALA_ALLOWED di atas.
  if (!isSuperAdmin && !isGembala && allowedPages) {
    const page = matchAdminPage(location.pathname)
    if (page && !allowedPages.includes(page.to) && !(scopedScheduleAccess && page.to === '/admin/jadwal-pelayanan')) {
      return <Navigate to={fallbackPath()} replace />
    }
  }

  const MENU = buildMenu(isSuperAdmin, isGembala, allowedPages, scopedScheduleAccess)
  const normalizedMenuQuery = menuQuery.trim().toLocaleLowerCase()
  const visibleMenu = normalizedMenuQuery ? MENU.filter(item => item.to
    && t(item.labelKey).toLocaleLowerCase().includes(normalizedMenuQuery)) : MENU
  const currentMenuItem = MENU.filter(item => item.to)
    .sort((a, b) => b.to.length - a.to.length)
    .find(item => location.pathname === item.to || location.pathname.startsWith(item.to + '/'))
  const visiblePendingItems = MENU
    .filter(item => item.to && PENDING_DESTINATIONS[item.to])
    .map(item => ({
      ...PENDING_DESTINATIONS[item.to],
      to: getPendingDestination(item.to, pendingCounts),
      count: pendingCounts[PENDING_DESTINATIONS[item.to].key] || 0,
      label: t(PENDING_DESTINATIONS[item.to].labelKey),
      icon: item.icon,
    }))
    .filter(item => item.count > 0)
  const pendingTotal = visiblePendingItems.reduce((total, item) => total + item.count, 0)

  return (
    <div className="admin-shell flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className={`
        admin-sidebar fixed inset-y-0 left-0 z-40 w-64
        flex flex-col transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:flex
      `}>
        {/* Logo */}
        <div className="admin-brand">
          <div className="flex items-center gap-3">
            <img src="/icons/icon-192.png" alt="" className="admin-brand-mark" />
            <div className="flex-1 min-w-0">
              <p className="admin-brand-name">ESC Siantan</p>
              <p className="admin-brand-caption">{t('admin.panel')}</p>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Panel switcher */}
        {(!isAdminOnly || hasSecondaryAccess) && (
          <div className="admin-app-switch">
            <NavLink to="/" className="admin-app-link" onClick={() => setOpen(false)}>
              <Smartphone size={17} strokeWidth={1.8} />
              {t('admin.switchApp')}
            </NavLink>
          </div>
        )}

        <div className="admin-menu-search">
          <Input icon={Search} type="search" value={menuQuery}
            aria-label={t('admin.searchMenu')} placeholder={t('admin.searchMenu')}
            onChange={event => setMenuQuery(event.target.value)} />
        </div>

        {/* Navigation */}
        <nav aria-label={t('admin.navigation')} className="admin-nav flex-1 overflow-y-auto">
          {visibleMenu.map((item, i) => {
            if (!item.to) return (
              <p key={i} className="admin-nav-section">
                {item.sectionKey ? t(item.sectionKey) : item.section}
              </p>
            )
            const { to, icon: Icon, labelKey, label, exact } = item
            const pendingDestination = PENDING_DESTINATIONS[to]
            const badge = pendingDestination ? (pendingCounts[pendingDestination.key] || 0) : 0
            const reminderTo = badge > 0 ? getPendingDestination(to, pendingCounts) : to

            return (
              <NavLink key={to} to={reminderTo} end={exact}
                onClick={() => { setOpen(false); setMenuQuery('') }}
                className={({ isActive }) =>
                  `admin-nav-link${isActive ? ' is-active' : ''}`
                }
              >
                {() => (
                  <>
                    <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                    <span className="flex-1">{labelKey ? t(labelKey) : label}</span>
                    {badge > 0 && (
                      <span className="admin-nav-badge">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            )
          })}
          {visibleMenu.length === 0 && <p className="admin-nav-empty">{t('admin.noMenuResults')}</p>}
        </nav>

        {/* User & logout */}
        <div className="admin-sidebar-footer">
          <div className="admin-user">
            <div className="admin-user-avatar">
              {profile?.name?.slice(0, 2).toUpperCase() || 'AD'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="admin-user-name truncate">{profile?.name || 'Admin'}</p>
              <p className="admin-user-role">{profile?.role}</p>
            </div>
          </div>
          <Button variant="ghost" onClick={handleLogout} className="admin-logout w-full justify-start">
            <LogOut size={17} />
            {t('admin.logout')}
          </Button>
        </div>
      </aside>

      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0" onClickCapture={handleReadOnlyCapture} onSubmitCapture={handleReadOnlyCapture}>
        {/* Top bar mobile */}
        <header className="admin-mobile-bar lg:hidden px-4 pb-3 flex items-center gap-3 sticky top-0 z-20" style={{paddingTop: 'calc(var(--safe-top, 28px) + 0.75rem)'}}>
          <Button variant="ghost" onClick={() => setOpen(true)} aria-label={t('admin.openMenu')} className="admin-icon-button">
            <Menu size={22} />
          </Button>
          <span className="admin-mobile-title flex-1 truncate">{currentMenuItem?.labelKey ? t(currentMenuItem.labelKey) : t('admin.appShort')}</span>
          <div className="contents" ref={pendingRef}>
            <button
              type="button"
              onClick={() => setPendingOpen(value => !value)}
              aria-label={pendingTotal > 0 ? t('admin.pendingWork', { count: pendingTotal }) : t('admin.noPendingWork')}
              aria-expanded={pendingOpen}
              aria-controls="admin-pending-menu"
              className="relative flex min-h-11 min-w-11 items-center justify-center rounded-xl text-gray-500 hover:bg-control"
            >
              <Bell size={20} />
              {pendingTotal > 0 && (
                <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-red-500 px-1 text-center text-[9px] font-bold leading-4 text-white">
                  {pendingTotal > 99 ? '99+' : pendingTotal}
                </span>
              )}
            </button>
            {pendingOpen && (
              <section
                id="admin-pending-menu"
                role="region"
                aria-labelledby="admin-pending-menu-title"
                className="absolute left-4 right-4 top-[calc(100%+0.5rem)] max-h-[min(28rem,calc(100vh-7rem))] overflow-y-auto rounded-2xl border border-gray-200 bg-surface ambient-shadow"
              >
                <div className="sticky top-0 flex items-start gap-3 border-b border-gray-100 bg-surface px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <h2 id="admin-pending-menu-title" className="text-sm font-semibold text-gray-900">{t('admin.pendingTitle')}</h2>
                    <p className="mt-0.5 text-xs text-gray-500">{t('admin.pendingSummary', { count: pendingTotal })}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingOpen(false)}
                    aria-label={t('admin.closePending')}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-gray-500 hover:bg-control"
                  >
                    <X size={18} />
                  </button>
                </div>
                <AdminPendingList items={visiblePendingItems} onSelect={() => setPendingOpen(false)} />
              </section>
            )}
          </div>
          <ThemeToggle />
        </header>

        <main className="admin-main flex-1 p-4 lg:p-7 overflow-y-auto">
          {children || <Outlet context={{ pendingItems: visiblePendingItems, pendingTotal }} />}
        </main>
      </div>
    </div>
  )
}
