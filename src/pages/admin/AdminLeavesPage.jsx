import { useEffect, useState } from 'react'
import { CalendarOff, Check, X, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { leavesService } from '@/services/leavesService'
import { Card, PageHeader, Select, Spinner, EmptyState, StatusBadge, Avatar } from '@/components/ui'
import { formatDate } from '@/lib/utils'

export default function AdminLeavesPage() {
  const { profile } = useAuth()
  const { toast, confirm } = useToast()
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('Menunggu')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [status])

  function load() {
    setLoading(true)
    leavesService.getAll({ status }).then(setItems).catch(() => {}).finally(() => setLoading(false))
  }

  async function review(it, st) {
    try {
      await leavesService.setStatus(it.leave_id, st, profile.user_id)
      toast.success(st === 'Disetujui' ? 'Izin disetujui.' : 'Izin ditolak.')
      load()
    } catch (err) {
      toast.error(err.message || 'Gagal memperbarui status.')
    }
  }

  async function remove(it) {
    const ok = await confirm({ title: 'Hapus pengajuan?', message: 'Data pengajuan izin ini akan dihapus permanen.', confirmText: 'Hapus', danger: true })
    if (!ok) return
    try { await leavesService.delete(it.leave_id); toast.success('Pengajuan dihapus.'); load() }
    catch (err) { toast.error(err.message || 'Gagal menghapus.') }
  }

  return (
    <div>
      <PageHeader title="Izin / Sakit" subtitle="Tinjau & setujui pengajuan izin anggota" />

      <Card className="p-4 mb-4">
        <Select label="Status" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="Menunggu">Menunggu</option>
          <option value="Disetujui">Disetujui</option>
          <option value="Ditolak">Ditolak</option>
          <option value="">Semua</option>
        </Select>
      </Card>

      {loading && <div className="flex justify-center py-10"><Spinner /></div>}
      {!loading && items.length === 0 && <EmptyState icon={CalendarOff} title="Tidak ada pengajuan" />}
      {!loading && items.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {items.map(it => (
            <div key={it.leave_id} className="p-3.5">
              <div className="flex items-center gap-3">
                <Avatar name={it.users?.name} src={it.users?.photo_url} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{it.users?.name || '-'}</p>
                  <p className="text-xs text-gray-400">{it.type} · {formatDate(it.start_date)} – {formatDate(it.end_date)}</p>
                </div>
                <StatusBadge status={it.status} />
              </div>
              {it.reason && <p className="text-xs text-gray-500 mt-1.5">{it.reason}</p>}
              <div className="flex items-center gap-3 mt-2">
                {it.proof_url && <a href={it.proof_url} target="_blank" rel="noreferrer" className="text-xs text-brand-500 underline">Lihat bukti</a>}
                <div className="flex-1" />
                {it.status !== 'Disetujui' && (
                  <button onClick={() => review(it, 'Disetujui')} className="text-xs text-green-600 hover:underline flex items-center gap-1">
                    <Check size={13} /> Setujui
                  </button>
                )}
                {it.status !== 'Ditolak' && (
                  <button onClick={() => review(it, 'Ditolak')} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                    <X size={13} /> Tolak
                  </button>
                )}
                <button onClick={() => remove(it)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
