import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { useMaintenance } from '@/hooks/useMaintenance'
import { UserRound, LockKeyhole, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { Button, Input, Checkbox } from '@/components/ui'
import AuthScene from './AuthScene'

const REMEMBER_KEY = 'esc-remember-email'

export default function LoginPage() {
  const { login } = useAuth()
  const { t } = useLang()
  const { enabled: maintenanceEnabled } = useMaintenance()
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
    } catch (err) {
      setError(t(err?.message === 'SERVICE_UNAVAILABLE' ? 'auth.serviceUnavailable' : 'auth.loginError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthScene variant="login">
      <div className="auth-card-heading">
        <h1 id="login-title">{t('auth.loginTitle')}</h1>
        <p>{t('auth.loginCardSubtitle')}</p>
      </div>

      {error && <div id="login-error" role="alert" className="auth-error">{error}</div>}

      {maintenanceEnabled && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="status">
          {t('maintenance.loginNotice')}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" aria-describedby={error ? 'login-error' : undefined}>
        <Input
          label={t('auth.emailOrPhone')} name="username" autoComplete="username"
          type="text" required autoCapitalize="none" autoCorrect="off" icon={UserRound}
          value={form.email}
          onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
        />
        <Input
          label={t('auth.password')} name="password" autoComplete="current-password"
          type={showPassword ? 'text' : 'password'} required icon={LockKeyhole} className="pr-14"
          value={form.password}
          onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
          rightElement={
            <button
              type="button" onClick={() => setShowPassword(s => !s)}
              aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              aria-pressed={showPassword} className="auth-password-toggle"
            >{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>
          }
        />
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <Checkbox label={t('auth.rememberMe')} checked={remember}
            onChange={e => setRemember(e.target.checked)} className="min-h-11" />
          <Link to="/lupa-password" className="auth-secondary-link">{t('auth.forgotPassword')}</Link>
        </div>
        <Button type="submit" loading={loading} className="auth-submit w-full" size="lg">
          {t('auth.signIn')} <ArrowRight size={18} aria-hidden="true" />
        </Button>
      </form>

      <div className="auth-divider" />
      <p className="auth-footnote">{t('auth.noAccount')}{' '}<Link to="/register" className="auth-secondary-link">{t('auth.registerNow')} <ArrowRight size={16} aria-hidden="true" /></Link></p>
      <p className="auth-footnote mt-1"><Link to="/kebijakan-privasi" className="auth-secondary-link">{t('auth.privacyPolicy')}</Link></p>
    </AuthScene>
  )
}
