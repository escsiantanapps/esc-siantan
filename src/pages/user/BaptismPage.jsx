import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Paperclip } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { registrationService } from '@/services/contentService'
import { Card, Button, Input, Textarea, Spinner, StatusBadge, GradientHeader } from '@/components/ui'
import { formatDate, validateUpload } from '@/lib/utils'

const STEPS = ['Data Diri', 'Keluarga', 'Kerohanian', 'Dokumen']

const DOCS = [
  { key: 'ktp', label: 'Foto KTP / Kartu Keluarga' },
  { key: 'foto', label: 'Pas Foto Terbaru' },
]

export default function BaptismPage() {
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
    full_name: '', birth_date: '', birth_place: '', address: '', nik: '',
    father_name: '', mother_name: '',
    supervisor: '', class_done: '', testimony: '',
    documents: {},
  })

  useEffect(() => {
    if (!profile) return
    setForm(p => ({ ...p, full_name: profile.name || '', address: profile.address || '', nik: profile.nik || '' }))
    registrationService.getMyRegistrations(profile.user_id)
      .then(({ baptism }) => {
        const active = baptism.find(b => !['Ditolak', 'Selesai'].includes(b.status))
        setExisting(active || null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [profile])

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }
  function setDoc(key, val) { setForm(p => ({ ...p, documents: { ...p.documents, [key]: val } })) }

  async function handleFile(key, e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingKey(key)
    setError('')
    try {
      validateUpload(file, { maxMB: 10 })
      const url = await registrationService.uploadDocument(`baptism/${profile.user_id}`, file)
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
    if (step === 0) {
      if (!form.full_name.trim()) return 'Nama lengkap wajib diisi.'
      if (!form.birth_date) return 'Tanggal lahir wajib diisi.'
    }
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
      const result = await registrationService.submitBaptism({ ...form, user_id: profile.user_id })
      setExisting(result)
      toast.success('Pendaftaran baptisan berhasil dikirim.')
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
        <GradientHeader title="Pendaftaran Baptisan" subtitle="Status pendaftaran kamu" back={() => navigate('/')} />
        <div className="px-4 py-4 space-y-3">
          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">{existing.full_name}</p>
              <StatusBadge status={existing.status} />
            </div>
            <p className="text-xs text-gray-400">Diajukan {formatDate(existing.created_at)}</p>
            {existing.scheduled_at && (
              <p className="text-sm text-gray-600">Dijadwalkan: {formatDate(existing.scheduled_at, 'd MMMM yyyy, HH:mm')}</p>
            )}
            {existing.admin_note && (
              <div className="bg-brand-50 border border-brand-100 rounded-xl px-3 py-2 text-sm text-brand-700">{existing.admin_note}</div>
            )}
          </Card>
          <p className="text-xs text-gray-400 text-center">Pendaftaran sedang diproses. Kamu akan dihubungi melalui WhatsApp untuk informasi lebih lanjut.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-4">
      <GradientHeader title="Pendaftaran Baptisan" subtitle={`Langkah ${step + 1} dari ${STEPS.length}: ${STEPS[step]}`} back={() => navigate('/')}>
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
              <Input label="Nama Lengkap" required value={form.full_name} onChange={e => set('full_name', e.target.value)} />
              <Input label="Tanggal Lahir" type="date" required value={form.birth_date} onChange={e => set('birth_date', e.target.value)} />
              <Input label="Tempat Lahir" placeholder="Kota kelahiran" value={form.birth_place} onChange={e => set('birth_place', e.target.value)} />
              <Input label="NIK" placeholder="Nomor Induk Kependudukan" value={form.nik} onChange={e => set('nik', e.target.value)} />
              <Textarea label="Alamat Lengkap" value={form.address} onChange={e => set('address', e.target.value)} />
            </>
          )}

          {step === 1 && (
            <>
              <Input label="Nama Ayah" value={form.father_name} onChange={e => set('father_name', e.target.value)} />
              <Input label="Nama Ibu" value={form.mother_name} onChange={e => set('mother_name', e.target.value)} />
            </>
          )}

          {step === 2 && (
            <>
              <Input label="Pembimbing / Penanggung Jawab" placeholder="Nama pembimbing rohani" value={form.supervisor} onChange={e => set('supervisor', e.target.value)} />
              <Input label="Kelas Persiapan yang Sudah Diikuti" placeholder="cth. Kelas Baptisan Tahap 1" value={form.class_done} onChange={e => set('class_done', e.target.value)} />
              <Textarea label="Kesaksian / Alasan Ingin Dibaptis" rows={5} value={form.testimony} onChange={e => set('testimony', e.target.value)} />
            </>
          )}

          {step === 3 && (
            <>
              {DOCS.map(doc => (
                <div key={doc.key} className="space-y-1">
                  <label className="text-sm text-gray-600 font-medium">{doc.label}</label>
                  <label className="flex items-center gap-2 px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl cursor-pointer text-gray-500">
                    {uploadingKey === doc.key ? <Spinner size="sm" /> : <Paperclip size={15} />}
                    {form.documents[doc.key] ? 'File terunggah ✓' : 'Pilih file'}
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => handleFile(doc.key, e)} />
                  </label>
                </div>
              ))}
              <p className="text-xs text-gray-400">Dokumen bersifat opsional, dapat dilengkapi kemudian saat wawancara.</p>
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
