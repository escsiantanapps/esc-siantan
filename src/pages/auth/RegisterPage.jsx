import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button, Input, Select, GradientHeader } from '@/components/ui'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '', confirmPassword: '',
    gender: '', birth_date: '', birth_place: '', address: '',
    blood_type: '', social_media: '',
  })

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

  async function handleSubmit() {
    if (form.password !== form.confirmPassword) { setError('Kata sandi tidak cocok.'); return }
    if (form.password.length < 8) { setError('Kata sandi minimal 8 karakter.'); return }
    setError(''); setLoading(true)
    try {
      await register(form)
      navigate('/')
    } catch (err) {
      setError(err.message || 'Pendaftaran gagal. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center sm:items-center sm:px-4 sm:py-10">
      <div className="w-full max-w-md min-h-screen sm:min-h-0 flex flex-col bg-surface sm:rounded-3xl sm:shadow-2xl sm:shadow-black/10 sm:overflow-hidden">
        <GradientHeader
          title="Buat Akun"
          subtitle="Isi data untuk bergabung"
          back={step > 1 ? () => setStep(s => s - 1) : undefined}
        />

        {/* Step indicator */}
        <div className="bg-surface px-6 py-3 flex items-center gap-2 border-b border-gray-100">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0
                ${s < step ? 'gradient-main text-white' : s === step ? 'border-2 border-brand-500 text-brand-500' : 'border-2 border-gray-200 text-gray-300'}`}>
                {s < step ? '✓' : s}
              </div>
              <span className={`text-xs ${s === step ? 'text-brand-500 font-medium' : 'text-gray-400'}`}>
                {['Akun', 'Data Diri', 'Selesai'][s - 1]}
              </span>
              {s < 3 && <div className="flex-1 h-px bg-gray-200" />}
            </div>
          ))}
        </div>

        <div className="flex-1 bg-surface px-6 py-6">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <Input label="Nama Lengkap" required placeholder="Nama sesuai KTP" value={form.name} onChange={e => set('name', e.target.value)} />
              <Input label="Email" type="email" required placeholder="nama@email.com" value={form.email} onChange={e => set('email', e.target.value)} />
              <Input label="No. HP / WhatsApp" type="tel" required placeholder="+62 8xx xxxx xxxx" value={form.phone} onChange={e => set('phone', e.target.value)} />
              <Input label="Kata Sandi" type="password" required placeholder="Min. 8 karakter" value={form.password} onChange={e => set('password', e.target.value)} />
              <Input label="Ulangi Kata Sandi" type="password" required placeholder="Ketik ulang kata sandi" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} />
              <Button className="w-full mt-2" size="lg" onClick={() => { if (!form.name || !form.email || !form.password) { setError('Lengkapi semua field.'); return } setError(''); setStep(2) }}>
                Lanjut →
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Select label="Jenis Kelamin" value={form.gender} onChange={e => set('gender', e.target.value)}>
                <option value="">Pilih...</option>
                <option>Laki-laki</option>
                <option>Perempuan</option>
              </Select>
              <Input label="Tanggal Lahir" type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} />
              <Input label="Tempat Lahir" placeholder="Kota kelahiran" value={form.birth_place} onChange={e => set('birth_place', e.target.value)} />
              <Input label="Alamat Lengkap" placeholder="Jl. ... No. ... Kelurahan Kota" value={form.address} onChange={e => set('address', e.target.value)} />
              <Select label="Golongan Darah" value={form.blood_type} onChange={e => set('blood_type', e.target.value)}>
                <option value="">Tidak tahu / belum periksa</option>
                {['A','B','AB','O'].map(b => <option key={b}>{b}</option>)}
              </Select>
              <Input label="Instagram / Sosial Media" placeholder="@username" value={form.social_media} onChange={e => set('social_media', e.target.value)} />
              <Button className="w-full mt-2" size="lg" onClick={() => { setStep(3) }}>
                Lanjut →
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center text-center py-8">
              <div className="w-20 h-20 rounded-full gradient-main flex items-center justify-center mb-4 text-4xl">✓</div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Siap didaftarkan!</h2>
              <p className="text-sm text-gray-500 mb-2">Nama: <strong className="text-gray-800">{form.name}</strong></p>
              <p className="text-sm text-gray-500 mb-6">Email: <strong className="text-gray-800">{form.email}</strong></p>
              <Button className="w-full" size="lg" loading={loading} onClick={handleSubmit}>
                Daftar Sekarang
              </Button>
            </div>
          )}

          <p className="text-center text-sm text-gray-500 mt-6">
            Sudah punya akun?{' '}
            <Link to="/login" className="text-brand-500 font-medium">Masuk</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
