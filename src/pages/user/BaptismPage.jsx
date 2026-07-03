import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Droplets, Info } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { registrationService, classesService, appSettingsService } from '@/services/contentService'
import { Card, Button, Input, Textarea, Select, Spinner, StatusBadge, GradientHeader, EmptyState } from '@/components/ui'
import Uploader from '@/components/Uploader'
import { useLang } from '@/hooks/useLang'
import { formatDate, validateUpload, compressImage } from '@/lib/utils'

// Kelas dianggap "Kelas Baptisan" bila namanya mengandung kata "baptis".
export function isBaptismClass(cls) {
  return /baptis/i.test(cls?.name || '')
}

const STEP_KEYS = ['baptism.step0', 'baptism.step1', 'baptism.step2', 'baptism.step3']

const DOCS = [
  { key: 'ktp', labelKey: 'baptism.docKtp' },
  { key: 'kartu_keluarga', labelKey: 'baptism.docKK' },
  { key: 'foto', labelKey: 'baptism.docFoto' },
]

export default function BaptismPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { toast } = useToast()
  const { t } = useLang()

  const [loading, setLoading] = useState(true)
  const [existing, setExisting] = useState(null)
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploadingKey, setUploadingKey] = useState(null)
  const [baptismClasses, setBaptismClasses] = useState([])
  const [regOpen, setRegOpen] = useState(true)

  const [form, setForm] = useState({
    full_name: '', birth_date: '', birth_place: '', address: '', nik: '',
    father_name: '', mother_name: '',
    supervisor: '', class_done: '', testimony: '', class_id: '',
    documents: {},
  })

  useEffect(() => {
    if (!profile) return
    setForm(p => ({ ...p, full_name: profile.name || '', address: profile.address || '', nik: profile.nik || '' }))
    Promise.all([
      registrationService.getMyRegistrations(profile.user_id).catch(() => ({ baptism: [] })),
      classesService.getAll().catch(() => []),
      appSettingsService.get('baptism_status').catch(() => 'open'),
    ])
      .then(([{ baptism }, classes, status]) => {
        const active = baptism.find(b => !['Ditolak', 'Selesai'].includes(b.status))
        setExisting(active || null)
        setBaptismClasses(
          (classes || []).filter(c => isBaptismClass(c) && ['Mulai', 'Sedang Berlangsung'].includes(c.status))
        )
        setRegOpen(status !== 'closed')
      })
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
      const url = await registrationService.uploadDocument(`baptism/${profile.user_id}`, file)
      setDoc(key, url)
      toast.success(t('common.docUploaded'))
    } catch (err) {
      setError(err.message || t('common.docUploadFailed'))
      toast.error(err.message || t('common.docUploadFailed'))
    } finally {
      setUploadingKey(null)
    }
  }

  function validateStep() {
    if (step === 0) {
      if (!form.full_name.trim()) return t('baptism.nameRequired')
      if (!form.birth_date) return t('baptism.birthRequired')
      if (baptismClasses.length > 0 && !form.class_id) return 'Silakan pilih Kelas Baptisan.'
    }
    return ''
  }

  function next() {
    const err = validateStep()
    if (err) { setError(err); return }
    setError('')
    setStep(s => Math.min(s + 1, STEP_KEYS.length - 1))
  }

  function back() {
    setError('')
    setStep(s => Math.max(s - 1, 0))
  }

  async function handleSubmit() {
    setError('')
    setSaving(true)
    try {
      const result = await registrationService.submitBaptism({ ...form, class_id: form.class_id || null, user_id: profile.user_id })
      setExisting(result)
      toast.success(t('baptism.submitted'))
    } catch (err) {
      setError(err.message || t('common.submitRegFailed'))
      toast.error(err.message || t('common.submitRegFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center items-center h-60"><Spinner /></div>

  // Pendaftaran ditutup admin — tetap boleh melihat status yang sudah ada,
  // tapi tidak bisa mendaftar baru.
  if (!regOpen && !existing) {
    return (
      <div className="pb-4">
        <GradientHeader title={t('baptism.title')} back={() => navigate('/')} />
        <div className="px-4 py-4">
          <EmptyState icon={Droplets} title="Pendaftaran Ditutup"
            description="Pendaftaran baptisan sedang tidak dibuka. Silakan hubungi admin gereja untuk informasi jadwal berikutnya." />
        </div>
      </div>
    )
  }

  if (existing) {
    return (
      <div className="pb-4">
        <GradientHeader title={t('baptism.title')} subtitle={t('common.regStatusSub')} back={() => navigate('/')} />
        <div className="px-4 py-4 space-y-3">
          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">{existing.full_name}</p>
              <StatusBadge status={existing.status} />
            </div>
            <p className="text-xs text-gray-400">{t('common.submitted')} {formatDate(existing.created_at)}</p>
            {existing.scheduled_at && (
              <p className="text-sm text-gray-600">{t('common.scheduled')}: {formatDate(existing.scheduled_at, 'd MMMM yyyy, HH:mm')}</p>
            )}
            {existing.admin_note && (
              <div className="bg-brand-50 border border-brand-100 rounded-xl px-3 py-2 text-sm text-brand-700">{existing.admin_note}</div>
            )}
          </Card>
          <p className="text-xs text-gray-400 text-center">{t('baptism.processing')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-4">
      <GradientHeader title={t('baptism.title')} subtitle={t('common.stepOf', { n: step + 1, total: STEP_KEYS.length, name: t(STEP_KEYS[step]) })} back={() => navigate('/')}>
        <div className="flex gap-1.5 mt-3">
          {STEP_KEYS.map((_, i) => (
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
              {baptismClasses.length > 0 && (
                <Select label="Kelas Baptisan" required value={form.class_id} onChange={e => set('class_id', e.target.value)}>
                  <option value="">Pilih kelas baptisan...</option>
                  {baptismClasses.map(c => <option key={c.class_id} value={c.class_id}>{c.name}</option>)}
                </Select>
              )}
              <Input label={t('common.fullName')} required value={form.full_name} onChange={e => set('full_name', e.target.value)} />
              <Input label={t('common.birthDate')} type="date" required value={form.birth_date} onChange={e => set('birth_date', e.target.value)} />
              <Input label={t('common.birthPlace')} placeholder={t('common.birthPlacePh')} value={form.birth_place} onChange={e => set('birth_place', e.target.value)} />
              <Input label={t('baptism.nik')} placeholder={t('baptism.nikPh')} value={form.nik} onChange={e => set('nik', e.target.value)} />
              <Textarea label={t('common.fullAddress')} value={form.address} onChange={e => set('address', e.target.value)} />
            </>
          )}

          {step === 1 && (
            <>
              <Input label={t('common.fatherName')} value={form.father_name} onChange={e => set('father_name', e.target.value)} />
              <Input label={t('common.motherName')} value={form.mother_name} onChange={e => set('mother_name', e.target.value)} />
            </>
          )}

          {step === 2 && (
            <>
              <Input label={t('baptism.supervisor')} placeholder={t('baptism.supervisorPh')} value={form.supervisor} onChange={e => set('supervisor', e.target.value)} />
              <Input label={t('baptism.classDone')} placeholder={t('baptism.classDonePh')} value={form.class_done} onChange={e => set('class_done', e.target.value)} />
              <Textarea label={t('baptism.testimony')} rows={5} value={form.testimony} onChange={e => set('testimony', e.target.value)} />
            </>
          )}

          {step === 3 && (
            <>
              {DOCS.map(doc => (
                <Uploader
                  key={doc.key} kind="file" label={t(doc.labelKey)}
                  value={form.documents[doc.key]} uploading={uploadingKey === doc.key}
                  onFile={file => handleFile(doc.key, file)} onClear={() => setDoc(doc.key, '')}
                />
              ))}
              <p className="text-xs text-gray-400">{t('baptism.docsOptional')}</p>

              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                  <Info size={15} /> {t('baptism.receptionistInfoTitle')}
                </div>
                <ul className="text-xs text-amber-700 list-disc pl-4 space-y-1">
                  <li>{t('baptism.receptionistInfo1')}</li>
                  <li>{t('baptism.receptionistInfo2')}</li>
                  <li>{t('baptism.receptionistInfo3')}</li>
                  <li>{t('baptism.receptionistInfo4')}</li>
                </ul>
              </div>
            </>
          )}
        </Card>

        <div className="flex gap-2">
          {step > 0 && <Button variant="outline" className="flex-1" onClick={back}>{t('common.back')}</Button>}
          {step < STEP_KEYS.length - 1 && <Button className="flex-1" onClick={next}>{t('common.next')}</Button>}
          {step === STEP_KEYS.length - 1 && <Button className="flex-1" loading={saving} onClick={handleSubmit}>{t('common.submitRegistration')}</Button>}
        </div>
      </div>
    </div>
  )
}
