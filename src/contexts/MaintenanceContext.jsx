import { createContext, useCallback, useEffect, useRef, useState } from 'react'
import { maintenanceService } from '@/services/maintenanceService'

export const MaintenanceContext = createContext(null)

// Fokus tab tetap memicu pemeriksaan langsung; interval ini hanya untuk tab aktif.
const POLL_INTERVAL_MS = 60_000

export function MaintenanceProvider({ children }) {
  const [enabled, setEnabled] = useState(null)
  const [checkError, setCheckError] = useState(false)
  const inFlight = useRef(false)
  const revision = useRef(0)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    const currentRevision = revision.current
    try {
      const next = await maintenanceService.getEnabled()
      if (currentRevision === revision.current) {
        setEnabled(next)
        setCheckError(false)
      }
    } catch {
      // Status lama yang "nonaktif" tidak boleh membuka app saat pemeriksaan
      // baru gagal; status aktif tetap ditahan sampai terbukti dimatikan.
      if (currentRevision === revision.current) {
        setEnabled(previous => previous === true ? true : null)
        setCheckError(true)
      }
    } finally {
      inFlight.current = false
    }
  }, [])

  const setMode = useCallback(async next => {
    // Respons polling lama tidak boleh menimpa hasil tombol Super Admin.
    revision.current += 1
    await maintenanceService.setEnabled(next)
    setEnabled(next)
    setCheckError(false)
  }, [])

  useEffect(() => {
    refresh()
    const checkVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const timer = window.setInterval(checkVisible, POLL_INTERVAL_MS)
    window.addEventListener('focus', checkVisible)
    document.addEventListener('visibilitychange', checkVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', checkVisible)
      document.removeEventListener('visibilitychange', checkVisible)
    }
  }, [refresh])

  return (
    <MaintenanceContext.Provider value={{ enabled, checkError, refresh, setMode }}>
      {children}
    </MaintenanceContext.Provider>
  )
}
