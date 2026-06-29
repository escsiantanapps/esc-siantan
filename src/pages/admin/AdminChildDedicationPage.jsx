import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Baby, ChevronRight } from 'lucide-react'
import { registrationService } from '@/services/contentService'
import { Card, Select, PageHeader, Spinner, EmptyState, StatusBadge } from '@/components/ui'
import { useLang } from '@/hooks/useLang'
import { formatDate, formatPhone } from '@/lib/utils'

const STATUSES = ['Menunggu', 'Sedang Ditinjau', 'Disetujui', 'Terjadwal', 'Selesai', 'Ditolak']

export default function AdminChildDedicationPage() {
  const { t } = useLang()
  const [registrations, setRegistrations] = useState([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    registrationService.getAllDedication({ status })
      .then(setRegistrations)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [status])

  return (
    <div>
      <PageHeader title={t('aded.title')} subtitle={t('areg.count', { count: registrations.length })} />

      <div className="mb-4 max-w-xs">
        <Select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">{t('amem.allStatus')}</option>
          {STATUSES.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </Select>
      </div>

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && registrations.length === 0 && (
        <EmptyState icon={Baby} title={t('aded.empty')} description={t('areg.emptyDesc')} />
      )}

      {!loading && registrations.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {registrations.map(r => (
            <Link key={r.dedication_id} to={`/admin/penyerahan-anak/${r.dedication_id}`} className="flex items-center gap-3 p-3.5 hover:bg-gray-50 transition-colors">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Baby size={16} className="text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{r.child_name}</p>
                <p className="text-xs text-gray-400">{formatPhone(r.users?.phone)} · {formatDate(r.created_at)}</p>
              </div>
              <StatusBadge status={r.status} />
              <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
            </Link>
          ))}
        </Card>
      )}
    </div>
  )
}
