import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { Home, Newspaper, Calendar, BookOpen, ClipboardList, User } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/',          icon: Home,          label: 'Beranda',  exact: true },
  { to: '/informasi', icon: Newspaper,     label: 'Info' },
  { to: '/events',    icon: Calendar,      label: 'Events' },
  { to: '/kelas',     icon: BookOpen,      label: 'Kelas' },
  { to: '/tugas',     icon: ClipboardList, label: 'Tugas' },
  { to: '/profil',    icon: User,          label: 'Profil' },
]

export default function UserLayout() {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative">
      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-surface border-t border-gray-100 z-50">
        <div className="flex">
          {NAV_ITEMS.map(({ to, icon: Icon, label, exact }) => {
            const active = exact ? location.pathname === to : location.pathname.startsWith(to)
            return (
              <NavLink key={to} to={to}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 px-1"
              >
                <Icon
                  size={22}
                  className={active ? 'text-brand-500' : 'text-gray-400'}
                  strokeWidth={active ? 2 : 1.5}
                />
                <span className={`text-[10px] font-medium ${active ? 'text-brand-500' : 'text-gray-400'}`}>
                  {label}
                </span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
