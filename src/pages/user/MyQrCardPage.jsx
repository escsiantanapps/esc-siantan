import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { Download } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Card, Button, Avatar, GradientHeader, Spinner } from '@/components/ui'

// Kartu QR personal — dipindai Admin/PKS untuk memverifikasi bahwa pemegangnya
// adalah jemaat terdaftar GBI El Shaddai Siantan, dan melihat saldo poinnya.
// Payload: ESC-MEMBER:<nij> (nij sudah unik & sudah bisa dibaca pemilik akun
// sendiri lewat RLS users_read_self — tidak ada eksposur data baru).
export default function MyQrCardPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [dataUrl, setDataUrl] = useState('')

  useEffect(() => {
    if (!profile?.nij) return
    QRCode.toDataURL(`ESC-MEMBER:${profile.nij}`, { width: 320, margin: 1 }).then(setDataUrl)
  }, [profile?.nij])

  return (
    <div className="pb-4">
      <GradientHeader title="Kartu QR Saya" subtitle="Tunjukkan ke petugas untuk verifikasi keanggotaan" back={() => navigate(-1)} />

      <div className="px-4 py-4">
        {!profile?.nij ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : (
          <Card className="p-5 flex flex-col items-center text-center gap-3">
            <Avatar name={profile.name} src={profile.photo_url} size="xl" />
            <div>
              <p className="text-base font-semibold text-gray-900">{profile.name}</p>
              <p className="text-xs text-gray-400">NIJ: {profile.nij}</p>
            </div>

            {dataUrl && (
              <img src={dataUrl} alt="QR Kartu Jemaat" className="w-56 h-56 rounded-xl border border-gray-100" />
            )}

            {dataUrl && (
              <a href={dataUrl} download={`Kartu-QR-${profile.name}.png`} className="w-full">
                <Button className="w-full"><Download size={15} /> Unduh QR</Button>
              </a>
            )}

            <p className="text-xs text-gray-400">
              QR ini menandakan Anda adalah jemaat terdaftar GBI El Shaddai Siantan.
              Petugas dapat memindainya untuk verifikasi identitas & saldo poin.
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}
