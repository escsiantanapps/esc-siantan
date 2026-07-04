import { useEffect, useState } from 'react'
import { Download, MoreVertical, Share } from 'lucide-react'
import { useLang } from '@/hooks/useLang'

const DISMISS_KEY = 'pwa-prompt-dismissed'

// Popup ajakan pasang app sebagai PWA lewat Chrome ("Tambahkan ke Layar
// Utama") saat situs dibuka lewat browser HP.
// "Tetap lanjut di website" diingat per sesi browser (sessionStorage).
function getPromptContext() {
  if (typeof window === 'undefined') return null
  // Sudah berjalan sebagai PWA terpasang (manifest pakai fullscreen/standalone)
  if (window.matchMedia?.('(display-mode: standalone)')?.matches) return null
  if (window.matchMedia?.('(display-mode: fullscreen)')?.matches) return null
  if (window.navigator.standalone) return null
  try { if (sessionStorage.getItem(DISMISS_KEY)) return null } catch { /* private mode */ }
  if (/android/i.test(navigator.userAgent)) return 'android'
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return 'ios'
  return null // desktop: admin bekerja di browser, tidak perlu diganggu
}

export default function InstallPrompt() {
  const { t } = useLang()
  const [platform] = useState(getPromptContext)
  const [dismissed, setDismissed] = useState(false)
  const [installEvent, setInstallEvent] = useState(null)

  // Chrome Android menembakkan beforeinstallprompt bila PWA memenuhi syarat
  // dan belum terpasang — simpan event-nya untuk tombol "Pasang Aplikasi".
  useEffect(() => {
    if (platform !== 'android') return
    const onPrompt = (e) => { e.preventDefault(); setInstallEvent(e) }
    const onInstalled = () => setDismissed(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [platform])

  if (!platform || dismissed) return null

  function dismiss() {
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode */ }
    setDismissed(true)
  }

  async function install() {
    if (!installEvent) return
    installEvent.prompt()
    const { outcome } = await installEvent.userChoice.catch(() => ({}))
    setInstallEvent(null)
    if (outcome === 'accepted') dismiss()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[2px] p-4 pb-8 animate-fade-in">
      <div className="w-full max-w-sm bg-surface rounded-3xl p-6 text-center ambient-shadow animate-fade-in-up">
        <img
          src="/icons/icon-192.png"
          alt="ESC Siantan"
          className="w-20 h-20 mx-auto rounded-2xl shadow-[0_8px_24px_-8px_rgba(244,81,30,0.5)]"
        />
        <h2 className="font-display text-lg font-bold text-gray-900 mt-4">{t('install.title')}</h2>
        <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{t('install.desc')}</p>

        {platform === 'android' && installEvent ? (
          <button
            onClick={install}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 gradient-main text-white text-sm font-semibold rounded-2xl py-3.5 active:scale-[0.98] transition-transform"
          >
            <Download size={18} /> {t('install.install')}
          </button>
        ) : (
          // Prompt native tidak tersedia (browser lain / iOS) → petunjuk manual
          <div className="mt-5 bg-brand-50 rounded-2xl p-4 text-left flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center shrink-0">
              {platform === 'ios'
                ? <Share size={16} className="text-brand-500" />
                : <MoreVertical size={16} className="text-brand-500" />}
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              {platform === 'ios' ? t('install.manualIos') : t('install.manualAndroid')}
            </p>
          </div>
        )}

        <button
          onClick={dismiss}
          className="mt-3 w-full py-2 text-xs text-gray-400 hover:text-gray-500"
        >
          {t('install.continueWeb')}
        </button>
      </div>
    </div>
  )
}
