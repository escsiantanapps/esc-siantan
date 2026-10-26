import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LogIn, LogOut, RefreshCw, Wrench } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { useMaintenance } from '@/hooks/useMaintenance'
import { Button, Card, ThemeToggle } from '@/components/ui'
import SheepLoader from '@/components/SheepLoader'

export default function MaintenanceGate({ children }) {
  const { user, profile, loading, logout } = useAuth()
  const { enabled, checkError, refresh } = useMaintenance()
  const { t } = useLang()
  const location = useLocation()
  const navigate = useNavigate()
  const [retrying, setRetrying] = useState(false)

  const isSuperAdmin = user && profile?.role === 'Super Admin' && profile?.status === 'Aktif'
  if (loading) return <SheepLoader fullScreen size="xl" />
  // Login harus tetap terbuka agar Super Admin yang keluar dapat mematikan mode.
  if (isSuperAdmin || (!user && location.pathname === '/login')) return children
  if (enabled === false) return children
  if (enabled === null && !checkError) return <SheepLoader fullScreen size="xl" />

  const unavailable = enabled === null
  async function retry() {
    setRetrying(true)
    try { await refresh() } finally { setRetrying(false) }
  }

  return (
    <main className="min-h-svh bg-gray-50 px-4 py-8 flex flex-col items-center justify-center">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2.5 font-display font-bold text-gray-900">
            <img src="/icons/esc-mark.svg" width="32" height="32" alt="" />
            <span>ESC Siantan</span>
          </div>
          <ThemeToggle />
        </div>
        <Card className="p-6 sm:p-8 text-center">
          <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-brand-50 text-brand-500 flex items-center justify-center">
            <Wrench size={30} aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-bold text-gray-900">
            {t(unavailable ? 'maintenance.unavailableTitle' : 'maintenance.title')}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-gray-600">
            {t(unavailable ? 'maintenance.unavailableDesc' : 'maintenance.description')}
          </p>
          <div className="mt-7 flex flex-col gap-3">
            <Button size="lg" className="w-full min-h-11" onClick={retry} loading={retrying}>
              <RefreshCw size={18} aria-hidden="true" /> {t('maintenance.checkAgain')}
            </Button>
            {user ? (
              <Button size="lg" variant="secondary" className="w-full min-h-11" onClick={logout}>
                <LogOut size={18} aria-hidden="true" /> {t('maintenance.signOut')}
              </Button>
            ) : (
              <Button size="lg" variant="secondary" className="w-full min-h-11" onClick={() => navigate('/login')}>
                <LogIn size={18} aria-hidden="true" /> {t('maintenance.adminLogin')}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </main>
  )
}
