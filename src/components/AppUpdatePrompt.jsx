import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useLang } from '@/hooks/useLang'
import { Button } from '@/components/ui'

export default function AppUpdatePrompt() {
  const { t } = useLang()
  const [snoozed, setSnoozed] = useState(false)
  const [updating, setUpdating] = useState(false)
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()

  useEffect(() => {
    if (!snoozed) return undefined
    const timer = window.setTimeout(() => setSnoozed(false), 10 * 60_000)
    return () => window.clearTimeout(timer)
  }, [snoozed])

  if (!needRefresh || snoozed) return null

  async function applyUpdate() {
    setUpdating(true)
    try { await updateServiceWorker(true) }
    catch { setUpdating(false) }
  }

  return <div className="fixed inset-x-3 top-[calc(var(--safe-top,0px)+0.75rem)] z-[70] mx-auto max-w-md rounded-2xl border border-gray-200 bg-card p-3 text-gray-900" role="status" aria-live="polite">
    <div className="flex items-start gap-3">
      <RefreshCw size={20} className="mt-0.5 shrink-0 text-brand-500" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t('appUpdate.title')}</p>
        <p className="mt-1 text-xs text-gray-600">{t('appUpdate.description')}</p>
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={applyUpdate} loading={updating}>{t('appUpdate.apply')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setSnoozed(true)}>{t('appUpdate.later')}</Button>
        </div>
      </div>
    </div>
  </div>
}
