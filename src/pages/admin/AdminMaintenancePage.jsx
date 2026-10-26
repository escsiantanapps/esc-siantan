import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Wrench, RefreshCw } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { useMaintenance } from '@/hooks/useMaintenance'
import { Badge, Button, Card, PageHeader } from '@/components/ui'

export default function AdminMaintenancePage() {
  const { profile } = useAuth()
  const { t } = useLang()
  const { enabled, checkError, refresh, setMode } = useMaintenance()
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (profile?.role !== 'Super Admin') return <Navigate to="/admin" replace />

  async function changeMode(next) {
    setSaving(true)
    setError('')
    try {
      await setMode(next)
      setConfirming(false)
    } catch {
      setError(t('maintenance.saveError'))
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('maintenance.adminTitle')} subtitle={t('maintenance.adminSubtitle')} />
      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-50 text-brand-500 flex items-center justify-center shrink-0">
            <Wrench size={24} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-bold text-gray-900">{t('maintenance.modeTitle')}</h2>
              <Badge color={enabled === null ? 'gray' : enabled ? 'amber' : 'green'}>
                {t(enabled === null ? 'maintenance.unknown' : enabled ? 'maintenance.active' : 'maintenance.inactive')}
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">{t('maintenance.adminDescription')}</p>
          </div>
        </div>

        {checkError && <p className="mt-5 text-sm text-red-700" role="alert">{t('maintenance.statusError')}</p>}
        {error && <p className="mt-5 text-sm text-red-700" role="alert">{error}</p>}

        <div className="mt-6 flex flex-wrap gap-3">
          {enabled ? (
            <Button size="lg" className="min-h-11" loading={saving} onClick={() => changeMode(false)}>
              {t('maintenance.disable')}
            </Button>
          ) : confirming ? (
            <>
              <p className="w-full text-sm font-medium text-amber-700">{t('maintenance.confirmWarning')}</p>
              <Button size="lg" variant="danger" className="min-h-11" loading={saving} onClick={() => changeMode(true)}>
                {t('maintenance.confirmEnable')}
              </Button>
              <Button size="lg" variant="secondary" className="min-h-11" onClick={() => setConfirming(false)}>
                {t('common.cancel')}
              </Button>
            </>
          ) : (
            <Button size="lg" variant="danger" className="min-h-11" disabled={enabled === null || checkError} onClick={() => setConfirming(true)}>
              {t('maintenance.enable')}
            </Button>
          )}
          <Button size="lg" variant="secondary" className="min-h-11" onClick={refresh} disabled={saving}>
            <RefreshCw size={18} aria-hidden="true" /> {t('maintenance.checkAgain')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
