import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Calendar, Newspaper, BookOpen,
  ClipboardList, Droplets, Heart, AlertTriangle,
  Layers, Network, LogOut, ChevronRight, Menu, X
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'

const MENU = [
  { section: 'Utama' },
  { to: '/admin',             icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/admin/jemaat',      icon: Users,           label: 'Jemaat' },
  { section: 'Konten' },
  { to: '/admin/berita',      icon: Newspaper,       label: 'Berita & Info' },
  { to: '/admin/events',      icon: Calendar,        label: 'Events' },
  { to: '/admin/kelas',       icon: BookOpen,        label: 'Kelas' },
  { section: 'Pelayanan' },
  { to: '/admin/tugas',       icon: ClipboardList,   label: 'Tugas & Form' },
  { to: '/admin/baptisan',    icon: Droplets,        label: 'Baptisan' },
  { to: '/admin/nikah',       icon: Heart,           label: 'Pemberkatan Nikah' },
  { section: 'Organisasi' },
  { to: '/admin/sp',          icon: AlertTriangle,   label: 'Surat Peringatan' },
  { to: '/admin/ministry',    icon: Layers,          label: 'Ministry' },
  { to: '/admin/komsel',      icon: Network,         label: 'Komsel' },
]

export default function AdminLayout() {
  const [open, setOpen] = useState(false)
  const { profile, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar desktop */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-60 bg-white border-r border-gray-100
        flex flex-col transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:flex
      `}>
        {/* Logo */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl gradient-main flex items-center justify-center">
              <span className="text-white text-sm font-bold">GK</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">GerejaKu</p>
              <p className="text-xs text-gray-500">Admin Panel</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {MENU.map((item, i) => {
            if (item.section) return (
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
        <header className="lg:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
          <button onClick={() => setOpen(true)} className="p-1 text-gray-500">
            <Menu size={22} />
          </button>
          <span className="font-semibold text-gray-900 text-sm">ESC Admin</span>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
