import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { registrationService } from '@/services/contentService'
import { Card, Button, Input, Textarea, Checkbox, Spinner, StatusBadge, GradientHeader } from '@/components/ui'
import Uploader from '@/components/Uploader'
import { formatDate, validateUpload, compressImage } from '@/lib/utils'

const STEPS = ['Mempelai Pria', 'Mempelai Wanita', 'Detail Acara', 'Dokumen']

const DOCS = [
  { key: 'ktp_pria', label: 'KTP Mempelai Pria' },
  { key: 'ktp_wanita', label: 'KTP Mempelai Wanita' },
  { key: 'kartu_keluarga', label: 'Kartu Keluarga' },
  { key: 'surat_baptis', label: 'Surat Baptis (jika ada)' },
]

export default function WeddingPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [existing, setExisting] = useState(null)
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploadingKey, setUploadingKey] = useState(null)

  const [form, setForm] = useState({
    groom_name: '', groom_birth_date: '', groom_phone: '', groom_father: '', groom_mother: '', groom_baptized: false,
    bride_name: '', bride_birth_date: '', bride_phone: '', bride_father: '', bride_mother: '', bride_baptized: false,
    planned_date: '', estimated_guests: '', preferred_pastor: '', special_notes: '',
    documents: {},
  })

  useEffect(() => {
    if (!profile) return
    registrationService.getMyRegistrations(profile.user_id)
      .then(({ wedding }) => {
        const active = wedding.find(w => !['Ditolak', 'Selesai'].includes(w.status))
        setExisting(active || null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [profile])

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }
  function setDoc(key, val) { setForm(p => ({ ...p, documents: { ...p.documents, [key]: val } })) }

  async function handleFile(key, file) {
    if (!file) return
    setUploadingKey(key)
    setError('')
    try {
      file = await compressImage(file, { maxDim: 1600 })
      validateUpload(file, { maxMB: 8 })
      const url = await registrationService.uploadDocument(`wedding/${profile.user_id}`, file)
      setDoc(key, url)
      toast.success('Dokumen berhasil diunggah.')
    } catch (err) {
      setError(err.message || 'Gagal mengunggah dokumen.')
      toast.error(err.message || 'Gagal mengunggah dokumen.')
    } finally {
      setUploadingKey(null)
    }
  }

  function validateStep() {
    if (step === 0 && !form.groom_name.trim()) return 'Nama mempelai pria wajib diisi.'
    if (step === 1 && !form.bride_name.trim()) return 'Nama mempelai wanita wajib diisi.'
    return ''
  }

  function next() {
    const err = validateStep()
    if (err) { setError(err); return }
    setError('')
    setStep(s => Math.min(s + 1, STEPS.length - 1))
  }

  function back() {
    setError('')
    setStep(s => Math.max(s - 1, 0))
  }

  async function handleSubmit() {
    setError('')
    setSaving(true)
    try {
      const result = await registrationService.submitWedding({
        ...form,
        estimated_guests: form.estimated_guests ? Number(form.estimated_guests) : null,
        planned_date: form.planned_date || null,
        user_id: profile.user_id,
      })
      setExisting(result)
      toast.success('Pendaftaran pemberkatan nikah berhasil dikirim.')
    } catch (err) {
      setError(err.message || 'Gagal mengirim pendaftaran.')
      toast.error(err.message || 'Gagal mengirim pendaftaran.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center items-center h-60"><Spinner /></div>

  if (existing) {
    return (
      <div className="pb-4">
        <GradientHeader title="Pemberkatan Nikah" subtitle="Status pendaftaran kamu" back={() => navigate('/')} />
        <div className="px-4 py-4 space-y-3">
          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">{existing.groom_name} & {existing.bride_name}</p>
              <StatusBadge status={existing.status} />
            </div>
            <p className="text-xs text-gray-400">Diajukan {formatDate(existing.created_at)}</p>
            {existing.planned_date && (
              <p className="text-sm text-gray-600">Rencana tanggal: {formatDate(existing.planned_date)}</p>
            )}
            {existing.scheduled_at && (
              <p className="text-sm text-gray-600">Dijadwalkan: {formatDate(existing.scheduled_at, 'd MMMM yyyy, HH:mm')}</p>
            )}
            {existing.admin_note && (
              <div className="bg-brand-50 border border-brand-100 rounded-xl px-3 py-2 text-sm text-brand-700">{existing.admin_note}</div>
            )}
          </Card>
          <p className="text-xs text-gray-400 text-center">Pendaftaran sedang diproses. Tim gereja akan menghubungi melalui WhatsApp untuk konfirmasi jadwal.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-4">
      <GradientHeader title="Pemberkatan Nikah" subtitle={`Langkah ${step + 1} dari ${STEPS.length}: ${STEPS[step]}`} back={() => navigate('/')}>
        <div className="flex gap-1.5 mt-3">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-white' : 'bg-white/25'}`} />
          ))}
        </div>
      </GradientHeader>

      <div className="px-4 py-4 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
        )}

        <Card className="p-4 space-y-4">
          {step === 0 && (
            <>
              <Input label="Nama Lengkap Mempelai Pria" required value={form.groom_name} onChange={e => set('groom_name', e.target.value)} />
              <Input label="Tanggal Lahir" type="date" value={form.groom_birth_date} onChange={e => set('groom_birth_date', e.target.value)} />
              <Input label="No. HP / WhatsApp" type="tel" value={form.groom_phone} onChange={e => set('groom_phone', e.target.value)} />
              <Input label="Nama Ayah" value={form.groom_father} onChange={e => set('groom_father', e.target.value)} />
              <Input label="Nama Ibu" value={form.groom_mother} onChange={e => set('groom_mother', e.target.value)} />
              <Checkbox label="Sudah dibaptis" checked={form.groom_baptized} onChange={e => set('groom_baptized', e.target.checked)} />
            </>
          )}

          {step === 1 && (
            <>
              <Input label="Nama Lengkap Mempelai Wanita" required value={form.bride_name} onChange={e => set('bride_name', e.target.value)} />
              <Input label="Tanggal Lahir" type="date" value={form.bride_birth_date} onChange={e => set('bride_birth_date', e.target.value)} />
              <Input label="No. HP / WhatsApp" type="tel" value={form.bride_phone} onChange={e => set('bride_phone', e.target.value)} />
              <Input label="Nama Ayah" value={form.bride_father} onChange={e => set('bride_father', e.target.value)} />
              <Input label="Nama Ibu" value={form.bride_mother} onChange={e => set('bride_mother', e.target.value)} />
              <Checkbox label="Sudah dibaptis" checked={form.bride_baptized} onChange={e => set('bride_baptized', e.target.checked)} />
            </>
          )}

          {step === 2 && (
            <>
              <Input label="Rencana Tanggal Pemberkatan" type="date" value={form.planned_date} onChange={e => set('planned_date', e.target.value)} />
              <Input label="Estimasi Jumlah Tamu" type="number" placeholder="cth. 100" value={form.estimated_guests} onChange={e => set('estimated_guests', e.target.value)} />
              <Input label="Pendeta yang Diharapkan" placeholder="Opsional" value={form.preferred_pastor} onChange={e => set('preferred_pastor', e.target.value)} />
              <Textarea label="Catatan Tambahan" rows={4} placeholder="Permintaan khusus, dll." value={form.special_notes} onChange={e => set('special_notes', e.target.value)} />
            </>
          )}

          {step === 3 && (
            <>
              {DOCS.map(doc => (
                <Uploader
                  key={doc.key} kind="file" label={doc.label}
                  value={form.documents[doc.key]} uploading={uploadingKey === doc.key}
                  onFile={file => handleFile(doc.key, file)} onClear={() => setDoc(doc.key, '')}
                />
              ))}
              <p className="text-xs text-gray-400">Dokumen bersifat opsional, dapat dilengkapi kemudian saat konsultasi.</p>
            </>
          )}
        </Card>

        <div className="flex gap-2">
          {step > 0 && <Button variant="outline" className="flex-1" onClick={back}>Kembali</Button>}
          {step < STEPS.length - 1 && <Button className="flex-1" onClick={next}>Lanjut</Button>}
          {step === STEPS.length - 1 && <Button className="flex-1" loading={saving} onClick={handleSubmit}>Kirim Pendaftaran</Button>}
        </div>
      </div>
    </div>
  )
}
