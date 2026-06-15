import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui'

export default function AccountStatusPage() {
  const { profile, logout } = useAuth()
  const { confirm } = useToast()
  const navigate = useNavigate()
  const isPending = profile?.status === 'Menunggu Persetujuan'

  async function handleLogout() {
    const ok = await confirm({
      title: 'Keluar dari akun?',
      message: 'Anda akan keluar dan perlu masuk kembali.',
      confirmText: 'Keluar',
      danger: true,
    })
    if (!ok) return
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center items-center px-4 py-10">
      <div className="w-full max-w-md bg-surface rounded-3xl shadow-2xl shadow-black/10 p-8 text-center">
        <div className="w-16 h-16 mx-auto bg-orange-50 rounded-2xl flex items-center justify-center mb-4">
          <span className="text-3xl">{isPending ? '⏳' : '🚫'}</span>
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">
          {isPending ? 'Menunggu Persetujuan' : 'Akun Dinonaktifkan'}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {isPending
            ? `Akun ${profile?.name ? `"${profile.name}" ` : ''}sedang menunggu persetujuan dari Admin / Super Admin. Silakan coba lagi nanti.`
            : 'Akun kamu telah dinonaktifkan. Hubungi Admin gereja untuk informasi lebih lanjut.'}
        </p>
        <Button variant="outline" className="w-full" onClick={handleLogout}>Keluar</Button>
      </div>
    </div>
  )
}
