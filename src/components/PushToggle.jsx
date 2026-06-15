import { useEffect, useState } from 'react'
import { BellRing } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { pushService } from '@/services/pushService'
import { Card } from '@/components/ui'

export default function PushToggle() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [supported] = useState(() => pushService.supported())
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supported) return
    pushService.isSubscribed().then(setSubscribed).catch(() => {})
  }, [supported])

  async function toggle() {
    if (busy || !profile) return
    setBusy(true)
    try {
      if (subscribed) {
        await pushService.unsubscribe()
        setSubscribed(false)
        toast.success('Notifikasi push dinonaktifkan.')
      } else {
        await pushService.subscribe(profile.user_id)
        setSubscribed(true)
        toast.success('Notifikasi push diaktifkan di perangkat ini.')
      }
    } catch (err) {
      toast.error(err.message || 'Gagal mengubah pengaturan notifikasi.')
    } finally {
      setBusy(false)
    }
  }

  // iOS Safari hanya mendukung push bila app di-install ke Home Screen.
  if (!supported) {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone
    if (isIOS && !standalone) {
      return (
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
              <BellRing size={15} className="text-brand-500" />
            </div>
            <div>
              <p className="text-sm text-gray-800 font-medium">Notifikasi Push</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Di iPhone, tambahkan app ke <span className="font-medium">Layar Utama</span> dulu
                (Bagikan → Tambah ke Layar Utama), lalu buka dari sana untuk mengaktifkan notifikasi.
              </p>
            </div>
          </div>
        </Card>
      )
    }
    return null
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
            <BellRing size={15} className="text-brand-500" />
          </div>
          <div>
            <p className="text-sm text-gray-800 font-medium">Notifikasi Push</p>
            <p className="text-xs text-gray-400">{subscribed ? 'Aktif di perangkat ini' : 'Nonaktif'}</p>
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          role="switch"
          aria-checked={subscribed}
          aria-label="Aktifkan notifikasi push"
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${subscribed ? 'bg-brand-500' : 'bg-gray-200'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${subscribed ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
    </Card>
  )
}
