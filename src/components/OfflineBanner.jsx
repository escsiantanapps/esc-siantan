import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

// Banner tipis di atas layar saat perangkat kehilangan koneksi. Memberi
// umpan balik agar user paham kenapa data tidak termuat (bukan app rusak).
export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline = () => setOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="fixed top-0 inset-x-0 z-[60] flex items-center justify-center gap-2 bg-gray-800 text-white text-xs font-medium py-1.5 px-3">
      <WifiOff size={13} />
      Tidak ada koneksi internet — sebagian data mungkin tidak termuat.
    </div>
  )
}
