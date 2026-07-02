import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Droplets, ChevronRight } from 'lucide-react'
import { registrationService, appSettingsService } from '@/services/contentService'
import { useToast } from '@/hooks/useToast'
import { Card, Select, PageHeader, Spinner, EmptyState, StatusBadge } from '@/components/ui'
import { useLang } from '@/hooks/useLang'
import { formatDate, formatPhone } from '@/lib/utils'

const STATUSES = ['Menunggu', 'Sedang Ditinjau', 'Disetujui', 'Terjadwal', 'Selesai', 'Ditolak']

export default function AdminBaptismPage() {
  const { t } = useLang()
  const { toast } = useToast()
  const [registrations, setRegistrations] = useState([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [regOpen, setRegOpen] = useState(true)
  const [savingGate, setSavingGate] = useState(false)

  useEffect(() => {
    setLoading(true)
    registrationService.getAllBaptism({ status })
      .then(setRegistrations)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [status])

  useEffect(() => {
    appSettingsService.get('baptism_status').then(s => setRegOpen(s !== 'closed')).catch(() => {})
  }, [])

  async function toggleGate() {
    const next = !regOpen
    setSavingGate(true)
    try {
      await appSettingsService.set('baptism_status', next ? 'open' : 'closed')
      setRegOpen(next)
      toast.success(next ? 'Pendaftaran baptisan dibuka.' : 'Pendaftaran baptisan ditutup.')
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan pengaturan.')
    } finally {
      setSavingGate(false)
    }
  }

  return (
    <div>
      <PageHeader title={t('abap.title')} subtitle={t('areg.count', { count: registrations.length })} />

      {/* Buka/tutup pendaftaran baptisan (menu cepat Beranda jemaat ikut hilang bila ditutup) */}
      <Card className="p-4 mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">Pendaftaran Baptisan</p>
          <p className="text-xs text-gray-400">{regOpen ? 'Sedang dibuka untuk jemaat.' : 'Sedang ditutup — jemaat tidak bisa mendaftar.'}</p>
        </div>
        <button
          onClick={toggleGate} disabled={savingGate} role="switch" aria-checked={regOpen}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${regOpen ? 'bg-brand-500' : 'bg-control-hover'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${regOpen ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </Card>

      <div className="mb-4 max-w-xs">
        <Select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">{t('amem.allStatus')}</option>
          {STATUSES.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </Select>
      </div>

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && registrations.length === 0 && (
        <EmptyState icon={Droplets} title={t('abap.empty')} description={t('areg.emptyDesc')} />
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
