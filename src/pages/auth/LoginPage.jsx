import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { ONBOARDING_KEY } from '@/pages/OnboardingPage'
import { Mail, Lock, Eye, EyeOff, Check } from 'lucide-react'

const REMEMBER_KEY = 'esc-remember-email'

export default function LoginPage() {
  const { login } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: localStorage.getItem(REMEMBER_KEY) || '', password: '' })
  const [remember, setRemember] = useState(!!localStorage.getItem(REMEMBER_KEY))
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.email, form.password)
      if (remember) localStorage.setItem(REMEMBER_KEY, form.email)
      else localStorage.removeItem(REMEMBER_KEY)
      // Onboarding tampil sekali, pada login pertama di perangkat ini.
      navigate(localStorage.getItem(ONBOARDING_KEY) ? '/' : '/onboarding')
    } catch {
      setError(t('auth.loginError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative gradient-main">
      {/* Scrim lembut agar kartu kaca tetap terbaca di atas gambar apa pun */}
      <div className="absolute inset-0 bg-black/10" />

      {/* Kartu kaca */}
      <div className="relative w-full max-w-sm rounded-[1.75rem] border border-white/40 bg-white/15 backdrop-blur-xl shadow-2xl shadow-black/20 px-7 py-8 text-white">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80">ESC Siantan</p>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-1">{t('auth.welcome')} 👋</h1>
        <p className="text-sm text-white/85 mt-1.5 mb-7">{t('auth.loginSubtitle')}</p>

        {error && (
          <div className="bg-red-500/20 border border-red-300/40 text-white text-sm rounded-xl px-4 py-3 mb-4 animate-fade-in">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="relative">
            <input
              type="text" required placeholder={t('auth.emailOrPhone')}
              autoCapitalize="none" autoCorrect="off"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              className="w-full bg-white/10 border border-white/40 rounded-2xl pl-5 pr-12 py-3.5 text-white placeholder-white/70 outline-none focus:border-white/80 focus:bg-white/15 transition"
            />
            <Mail size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80" />
          </div>

          {/* Password */}
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'} required placeholder={t('auth.password')}
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              className="w-full bg-white/10 border border-white/40 rounded-2xl pl-5 pr-12 py-3.5 text-white placeholder-white/70 outline-none focus:border-white/80 focus:bg-white/15 transition"
            />
            <button
              type="button" onClick={() => setShowPassword(s => !s)} tabIndex={-1}
              aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white transition"
            >
              {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          </div>

          {/* Remember me */}
          <button
            type="button" onClick={() => setRemember(r => !r)}
            className="flex items-center gap-2.5 text-sm text-white/90"
          >
            <span className={`w-5 h-5 rounded-md flex items-center justify-center border transition
              ${remember ? 'bg-white border-white' : 'bg-white/10 border-white/50'}`}>
              {remember && <Check size={13} className="text-gray-800" strokeWidth={3} />}
            </span>
            {t('auth.rememberMe')}
          </button>

          {/* Tombol Login (gradien hijau) */}
          <button
            type="submit" disabled={loading}
            className="w-full mt-1 py-3.5 rounded-2xl font-display text-lg font-bold text-gray-900 bg-white shadow-lg shadow-black/20 transition active:scale-[0.99] hover:bg-white/90 disabled:opacity-70"
          >
            {loading ? '…' : t('auth.signIn')}
          </button>
        </form>

        <div className="mt-5 text-center text-sm text-white/90">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-bold hover:underline">{t('auth.registerNow')}</Link>
        </div>
        <div className="mt-3 text-center space-x-3">
          <Link to="/lupa-password" className="text-xs text-white/75 hover:text-white transition">{t('auth.forgotPassword')}</Link>
          <span className="text-white/30">•</span>
          <Link to="/aktivasi" className="text-xs text-white/75 hover:text-white transition">{t('act.link')}</Link>
        </div>
      </div>
    </div>
  )
}
