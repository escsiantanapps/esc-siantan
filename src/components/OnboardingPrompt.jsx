import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus, BellRing, ChevronRight, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { pushService } from '@/services/pushService'
import { Card } from '@/components/ui'

// Field penting yang sebaiknya dilengkapi akun baru.
const REQUIRED = ['phone', 'gender', 'birth_date', 'address']

// Kartu panduan untuk akun baru: lengkapi data & aktifkan notifikasi push.
// Otomatis hilang bila profil sudah lengkap dan push sudah aktif.
export default function OnboardingPrompt() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const { t } = useLang()
  const [pushSupported] = useState(() => pushService.supported())
  const [subscribed, setSubscribed] = useState(true) // anggap aktif sampai dicek (hindari kedip)
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (pushSupported) pushService.isSubscribed().then(setSubscribed).catch(() => setSubscribed(false))
    else setSubscribed(true)
  }, [pushSupported])

  if (!profile || dismissed) return null
  const needData = REQUIRED.some(k => !profile[k])
  const needPush = pushSupported && !subscribed
  if (!needData && !needPush) return null

  async function enablePush() {
    setBusy(true)
    try {
      await pushService.subscribe(profile.user_id)
      setSubscribed(true)
      toast.success(t('onb.pushOk'))
    } catch (err) {
      toast.error(err.message || t('onb.pushFail'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4 mb-5 border-brand-200 bg-brand-50/60 relative animate-fade-in-up">
      <button onClick={() => setDismissed(true)} aria-label="Tutup" className="absolute top-2.5 right-2.5 text-gray-300 hover:text-gray-500">
        <X size={15} />
      </button>
      <p className="text-sm font-semibold text-gray-900 mb-2.5">{t('onb.title')}</p>
      <div className="space-y-2">
        {needData && (
          <Link to="/profil/edit" className="flex items-center gap-3 bg-surface rounded-xl px-3 py-2.5 hover:shadow-sm transition">
            <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center shrink-0"><UserPlus size={15} className="text-brand-600" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{t('onb.completeData')}</p>
              <p className="text-xs text-gray-400">{t('onb.completeDataSub')}</p>
            </div>
            <ChevronRight size={16} className="text-gray-300" />
          </Link>
        )}
        {needPush && (
          <button onClick={enablePush} disabled={busy} className="w-full text-left flex items-center gap-3 bg-surface rounded-xl px-3 py-2.5 hover:shadow-sm transition disabled:opacity-50">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0"><BellRing size={15} className="text-amber-600" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{t('onb.enablePush')}</p>
              <p className="text-xs text-gray-400">{t('onb.enablePushSub')}</p>
            </div>
            <span className="text-xs font-semibold text-amber-600 shrink-0">{busy ? '…' : t('onb.activate')}</span>
          </button>
        )}
      </div>
    </Card>
  )
}
