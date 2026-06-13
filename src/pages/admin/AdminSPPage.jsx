import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { usersService } from '@/services/usersService'
import { Card, PageHeader, Spinner, EmptyState, StatusBadge, Avatar } from '@/components/ui'
import { truncate } from '@/lib/utils'

const TABS = [
  { value: '', label: 'Semua' },
  { value: 'SP 1', label: 'SP 1' },
  { value: 'SP 2', label: 'SP 2' },
  { value: 'SP 3', label: 'SP 3' },
]

export default function AdminSPPage() {
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
      <PageHeader title="Surat Peringatan (SP)" subtitle={`${members.length} jemaat dengan status SP`} />

      <div className="flex gap-2 mb-4">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${tab === t.value ? 'gradient-main text-white' : 'bg-gray-100 text-gray-500'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!loading && tab === '' && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {Object.entries(counts).map(([level, count]) => (
            <Card key={level} className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{count}</p>
              <p className="text-xs text-gray-400 mt-0.5">{level}</p>
            </Card>
          ))}
        </div>
      )}

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && members.length === 0 && (
        <EmptyState icon={AlertTriangle} title="Tidak ada jemaat dengan SP" description="Semua jemaat dalam status aman." />
      )}

      {!loading && members.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {members.map(m => (
            <Link key={m.user_id} to={`/admin/jemaat/${m.user_id}`} className="flex items-center gap-3 p-3.5 hover:bg-gray-50 transition-colors">
              <Avatar name={m.name} src={m.photo_url} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                <p className="text-xs text-gray-400 truncate">{m.sp_notes ? truncate(m.sp_notes, 60) : m.role}</p>
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
