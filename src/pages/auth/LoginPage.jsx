import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { Mail, Eye, EyeOff } from 'lucide-react'
import { Button, Input, Checkbox } from '@/components/ui'

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
    if (loading) return
    setError('')
    setLoading(true)
    try {
      await login(form.email, form.password)
      if (remember) localStorage.setItem(REMEMBER_KEY, form.email)
      else localStorage.removeItem(REMEMBER_KEY)
      // UserLayout menjadi satu-satunya gerbang roadmap supaya perubahan state
      // auth dan request setting tidak memicu onboarding dua kali.
      navigate('/', { replace: true })
    } catch {
      setError(t('auth.loginError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center px-4 py-8 gradient-main">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-surface px-6 py-7">
        <p className="text-sm font-semibold text-brand-700">ESC Siantan</p>
        <h1 className="font-display text-2xl font-bold text-gray-900 mt-2">{t('auth.welcome')}</h1>
        <p className="text-sm text-gray-600 mt-2 mb-6">{t('auth.loginSubtitle')}</p>

        {error && (
          <div id="login-error" role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" aria-describedby={error ? 'login-error' : undefined}>
          <Input
            label={t('auth.emailOrPhone')} name="username" autoComplete="username"
            type="text" required autoCapitalize="none" autoCorrect="off" icon={Mail}
            value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
          />
          <Input
            label={t('auth.password')} name="password" autoComplete="current-password"
            type={showPassword ? 'text' : 'password'} required className="pr-14"
            value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
            rightElement={
              <button
                type="button" onClick={() => setShowPassword(s => !s)}
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                aria-pressed={showPassword}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 rounded-lg flex items-center justify-center text-gray-600 hover:bg-control transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            }
          />
          <Checkbox label={t('auth.rememberMe')} checked={remember}
            onChange={e => setRemember(e.target.checked)} className="min-h-11" />
          <Button type="submit" loading={loading} className="w-full" size="lg">{t('auth.signIn')}</Button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-600">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="inline-flex min-h-11 items-center font-semibold text-brand-700 hover:underline">{t('auth.registerNow')}</Link>
        </p>
        <div className="flex flex-col items-center">
          <Link to="/lupa-password" className="inline-flex min-h-11 items-center text-sm text-brand-700 hover:underline">{t('auth.forgotPassword')}</Link>
          <Link to="/kebijakan-privasi" className="inline-flex min-h-11 items-center text-sm text-gray-600 hover:underline">{t('auth.privacyPolicy')}</Link>
        </div>
      </div>
    </div>
  )
}
