import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Info } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { registrationService } from '@/services/contentService'
import { Card, Button, Input, Textarea, Spinner, StatusBadge, GradientHeader } from '@/components/ui'
import Uploader from '@/components/Uploader'
import { useLang } from '@/hooks/useLang'
import { formatDate, validateUpload, compressImage } from '@/lib/utils'

const STEP_KEYS = ['dedication.step0', 'dedication.step1', 'dedication.step2']

const DOCS = [
  { key: 'ktp_ayah', labelKey: 'dedication.docKtpAyah' },
  { key: 'ktp_ibu', labelKey: 'dedication.docKtpIbu' },
  { key: 'kartu_keluarga', labelKey: 'dedication.docKK' },
  { key: 'akta_lahir', labelKey: 'dedication.docAkta' },
]

export default function PenyerahanAnakPage() {
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

  const [form, setForm] = useState({
    child_name: '', child_birth_date: '', child_birth_place: '',
    father_name: '', mother_name: '', address: '', nik: '',
    notes: '', documents: {},
  })

  useEffect(() => {
    if (!profile) return
    setForm(p => ({ ...p, address: profile.address || '' }))
    registrationService.getMyRegistrations(profile.user_id)
      .then(({ dedication }) => {
        const active = dedication.find(d => !['Ditolak', 'Selesai'].includes(d.status))
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
      const url = await registrationService.uploadDocument(`dedication/${profile.user_id}`, file)
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
      if (!form.child_name.trim()) return t('dedication.childNameRequired')
      if (!form.child_birth_date) return t('dedication.birthRequired')
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
      const result = await registrationService.submitDedication({ ...form, user_id: profile.user_id })
      setExisting(result)
      toast.success(t('dedication.submitted'))
    } catch (err) {
      setError(err.message || t('common.submitRegFailed'))
      toast.error(err.message || t('common.submitRegFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center items-center h-60"><Spinner /></div>

  if (existing) {
    return (
      <div className="pb-4">
        <GradientHeader title={t('dedication.title')} subtitle={t('common.regStatusSub')} back={() => navigate('/')} />
        <div className="px-4 py-4 space-y-3">
          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">{existing.child_name}</p>
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
          <p className="text-xs text-gray-400 text-center">{t('dedication.processing')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-4">
      <GradientHeader title={t('dedication.title')} subtitle={t('common.stepOf', { n: step + 1, total: STEP_KEYS.length, name: t(STEP_KEYS[step]) })} back={() => navigate('/')}>
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
              <Input label={t('dedication.childName')} required value={form.child_name} onChange={e => set('child_name', e.target.value)} />
              <Input label={t('common.birthDate')} type="date" required value={form.child_birth_date} onChange={e => set('child_birth_date', e.target.value)} />
              <Input label={t('common.birthPlace')} placeholder={t('common.birthPlacePh')} value={form.child_birth_place} onChange={e => set('child_birth_place', e.target.value)} />
            </>
          )}

          {step === 1 && (
            <>
              <Input label={t('common.fatherName')} value={form.father_name} onChange={e => set('father_name', e.target.value)} />
              <Input label={t('common.motherName')} value={form.mother_name} onChange={e => set('mother_name', e.target.value)} />
              <Input label={t('dedication.familyNik')} placeholder={t('dedication.familyNikPh')} value={form.nik} onChange={e => set('nik', e.target.value)} />
              <Textarea label={t('common.fullAddress')} value={form.address} onChange={e => set('address', e.target.value)} />
            </>
          )}

          {step === 2 && (
            <>
              {DOCS.map(doc => (
                <Uploader
                  key={doc.key} kind="file" label={t(doc.labelKey)}
                  value={form.documents[doc.key]} uploading={uploadingKey === doc.key}
                  onFile={file => handleFile(doc.key, file)} onClear={() => setDoc(doc.key, '')}
                />
              ))}
              <Textarea label={t('dedication.notes')} rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
              <p className="text-xs text-gray-400">{t('dedication.docsOptional')}</p>

              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                  <Info size={15} /> {t('dedication.receptionistInfoTitle')}
                </div>
                <ul className="text-xs text-amber-700 list-disc pl-4 space-y-1">
                  <li>{t('dedication.receptionistInfo1')}</li>
                  <li>{t('dedication.receptionistInfo2')}</li>
                  <li>{t('dedication.receptionistInfo3')}</li>
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
