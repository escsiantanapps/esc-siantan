import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { supabase } from '@/lib/supabase'
import { fetchApi } from '@/lib/utils'
import { Button, Input, Select, GradientHeader } from '@/components/ui'

async function postJson(url, payload) {
  const res = await fetchApi(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan.')
  return data
}

export default function RegisterPage() {
  const { register } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '', confirmPassword: '',
    gender: '', birth_date: '', birth_place: '', address: '',
    blood_type: '', social_media: '',
  })

  // Mode aktivasi: dipicu bila No.HP pendaftar cocok dgn jemaat lama yang belum
  // punya login (auth_id NULL). Alih-alih membuat akun ganda, kita verifikasi
  // kepemilikan nomor via OTP WhatsApp lalu tautkan + set password. Ini
  // menggantikan halaman Aktivasi lama (kini masuk lewat tombol Daftar).
  const [activateMode, setActivateMode] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpMethod, setOtpMethod] = useState('')
  const [otpInfo, setOtpInfo] = useState('')
  const [otpCooldown, setOtpCooldown] = useState(0)

  useEffect(() => {
    if (otpCooldown <= 0) return
    const id = setInterval(() => setOtpCooldown(s => (s <= 1 ? 0 : s - 1)), 1000)
    return () => clearInterval(id)
  }, [otpCooldown])

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

  async function beginActivation() {
    const r = await postJson('/api/activate-request', { phone: form.phone })
    setOtpMethod(r.method || 'whatsapp')
    setOtpInfo(r.method === 'email' ? t('act.emailCodeSent', { email: r.masked || '' }) : t('act.codeSent', { wa: r.masked || '' }))
    setOtpCooldown(60)
    setActivateMode(true)
  }

  async function handleSubmit() {
    if (form.password !== form.confirmPassword) { setError(t('auth.pwMismatch')); return }
    // Samakan dgn aturan aktivasi/reset (huruf + angka) supaya member migrasi
    // tidak tersangkut di langkah OTP karena password ditolak activate-verify.
    if (form.password.length < 8 || !/[a-zA-Z]/.test(form.password) || !/\d/.test(form.password)) {
      setError(t('auth.pwMin8')); return
    }
    setError(''); setLoading(true)
    try {
      // Cek lebih dulu: nomor/email milik jemaat lama? Tiga kemungkinan:
      //  (a) needsActivation → jemaat lama belum punya login → verifikasi OTP.
      //  (b) hasLogin/taken   → sudah punya akun → arahkan ke Masuk (jgn ganda).
      //  (c) benar-benar baru  → daftar normal (status Menunggu Persetujuan).
      const chk = await postJson('/api/check-phone', { phone: form.phone, email: form.email }).catch(() => null)
      if (chk?.needsActivation) {
        await beginActivation()
        return
      }
      if (chk?.hasLogin || chk?.emailTaken || chk?.phoneTaken) {
        setError(chk?.emailTaken ? t('auth.emailTaken') : t('auth.phoneTaken'))
        setStep(1)
        return
      }
      await register(form)
      
      // Kirim notifikasi web push ke Admin
      const { pushService } = await import('@/services/pushService')
      await pushService.notifyAdmin('new_user', { name: form.name })
      
      navigate('/') // gate PrivateRoute → AccountStatusPage (menunggu persetujuan)
    } catch (err) {
      setError(
        err.message === 'PHONE_TAKEN' ? t('auth.phoneTaken')
        : err.message === 'EMAIL_TAKEN' ? t('auth.emailTaken')
        : (err.message || t('auth.registerFailed'))
      )
      setStep(1) // kembali ke langkah data agar bisa perbaiki nomor/email
    } finally {
      setLoading(false)
    }
  }

  // Verifikasi OTP → tautkan akun jemaat lama + set password + auto login.
  async function submitActivation(e) {
    e?.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(otp.trim())) { setError(t('auth.otpInvalid')); return }
    setLoading(true)
    try {
      const r = await postJson('/api/activate-verify', {
        phone: form.phone, code: otp.trim(), password: form.password, method: otpMethod,
      })
      if (r.access_token && r.refresh_token) {
        await supabase.auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token })
        navigate('/', { replace: true })
      } else {
        navigate('/login', { replace: true })
      }
    } catch (err) {
      setError(err.message || t('auth.otpWrong'))
    } finally {
      setLoading(false)
    }
  }

  async function resendActivation() {
    if (otpCooldown > 0) return
    setError('')
    try { await beginActivation() } catch (err) { setError(err.message) }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center sm:items-center sm:px-4 sm:py-10">
      <div className="w-full max-w-md min-h-screen sm:min-h-0 flex flex-col bg-surface sm:rounded-3xl sm:shadow-2xl sm:shadow-black/10 sm:overflow-hidden">
        <GradientHeader
          title={t('auth.createAccount')}
          subtitle={t('auth.createSubtitle')}
          back={step > 1 ? () => setStep(s => s - 1) : undefined}
        />

        {/* Step indicator (disembunyikan saat verifikasi OTP jemaat lama) */}
        {!activateMode && (
        <div className="bg-surface px-6 py-3 flex items-center gap-2 border-b border-gray-100">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0
                ${s < step ? 'gradient-main text-white' : s === step ? 'border-2 border-brand-500 text-brand-500' : 'border-2 border-gray-200 text-gray-300'}`}>
                {s < step ? '✓' : s}
              </div>
              <span className={`text-xs ${s === step ? 'text-brand-500 font-medium' : 'text-gray-400'}`}>
                {[t('auth.stepAccount'), t('auth.stepData'), t('auth.stepDone')][s - 1]}
              </span>
              {s < 3 && <div className="flex-1 h-px bg-gray-200" />}
            </div>
          ))}
        </div>
        )}

        <div className="flex-1 bg-surface px-6 py-6">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>
          )}

          {/* Verifikasi OTP jemaat lama (No.HP cocok data migrasi, belum punya login) */}
          {activateMode && (
            <div>
              {otpInfo && <div className="bg-green-50 border border-green-100 text-green-700 text-sm rounded-xl px-4 py-3 mb-4">{otpInfo}</div>}
              <div className="bg-amber-50 border border-amber-100 text-amber-700 text-sm rounded-xl px-4 py-3 mb-4">
                {t('reg.activateNotice')}
              </div>
              <form onSubmit={submitActivation} className="space-y-4">
                <Input
                  label={t('auth.otpLabel')} inputMode="numeric" placeholder="123456" required
                  value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="tracking-[0.4em] text-center text-lg"
                />
                <Button type="submit" size="lg" className="w-full" loading={loading}>{t('reg.activateSubmit')}</Button>
              </form>
              <div className="mt-4 flex items-center justify-between text-sm">
                <button type="button" onClick={() => { setActivateMode(false); setOtp(''); setError(''); setOtpInfo('') }} className="text-gray-500">{t('reg.backToForm')}</button>
                <button type="button" onClick={resendActivation} disabled={otpCooldown > 0} className="text-brand-500 disabled:opacity-50">
                  {otpCooldown > 0 ? t('auth.resendIn', { s: otpCooldown }) : t('auth.resendCode')}
                </button>
              </div>
            </div>
          )}

          {!activateMode && step === 1 && (
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

          {!activateMode && step === 2 && (
            <div className="space-y-4">
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
              <Button className="w-full mt-2" size="lg" onClick={() => { setStep(3) }}>
                {t('auth.next')}
              </Button>
            </div>
          )}

          {!activateMode && step === 3 && (
            <div className="flex flex-col items-center text-center py-8">
              <div className="w-20 h-20 rounded-full gradient-main flex items-center justify-center mb-4 text-4xl">✓</div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('auth.readyTitle')}</h2>
              <p className="text-sm text-gray-500 mb-2">{t('auth.name')}: <strong className="text-gray-800">{form.name}</strong></p>
              <p className="text-sm text-gray-500 mb-6">{t('auth.email')}: <strong className="text-gray-800">{form.email}</strong></p>
              <p className="text-xs text-gray-400 mb-4">
                {t('auth.consentPrefix')}{' '}
                <Link to="/kebijakan-privasi" className="text-brand-500 font-medium" target="_blank">{t('auth.privacyPolicy')}</Link>.
              </p>
              <Button className="w-full" size="lg" loading={loading} onClick={handleSubmit}>
                {t('auth.registerSubmit')}
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
