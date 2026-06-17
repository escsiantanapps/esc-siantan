import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { Button, Input } from '@/components/ui'
import { Mail, Lock, Eye, EyeOff, LogIn, Church } from 'lucide-react'

export default function LoginPage() {
  const { login } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.email, form.password)
      navigate('/')
    } catch (err) {
      setError(t('auth.loginError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center sm:items-center sm:px-4 sm:py-10">
      <div className="w-full max-w-md min-h-screen sm:min-h-0 flex flex-col bg-surface sm:rounded-3xl sm:shadow-2xl sm:shadow-black/10 sm:overflow-hidden">
        {/* Header gradient ala Stitch */}
        <div className="gradient-main relative pt-20 pb-20 px-6 flex flex-col items-center text-center overflow-hidden">
          <div className="absolute -top-12 -left-12 w-64 h-64 bg-white/15 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -right-12 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
          <div className="relative w-24 h-24 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mb-5 shadow-xl shadow-black/10 ring-1 ring-white/20">
            <Church size={44} className="text-white" strokeWidth={1.5} />
          </div>
          <h1 className="relative font-display text-white text-3xl font-bold tracking-tight">ESC Siantan</h1>
          <p className="relative text-white/80 text-[11px] font-semibold uppercase tracking-[0.22em] mt-2">Community &amp; Grace</p>
        </div>

        {/* Form card */}
        <div className="flex-1 bg-surface rounded-t-3xl -mt-6 px-6 pt-8 pb-6">
          <h2 className="text-gray-900 text-lg font-semibold">{t('auth.loginTitle')}</h2>
          <p className="text-sm text-gray-500 mt-1 mb-6">{t('auth.loginSubtitle')}</p>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-4 animate-fade-in">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t('auth.email')}
              type="email"
              icon={Mail}
              placeholder="nama@email.com"
              required
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            />
            <Input
              label={t('auth.password')}
              type={showPassword ? 'text' : 'password'}
              icon={Lock}
              placeholder="••••••••"
              required
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              }
            />

            <div className="text-right">
              <Link to="/lupa-password" className="text-sm text-brand-500 font-medium hover:text-brand-600 transition">{t('auth.forgotPassword')}</Link>
            </div>

            <Button type="submit" loading={loading} className="w-full" size="lg">
              {!loading && <LogIn size={18} />}
              {t('auth.signIn')}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              {t('auth.noAccount')}{' '}
              <Link to="/register" className="text-brand-500 font-semibold hover:text-brand-600 transition">{t('auth.registerNow')}</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
