import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Info } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { registrationService } from '@/services/contentService'
import { Card, Button, Input, Textarea, Select, Checkbox, Spinner, StatusBadge, GradientHeader } from '@/components/ui'
import Uploader from '@/components/Uploader'
import { useLang } from '@/hooks/useLang'
import { formatDate, validateUpload, compressImage } from '@/lib/utils'

const STEP_KEYS = ['wedding.step0', 'wedding.step1', 'wedding.step2']

const DOCS = [
  { key: 'ktp_pria', labelKey: 'wedding.docKtpGroom' },
  { key: 'ktp_wanita', labelKey: 'wedding.docKtpBride' },
  { key: 'kk_pria', labelKey: 'wedding.docKKGroom' },
  { key: 'kk_wanita', labelKey: 'wedding.docKKBride' },
  { key: 'surat_baptis_pria', labelKey: 'wedding.docBaptismGroom' },
  { key: 'surat_baptis_wanita', labelKey: 'wedding.docBaptismBride' },
  { key: 'surat_belum_menikah_pria', labelKey: 'wedding.docNeverMarriedGroom' },
  { key: 'surat_belum_menikah_wanita', labelKey: 'wedding.docNeverMarriedBride' },
]

export default function WeddingPage() {
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
    groom_name: '', groom_birth_date: '', groom_birth_place: '', groom_ktp: '', groom_disdukcapil_name: '',
    groom_phone: '', groom_address: '', groom_marital_history: '',
    groom_father: '', groom_father_phone: '', groom_mother: '', groom_mother_phone: '',
    groom_baptized: false, groom_baptism_date: '', groom_baptism_church: '',
    bride_name: '', bride_birth_date: '', bride_birth_place: '', bride_ktp: '', bride_disdukcapil_name: '',
    bride_phone: '', bride_address: '', bride_marital_history: '',
    bride_father: '', bride_father_phone: '', bride_mother: '', bride_mother_phone: '',
    bride_baptized: false, bride_baptism_date: '', bride_baptism_church: '',
    planned_date: '', estimated_guests: '', preferred_pastor: '', special_notes: '',
    documents: {},
  })
  const [docPreviews, setDocPreviews] = useState({}) // signed URL sementara per dokumen, bukan yg disimpan

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
      const { path, url } = await registrationService.uploadDocument(`wedding/${profile.user_id}`, file)
      setDoc(key, path)
      setDocPreviews(p => ({ ...p, [key]: url }))
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
      if (!form.groom_name.trim()) return t('wedding.groomNameRequired')
      if (!form.bride_name.trim()) return t('wedding.brideNameRequired')
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
      const result = await registrationService.submitWedding({
        ...form,
        estimated_guests: form.estimated_guests ? Number(form.estimated_guests) : null,
        planned_date: form.planned_date || null,
        groom_baptism_date: form.groom_baptism_date || null,
        bride_baptism_date: form.bride_baptism_date || null,
        groom_marital_history: form.groom_marital_history || null,
        bride_marital_history: form.bride_marital_history || null,
        user_id: profile.user_id,
      })
      setExisting(result)
      toast.success(t('wedding.submitted'))
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
        <GradientHeader title={t('wedding.title')} subtitle={t('common.regStatusSub')} back={() => navigate('/')} />
        <div className="px-4 py-4 space-y-3">
          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">{existing.groom_name} & {existing.bride_name}</p>
              <StatusBadge status={existing.status} />
            </div>
            <p className="text-xs text-gray-400">{t('common.submitted')} {formatDate(existing.created_at)}</p>
            {existing.planned_date && (
              <p className="text-sm text-gray-600">{t('wedding.plannedDateLabel')}: {formatDate(existing.planned_date)}</p>
            )}
            {existing.scheduled_at && (
              <p className="text-sm text-gray-600">{t('common.scheduled')}: {formatDate(existing.scheduled_at, 'd MMMM yyyy, HH:mm')}</p>
            )}
            {existing.admin_note && (
              <div className="bg-brand-50 border border-brand-100 rounded-xl px-3 py-2 text-sm text-brand-700">{existing.admin_note}</div>
            )}
          </Card>
          <p className="text-xs text-gray-400 text-center">{t('wedding.processing')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-4">
      <GradientHeader title={t('wedding.title')} subtitle={t('common.stepOf', { n: step + 1, total: STEP_KEYS.length, name: t(STEP_KEYS[step]) })} back={() => navigate('/')}>
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
              <p className="text-sm font-semibold text-brand-600">{t('wedding.groomSection')}</p>
              <Input label={t('wedding.groomName')} required value={form.groom_name} onChange={e => set('groom_name', e.target.value)} />
              <Input label={t('common.birthPlace')} placeholder={t('common.birthPlacePh')} value={form.groom_birth_place} onChange={e => set('groom_birth_place', e.target.value)} />
              <Input label={t('common.birthDate')} type="date" value={form.groom_birth_date} onChange={e => set('groom_birth_date', e.target.value)} />
              <Input label={t('wedding.ktpNumber')} value={form.groom_ktp} onChange={e => set('groom_ktp', e.target.value)} />
              <Input label={t('wedding.disdukcapilName')} placeholder={t('wedding.disdukcapilNamePh')} value={form.groom_disdukcapil_name} onChange={e => set('groom_disdukcapil_name', e.target.value)} />
              <Input label={t('common.phoneWa')} type="tel" value={form.groom_phone} onChange={e => set('groom_phone', e.target.value)} />
              <Textarea label={t('common.fullAddress')} value={form.groom_address} onChange={e => set('groom_address', e.target.value)} />
              <Select label={t('wedding.maritalHistory')} value={form.groom_marital_history} onChange={e => set('groom_marital_history', e.target.value)}>
                <option value="">—</option>
                <option value="Belum Pernah">{t('wedding.maritalHistoryNever')}</option>
                <option value="Pernah">{t('wedding.maritalHistoryEver')}</option>
              </Select>
              <Input label={t('common.fatherName')} value={form.groom_father} onChange={e => set('groom_father', e.target.value)} />
              <Input label={t('wedding.fatherPhone')} type="tel" value={form.groom_father_phone} onChange={e => set('groom_father_phone', e.target.value)} />
              <Input label={t('common.motherName')} value={form.groom_mother} onChange={e => set('groom_mother', e.target.value)} />
              <Input label={t('wedding.motherPhone')} type="tel" value={form.groom_mother_phone} onChange={e => set('groom_mother_phone', e.target.value)} />
              <Checkbox label={t('wedding.baptized')} checked={form.groom_baptized} onChange={e => set('groom_baptized', e.target.checked)} />
              {form.groom_baptized && (
                <>
                  <Input label={t('wedding.baptismDate')} type="date" value={form.groom_baptism_date} onChange={e => set('groom_baptism_date', e.target.value)} />
                  <Input label={t('wedding.baptismChurch')} placeholder={t('wedding.baptismChurchPh')} value={form.groom_baptism_church} onChange={e => set('groom_baptism_church', e.target.value)} />
                </>
              )}

              <div className="border-t border-gray-100 pt-4">
                <p className="text-sm font-semibold text-brand-600">{t('wedding.brideSection')}</p>
              </div>
              <Input label={t('wedding.brideName')} required value={form.bride_name} onChange={e => set('bride_name', e.target.value)} />
              <Input label={t('common.birthPlace')} placeholder={t('common.birthPlacePh')} value={form.bride_birth_place} onChange={e => set('bride_birth_place', e.target.value)} />
              <Input label={t('common.birthDate')} type="date" value={form.bride_birth_date} onChange={e => set('bride_birth_date', e.target.value)} />
              <Input label={t('wedding.ktpNumber')} value={form.bride_ktp} onChange={e => set('bride_ktp', e.target.value)} />
              <Input label={t('wedding.disdukcapilName')} placeholder={t('wedding.disdukcapilNamePh')} value={form.bride_disdukcapil_name} onChange={e => set('bride_disdukcapil_name', e.target.value)} />
              <Input label={t('common.phoneWa')} type="tel" value={form.bride_phone} onChange={e => set('bride_phone', e.target.value)} />
              <Textarea label={t('common.fullAddress')} value={form.bride_address} onChange={e => set('bride_address', e.target.value)} />
              <Select label={t('wedding.maritalHistory')} value={form.bride_marital_history} onChange={e => set('bride_marital_history', e.target.value)}>
                <option value="">—</option>
                <option value="Belum Pernah">{t('wedding.maritalHistoryNever')}</option>
                <option value="Pernah">{t('wedding.maritalHistoryEver')}</option>
              </Select>
              <Input label={t('common.fatherName')} value={form.bride_father} onChange={e => set('bride_father', e.target.value)} />
              <Input label={t('wedding.fatherPhone')} type="tel" value={form.bride_father_phone} onChange={e => set('bride_father_phone', e.target.value)} />
              <Input label={t('common.motherName')} value={form.bride_mother} onChange={e => set('bride_mother', e.target.value)} />
              <Input label={t('wedding.motherPhone')} type="tel" value={form.bride_mother_phone} onChange={e => set('bride_mother_phone', e.target.value)} />
              <Checkbox label={t('wedding.baptized')} checked={form.bride_baptized} onChange={e => set('bride_baptized', e.target.checked)} />
              {form.bride_baptized && (
                <>
                  <Input label={t('wedding.baptismDate')} type="date" value={form.bride_baptism_date} onChange={e => set('bride_baptism_date', e.target.value)} />
                  <Input label={t('wedding.baptismChurch')} placeholder={t('wedding.baptismChurchPh')} value={form.bride_baptism_church} onChange={e => set('bride_baptism_church', e.target.value)} />
                </>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <Input label={t('wedding.plannedDate')} type="date" value={form.planned_date} onChange={e => set('planned_date', e.target.value)} />
              <Input label={t('wedding.estGuests')} type="number" placeholder={t('wedding.estGuestsPh')} value={form.estimated_guests} onChange={e => set('estimated_guests', e.target.value)} />
              <Input label={t('wedding.pastor')} placeholder={t('wedding.pastorPh')} value={form.preferred_pastor} onChange={e => set('preferred_pastor', e.target.value)} />
              <Textarea label={t('wedding.notes')} rows={4} placeholder={t('wedding.notesPh')} value={form.special_notes} onChange={e => set('special_notes', e.target.value)} />
            </>
          )}

          {step === 2 && (
            <>
              {DOCS.map(doc => (
                <Uploader
                  key={doc.key} kind="file" label={t(doc.labelKey)}
                  value={docPreviews[doc.key]} uploading={uploadingKey === doc.key}
                  onFile={file => handleFile(doc.key, file)}
                  onClear={() => { setDoc(doc.key, ''); setDocPreviews(p => ({ ...p, [doc.key]: '' })) }}
                />
              ))}
              <p className="text-xs text-gray-400">{t('wedding.docsOptional')}</p>

              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                  <Info size={15} /> {t('wedding.receptionistInfoTitle')}
                </div>
                <ul className="text-xs text-amber-700 list-disc pl-4 space-y-1">
                  <li>{t('wedding.receptionistInfo1')}</li>
                  <li>{t('wedding.receptionistInfo2')}</li>
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
