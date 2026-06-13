import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Droplets, ChevronRight } from 'lucide-react'
import { registrationService } from '@/services/contentService'
import { Card, Select, PageHeader, Spinner, EmptyState, StatusBadge } from '@/components/ui'
import { formatDate, formatPhone } from '@/lib/utils'

const STATUSES = ['Menunggu', 'Sedang Ditinjau', 'Disetujui', 'Terjadwal', 'Selesai', 'Ditolak']

export default function AdminBaptismPage() {
  const [registrations, setRegistrations] = useState([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    registrationService.getAllBaptism({ status })
      .then(setRegistrations)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [status])

  return (
    <div>
      <PageHeader title="Pendaftaran Baptisan" subtitle={`${registrations.length} pendaftaran`} />

      <div className="mb-4 max-w-xs">
        <Select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Semua Status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && registrations.length === 0 && (
        <EmptyState icon={Droplets} title="Belum ada pendaftaran baptisan" description="Pendaftaran dari jemaat akan muncul di sini." />
      )}

      {!loading && registrations.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {registrations.map(r => (
            <Link key={r.baptism_id} to={`/admin/baptisan/${r.baptism_id}`} className="flex items-center gap-3 p-3.5 hover:bg-gray-50 transition-colors">
              <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                <Droplets size={16} className="text-teal-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{r.full_name}</p>
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
