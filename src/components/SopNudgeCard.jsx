import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, X, ChevronRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { tasksService } from '@/services/tasksService'

const DISMISS_KEY = 'esc-sop-nudge-dismissed'

// Alert modal di Beranda: muncul sekali per sesi bila jemaat masih punya tugas
// yang belum dituntaskan minggu/bulan ini. Nada positif — bukan galak.
// Overlay + dialog di tengah layar, tombol tutup + link ke tiap tugas.
export default function SopNudgeCard() {
  const { profile } = useAuth()
  const { t } = useLang()
  const [incomplete, setIncomplete] = useState([])
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })
  const [loaded, setLoaded] = useState(false)

  // Hanya munculkan pengingat di hari JUMAT & SABTU (menjelang & saat akhir
  // pekan pelayanan) — di luar itu tidak mengganggu. getDay(): 5=Jumat, 6=Sabtu
  // (waktu lokal perangkat ≈ WIB untuk jemaat setempat; cukup untuk nudge).
  const day = new Date().getDay()
  const isReminderDay = day === 5 || day === 6

  useEffect(() => {
    if (!profile?.user_id || dismissed || !isReminderDay) return
    tasksService.getIncompleteSopSummary(profile)
      .then(setIncomplete)
      .catch(() => setIncomplete([]))
      .finally(() => setLoaded(true))
  }, [profile, dismissed, isReminderDay])

  function handleDismiss() {
    setDismissed(true)
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch {}
  }

  if (dismissed || !loaded || !isReminderDay || incomplete.length === 0) return null

  return (
    <div
      role="dialog" aria-modal="true"
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={handleDismiss}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-surface rounded-2xl shadow-xl border border-amber-100 max-h-[85vh] overflow-y-auto animate-fade-in-up"
      >
        <div className="p-5 relative">
          <button
            onClick={handleDismiss} aria-label={t('sop.nudge.dismiss')}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
          >
            <X size={16} />
          </button>

          <div className="flex flex-col items-center text-center mb-4">
            <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mb-3">
              <AlertTriangle size={26} className="text-amber-600" />
            </div>
            <p className="text-base font-bold text-gray-900">{t('sop.nudge.title')}</p>
            <p className="text-xs text-gray-500 mt-1 px-2">{t('sop.nudge.subtitle')}</p>
          </div>

          <div className="space-y-2">
            {incomplete.slice(0, 5).map(item => (
              <Link
                key={item.formId} to={`/tugas/${item.formId}`}
                onClick={handleDismiss}
                className="flex items-center gap-3 bg-amber-50/60 border border-amber-100 rounded-xl px-3 py-2.5 hover:bg-amber-50 transition"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.formTitle}</p>
                  <p className="text-xs text-amber-600 font-medium">
                    {t('sop.nudge.progress', { done: item.completed, target: item.goal })}
                  </p>
                </div>
                <ChevronRight size={16} className="text-amber-400" />
              </Link>
            ))}
            {incomplete.length > 5 && (
              <Link
                to="/tugas" onClick={handleDismiss}
                className="block text-xs text-center text-brand-500 font-medium pt-1"
              >
                {t('sop.nudge.viewAll', { n: incomplete.length })}
              </Link>
            )}
          </div>

          <button
            onClick={handleDismiss}
            className="w-full mt-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-700 transition"
          >
            {t('sop.nudge.later') || 'Nanti saja'}
          </button>
        </div>
      </div>
    </div>
  )
}
