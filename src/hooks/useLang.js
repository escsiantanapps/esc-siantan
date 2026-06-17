import { useContext } from 'react'
import { LanguageContext } from '@/contexts/LanguageContext'

export function useLang() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLang harus digunakan di dalam LanguageProvider')
  return ctx
}
