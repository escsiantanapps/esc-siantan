import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLang } from '@/hooks/useLang'
import { supabase } from '@/lib/supabase'
import { Button, Input } from '@/components/ui'

async function postJson(url, payload) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan.')
  return data
}

// Aktivasi akun jemaat lama (data impor) memakai nomor HP + OTP WhatsApp.
export default function ActivatePage() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [step, setStep] = useState('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown(s => (s <= 1 ? 0 : s - 1)), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  async function sendCode(e) {
    e?.preventDefault()
    if (cooldown > 0) return
    setError(''); setInfo(''); setLoading(true)
    try {
      const r = await postJson('/api/activate-request', { phone: phone.trim() })
      setStep('otp'); setInfo(t('act.codeSent', { wa: r.masked || '' })); setCooldown(60)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  async function activate(e) {
    e.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(otp.trim())) { setError(t('auth.otpInvalid')); return }
    if (password.length < 6) { setError(t('auth.pwMin6')); return }
    if (password !== confirm) { setError(t('auth.pwMismatch6')); return }
    setLoading(true)
    try {
      const r = await postJson('/api/activate-verify', { phone: phone.trim(), code: otp.trim(), password })
      if (r.access_token && r.refresh_token) {
        await supabase.auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token })
        navigate('/', { replace: true })
      } else {
        navigate('/login', { replace: true })
      }
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center sm:items-center sm:px-4 sm:py-10">
      <div className="w-full max-w-md min-h-screen sm:min-h-0 flex flex-col bg-surface sm:rounded-3xl sm:shadow-2xl sm:shadow-black/10 sm:overflow-hidden">
        <div className="gradient-main pt-16 pb-10 px-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
            <span className="text-3xl">{step === 'phone' ? '📱' : '🔢'}</span>
          </div>
          <h1 className="text-white text-2xl font-bold">{t('act.title')}</h1>
          <p className="text-white/70 text-sm mt-1">{step === 'phone' ? t('act.subPhone') : t('act.subOtp')}</p>
        </div>

        <div className="flex-1 bg-surface rounded-t-3xl -mt-4 px-6 pt-8 pb-6">
          {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>}
          {info && <div className="bg-green-50 border border-green-100 text-green-700 text-sm rounded-xl px-4 py-3 mb-4">{info}</div>}

          {step === 'phone' ? (
            <form onSubmit={sendCode} className="space-y-4">
              <Input label={t('act.phoneLabel')} type="tel" inputMode="numeric" placeholder="08xxxxxxxxxx" required value={phone} onChange={e => setPhone(e.target.value)} />
              <p className="text-xs text-gray-400">{t('act.phoneHint')}</p>
              <Button type="submit" loading={loading} className="w-full" size="lg">{t('auth.sendCode')}</Button>
              <div className="text-center"><Link to="/login" className="text-sm text-brand-500">{t('auth.backToLogin')}</Link></div>
            </form>
          ) : (
            <form onSubmit={activate} className="space-y-4">
              <Input label={t('auth.otpLabel')} inputMode="numeric" placeholder="123456" required value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} className="tracking-[0.4em] text-center text-lg" />
              <Input label={t('act.newPassword')} type="password" placeholder="••••••••" required value={password} onChange={e => setPassword(e.target.value)} />
              <Input label={t('auth.confirmPassword')} type="password" placeholder="••••••••" required value={confirm} onChange={e => setConfirm(e.target.value)} />
              <Button type="submit" loading={loading} className="w-full" size="lg">{t('act.submit')}</Button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={() => { setStep('phone'); setOtp(''); setError(''); setInfo('') }} className="text-gray-500">{t('act.changePhone')}</button>
                <button type="button" onClick={sendCode} disabled={loading || cooldown > 0} className="text-brand-500 disabled:opacity-50">
                  {cooldown > 0 ? t('auth.resendIn', { s: cooldown }) : t('auth.resendCode')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
