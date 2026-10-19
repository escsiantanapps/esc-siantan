import { ThemeToggle } from '@/components/ui'
import { useLang } from '@/hooks/useLang'
import './AuthScene.css'

export default function AuthScene({ variant, children }) {
  const { t } = useLang()
  const registering = variant === 'register'

  return (
    <main className={`auth-scene auth-scene--${variant}`}>
      <header className="auth-topbar">
        <div className="auth-brand">
          <img src="/icons/esc-mark.svg" width="30" height="30" alt="" />
          <span>{t('auth.brandName')}</span>
        </div>
        <ThemeToggle className="auth-theme-toggle" ariaLabel={t('settings.darkMode')} title={t('settings.darkMode')} />
      </header>
      <div className="auth-layout">
        <aside className="auth-hero" aria-label={t('auth.brandName')}>
          <div className="auth-hero-center">
            <img className="auth-hero-emblem" src="/images/auth/amber-glass-emblem.png" width="1024" height="1024" alt="" />
            <div className="auth-hero-copy">
              <p className="auth-hero-title">{t(registering ? 'auth.createAccount' : 'auth.welcome')}</p>
              <p>{t(registering ? 'auth.createSubtitle' : 'auth.loginSubtitle')}</p>
            </div>
          </div>
          <p className="auth-hero-footer">{t('auth.churchName')} · {t('auth.brandLocation')}</p>
        </aside>
        <section className="auth-card">
          {children}
        </section>
      </div>
    </main>
  )
}
