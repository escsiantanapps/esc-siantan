// Placeholder pages — masing-masing akan diisi saat build per fitur
import { GradientHeader, EmptyState, Button } from '@/components/ui'
import { useNavigate } from 'react-router-dom'

function Placeholder({ title, subtitle, icon = '🔧' }) {
  const navigate = useNavigate()
  return (
    <div>
      <GradientHeader title={title} subtitle={subtitle} back={() => navigate(-1)} />
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="text-5xl mb-4">{icon}</div>
        <p className="text-base font-semibold text-gray-700 mb-1">Segera hadir</p>
        <p className="text-sm text-gray-400">Halaman ini sedang dalam pembangunan.</p>
        <Button variant="ghost" className="mt-6" onClick={() => navigate(-1)}>← Kembali</Button>
      </div>
    </div>
  )
}

// ─── User Pages ────────────────────────────────────────────
export function ForgotPasswordPage() {
  const navigate = useNavigate()
  return (
    <div>
      <GradientHeader title="Lupa Kata Sandi" back={() => navigate('/login')} />
      <div className="px-6 py-8">
        <p className="text-sm text-gray-500 mb-4">Masukkan email kamu. Kami akan mengirim link reset kata sandi.</p>
        <input type="email" placeholder="nama@email.com"
          className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-orange-400" />
        <Button className="w-full" size="lg">Kirim Link Reset</Button>
      </div>
    </div>
  )
}

export function ClassesPage() { return <Placeholder title="Kelas & Pembinaan" icon="📚" /> }
export function ClassDetailPage() { return <Placeholder title="Detail Kelas" icon="📖" /> }
export function RegistrationStatusPage() { return <Placeholder title="Status Pendaftaran" icon="📋" /> }

// ─── Admin Pages ────────────────────────────────────────────
function AdminPlaceholder({ title, icon = '⚙️' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <div className="text-5xl mb-4">{icon}</div>
      <p className="text-base font-semibold text-gray-700 mb-1">{title}</p>
      <p className="text-sm text-gray-400">Halaman ini sedang dalam pembangunan.</p>
    </div>
  )
}

export function AdminEventsPage() { return <AdminPlaceholder title="Kelola Events" icon="📅" /> }
export function AdminEventFormPage() { return <AdminPlaceholder title="Form Event" icon="✏️" /> }
export function AdminNewsPage() { return <AdminPlaceholder title="Kelola Berita" icon="📰" /> }
export function AdminNewsFormPage() { return <AdminPlaceholder title="Buat/Edit Berita" icon="✏️" /> }
export function AdminClassesPage() { return <AdminPlaceholder title="Kelola Kelas" icon="📚" /> }
export function AdminMinistryPage() { return <AdminPlaceholder title="Ministry" icon="🏛️" /> }
export function AdminKomselPage() { return <AdminPlaceholder title="Komsel" icon="🤝" /> }
