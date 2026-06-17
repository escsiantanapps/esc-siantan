import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button, Input } from '@/components/ui'

export default function ForgotPasswordPage() {
  const { resetPassword, verifyResetOtp, updatePassword } = useAuth()
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
      setInfo(`Kode 6 digit telah dikirim ke ${email.trim()}. Cek email (termasuk folder spam).`)
    } catch (err) {
      setError(err.message || 'Gagal mengirim kode. Silakan coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(otp.trim())) { setError('Kode OTP harus 6 angka.'); return }
    if (password.length < 6) { setError('Kata sandi minimal 6 karakter.'); return }
    if (password !== confirm) { setError('Konfirmasi kata sandi tidak cocok.'); return }
    setLoading(true)
    try {
      await verifyResetOtp(email.trim(), otp.trim())
      await updatePassword(password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Kode salah atau sudah kedaluwarsa. Coba kirim ulang.')
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
          <h1 className="text-white text-2xl font-bold">Lupa Kata Sandi</h1>
          <p className="text-white/70 text-sm mt-1">
            {step === 'email' ? 'Kami akan kirim kode ke email kamu' : 'Masukkan kode & kata sandi baru'}
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
              <h2 className="text-gray-900 text-lg font-semibold mb-6">Masukkan email kamu</h2>
              <form onSubmit={sendCode} className="space-y-4">
                <Input label="Email" type="email" placeholder="nama@email.com" required value={email} onChange={e => setEmail(e.target.value)} />
                <Button type="submit" loading={loading} className="w-full" size="lg">Kirim Kode</Button>
              </form>
              <div className="mt-6 text-center">
                <Link to="/login" className="text-sm text-brand-500">← Kembali ke login</Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-gray-900 text-lg font-semibold mb-6">Verifikasi & sandi baru</h2>
              <form onSubmit={handleReset} className="space-y-4">
                <Input
                  label="Kode OTP (6 angka)" inputMode="numeric" placeholder="123456" required
                  value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="tracking-[0.4em] text-center text-lg"
                />
                <Input label="Kata Sandi Baru" type="password" placeholder="••••••••" required value={password} onChange={e => setPassword(e.target.value)} />
                <Input label="Konfirmasi Kata Sandi" type="password" placeholder="••••••••" required value={confirm} onChange={e => setConfirm(e.target.value)} />
                <Button type="submit" loading={loading} className="w-full" size="lg">Simpan Kata Sandi Baru</Button>
              </form>
              <div className="mt-5 flex items-center justify-between text-sm">
                <button onClick={() => { setStep('email'); setOtp(''); setError(''); setInfo('') }} className="text-gray-500">← Ganti email</button>
                <button onClick={sendCode} disabled={loading} className="text-brand-500 disabled:opacity-50">Kirim ulang kode</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
