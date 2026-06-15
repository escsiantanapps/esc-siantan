import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button, Input } from '@/components/ui'

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await resetPassword(email)
      setSent(true)
    } catch (err) {
      setError(err.message || 'Gagal mengirim link reset. Silakan coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center sm:items-center sm:px-4 sm:py-10">
      <div className="w-full max-w-md min-h-screen sm:min-h-0 flex flex-col bg-surface sm:rounded-3xl sm:shadow-2xl sm:shadow-black/10 sm:overflow-hidden">
        <div className="gradient-main pt-16 pb-10 px-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
            <span className="text-3xl">🔑</span>
          </div>
          <h1 className="text-white text-2xl font-bold">Lupa Kata Sandi</h1>
          <p className="text-white/70 text-sm mt-1">Kami akan kirim link reset ke email kamu</p>
        </div>

        <div className="flex-1 bg-surface rounded-t-3xl -mt-4 px-6 pt-8 pb-6">
          {sent ? (
            <div className="text-center py-6">
              <div className="text-5xl mb-4">📩</div>
              <p className="text-base font-semibold text-gray-900 mb-1">Link terkirim!</p>
              <p className="text-sm text-gray-500 mb-6">
                Periksa email <span className="font-medium">{email}</span> untuk link reset kata sandi.
              </p>
              <Link to="/login"><Button className="w-full" size="lg">Kembali ke Login</Button></Link>
            </div>
          ) : (
            <>
              <h2 className="text-gray-900 text-lg font-semibold mb-6">Masukkan email kamu</h2>

              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  placeholder="nama@email.com"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />

                <Button type="submit" loading={loading} className="w-full" size="lg">
                  Kirim Link Reset
                </Button>
              </form>

              <div className="mt-6 text-center">
                <Link to="/login" className="text-sm text-brand-500">← Kembali ke login</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
