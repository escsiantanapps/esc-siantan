import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ShieldCheck, UserRoundPlus } from 'lucide-react'
import { useLang } from '@/hooks/useLang'
import { supabase } from '@/lib/supabase'
import { fetchApi } from '@/lib/utils'
import { Button, Input } from '@/components/ui'

async function postJson(url, payload) {
  const response = await fetchApi(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || '')
    error.code = data.code || 'INTERNAL'
    throw error
  }
  return data
}

const ERROR_KEYS = {
  PHONE_INVALID: 'auth.phoneInvalid',
  EMAIL_INVALID: 'auth.emailInvalid',
  EMAIL_TAKEN: 'auth.emailTaken',
  PASSWORD_WEAK: 'auth.pwMin8',
  INPUT_INVALID: 'auth.otpInvalid',
  OTP_INVALID: 'auth.otpWrong',
  ALREADY_ACTIVE: 'auth.phoneTaken',
}

export default function ActivatePage() {
  const { t } = useLang()
  const location = useLocation()
  const navigate = useNavigate()
  const [step, setStep] = useState('identity')
  const [phone, setPhone] = useState(location.state?.phone || '')
  const [email, setEmail] = useState(location.state?.email || '')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setInterval(() => setCooldown(value => (value <= 1 ? 0 : value - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  async function sendCode(event) {
    event?.preventDefault()
    if (loading || cooldown > 0) return
    setError(''); setInfo(''); setLoading(true)
    try {
      const result = await postJson('/api/activate-request', {
        phone: phone.trim(),
        email: email.trim(),
      })
      setStep('verify')
      setInfo(t('auth.waCodeSent', { wa: result.masked || '' }))
      setCooldown(60)
    } catch (requestError) {
      setError(t(ERROR_KEYS[requestError.code] || 'auth.sendCodeFailed'))
    } finally {
      setLoading(false)
    }
  }

  async function activate(event) {
    event.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(otp.trim())) { setError(t('auth.otpInvalid')); return }
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      setError(t('auth.pwMin8')); return
    }
    if (password !== confirmPassword) { setError(t('auth.pwMismatch')); return }

    setLoading(true)
    try {
      const result = await postJson('/api/activate-verify', {
        phone: phone.trim(),
        email: email.trim(),
        code: otp.trim(),
        password,
      })
      if (result.access_token && result.refresh_token) {
        await supabase.auth.setSession({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        })
        navigate('/', { replace: true })
      } else {
        navigate('/login', { replace: true })
      }
    } catch (activationError) {
      setError(t(ERROR_KEYS[activationError.code] || 'auth.registerFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex justify-center sm:items-center sm:px-4 sm:py-10">
      <div className="w-full max-w-md min-h-screen sm:min-h-0 flex flex-col bg-surface sm:rounded-3xl sm:shadow-2xl sm:shadow-black/10 sm:overflow-hidden">
        <header className="gradient-main pt-16 pb-10 px-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 text-white bg-white/20 rounded-2xl flex items-center justify-center mb-4">
            {step === 'identity' ? <UserRoundPlus size={28} aria-hidden="true" /> : <ShieldCheck size={28} aria-hidden="true" />}
          </div>
          <h1 className="text-white text-2xl font-bold">{t('reg.activateSubmit')}</h1>
          <p className="text-white/75 text-sm mt-1">
            {step === 'identity' ? t('auth.createSubtitle') : t('auth.forgotSubOtp')}
          </p>
        </header>

        <section className="flex-1 bg-surface rounded-t-3xl -mt-4 px-6 pt-8 pb-6">
          {error && <div role="alert" className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>}
          {info && <div role="status" className="bg-green-50 border border-green-100 text-green-700 text-sm rounded-xl px-4 py-3 mb-4">{info}</div>}

          {step === 'identity' ? (
            <form onSubmit={sendCode} className="space-y-4">
              <Input name="phone" label={t('auth.phone')} type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={event => setPhone(event.target.value)} />
              <Input name="email" label={t('auth.email')} type="email" inputMode="email" autoComplete="email" placeholder={t('auth.emailPlaceholder')} required value={email} onChange={event => setEmail(event.target.value)} />
              <Button type="submit" loading={loading} className="w-full" size="lg">{t('auth.sendCode')}</Button>
              <div className="text-center"><Link to="/login" className="text-sm text-brand-500">{t('auth.backToLogin')}</Link></div>
            </form>
          ) : (
            <form onSubmit={activate} className="space-y-4">
              <Input name="otp" label={t('auth.otpLabel')} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" required value={otp}
                onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} className="tracking-[0.4em] text-center text-lg" />
              <Input name="password" label={t('auth.newPassword')} type="password" autoComplete="new-password" placeholder="••••••••" required value={password} onChange={event => setPassword(event.target.value)} />
              <Input name="confirmPassword" label={t('auth.confirmPassword')} type="password" autoComplete="new-password" placeholder="••••••••" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
              <Button type="submit" loading={loading} className="w-full" size="lg">{t('reg.activateSubmit')}</Button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={() => { setStep('identity'); setOtp(''); setError(''); setInfo('') }} className="text-gray-500">{t('reg.backToForm')}</button>
                <button type="button" onClick={sendCode} disabled={loading || cooldown > 0} className="text-brand-500 disabled:opacity-50">
                  {cooldown > 0 ? t('auth.resendIn', { s: cooldown }) : t('auth.resendCode')}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  )
}
