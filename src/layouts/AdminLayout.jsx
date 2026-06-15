import { Outlet, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, LogOut, ChevronRight, Smartphone, ShieldCheck, Menu, X, KeyRound
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { ThemeToggle, Spinner } from '@/components/ui'
import { permissionsService } from '@/services/permissionsService'
import { ADMIN_PAGES, matchAdminPage } from '@/config/adminPages'

function buildMenu(isSuperAdmin, allowedPages) {
  const items = [
    { section: 'Utama' },
    { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  ]

  let lastSection = 'Utama'
  for (const page of ADMIN_PAGES) {
    if (!isSuperAdmin && allowedPages && !allowedPages.includes(page.to)) continue
    if (page.section !== lastSection) {
      items.push({ section: page.section })
      lastSection = page.section
    }
    items.push(page)
  }

  if (isSuperAdmin) {
    items.push({ section: 'Sistem' })
    items.push({ to: '/admin/hak-akses', icon: KeyRound, label: 'Hak Akses' })
  }

  return items
}

export default function AdminLayout() {
  const [open, setOpen] = useState(false)
  const { profile, logout } = useAuth()
  const { confirm } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const isSuperAdmin = profile?.role === 'Super Admin'
  const isAdminOnly = profile?.role === 'Admin'
  const isPKS = profile?.is_pks === true || profile?.role === 'PKS'
  const [allowedPages, setAllowedPages] = useState(null)
  const [permLoading, setPermLoading] = useState(!isSuperAdmin)

  useEffect(() => {
    if (isSuperAdmin) { setPermLoading(false); return }
    setPermLoading(true)
    permissionsService.getAdminPermissions()
      .then(setAllowedPages)
      .catch(() => setAllowedPages(null))
      .finally(() => setPermLoading(false))
  }, [isSuperAdmin])

  async function handleLogout() {
    const ok = await confirm({
      title: 'Keluar dari akun?',
      message: 'Anda akan keluar dari panel admin dan perlu masuk kembali.',
      confirmText: 'Keluar',
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

  // Halaman Hak Akses khusus Super Admin
  if (location.pathname === '/admin/hak-akses' && !isSuperAdmin) {
    return <Navigate to="/admin" replace />
  }

  // Batasi akses Admin ke halaman yang belum diizinkan Super Admin
  if (!isSuperAdmin && allowedPages) {
    const page = matchAdminPage(location.pathname)
    if (page && !allowedPages.includes(page.to)) {
      return <Navigate to="/admin" replace />
    }
  }

  const MENU = buildMenu(isSuperAdmin, allowedPages)

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar desktop */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-60 bg-surface border-r border-gray-100
        flex flex-col transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:flex
      `}>
        {/* Logo */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl gradient-main flex items-center justify-center">
              <span className="text-white text-sm font-bold">ES</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">ESC Siantan</p>
              <p className="text-xs text-gray-500">Admin Panel</p>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Panel switcher */}
        {(!isAdminOnly || isPKS) && (
          <div className="p-3 border-b border-gray-100">
            <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
              <NavLink
                to={isAdminOnly ? '/pks' : '/'}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Smartphone size={14} strokeWidth={1.5} />
                {isAdminOnly ? 'Panel PKS' : 'Aplikasi'}
              </NavLink>
              <span className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold bg-surface text-orange-600 shadow-sm">
                <ShieldCheck size={14} strokeWidth={2} />
                Admin
              </span>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {MENU.map((item, i) => {
            if (!item.to) return (
              <p key={i} className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 pt-4 pb-1">
                {item.section}
              </p>
            )
            const { to, icon: Icon, label, exact } = item
            return (
              <NavLink key={to} to={to} end={exact}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${isActive
                    ? 'bg-orange-50 text-orange-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={17} strokeWidth={isActive ? 2 : 1.5} />
                    <span className="flex-1">{label}</span>
                    {isActive && <ChevronRight size={14} />}
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
            Keluar
          </button>
        </div>
      </aside>

      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar mobile */}
        <header className="lg:hidden bg-surface border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
          <button onClick={() => setOpen(true)} className="p-1 text-gray-500">
            <Menu size={22} />
          </button>
          <span className="font-semibold text-gray-900 text-sm flex-1">ESC Admin</span>
          <ThemeToggle />
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
