import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HeartPulse, CalendarOff, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { leavesService, LEAVE_TYPES } from '@/services/leavesService'
import { Card, Spinner, GradientHeader, Button, Input, Select, Textarea, StatusBadge, EmptyState } from '@/components/ui'
import Uploader from '@/components/Uploader'
import { formatDate, validateUpload, compressImage } from '@/lib/utils'

// Tanggal hari ini (atau mundur n hari) sebagai string YYYY-MM-DD.
function isoMinusDays(n) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export default function UserLeavePage() {
  const navigate = useNavigate()
  const { profile, isVolunteer } = useAuth()
  const { toast, confirm } = useToast()

  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const today = isoMinusDays(0)
  const minStart = isoMinusDays(2) // anti-backdate: maksimal mundur 2 hari
  const [form, setForm] = useState({ type: 'Sakit', start_date: today, end_date: today, reason: '', proof_url: '' })

  useEffect(() => {
    if (profile && isVolunteer) load()
    else if (profile) setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  async function load() {
    setLoading(true)
    try { setList(await leavesService.getMine(profile.user_id)) }
    catch { /* abaikan */ }
    finally { setLoading(false) }
  }

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleProof(file) {
    setUploading(true); setError('')
    try {
      file = await compressImage(file, { maxDim: 1600 })
      validateUpload(file, { maxMB: 8 })
      const url = await leavesService.uploadProof(profile.user_id, file)
      set('proof_url', url)
      toast.success('Bukti berhasil diunggah.')
    } catch (err) {
      setError(err.message || 'Gagal mengunggah bukti.')
      toast.error(err.message || 'Gagal mengunggah bukti.')
    } finally { setUploading(false) }
  }

  async function handleSubmit() {
    setError('')
    if (!form.start_date || !form.end_date) { setError('Tanggal mulai & selesai wajib diisi.'); return }
    if (form.end_date < form.start_date) { setError('Tanggal selesai tidak boleh sebelum tanggal mulai.'); return }
    if (form.start_date < minStart) { setError('Pengajuan tidak boleh mundur lebih dari 2 hari.'); return }
    setSaving(true)
    try {
      await leavesService.create({
        userId: profile.user_id,
        type: form.type,
        startDate: form.start_date,
        endDate: form.end_date,
        reason: form.reason,
        proofUrl: form.proof_url,
      })
      setForm({ type: 'Sakit', start_date: today, end_date: today, reason: '', proof_url: '' })
      toast.success('Pengajuan terkirim. Menunggu persetujuan admin.')
      load()
    } catch (err) {
      setError(err.message || 'Gagal mengirim pengajuan.')
      toast.error(err.message || 'Gagal mengirim pengajuan.')
    } finally { setSaving(false) }
  }

  async function cancel(item) {
    const ok = await confirm({ title: 'Batalkan pengajuan?', message: 'Pengajuan izin ini akan dihapus.', confirmText: 'Batalkan', danger: true })
    if (!ok) return
    try { await leavesService.cancel(item.leave_id); toast.success('Pengajuan dibatalkan.'); load() }
    catch (err) { toast.error(err.message || 'Gagal membatalkan.') }
  }

  if (!isVolunteer) {
    return (
      <div className="pb-4">
        <GradientHeader title="Izin / Sakit" back={() => navigate('/tugas')} />
        <div className="px-4 pt-4">
          <EmptyState icon={CalendarOff} title="Khusus Volunteer" description="Fitur pengajuan izin/sakit hanya tersedia untuk Volunteer." />
        </div>
      </div>
    )
  }

  return (
    <div className="pb-4">
      <GradientHeader title="Izin / Sakit" subtitle="Ajukan izin bila berhalangan mengisi tugas" back={() => navigate('/tugas')} />

      <div className="px-4 -mt-2 pt-4 space-y-5">
        {/* Form pengajuan */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Ajukan Izin</h3>
          <Card className="p-4 space-y-4">
            {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}
            <Select label="Jenis" value={form.type} onChange={e => set('type', e.target.value)}>
              {LEAVE_TYPES.map(tp => <option key={tp} value={tp}>{tp}</option>)}
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Tanggal Mulai" type="date" min={minStart} value={form.start_date} onChange={e => set('start_date', e.target.value)} />
              <Input label="Tanggal Selesai" type="date" min={form.start_date || minStart} value={form.end_date} onChange={e => set('end_date', e.target.value)} />
            </div>
            <Textarea label="Alasan (opsional)" rows={2} value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="cth: Sakit demam, surat dokter terlampir" />
            <Uploader
              kind="image" label="Bukti (opsional)" hint="Foto surat dokter / bukti, maks 8 MB"
              value={form.proof_url} uploading={uploading}
              onFile={handleProof} onClear={() => set('proof_url', '')}
            />
            <Button className="w-full" loading={saving} onClick={handleSubmit}>
              <CalendarOff size={16} /> Kirim Pengajuan
            </Button>
            <p className="text-xs text-gray-400 text-center">
              Izin berlaku setelah disetujui admin. Periode yang disetujui tidak dihitung "Kosong" di evaluasi.
            </p>
          </Card>
        </section>

        {/* Riwayat pengajuan */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Riwayat Pengajuan</h3>
          {loading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : list.length === 0 ? (
            <EmptyState icon={HeartPulse} title="Belum ada pengajuan" description="Pengajuan izin Anda akan muncul di sini." />
          ) : (
            <Card className="divide-y divide-gray-100">
              {list.map(it => (
                <div key={it.leave_id} className="p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{it.type} · {formatDate(it.start_date)} – {formatDate(it.end_date)}</p>
                      {it.reason && <p className="text-xs text-gray-400 truncate">{it.reason}</p>}
                    </div>
                    <StatusBadge status={it.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    {it.proof_url && <a href={it.proof_url} target="_blank" rel="noreferrer" className="text-xs text-brand-500 underline">Lihat bukti</a>}
                    {it.admin_note && <p className="text-xs text-gray-500 truncate">Catatan: {it.admin_note}</p>}
                    <div className="flex-1" />
                    {it.status === 'Menunggu' && (
                      <button onClick={() => cancel(it)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>
    </div>
  )
}
