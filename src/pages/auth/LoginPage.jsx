import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { UserRound, LockKeyhole, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { Button, Input, Checkbox } from '@/components/ui'
import './LoginPage.css'

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
    <main className="login-page">
      <div className="login-shell">
        <header className="login-brand">
          <div className="login-wordmark">
            <img src="/icons/icon-192.png" alt="" width="56" height="56" className="login-logo" />
            <div>
              <p className="login-brand-name">{t('auth.brandName')}</p>
              <p className="login-brand-location">{t('auth.brandLocation')}</p>
            </div>
          </div>
          <div className="login-introduction">
            <p className="login-church-name">{t('auth.churchName')}</p>
            <p className="login-brand-description">{t('auth.portalDescription')}</p>
          </div>
          <p className="login-brand-caption">{t('auth.memberPortal')}</p>
        </header>

        <section className="login-form-panel" aria-labelledby="login-title">
          <div className="login-form-heading">
            <p className="login-eyebrow">{t('auth.loginTitle')}</p>
            <h1 id="login-title" className="font-display text-3xl font-bold text-gray-900">{t('auth.welcome')}</h1>
            <p className="text-base text-gray-600 mt-2">{t('auth.loginSubtitle')}</p>
          </div>

          {error && (
            <div id="login-error" role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" aria-describedby={error ? 'login-error' : undefined}>
            <Input
              label={t('auth.emailOrPhone')} name="username" autoComplete="username"
              type="text" required autoCapitalize="none" autoCorrect="off" icon={UserRound} className="min-h-12"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            />
            <Input
              label={t('auth.password')} name="password" autoComplete="current-password"
              type={showPassword ? 'text' : 'password'} required icon={LockKeyhole} className="pr-14 min-h-12"
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
            <div className="login-form-options">
              <Checkbox label={t('auth.rememberMe')} checked={remember}
                onChange={e => setRemember(e.target.checked)} className="min-h-11" />
              <Link to="/lupa-password" className="login-link">{t('auth.forgotPassword')}</Link>
            </div>
            <Button type="submit" loading={loading} className="login-submit w-full min-h-12" size="lg">
              {t('auth.signIn')} <ArrowRight size={18} aria-hidden="true" />
            </Button>
          </form>

          <div className="login-registration">
            <span className="text-sm text-gray-600">{t('auth.noAccount')}</span>
            <Link to="/register" className="login-link font-semibold">{t('auth.registerNow')} <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <footer className="login-footer">
            <Link to="/kebijakan-privasi" className="inline-flex min-h-11 items-center text-sm text-gray-600 hover:underline">{t('auth.privacyPolicy')}</Link>
          </footer>
        </section>
      </div>
    </main>
  )
}
