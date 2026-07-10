import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditCard } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { registrationService } from '@/services/contentService'
import { usersService } from '@/services/usersService'
import { Card, Button, Input, Textarea, Select, Spinner, StatusBadge, GradientHeader } from '@/components/ui'
import Uploader from '@/components/Uploader'
import { useLang } from '@/hooks/useLang'
import { formatDate, compressImage, validateUpload } from '@/lib/utils'

export default function KTJPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { toast } = useToast()
  const { t } = useLang()

  const [loading, setLoading] = useState(true)
  const [existing, setExisting] = useState(null)
  const [komselList, setKomselList] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    full_name: '', birth_date: '', birth_place: '', address: '', komsel_id: '', photo_url: '',
  })
  const [photoPreview, setPhotoPreview] = useState('') // signed URL sementara utk pratinjau, bukan yg disimpan
  const [photoUploading, setPhotoUploading] = useState(false)

  useEffect(() => {
    if (!profile) return
    setForm(p => ({
      ...p,
      full_name: profile.name || '',
      birth_date: profile.birth_date || '',
      birth_place: profile.birth_place || '',
      address: profile.address || '',
      komsel_id: profile.komsel_id || '',
    }))
    Promise.all([
      registrationService.getMyRegistrations(profile.user_id).catch(() => ({ ktj: [] })),
      usersService.getAllKomsel().catch(() => []),
    ])
      .then(([{ ktj }, komsel]) => {
        // Aktif = status apapun selain Ditolak. Jemaat dg pengajuan Disetujui/Selesai
        // tetap "punya" pengajuan (kartu masih di-issue admin manual).
        const active = (ktj || []).find(k => k.status !== 'Ditolak')
        setExisting(active || null)
        setKomselList(komsel || [])
      })
      .finally(() => setLoading(false))
  }, [profile])

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

  // Unggah PAS Foto ke bucket privat `documents` (path ktj/<user_id>/...): owner
  // boleh tulis, admin boleh baca. `photo_url` form menyimpan PATH storage saja
  // (permanen); signed URL cuma dipakai lokal utk pratinjau sebelum submit —
  // signed URL TIDAK boleh disimpan ke DB krn expired 4 jam (lihat contentService).
  async function handlePhoto(file) {
    if (!file) return
    setPhotoUploading(true)
    try {
      file = await compressImage(file, { maxDim: 1000 })
      validateUpload(file, { maxMB: 5, image: true })
      const { path, url } = await registrationService.uploadDocument(`ktj/${profile.user_id}`, file)
      set('photo_url', path)
      setPhotoPreview(url)
      toast.success(t('ktj.photoUploaded'))
    } catch (err) {
      toast.error(err.message || t('ktj.photoFailed'))
    } finally {
      setPhotoUploading(false)
    }
  }

  async function handleSubmit() {
    setError('')
    if (!form.full_name.trim()) { setError(t('ktj.nameRequired')); return }
    if (!form.birth_date) { setError(t('ktj.birthRequired')); return }
    if (!form.photo_url) { setError(t('ktj.photoRequired')); return }
    setSaving(true)
    try {
      const result = await registrationService.submitKtj({
        ...form,
        komsel_id: form.komsel_id || null,
        user_id: profile.user_id,
      })
      setExisting(result)
      toast.success(t('ktj.submitted'))
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
        <GradientHeader title={t('ktj.title')} subtitle={t('common.regStatusSub')} back={() => navigate('/')} />
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
          <p className="text-xs text-gray-400 text-center">{t('ktj.processing')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-4">
      <GradientHeader title={t('ktj.title')} subtitle={t('ktj.subtitle')} back={() => navigate('/')} />

      <div className="px-4 py-4 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
        )}

        <Card className="p-4 space-y-4">
          <div className="flex items-start gap-3 bg-brand-50 border border-brand-100 rounded-xl px-3 py-2.5">
            <CreditCard size={16} className="text-brand-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-brand-700 leading-relaxed">{t('ktj.info')}</p>
          </div>

          <Input label={t('common.fullName')} required value={form.full_name} onChange={e => set('full_name', e.target.value)} />
          <Input label={t('common.birthDate')} type="date" required value={form.birth_date} onChange={e => set('birth_date', e.target.value)} />
          <Input label={t('common.birthPlace')} placeholder={t('common.birthPlacePh')} value={form.birth_place} onChange={e => set('birth_place', e.target.value)} />
          <Textarea label={t('common.fullAddress')} value={form.address} onChange={e => set('address', e.target.value)} />

          <Select label={t('ktj.komselLabel')} value={form.komsel_id} onChange={e => set('komsel_id', e.target.value)}>
            <option value="">{t('ktj.komselEmpty')}</option>
            {komselList.map(k => <option key={k.komsel_id} value={k.komsel_id}>{k.name}</option>)}
          </Select>

          <Uploader
            kind="image" crop aspect={3 / 4}
            label={t('ktj.photoLabel')} hint={t('ktj.photoHint')}
            value={photoPreview} uploading={photoUploading}
            onFile={handlePhoto} onClear={() => { set('photo_url', ''); setPhotoPreview('') }}
          />
        </Card>

        <Button className="w-full" loading={saving} onClick={handleSubmit}>{t('common.submitRegistration')}</Button>
      </div>
    </div>
  )
}
