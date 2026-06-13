import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button, Input } from '@/components/ui'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
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
      setError('Email atau kata sandi salah. Silakan coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header gradient */}
      <div className="gradient-main pt-16 pb-10 px-6 flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
          <span className="text-3xl">⛪</span>
        </div>
        <h1 className="text-white text-2xl font-bold">ESC Siantan</h1>
        <p className="text-white/70 text-sm mt-1">Selamat datang kembali</p>
      </div>

      {/* Form card */}
      <div className="flex-1 bg-white rounded-t-3xl -mt-4 px-6 pt-8 pb-6">
        <h2 className="text-gray-900 text-lg font-semibold mb-6">Masuk ke akun</h2>

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
            value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
          />
          <Input
            label="Kata Sandi"
            type="password"
            placeholder="••••••••"
            required
            value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
          />

          <div className="text-right">
            <Link to="/lupa-password" className="text-sm text-orange-500">Lupa kata sandi?</Link>
          </div>

          <Button type="submit" loading={loading} className="w-full" size="lg">
            Masuk
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Belum punya akun?{' '}
            <Link to="/register" className="text-orange-500 font-medium">Daftar sekarang</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
