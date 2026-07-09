import { useState } from 'react'
import { RefreshCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { Button } from '@/components/ui'

export default function AccountStatusPage() {
  const { profile, logout, refreshProfile } = useAuth()
  const { confirm, toast } = useToast()
  const { t } = useLang()
  const navigate = useNavigate()
  const [refreshing, setRefreshing] = useState(false)
  const isPending = profile?.status === 'Menunggu Persetujuan'

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await refreshProfile()
      toast.success('Status diperbarui')
    } catch {
      toast.error('Gagal memperbarui status')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleLogout() {
    const ok = await confirm({
      title: t('account.logoutTitle'),
      message: t('account.logoutMessage'),
      confirmText: t('account.logout'),
      danger: true,
    })
    if (!ok) return
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center items-center px-4 py-10">
      <div className="w-full max-w-md bg-surface rounded-3xl shadow-2xl shadow-black/10 p-8 text-center">
        <div className="w-16 h-16 mx-auto bg-brand-50 rounded-2xl flex items-center justify-center mb-4">
          <span className="text-3xl">{isPending ? '⏳' : '🚫'}</span>
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">
          {isPending ? t('account.pendingTitle') : t('account.disabledTitle')}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {isPending
            ? t('account.pendingDesc', { name: profile?.name ? `"${profile.name}" ` : '' })
            : t('account.disabledDesc')}
        </p>
        <div className="space-y-3">
          {isPending && (
            <Button className="w-full" onClick={handleRefresh} loading={refreshing}>
              <RefreshCcw size={15} /> Refresh Status
            </Button>
          )}
          <Button variant="outline" className="w-full" onClick={handleLogout}>{t('account.logout')}</Button>
        </div>
      </div>
    </div>
  )
}
