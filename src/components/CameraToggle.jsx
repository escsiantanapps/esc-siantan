import { useEffect, useState } from 'react'
import { Camera } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { Card } from '@/components/ui'

// Toggle izin kamera. Berbeda dari izin push: browser TIDAK menyediakan API
// untuk mencabut izin dari kode. Yang bisa dilakukan:
//   - Query state saat ini (Permissions API)
//   - Kalau state = 'prompt' → panggil getUserMedia untuk memunculkan prompt
//   - Kalau state = 'denied' → tampilkan panduan reset manual
//   - Kalau state = 'granted' → toggle jadi indikator status (matikan =
//     kasih tahu cara mencabut manual)
export default function CameraToggle() {
  const { toast } = useToast()
  const [state, setState] = useState('unknown') // 'granted' | 'denied' | 'prompt' | 'unsupported' | 'unknown'
  const [busy, setBusy] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setState('unsupported')
        return
      }
      // Permissions API tidak tersedia di semua browser (mis. Safari lama).
      if (!navigator.permissions?.query) {
        if (!cancelled) setState('prompt')
        return
      }
      try {
        const st = await navigator.permissions.query({ name: 'camera' })
        if (!cancelled) setState(st.state)
        st.onchange = () => !cancelled && setState(st.state)
      } catch {
        if (!cancelled) setState('prompt')
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function requestPermission() {
    if (busy) return
    setBusy(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      stream.getTracks().forEach(tr => tr.stop())
      setState('granted')
      toast.success('Izin kamera aktif. Anda sudah bisa scan QR.')
    } catch (err) {
      const name = err?.name || 'Error'
      if (name === 'NotAllowedError') {
        setState('denied')
        setShowHelp(true)
        toast.error('Izin ditolak. Ikuti panduan di bawah untuk mengaktifkan.')
      } else if (name === 'NotFoundError') {
        toast.error('Tidak ada kamera terdeteksi pada perangkat.')
      } else {
        toast.error(`${name}: ${err?.message || 'Gagal meminta izin.'}`)
      }
    } finally {
      setBusy(false)
    }
  }

  function handleToggle() {
    if (state === 'granted') {
      // Tak bisa dicabut lewat kode — arahkan user.
      setShowHelp(true)
      return
    }
    if (state === 'denied') {
      setShowHelp(true)
      return
    }
    if (state === 'prompt' || state === 'unknown') {
      requestPermission()
    }
  }

  if (state === 'unsupported') return null

  const on = state === 'granted'
  const subtitle =
    state === 'granted' ? 'Aktif — siap dipakai untuk scan QR'
    : state === 'denied' ? 'Ditolak — ketuk untuk lihat cara mengaktifkan'
    : 'Nonaktif — ketuk untuk meminta izin'

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
            <Camera size={15} className="text-brand-500" />
          </div>
          <div>
            <p className="text-sm text-gray-800 font-medium">Izin Kamera</p>
            <p className="text-xs text-gray-400">{subtitle}</p>
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={busy}
          role="switch"
          aria-checked={on}
          aria-label="Aktifkan izin kamera"
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-brand-500' : state === 'denied' ? 'bg-red-300' : 'bg-control-hover'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {showHelp && (state === 'denied' || state === 'granted') && (
        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600">
          {state === 'denied' ? (
            <>
              <p className="font-semibold text-gray-800 mb-2">Cara mengaktifkan izin kamera di Chrome:</p>
              <ol className="list-decimal ml-4 space-y-1 text-[11px]">
                <li>Ketuk ikon <b>gembok/(i)</b> di sebelah alamat situs</li>
                <li>Ketuk <b>Izin</b> (atau "Site settings")</li>
                <li>Pada <b>Kamera</b>, pilih <b>Izinkan</b></li>
                <li>Kembali ke halaman ini, ketuk sakelar di atas lagi</li>
              </ol>
              <p className="text-[10px] text-gray-400 mt-2 italic">
                Kalau ini APK ESC Siantan: Pengaturan HP → Aplikasi → ESC Siantan → Izin → Kamera → Izinkan.
                Di Vivo/Xiaomi kadang tersembunyi di "Izin Tambahan".
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-gray-800 mb-2">Cara menonaktifkan izin kamera:</p>
              <p className="text-[11px]">
                Browser tidak menyediakan tombol mati dari sini. Buka <b>gembok/(i)</b> di sebelah alamat →
                <b> Izin → Kamera → Tolak</b>, lalu muat ulang halaman.
              </p>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
