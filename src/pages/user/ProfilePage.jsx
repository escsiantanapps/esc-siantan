import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { LogOut, Phone, Mail, MapPin, Cake, Droplet, Instagram, Users, Heart, ShieldAlert, Settings, ShieldCheck, ClipboardCheck, ChevronRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { usersService } from '@/services/usersService'
import { Card, Badge, StatusBadge, Spinner } from '@/components/ui'
import SkyTime from '@/components/SkyTime'
import { formatDate, hitungUmur, formatPhone } from '@/lib/utils'

export default function ProfilePage() {
  const { profile, logout, isAdmin, isPKS } = useAuth()
  const { confirm } = useToast()
  const { t } = useLang()
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
    const ok = await confirm({
      title: 'Keluar dari akun?',
      message: 'Anda akan keluar dari aplikasi dan perlu masuk kembali.',
      confirmText: 'Keluar',
      danger: true,
    })
    if (!ok) return
    await logout()
    navigate('/login')
  }

  if (!profile) return <div className="flex justify-center items-center h-60"><Spinner /></div>

  const initials = profile.name ? profile.name.trim().split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() : '?'

  const genderLabel = profile.gender === 'Laki-laki' ? t('gender.male')
    : profile.gender === 'Perempuan' ? t('gender.female') : profile.gender

  const info = [
    { icon: Mail, label: t('profile.email'), value: profile.email },
    { icon: Phone, label: t('profile.phone'), value: formatPhone(profile.phone) },
    { icon: Cake, label: t('profile.birthDate'), value: profile.birth_date ? `${formatDate(profile.birth_date)} (${hitungUmur(profile.birth_date)})` : '-' },
    { icon: MapPin, label: t('profile.birthPlace'), value: profile.birth_place || '-' },
    { icon: MapPin, label: t('profile.address'), value: profile.address || '-' },
    { icon: Droplet, label: t('profile.bloodType'), value: profile.blood_type || '-' },
    { icon: Instagram, label: t('profile.socialMedia'), value: profile.social_media || '-' },
  ]

  return (
    <div className="pb-6">
      {/* Hero banner ala Stitch + animasi langit (jam, matahari/bulan) */}
      <div className="gradient-main h-32 rounded-b-[2rem] relative overflow-hidden">
        <SkyTime />
      </div>
      <div className="px-4 -mt-14 relative z-10">
        <div className="w-24 h-24 rounded-3xl ring-4 ring-surface shadow-lg overflow-hidden shrink-0">
          {profile.photo_url
            ? <img src={profile.photo_url} alt={profile.name} className="w-full h-full object-cover" />
            : <div className="w-full h-full gradient-main flex items-center justify-center text-white text-2xl font-bold">{initials}</div>}
        </div>

        <div className="mt-3">
          <h1 className="text-xl font-bold text-gray-900">{profile.name}</h1>
          <p className="text-sm text-gray-500">{profile.username ? `@${profile.username}` : profile.email}</p>
          <div className="flex items-center gap-2 mt-2">
            <Badge color="gray">{profile.role}</Badge>
            <StatusBadge status={profile.status} />
          </div>
        </div>
      </div>

      <div className="px-4 mt-5 space-y-4">
        {/* Ganti panel — bergaya seperti mengganti akun */}
        {(isAdmin || isPKS) && (
          <Card className="p-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2.5 pt-2 pb-1">{t('profile.switchPanel')}</p>
            {isAdmin && (
              <Link to="/admin" className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 active:scale-[0.99] transition-all">
                <div className="w-10 h-10 rounded-full gradient-main flex items-center justify-center text-white shrink-0">
                  <ShieldCheck size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{t('profile.adminPanel')}</p>
                  <p className="text-xs text-gray-400">{t('profile.adminPanelDesc')}</p>
                </div>
                <ChevronRight size={18} className="text-gray-300 shrink-0" />
              </Link>
            )}
            {isPKS && (
              <Link to="/pks" className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 active:scale-[0.99] transition-all">
                <div className="w-10 h-10 rounded-full gradient-main flex items-center justify-center text-white shrink-0">
                  <ClipboardCheck size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{t('profile.pksPanel')}</p>
                  <p className="text-xs text-gray-400">{t('profile.pksPanelDesc')}</p>
                </div>
                <ChevronRight size={18} className="text-gray-300 shrink-0" />
              </Link>
            )}
          </Card>
        )}

        {loading && <div className="flex justify-center py-4"><Spinner /></div>}

        {/* Informasi Pribadi */}
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">{t('profile.personalInfo')}</h2>
          <div className="space-y-3">
            {profile.gender && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                  <Users size={15} className="text-brand-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t('profile.gender')}</p>
                  <p className="text-sm text-gray-800 font-medium">{genderLabel}</p>
                </div>
              </div>
            )}
            {info.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                  <Icon size={15} className="text-brand-500" />
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
            <h2 className="text-sm font-semibold text-gray-900 mb-3">{t('profile.ministrySection')}</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                  <Heart size={15} className="text-red-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t('profile.ministryLabel')}</p>
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
                  <p className="text-xs text-gray-400">{t('profile.komsel')}</p>
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
              <p className="text-xs text-gray-400">{t('profile.spStatus')}</p>
              <p className="text-sm text-gray-800 font-medium">{profile.sp_notes || t('profile.spNone')}</p>
            </div>
            <StatusBadge status={profile.sp_level} />
          </div>
        </Card>

        {/* Pengaturan */}
        <Card className="p-2">
          <Link to="/pengaturan" className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 active:scale-[0.99] transition-all">
            <div className="w-10 h-10 rounded-full bg-control flex items-center justify-center text-gray-600 shrink-0">
              <Settings size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{t('profile.settings')}</p>
              <p className="text-xs text-gray-400">{t('profile.settingsDesc')}</p>
            </div>
            <ChevronRight size={18} className="text-gray-300 shrink-0" />
          </Link>
        </Card>

        {/* Keluar ala Stitch */}
        <button
          onClick={handleLogout}
          className="w-full py-3.5 rounded-2xl border-2 border-dashed border-gray-200 text-red-500 font-semibold flex items-center justify-center gap-2 hover:bg-red-50 hover:border-transparent transition-all"
        >
          <LogOut size={18} /> {t('profile.logout')}
        </button>
      </div>
    </div>
  )
}
