import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { Home, Newspaper, ClipboardList, User, ScanLine } from 'lucide-react'

// Item kiri & kanan; tombol Scan disisipkan menonjol di tengah.
const LEFT_ITEMS = [
  { to: '/',          icon: Home,      label: 'Beranda', exact: true },
  { to: '/informasi', icon: Newspaper, label: 'Info' },
]
const RIGHT_ITEMS = [
  { to: '/tugas',     icon: ClipboardList, label: 'Tugas' },
  { to: '/profil',    icon: User,          label: 'Profil' },
]

function NavItem({ to, icon: Icon, label, exact }) {
  const location = useLocation()
  const active = exact ? location.pathname === to : location.pathname.startsWith(to)
  return (
    <NavLink to={to} className="flex-1 flex flex-col items-center gap-0.5 py-2 px-1">
      <Icon size={22} className={active ? 'text-brand-500' : 'text-gray-400'} strokeWidth={active ? 2 : 1.5} />
      <span className={`text-[10px] font-medium ${active ? 'text-brand-500' : 'text-gray-400'}`}>{label}</span>
    </NavLink>
  )
}

export default function UserLayout() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative">
      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-surface border-t border-gray-100 z-50">
        <div className="flex items-end">
          {LEFT_ITEMS.map(item => <NavItem key={item.to} {...item} />)}

          {/* Tombol Scan menonjol di tengah */}
          <div className="flex-1 flex justify-center">
            <NavLink
              to="/scan"
              aria-label="Scan QR Absensi"
              className="-mt-6 w-14 h-14 rounded-full gradient-main text-white flex items-center justify-center shadow-lg ambient-shadow active:scale-95 transition-transform border-4 border-surface"
            >
              <ScanLine size={24} />
            </NavLink>
          </div>

          {RIGHT_ITEMS.map(item => <NavItem key={item.to} {...item} />)}
        </div>
      </nav>
    </div>
  )
}
