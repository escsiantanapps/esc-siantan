import { createContext, useCallback, useEffect, useState } from 'react'
import { translations } from '@/lib/i18n'

export const LanguageContext = createContext(null)

const STORAGE_KEY = 'esc-lang'

function getInitialLang() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'id' || stored === 'en') return stored
  return 'id' // default Bahasa Indonesia
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(getInitialLang)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  const t = useCallback(
    (key) => translations[lang]?.[key] ?? translations.id[key] ?? key,
    [lang],
  )

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}
