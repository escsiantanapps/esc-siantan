import { ArrowLeft, CalendarRange } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '@/components/ui'
import { useLang } from '@/hooks/useLang'

export default function MinistryScheduleLayout({ children }) {
  const { t } = useLang()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pb-3" style={{ paddingTop: 'calc(var(--safe-top, 28px) + 0.75rem)' }}>
          <Link to="/" aria-label={t('admin.switchApp')} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-600 hover:bg-control">
            <ArrowLeft size={20} />
          </Link>
          <CalendarRange size={20} className="text-brand-600" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{t('admin.nav.jadwalPelayanan')}</span>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 lg:p-6">{children}</main>
    </div>
  )
}
