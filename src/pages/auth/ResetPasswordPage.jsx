import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { Button, Input } from '@/components/ui'

export default function ResetPasswordPage() {
  const { updatePassword } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError(t('auth.pwMin6')); return }
    if (password !== confirmPassword) { setError(t('auth.pwMismatch6')); return }
    setLoading(true)
    try {
      await updatePassword(password)
      setDone(true)
    } catch (err) {
      setError(err.message || t('auth.resetFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center sm:items-center sm:px-4 sm:py-10">
      <div className="w-full max-w-md min-h-screen sm:min-h-0 flex flex-col bg-surface sm:rounded-3xl sm:shadow-2xl sm:shadow-black/10 sm:overflow-hidden">
        <div className="gradient-main pt-16 pb-10 px-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
            <span className="text-3xl">🔒</span>
          </div>
          <h1 className="text-white text-2xl font-bold">{t('auth.resetTitle')}</h1>
          <p className="text-white/70 text-sm mt-1">{t('auth.resetSubtitle')}</p>
        </div>

        <div className="flex-1 bg-surface rounded-t-3xl -mt-4 px-6 pt-8 pb-6">
          {done ? (
            <div className="text-center py-6">
              <div className="text-5xl mb-4">✅</div>
              <p className="text-base font-semibold text-gray-900 mb-1">{t('auth.resetDoneTitle')}</p>
              <p className="text-sm text-gray-500 mb-6">{t('auth.resetDoneDesc')}</p>
              <Button className="w-full" size="lg" onClick={() => navigate('/login')}>{t('auth.toLogin')}</Button>
            </div>
          ) : (
            <>
              <h2 className="text-gray-900 text-lg font-semibold mb-6">{t('auth.newPasswordTitle')}</h2>

              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label={t('auth.newPassword')}
                  type="password"
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <Input
                  label={t('auth.confirmPassword')}
                  type="password"
                  placeholder="••••••••"
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />

                <Button type="submit" loading={loading} className="w-full" size="lg">
                  {t('auth.savePassword')}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
