import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, X, ChevronRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { tasksService } from '@/services/tasksService'
import { Card } from '@/components/ui'

const DISMISS_KEY = 'esc-sop-nudge-dismissed'

// Kartu ramah di Beranda yang mengingatkan jemaat kalau target SOP mingguan
// belum tercapai. Nada positif — bukan galak. Muncul sekali per sesi browser
// (guard sessionStorage supaya tidak muncul berulang saat back/forward remount).
export default function SopNudgeCard() {
  const { profile } = useAuth()
  const { t } = useLang()
  const [incomplete, setIncomplete] = useState([])
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!profile?.user_id || dismissed) return
    tasksService.getIncompleteSopSummary(profile)
      .then(setIncomplete)
      .catch(() => setIncomplete([]))
      .finally(() => setLoaded(true))
  }, [profile, dismissed])

  function handleDismiss() {
    setDismissed(true)
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch {}
  }

  if (dismissed || !loaded || incomplete.length === 0) return null

  return (
    <Card className="p-4 mb-5 border-amber-200 bg-amber-50/70 relative animate-fade-in-up">
      <button
        onClick={handleDismiss} aria-label={t('sop.nudge.dismiss')}
        className="absolute top-2.5 right-2.5 text-gray-300 hover:text-gray-500"
      >
        <X size={15} />
      </button>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
          <Sparkles size={17} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0 pr-5">
          <p className="text-sm font-semibold text-gray-900">{t('sop.nudge.title')}</p>
          <p className="text-xs text-gray-500 mt-0.5">{t('sop.nudge.subtitle')}</p>
        </div>
      </div>
      <div className="space-y-2">
        {incomplete.slice(0, 3).map(item => (
          <Link
            key={item.formId} to={`/tugas/${item.formId}`}
            className="flex items-center gap-3 bg-surface rounded-xl px-3 py-2.5 hover:shadow-sm transition"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{item.formTitle}</p>
              <p className="text-xs text-amber-600 font-medium">
                {t('sop.nudge.progress', { done: item.completed, target: item.goal })}
              </p>
            </div>
            <ChevronRight size={16} className="text-gray-300" />
          </Link>
        ))}
        {incomplete.length > 3 && (
          <Link to="/tugas" className="block text-xs text-center text-brand-500 font-medium pt-1">
            {t('sop.nudge.viewAll', { n: incomplete.length })}
          </Link>
        )}
      </div>
    </Card>
  )
}
