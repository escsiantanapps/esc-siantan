import { AlertCircle } from 'lucide-react'
import { useLang } from '@/hooks/useLang'

export default function AdminPendingNotice({ count, labelKey }) {
  const { t } = useLang()
  if (!count) return null
  const title = labelKey
    ? t('admin.pendingPageTitle', { label: t(labelKey), count })
    : t('arem.queueTitle', { count })

  return (
    <div
      role="status"
      aria-atomic="true"
      className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3"
    >
      <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
      <div>
        <p className="text-sm font-semibold text-amber-800">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-amber-700">{t('arem.queueHint')}</p>
      </div>
    </div>
  )
}