import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import { useLang } from '@/hooks/useLang'

export default function AdminPendingList({ items = [], onSelect }) {
  const { t } = useLang()

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-5 text-sm text-gray-500">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-600">
          <CheckCircle2 size={18} />
        </span>
        <span>{t('admin.pendingEmpty')}</span>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-gray-100">
      {items.map(({ to, count, label, icon: Icon }) => (
        <li key={to}>
          <Link
            to={to}
            onClick={onSelect}
            aria-label={t('admin.openPendingQueue', { label, count })}
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Icon size={18} strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-gray-900">{label}</span>
              <span className="block text-xs text-gray-500">{t('admin.pendingCount', { count })}</span>
            </span>
            <span className="min-w-6 rounded-full bg-red-500 px-1.5 text-center text-[10px] font-bold leading-5 text-white">
              {count > 99 ? '99+' : count}
            </span>
            <ChevronRight size={16} className="shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
