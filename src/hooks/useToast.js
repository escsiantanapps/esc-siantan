import { useContext } from 'react'
import { ToastContext } from '@/contexts/ToastContext'

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast harus digunakan di dalam ToastProvider')
  return ctx
}
