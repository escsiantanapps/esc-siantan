import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, LogOut, Phone, Mail, MapPin, Cake, Droplet, Instagram, Users, Heart, ShieldAlert } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usersService } from '@/services/usersService'
import { Avatar, Card, Badge, StatusBadge, Spinner, Button } from '@/components/ui'
import { formatDate, hitungUmur, formatPhone } from '@/lib/utils'

export default function ProfilePage() {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()
  const [ministries, setMinistries] = useState([])
  const [komsel, setKomsel] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    Promise.all([
      usersService.getMinistries(profile.ministry_ids).catch(() => []),
      usersService.getKomsel(profile.komsel_id).catch(() => null),
    ]).then(([m, k]) => { setMinistries(m); setKomsel(k) })
      .finally(() => setLoading(false))
  }, [profile])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  if (!profile) return <div className="flex justify-center items-center h-60"><Spinner /></div>

  const info = [
    { icon: Mail, label: 'Email', value: profile.email },
    { icon: Phone, label: 'No. HP', value: formatPhone(profile.phone) },
    { icon: Cake, label: 'Tanggal Lahir', value: profile.birth_date ? `${formatDate(profile.birth_date)} (${hitungUmur(profile.birth_date)})` : '-' },
    { icon: MapPin, label: 'Tempat Lahir', value: profile.birth_place || '-' },
    { icon: MapPin, label: 'Alamat', value: profile.address || '-' },
    { icon: Droplet, label: 'Golongan Darah', value: profile.blood_type || '-' },
    { icon: Instagram, label: 'Sosial Media', value: profile.social_media || '-' },
  ]

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="gradient-main px-4 pt-12 pb-8 flex flex-col items-center text-center">
        <Avatar name={profile.name} src={profile.photo_url} size="xl" />
        <h1 className="text-white text-lg font-bold mt-3">{profile.name}</h1>
        <p className="text-white/70 text-sm">{profile.username ? `@${profile.username}` : profile.email}</p>
        <div className="flex items-center gap-2 mt-2">
          <Badge color="gray">{profile.role}</Badge>
          <StatusBadge status={profile.status} />
        </div>
      </div>

      <div className="px-4 -mt-4 space-y-4">
        <Card className="p-4 flex gap-2">
          <Button className="flex-1" onClick={() => navigate('/profil/edit')}>
            <Pencil size={15} /> Edit Profil
          </Button>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut size={15} /> Keluar
          </Button>
        </Card>

        {loading && <div className="flex justify-center py-4"><Spinner /></div>}

        {/* Informasi Pribadi */}
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Informasi Pribadi</h2>
          <div className="space-y-3">
            {profile.gender && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <Users size={15} className="text-orange-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Jenis Kelamin</p>
                  <p className="text-sm text-gray-800 font-medium">{profile.gender}</p>
                </div>
              </div>
            )}
            {info.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <Icon size={15} className="text-orange-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="text-sm text-gray-800 font-medium break-words">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Ministry & Komsel */}
        {!loading && (
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Pelayanan</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                  <Heart size={15} className="text-red-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Ministry</p>
                  {ministries.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {ministries.map(m => <Badge key={m.ministry_id} color="orange">{m.name}</Badge>)}
                    </div>
                  ) : <p className="text-sm text-gray-800 font-medium">-</p>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Users size={15} className="text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Komsel</p>
                  <p className="text-sm text-gray-800 font-medium">{komsel?.name || '-'}</p>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Status SP */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
              <ShieldAlert size={15} className="text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-400">Status Surat Peringatan</p>
              <p className="text-sm text-gray-800 font-medium">{profile.sp_notes || 'Tidak ada catatan'}</p>
            </div>
            <StatusBadge status={profile.sp_level} />
          </div>
        </Card>
      </div>
    </div>
  )
}
