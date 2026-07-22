import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, KeyRound, Moon, Sun, ChevronRight, LogOut, ChevronDown, Languages, Check, ShieldCheck, Award } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { LOCALES } from '@/lib/i18n'
import { Card, Button, Input, ThemeToggle, GradientHeader } from '@/components/ui'
import PushToggle from '@/components/PushToggle'
import CameraToggle from '@/components/CameraToggle'

export default function SettingsPage() {
  const { profile, login, updatePassword, logout } = useAuth()
  const { theme } = useTheme()
  const { toast, confirm } = useToast()
  const { lang, setLang, t } = useLang()
  const navigate = useNavigate()

  const [pwOpen, setPwOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')

  async function handleChangePassword(e) {
    e.preventDefault()
    setPwError('')
    if (next.length < 6) { setPwError(t('settings.pwMinLength')); return }
    if (next !== confirmPw) { setPwError(t('settings.pwMismatch')); return }
    setPwLoading(true)
    try {
      // Verifikasi sandi lama dulu dengan login ulang (sesi user yang sama).
      await login(profile.email, current)
      await updatePassword(next)
      toast.success(t('settings.pwSuccess'))
      setPwOpen(false)
      setCurrent(''); setNext(''); setConfirmPw('')
    } catch (err) {
      setPwError(err.message?.includes('Invalid login')
        ? t('settings.pwCurrentWrong')
        : (err.message || t('settings.pwFailed')))
    } finally {
      setPwLoading(false)
    }
  }

  async function handleLogout() {
    const ok = await confirm({
      title: t('settings.logoutTitle'),
      message: t('settings.logoutMessage'),
      confirmText: t('settings.logout'),
      danger: true,
    })
    if (!ok) return
    await logout()
    navigate('/login')
  }

  return (
    <div className="pb-8">
      <GradientHeader title={t('settings.title')} subtitle={t('settings.subtitle')} back={() => navigate(-1)} />

      <div className="px-4 -mt-3 space-y-4">
        {/* Akun */}
        <Card className="p-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2.5 pt-2 pb-1">{t('settings.account')}</p>

          <button
            onClick={() => navigate('/profil/edit')}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-control active:scale-[0.99] transition-all"
          >
            <div className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center text-brand-500 shrink-0">
              <Pencil size={16} />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-900">{t('settings.editProfile')}</p>
              <p className="text-xs text-gray-400">{t('settings.editProfileDesc')}</p>
            </div>
            <ChevronRight size={18} className="text-gray-300 shrink-0" />
          </button>

          <button
            onClick={() => { setPwOpen(o => !o); setPwError('') }}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-control active:scale-[0.99] transition-all"
          >
            <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 shrink-0">
              <KeyRound size={16} />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-900">{t('settings.changePassword')}</p>
              <p className="text-xs text-gray-400">{t('settings.changePasswordDesc')}</p>
            </div>
            <ChevronDown size={18} className={`text-gray-300 shrink-0 transition-transform ${pwOpen ? 'rotate-180' : ''}`} />
          </button>

          <button
            onClick={() => navigate('/sertifikat')}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-control active:scale-[0.99] transition-all"
          >
            <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center text-orange-500 shrink-0">
              <Award size={16} />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-900">{t('settings.myCertificates')}</p>
              <p className="text-xs text-gray-400">{t('settings.myCertificatesDesc')}</p>
            </div>
            <ChevronRight size={18} className="text-gray-300 shrink-0" />
          </button>

          {pwOpen && (
            <form onSubmit={handleChangePassword} className="px-2.5 pb-2.5 pt-1 space-y-3">
              {pwError && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl px-3 py-2">{pwError}</div>
              )}
              <Input label={t('settings.currentPassword')} type="password" placeholder="••••••••" required
                value={current} onChange={e => setCurrent(e.target.value)} />
              <Input label={t('settings.newPassword')} type="password" placeholder="••••••••" required
                value={next} onChange={e => setNext(e.target.value)} />
              <Input label={t('settings.confirmNewPassword')} type="password" placeholder="••••••••" required
                value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
              <Button type="submit" loading={pwLoading} className="w-full">{t('settings.savePassword')}</Button>
            </form>
          )}
        </Card>

        {/* Bahasa */}
        <Card className="p-2">
          <div className="flex items-center gap-2 px-2.5 pt-2 pb-1">
            <Languages size={13} className="text-gray-400" />
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t('settings.language')}</p>
          </div>
          {Object.entries(LOCALES).map(([code, { label, flag }]) => (
            <button
              key={code}
              onClick={() => setLang(code)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-control active:scale-[0.99] transition-all"
            >
              <span className="text-xl shrink-0">{flag}</span>
              <span className="flex-1 text-left text-sm font-medium text-gray-900">{label}</span>
              {lang === code && <Check size={18} className="text-brand-500 shrink-0" />}
            </button>
          ))}
        </Card>

        {/* Tampilan */}
        <Card className="p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('settings.appearance')}</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center text-purple-500 shrink-0">
                {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{t('settings.darkMode')}</p>
                <p className="text-xs text-gray-400">{theme === 'dark' ? t('settings.on') : t('settings.off')}</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </Card>

        {/* Notifikasi & Izin Perangkat */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">{t('settings.notifications')}</p>
          <PushToggle />
          <CameraToggle />
        </div>

        {/* Legal */}
        <Card className="p-2">
          <button
            onClick={() => navigate('/kebijakan-privasi')}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-control active:scale-[0.99] transition-all"
          >
            <div className="w-9 h-9 rounded-full bg-control flex items-center justify-center text-gray-500 shrink-0">
              <ShieldCheck size={16} />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-900">{t('auth.privacyPolicy')}</p>
            </div>
            <ChevronRight size={18} className="text-gray-300 shrink-0" />
          </button>
        </Card>

        {/* Keluar */}
        <button
          onClick={handleLogout}
          className="w-full py-3.5 rounded-2xl border-2 border-dashed border-gray-200 text-red-500 font-semibold flex items-center justify-center gap-2 hover:bg-red-50 hover:border-transparent transition-all"
        >
          <LogOut size={18} /> {t('settings.logout')}
        </button>
      </div>
    </div>
  )
}
