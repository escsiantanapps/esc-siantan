import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, Phone, UserRound } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { compressImage, fetchApi } from '@/lib/utils'
import { Button, Input, Select } from '@/components/ui'
import Uploader from '@/components/Uploader'
import AuthScene from './AuthScene'

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
  const [fieldErrors, setFieldErrors] = useState({})
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [processingPhoto, setProcessingPhoto] = useState(false)
  const [accountCreated, setAccountCreated] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '', confirmPassword: '',
    gender: '', birth_date: '', birth_place: '', address: '',
    blood_type: '', social_media: '',
  })

  useEffect(() => () => {
    if (photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  function set(key, val) {
    setForm(p => ({ ...p, [key]: val }))
    setFieldErrors(previous => ({ ...previous, [key]: undefined }))
  }

  // Periksa sebelum biodata/foto agar pengguna tidak mengulang langkah akhir.
  // Validasi ini membantu UI; otoritas akun tetap berada di backend Auth.
  function accountErrors() {
    const errors = {}
    if (!form.name.trim()) errors.name = 'auth.fieldRequired'
    if (!form.email.trim()) errors.email = 'auth.fieldRequired'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'auth.emailInvalid'
    if (!form.phone.trim()) errors.phone = 'auth.fieldRequired'
    else if (form.phone.replace(/\D/g, '').length < 9) errors.phone = 'auth.phoneInvalid'
    if (!form.password) errors.password = 'auth.fieldRequired'
    else if (form.password.length < 8 || !/[a-zA-Z]/.test(form.password) || !/[0-9]/.test(form.password)) errors.password = 'auth.pwMin8'
    if (!form.confirmPassword) errors.confirmPassword = 'auth.fieldRequired'
    else if (form.password !== form.confirmPassword) errors.confirmPassword = 'auth.pwMismatch'
    return errors
  }

  async function nextAccount(e) {
    e.preventDefault()
    const errors = accountErrors()
    setFieldErrors(errors)
    setError('')
    const firstInvalid = Object.keys(errors)[0]
    if (firstInvalid) {
      e.currentTarget.elements.namedItem(firstInvalid)?.focus()
      return
    }

    setLoading(true)
    try {
      const check = await postJson('/api/check-phone', { phone: form.phone, email: form.email }).catch(() => null)

      if (check?.hasLogin || check?.phoneTaken) {
        setError(t('auth.phoneTaken'))
        return
      }
      if (check?.emailTaken) {
        setError(t('auth.emailTaken'))
        return
      }
      setStep(2)
    } finally {
      setLoading(false)
    }
  }

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
    if (loading) return
    if (!accountCreated) {
      const errors = accountErrors()
      if (Object.keys(errors).length) { setFieldErrors(errors); setStep(1); return }
    }
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


        if (chk?.hasLogin || chk?.phoneTaken) {
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
    <AuthScene variant="register">
      {step > 1 && !accountCreated && <Button type="button" variant="ghost" className="auth-step-back" onClick={() => setStep(s => s - 1)}>
        <ArrowLeft size={17} aria-hidden="true" />{t('quality.back')}
      </Button>}
      <div className="auth-card-heading">
        <h1>{t('auth.registerTitle')}</h1>
        <p>{t('auth.registerCardSubtitle')}</p>
      </div>

      <div className="auth-step-track" role="group" aria-label={t('auth.registrationProgress')}>
        {[1, 2, 3].map(s => <div key={s} className={`auth-step-item ${s < step ? 'is-complete' : s === step ? 'is-current' : ''}`} aria-current={s === step ? 'step' : undefined}>
          <span className="auth-step-number">{s < step ? <Check size={14} aria-hidden="true" /> : s}</span>
          <span>{[t('auth.stepAccount'), t('auth.stepData'), t('auth.stepDone')][s - 1]}</span>
        </div>)}
      </div>

      {error && <div role="alert" className="auth-error">{error}</div>}

      <div>

          {step === 1 && (
            <form noValidate onSubmit={nextAccount} className="space-y-4">
              <Input name="name" label={t('auth.fullName')} icon={UserRound} required autoComplete="name" error={fieldErrors.name && t(fieldErrors.name)} placeholder={t('auth.fullNamePh')} value={form.name} onChange={e => set('name', e.target.value)} />
              <Input name="email" label={t('auth.email')} icon={Mail} type="email" required autoComplete="email" inputMode="email" error={fieldErrors.email && t(fieldErrors.email)} placeholder={t('auth.emailPlaceholder')} value={form.email} onChange={e => set('email', e.target.value)} />
              <Input name="phone" label={t('auth.phone')} icon={Phone} type="tel" required autoComplete="tel" error={fieldErrors.phone && t(fieldErrors.phone)} placeholder={t('auth.phonePlaceholder')} value={form.phone} onChange={e => set('phone', e.target.value)} />
              <Input name="password" label={t('auth.password')} icon={LockKeyhole} type={showPassword ? 'text' : 'password'} required autoComplete="new-password" error={fieldErrors.password && t(fieldErrors.password)} placeholder={t('auth.passwordMin8')} className="pr-14" value={form.password} onChange={e => set('password', e.target.value)} rightElement={
                <button type="button" className="auth-password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')} aria-pressed={showPassword}>
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              } />
              <Input name="confirmPassword" label={t('auth.repeatPassword')} icon={LockKeyhole} type={showConfirmPassword ? 'text' : 'password'} required autoComplete="new-password" error={fieldErrors.confirmPassword && t(fieldErrors.confirmPassword)} placeholder={t('auth.repeatPasswordPh')} className="pr-14" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} rightElement={
                <button type="button" className="auth-password-toggle" onClick={() => setShowConfirmPassword(value => !value)} aria-label={t(showConfirmPassword ? 'auth.hidePassword' : 'auth.showPassword')} aria-pressed={showConfirmPassword}>
                  {showConfirmPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              } />
              <Button type="submit" loading={loading} className="auth-submit w-full mt-2" size="lg">{t('auth.next')}<ArrowRight size={18} aria-hidden="true" /></Button>
            </form>
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
              <Button className="auth-submit w-full mt-2" size="lg" loading={processingPhoto} onClick={() => {
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
              <Button className="auth-submit w-full" size="lg" loading={loading} onClick={handleSubmit}>
                {t(accountCreated ? 'auth.retryPhotoSubmit' : 'auth.registerSubmit')}
              </Button>
            </div>
          )}

          <p className="auth-footnote mt-6">
            {t('auth.haveAccount')}{' '}
            <Link to="/login" className="auth-secondary-link">{t('auth.signInLink')}</Link>
          </p>
      </div>
    </AuthScene>
  )
}
