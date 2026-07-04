import { useEffect, useState } from 'react'
import { Camera } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { Card } from '@/components/ui'

// Terinstal ke layar utama (Add to Home Screen) via Chrome = WebAPK di Android.
// PENTING: WebAPK terdaftar sebagai APLIKASI ANDROID TERSENDIRI dengan izin
// kamera SENDIRI di level OS (Setelan HP → Aplikasi → ESC Siantan), TERPISAH
// dari "Setelan situs" Chrome. Menghapus/reset site settings di Chrome tidak
// berpengaruh ke WebAPK ini -- itu sebabnya reset lewat Chrome sering "tidak
// mempan" bagi user yang membuka app dari ikon layar utama, bukan dari tab
// Chrome biasa. Jalur perbaikan yang benar utk kasus ini ada di OS, bukan
// browser.
function isStandalonePwa() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true
}

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
  const [standalone] = useState(isStandalonePwa)

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
            standalone ? (
              <>
                <p className="font-semibold text-gray-800 mb-2">Kenapa reset di Chrome tidak berpengaruh?</p>
                <p className="text-[11px] mb-3">
                  Aplikasi ini Anda buka dari <b>ikon di layar utama</b> — begitu di-install,
                  Android mendaftarkannya sebagai <b>aplikasi tersendiri</b> dengan izin
                  kamera sendiri, <b>terpisah dari Chrome</b>. Menghapus "Setelan situs"
                  di Chrome tidak menyentuh izin ini sama sekali. Perbaikannya lewat
                  Setelan HP, bukan Chrome:
                </p>

                <p className="font-semibold text-gray-800 mb-1">Cara A — ubah izin aplikasi (paling cepat):</p>
                <ol className="list-decimal ml-4 space-y-1 text-[11px] mb-3">
                  <li>Buka <b>Setelan HP → Aplikasi</b></li>
                  <li>Cari & buka <b>ESC Siantan</b></li>
                  <li>Ketuk <b>Izin</b> (atau "Perizinan Aplikasi")</li>
                  <li>Pada <b>Kamera</b>, pilih <b>Izinkan</b></li>
                  <li>Tutup total aplikasi (bukan minimize) lalu buka lagi & coba Scan</li>
                </ol>
                <p className="text-[10px] text-gray-500 mb-3 italic">
                  Tidak ketemu menu Kamera di Izin? Di Vivo/Xiaomi/Oppo cek juga
                  <b> "Izin Tambahan"</b> atau <b>"Pengaturan Privasi"</b> di halaman aplikasi yang sama.
                </p>

                <p className="font-semibold text-gray-800 mb-1">Cara B — pasang ulang (kalau Cara A tak ada menunya):</p>
                <ol className="list-decimal ml-4 space-y-1 text-[11px]">
                  <li>Tekan lama ikon <b>ESC Siantan</b> di layar utama → <b>Hapus/Uninstall</b></li>
                  <li>Buka <b>escsiantan.my.id</b> lewat Chrome biasa</li>
                  <li>Menu <b>⋮</b> → <b>Instal aplikasi / Tambah ke layar utama</b> lagi</li>
                  <li>Buka dari ikon baru → izin kamera akan diminta dari awal seperti install pertama kali</li>
                </ol>
              </>
            ) : (
              <>
                <p className="font-semibold text-gray-800 mb-2">Kenapa prompt kamera tak muncul lagi?</p>
                <p className="text-[11px] mb-3">
                  Chrome mengingat keputusan "blokir" seumur hidup situs, dan tidak
                  menyediakan cara untuk aplikasi memicu prompt lagi. Anda harus
                  <b> mereset izin di Chrome secara manual</b>:
                </p>

                <p className="font-semibold text-gray-800 mb-1">Cara A — cepat (lewat ikon gembok):</p>
                <ol className="list-decimal ml-4 space-y-1 text-[11px] mb-3">
                  <li>Ketuk ikon <b>gembok / (i) / 🛡️</b> di sebelah alamat <code>escsiantan.my.id</code></li>
                  <li>Ketuk <b>Izin</b> atau <b>Setelan situs</b></li>
                  <li>Pada <b>Kamera</b> ubah dari "Blokir" → <b>Izinkan</b> (atau "Tanyakan")</li>
                  <li>Muat ulang halaman ini</li>
                </ol>

                <p className="font-semibold text-gray-800 mb-1">Cara B — pasti berhasil (reset total):</p>
                <ol className="list-decimal ml-4 space-y-1 text-[11px]">
                  <li>Menu <b>⋮</b> kanan atas → <b>Setelan</b></li>
                  <li>Pilih <b>Setelan situs → Semua situs</b></li>
                  <li>Cari & ketuk <b>escsiantan.my.id</b></li>
                  <li>Ketuk <b>Hapus & setel ulang</b> lalu <b>Setel ulang</b></li>
                  <li>Buka <code>escsiantan.my.id</code> lagi → login → coba scan → prompt kamera akan muncul</li>
                </ol>

                <p className="text-[10px] text-gray-400 mt-3 italic">
                  Vivo/Xiaomi: pastikan juga <b>Setelan HP → Aplikasi → Chrome → Izin → Kamera → Izinkan</b>
                  (level OS di atas level browser).
                </p>
              </>
            )
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
