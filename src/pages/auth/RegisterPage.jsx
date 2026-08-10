import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { compressImage, fetchApi } from '@/lib/utils'
import { Button, Input, Select, GradientHeader } from '@/components/ui'
import Uploader from '@/components/Uploader'

async function postJson(url, payload) {
  const res = await fetchApi(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan.')
  return data
}

export default function RegisterPage() {
  const { register, completeRegistrationPhoto, refreshProfile } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [processingPhoto, setProcessingPhoto] = useState(false)
  const [accountCreated, setAccountCreated] = useState(false)
  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '', confirmPassword: '',
    gender: '', birth_date: '', birth_place: '', address: '',
    blood_type: '', social_media: '',
  })

  useEffect(() => () => {
    if (photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

  function beforePhoto(file) {
    setError('')
    if (!file.type?.startsWith('image/')) {
      setError(t('auth.photoTypeError'))
      return false
    }
    if (file.size > 15 * 1024 * 1024) {
      setError(t('auth.photoSizeError'))
      return false
    }
    return true
  }

  async function handlePhoto(file) {
    setError('')
    setProcessingPhoto(true)
    try {
      const compressed = await compressImage(file, { maxDim: 720, quality: 0.76, targetKB: 250 })
      setPhotoFile(compressed)
      setPhotoPreview(URL.createObjectURL(compressed))
    } catch {
      setError(t('auth.photoProcessError'))
    } finally {
      setProcessingPhoto(false)
    }
  }

  function clearPhoto() {
    setPhotoFile(null)
    setPhotoPreview('')
    setError('')
  }

  async function handleSubmit() {
    if (!photoFile) { setError(t('auth.photoRequired')); setStep(2); return }
    if (form.password !== form.confirmPassword) { setError(t('auth.pwMismatch')); setStep(1); return }
    if (form.password.length < 8 || !/[a-zA-Z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      setError(t('auth.pwMin8')); setStep(1); return
    }
    setError(''); setLoading(true)
    try {
      if (!accountCreated) {
        // Cek nomor/email sebelum membuat akun agar foto tidak diproses untuk data duplikat.
        const chk = await postJson('/api/check-phone', { phone: form.phone, email: form.email }).catch(() => null)

        if (chk?.needsActivation || chk?.hasLogin || chk?.phoneTaken) {
          setError(t('auth.phoneTaken'))
          setStep(1)
          return
        }
        if (chk?.emailTaken) {
          setError(t('auth.emailTaken'))
          setStep(1)
          return
        }
        await register({ ...form, photo: photoFile })
      } else {
        try {
          await completeRegistrationPhoto(photoFile)
        } catch (cause) {
          const retryError = new Error('PROFILE_PHOTO_UPLOAD_FAILED')
          retryError.code = 'PROFILE_PHOTO_UPLOAD_FAILED'
          retryError.cause = cause
          throw retryError
        }
      }

      // Muat profil setelah URL foto tersimpan agar layar pending langsung
      // menampilkan avatar yang baru dipilih.
      await refreshProfile().catch(() => {})

      // Notifikasi bukan bagian transaksi registrasi. Gangguan push tidak boleh
      // membuat pengguna mengulang signUp yang sebenarnya sudah berhasil.
      const { pushService } = await import('@/services/pushService')
      await pushService.notifyAdmin('new_user').catch(() => {})

      navigate('/')
    } catch (err) {
      if (err.code === 'PROFILE_PHOTO_UPLOAD_FAILED' || err.message === 'PROFILE_PHOTO_UPLOAD_FAILED') {
        setAccountCreated(true)
        setError(t('auth.photoUploadRetry'))
        setStep(3)
      } else if (err.message === 'PROFILE_PHOTO_REQUIRED') {
        setError(t('auth.photoRequired'))
        setStep(2)
      } else {
        setError(
          err.message === 'PHONE_TAKEN' ? t('auth.phoneTaken')
          : err.message === 'EMAIL_TAKEN' ? t('auth.emailTaken')
          : (err.message || t('auth.registerFailed'))
        )
        setStep(1)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center sm:items-center sm:px-4 sm:py-10">
      <div className="w-full max-w-md min-h-screen sm:min-h-0 flex flex-col bg-surface sm:rounded-3xl sm:shadow-2xl sm:shadow-black/10 sm:overflow-hidden">
        <GradientHeader
          title={t('auth.createAccount')}
          subtitle={t('auth.createSubtitle')}
          back={step > 1 && !accountCreated ? () => setStep(s => s - 1) : undefined}
        />

        {/* Step indicator */}
        <div className="bg-surface px-6 py-3 flex items-center gap-2 border-b border-gray-100">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0
                ${s < step ? 'gradient-main text-white' : s === step ? 'border-2 border-brand-500 text-brand-500' : 'border-2 border-gray-200 text-gray-300'}`}>
                {s < step ? <Check size={13} aria-hidden="true" /> : s}
              </div>
              <span className={`text-xs ${s === step ? 'text-brand-500 font-medium' : 'text-gray-400'}`}>
                {[t('auth.stepAccount'), t('auth.stepData'), t('auth.stepDone')][s - 1]}
              </span>
              {s < 3 && <div className="flex-1 h-px bg-gray-200" />}
            </div>
          ))}
        </div>

        <div className="flex-1 bg-surface px-6 py-6">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <Input label={t('auth.fullName')} required placeholder={t('auth.fullNamePh')} value={form.name} onChange={e => set('name', e.target.value)} />
              <Input label={t('auth.email')} type="email" required placeholder="nama@email.com" value={form.email} onChange={e => set('email', e.target.value)} />
              <Input label={t('auth.phone')} type="tel" required placeholder="+62 8xx xxxx xxxx" value={form.phone} onChange={e => set('phone', e.target.value)} />
              <Input label={t('auth.password')} type="password" required placeholder={t('auth.passwordMin8')} value={form.password} onChange={e => set('password', e.target.value)} />
              <Input label={t('auth.repeatPassword')} type="password" required placeholder={t('auth.repeatPasswordPh')} value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} />
              <Button className="w-full mt-2" size="lg" onClick={() => {
                if (!form.name || !form.email || !form.phone || !form.password) { setError(t('auth.completeAll')); return }
                if (form.phone.replace(/\D/g, '').length < 9) { setError(t('auth.phoneInvalid')); return }
                setError(''); setStep(2)
              }}>
                {t('auth.next')}
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Uploader
                kind="image" crop aspect={1} required value={photoPreview}
                label={t('auth.profilePhoto')} hint={t('auth.profilePhotoHint')}
                accept="image/*" uploading={processingPhoto}
                imageAlt={t('auth.photoPreviewAlt')}
                uploadLabel={t('auth.choosePhoto')} replaceLabel={t('auth.replacePhoto')}
                removeLabel={t('auth.removePhoto')} uploadingLabel={t('auth.processingPhoto')}
                beforeFile={beforePhoto} onFile={handlePhoto} onClear={clearPhoto}
              />
              <Select label={t('auth.gender')} value={form.gender} onChange={e => set('gender', e.target.value)}>
                <option value="">{t('auth.choose')}</option>
                <option value="Laki-laki">{t('gender.male')}</option>
                <option value="Perempuan">{t('gender.female')}</option>
              </Select>
              <Input label={t('auth.birthDate')} type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} />
              <Input label={t('auth.birthPlace')} placeholder={t('auth.birthPlacePh')} value={form.birth_place} onChange={e => set('birth_place', e.target.value)} />
              <Input label={t('auth.address')} placeholder={t('auth.addressPh')} value={form.address} onChange={e => set('address', e.target.value)} />
              <Select label={t('auth.bloodType')} value={form.blood_type} onChange={e => set('blood_type', e.target.value)}>
                <option value="">{t('auth.bloodUnknown')}</option>
                {['A','B','AB','O'].map(b => <option key={b}>{b}</option>)}
              </Select>
              <Input label={t('auth.socialMedia')} placeholder="@username" value={form.social_media} onChange={e => set('social_media', e.target.value)} />
              <Button className="w-full mt-2" size="lg" loading={processingPhoto} onClick={() => {
                if (!photoFile) { setError(t('auth.photoRequired')); return }
                setError(''); setStep(3)
              }}>
                {t('auth.next')}
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center text-center py-8">
              <img src={photoPreview} alt={t('auth.photoPreviewAlt')} width="96" height="96"
                className="w-24 h-24 rounded-full object-cover border-4 border-brand-100 mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{t(accountCreated ? 'auth.photoRetryTitle' : 'auth.readyTitle')}</h2>
              <p className="text-sm text-gray-500 mb-2">{t('auth.name')}: <strong className="text-gray-800">{form.name}</strong></p>
              <p className="text-sm text-gray-500 mb-6">{t('auth.email')}: <strong className="text-gray-800">{form.email}</strong></p>
              <p className="text-xs text-gray-400 mb-4">
                {t('auth.consentPrefix')}{' '}
                <Link to="/kebijakan-privasi" className="text-brand-500 font-medium" target="_blank">{t('auth.privacyPolicy')}</Link>.
              </p>
              <Button className="w-full" size="lg" loading={loading} onClick={handleSubmit}>
                {t(accountCreated ? 'auth.retryPhotoSubmit' : 'auth.registerSubmit')}
              </Button>
            </div>
          )}

          <p className="text-center text-sm text-gray-500 mt-6">
            {t('auth.haveAccount')}{' '}
            <Link to="/login" className="text-brand-500 font-medium">{t('auth.signInLink')}</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
