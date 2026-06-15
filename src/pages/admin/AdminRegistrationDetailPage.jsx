import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, FileText } from 'lucide-react'
import { registrationService } from '@/services/contentService'
import { pushService } from '@/services/pushService'
import { useToast } from '@/hooks/useToast'
import { Card, Select, Textarea, Input, Button, Spinner, StatusBadge, EmptyState } from '@/components/ui'
import { formatDate, formatPhone, hitungUmur } from '@/lib/utils'

const STATUSES = ['Menunggu', 'Sedang Ditinjau', 'Disetujui', 'Terjadwal', 'Selesai', 'Ditolak']

const BAPTISM_DOCS = [
  { key: 'ktp', label: 'Foto KTP / Kartu Keluarga' },
  { key: 'foto', label: 'Pas Foto' },
]

const WEDDING_DOCS = [
  { key: 'ktp_pria', label: 'KTP Mempelai Pria' },
  { key: 'ktp_wanita', label: 'KTP Mempelai Wanita' },
  { key: 'kartu_keluarga', label: 'Kartu Keluarga' },
  { key: 'surat_baptis', label: 'Surat Baptis' },
]

function toDatetimeLocal(value) {
  if (!value) return ''
  const d = new Date(value)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AdminRegistrationDetailPage() {
  const { id } = useParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { toast } = useToast()
  const type = pathname.startsWith('/admin/nikah') ? 'wedding' : 'baptism'
  const backTo = type === 'wedding' ? '/admin/nikah' : '/admin/baptisan'
  const docs = type === 'wedding' ? WEDDING_DOCS : BAPTISM_DOCS

  const [reg, setReg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [form, setForm] = useState({ status: 'Menunggu', admin_note: '', scheduled_at: '' })

  useEffect(() => { load() }, [id, type])

  async function load() {
    setLoading(true)
    try {
      const data = await registrationService.getById(type, id)
      setReg(data)
      setForm({
        status: data.status || 'Menunggu',
        admin_note: data.admin_note || '',
        scheduled_at: toDatetimeLocal(data.scheduled_at),
      })
    } catch (err) {
      setError(err.message || 'Gagal memuat data pendaftaran.')
    } finally {
      setLoading(false)
    }
  }

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

  async function handleSave() {
    setError(''); setSuccess(''); setSaving(true)
    try {
      const updated = await registrationService.updateStatus(type, id, {
        status: form.status,
        admin_note: form.admin_note,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
      })
      setReg(updated)
      setSuccess('Status pendaftaran berhasil diperbarui.')
      toast.success('Status pendaftaran berhasil diperbarui.')
      // Beri tahu jemaat lewat push bila statusnya berubah
      if (reg.user_id && form.status !== reg.status) {
        const jenis = type === 'wedding' ? 'Pemberkatan Nikah' : 'Baptisan'
        pushService.broadcast({
          title: `Status ${jenis}: ${form.status}`,
          body: form.admin_note || `Pendaftaran ${jenis} Anda kini berstatus "${form.status}".`,
          url: '/status-pendaftaran',
          userIds: [reg.user_id],
        }).catch(() => {})
      }
    } catch (err) {
      setError(err.message || 'Gagal memperbarui status.')
      toast.error(err.message || 'Gagal memperbarui status.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center items-center h-60"><Spinner /></div>

  if (!reg) {
    return (
      <div>
        <button onClick={() => navigate(backTo)} className="flex items-center gap-1 text-sm text-gray-500 mb-4">
          <ArrowLeft size={16} /> Kembali
        </button>
        <EmptyState title="Pendaftaran tidak ditemukan" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <button onClick={() => navigate(backTo)} className="flex items-center gap-1 text-sm text-gray-500 mb-4">
        <ArrowLeft size={16} /> Kembali ke {type === 'wedding' ? 'Pemberkatan Nikah' : 'Pendaftaran Baptisan'}
      </button>

      {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>}
      {success && <div className="bg-green-50 border border-green-100 text-green-600 text-sm rounded-xl px-4 py-3 mb-4">{success}</div>}

      {/* Header */}
      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-base font-semibold text-gray-900">
            {type === 'wedding' ? `${reg.groom_name} & ${reg.bride_name}` : reg.full_name}
          </p>
          <StatusBadge status={reg.status} />
        </div>
        <p className="text-sm text-gray-400">
          Diajukan oleh {reg.users?.name || '-'} · {formatPhone(reg.users?.phone)} · {formatDate(reg.created_at)}
        </p>
      </Card>

      {type === 'baptism' ? (
        <Card className="p-4 mb-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Data Calon Baptis</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Nama Lengkap" value={reg.full_name} />
            <Info label="Tanggal Lahir" value={reg.birth_date ? `${formatDate(reg.birth_date)} (${hitungUmur(reg.birth_date)})` : '-'} />
            <Info label="Tempat Lahir" value={reg.birth_place} />
            <Info label="NIK" value={reg.nik} />
            <Info label="Nama Ayah" value={reg.father_name} />
            <Info label="Nama Ibu" value={reg.mother_name} />
            <Info label="Pembimbing" value={reg.supervisor} />
            <Info label="Kelas Diikuti" value={reg.class_done} />
            <div className="col-span-2"><Info label="Alamat" value={reg.address} /></div>
          </div>
          {reg.testimony && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Kesaksian / Alasan Ingin Dibaptis</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{reg.testimony}</p>
            </div>
          )}
        </Card>
      ) : (
        <>
          <Card className="p-4 mb-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Mempelai Pria</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Nama Lengkap" value={reg.groom_name} />
              <Info label="Tanggal Lahir" value={reg.groom_birth_date ? formatDate(reg.groom_birth_date) : '-'} />
              <Info label="No. HP" value={formatPhone(reg.groom_phone)} />
              <Info label="Sudah Dibaptis" value={reg.groom_baptized ? 'Ya' : 'Belum'} />
              <Info label="Nama Ayah" value={reg.groom_father} />
              <Info label="Nama Ibu" value={reg.groom_mother} />
            </div>
          </Card>
          <Card className="p-4 mb-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Mempelai Wanita</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Nama Lengkap" value={reg.bride_name} />
              <Info label="Tanggal Lahir" value={reg.bride_birth_date ? formatDate(reg.bride_birth_date) : '-'} />
              <Info label="No. HP" value={formatPhone(reg.bride_phone)} />
              <Info label="Sudah Dibaptis" value={reg.bride_baptized ? 'Ya' : 'Belum'} />
              <Info label="Nama Ayah" value={reg.bride_father} />
              <Info label="Nama Ibu" value={reg.bride_mother} />
            </div>
          </Card>
          <Card className="p-4 mb-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Detail Acara</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Rencana Tanggal" value={reg.planned_date ? formatDate(reg.planned_date) : '-'} />
              <Info label="Estimasi Tamu" value={reg.estimated_guests || '-'} />
              <Info label="Pendeta Diharapkan" value={reg.preferred_pastor} />
            </div>
            {reg.special_notes && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Catatan Tambahan</p>
                <p className="text-sm text-gray-700 whitespace-pre-line">{reg.special_notes}</p>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Dokumen */}
      <Card className="p-4 mb-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Dokumen</h2>
        {docs.every(d => !reg.documents?.[d.key]) ? (
          <p className="text-sm text-gray-400">Belum ada dokumen yang diunggah.</p>
        ) : (
          docs.map(d => reg.documents?.[d.key] && (
            <a key={d.key} href={reg.documents[d.key]} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-sm text-brand-500 hover:underline">
              <FileText size={15} /> {d.label}
            </a>
          ))
        )}
      </Card>

      {/* Status update */}
      <Card className="p-4 mb-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Tinjau Pendaftaran</h2>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Status" value={form.status} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Input label="Jadwal" type="datetime-local" value={form.scheduled_at} onChange={e => set('scheduled_at', e.target.value)} />
        </div>
        <Textarea label="Catatan Admin" rows={3} placeholder="Catatan untuk jemaat (akan terlihat oleh jemaat)" value={form.admin_note} onChange={e => set('admin_note', e.target.value)} />
      </Card>

      <Button className="w-full" loading={saving} onClick={handleSave}>Simpan Perubahan</Button>
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-gray-700">{value || '-'}</p>
    </div>
  )
}
