import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { usersService } from '@/services/usersService'
import { Card, PageHeader, Spinner, EmptyState, StatusBadge, Avatar } from '@/components/ui'
import { useLang } from '@/hooks/useLang'
import { truncate } from '@/lib/utils'

const TAB_VALUES = ['', 'SP 1', 'SP 2', 'SP 3']

export default function AdminSPPage() {
  const { t } = useLang()
  const [members, setMembers] = useState([])
  const [tab, setTab] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    usersService.getWithSP(tab)
      .then(setMembers)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tab])

  const counts = {
    'SP 1': members.filter(m => m.sp_level === 'SP 1').length,
    'SP 2': members.filter(m => m.sp_level === 'SP 2').length,
    'SP 3': members.filter(m => m.sp_level === 'SP 3').length,
  }

  return (
    <div>
      <PageHeader title={t('asp.title')} subtitle={t('asp.subtitle', { count: members.length })} />

      <div className="flex gap-2 mb-4">
        {TAB_VALUES.map(v => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${tab === v ? 'gradient-main text-white' : 'bg-control text-gray-500'}`}
          >
            {v === '' ? t('asp.all') : t(`status.${v}`)}
          </button>
        ))}
      </div>

      {!loading && tab === '' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {Object.entries(counts).map(([level, count]) => (
            <Card key={level} className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{count}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t(`status.${level}`)}</p>
            </Card>
          ))}
        </div>
      )}

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && members.length === 0 && (
        <EmptyState icon={AlertTriangle} title={t('asp.none')} description={t('asp.noneDesc')} />
      )}

      {!loading && members.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {members.map(m => (
            <Link key={m.user_id} to={`/admin/jemaat/${m.user_id}`} className="flex items-center gap-3 p-3.5 hover:bg-gray-50 transition-colors">
              <Avatar name={m.name} src={m.photo_url} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                <p className="text-xs text-gray-400 truncate">{m.sp_notes ? truncate(m.sp_notes, 60) : t(`role.${m.role}`)}</p>
              </div>
              <StatusBadge status={m.sp_level} />
              <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
            </Link>
          ))}
        </Card>
      )}
    </div>
  )
}
