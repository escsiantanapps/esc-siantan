import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { Button, Input } from '@/components/ui'

export default function ForgotPasswordPage() {
  const { resetPassword, verifyResetOtp, updatePassword } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()

  const [step, setStep] = useState('email') // 'email' | 'otp'
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function sendCode(e) {
    e?.preventDefault()
    setError(''); setInfo(''); setLoading(true)
    try {
      await resetPassword(email.trim())
      setStep('otp')
      setInfo(t('auth.codeSent', { email: email.trim() }))
    } catch (err) {
      setError(err.message || t('auth.sendCodeFailed'))
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(otp.trim())) { setError(t('auth.otpInvalid')); return }
    if (password.length < 6) { setError(t('auth.pwMin6')); return }
    if (password !== confirm) { setError(t('auth.pwMismatch6')); return }
    setLoading(true)
    try {
      await verifyResetOtp(email.trim(), otp.trim())
      await updatePassword(password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || t('auth.otpWrong'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center sm:items-center sm:px-4 sm:py-10">
      <div className="w-full max-w-md min-h-screen sm:min-h-0 flex flex-col bg-surface sm:rounded-3xl sm:shadow-2xl sm:shadow-black/10 sm:overflow-hidden">
        <div className="gradient-main pt-16 pb-10 px-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
            <span className="text-3xl">{step === 'email' ? '🔑' : '🔢'}</span>
          </div>
          <h1 className="text-white text-2xl font-bold">{t('auth.forgotTitle')}</h1>
          <p className="text-white/70 text-sm mt-1">
            {step === 'email' ? t('auth.forgotSubEmail') : t('auth.forgotSubOtp')}
          </p>
        </div>

        <div className="flex-1 bg-surface rounded-t-3xl -mt-4 px-6 pt-8 pb-6">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>
          )}
          {info && (
            <div className="bg-green-50 border border-green-100 text-green-700 text-sm rounded-xl px-4 py-3 mb-4">{info}</div>
          )}

          {step === 'email' ? (
            <>
              <h2 className="text-gray-900 text-lg font-semibold mb-6">{t('auth.enterEmail')}</h2>
              <form onSubmit={sendCode} className="space-y-4">
                <Input label={t('auth.email')} type="email" placeholder="nama@email.com" required value={email} onChange={e => setEmail(e.target.value)} />
                <Button type="submit" loading={loading} className="w-full" size="lg">{t('auth.sendCode')}</Button>
              </form>
              <div className="mt-6 text-center">
                <Link to="/login" className="text-sm text-brand-500">{t('auth.backToLogin')}</Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-gray-900 text-lg font-semibold mb-6">{t('auth.verifyTitle')}</h2>
              <form onSubmit={handleReset} className="space-y-4">
                <Input
                  label={t('auth.otpLabel')} inputMode="numeric" placeholder="123456" required
                  value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="tracking-[0.4em] text-center text-lg"
                />
                <Input label={t('auth.newPassword')} type="password" placeholder="••••••••" required value={password} onChange={e => setPassword(e.target.value)} />
                <Input label={t('auth.confirmPassword')} type="password" placeholder="••••••••" required value={confirm} onChange={e => setConfirm(e.target.value)} />
                <Button type="submit" loading={loading} className="w-full" size="lg">{t('auth.saveNewPassword')}</Button>
              </form>
              <div className="mt-5 flex items-center justify-between text-sm">
                <button onClick={() => { setStep('email'); setOtp(''); setError(''); setInfo('') }} className="text-gray-500">{t('auth.changeEmail')}</button>
                <button onClick={sendCode} disabled={loading} className="text-brand-500 disabled:opacity-50">{t('auth.resendCode')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
