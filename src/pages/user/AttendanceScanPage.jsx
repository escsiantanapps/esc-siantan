import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, XCircle, ScanLine, RotateCcw } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { classesService, eventsService, komselService } from '@/services/contentService'
import { classAttendanceService, eventAttendanceService } from '@/services/attendanceService'
import { pointsService } from '@/services/pointsService'
import { usersService } from '@/services/usersService'
import { isCardExpired } from '@/components/MembershipCard'
import { Card, Spinner, GradientHeader, Button, StatusBadge, Avatar } from '@/components/ui'
import { useLang } from '@/hooks/useLang'

// Deteksi konteks TWA (APK Play Store) — Chrome membuka halaman dgn referrer
// android-app:// saat di-load lewat TWA. Panduan reset izin kamera berbeda
// jauh antara APK & PWA browser (Android Settings vs Chrome site settings).
function isRunningAsTwa() {
  return typeof document !== 'undefined' && document.referrer.startsWith('android-app://')
}

const CLASS_PREFIX = 'ESC-ABSEN:'
const EVENT_PREFIX = 'ESC-EVENT:'
const KOMSEL_PREFIX = 'ESC-KOMSEL:'
const SUNDAY_PREFIX = 'ESC-SUNDAY:'
const REDEEM_PREFIX = 'ESC-REDEEM:'
const MEMBER_PREFIX = 'ESC-MEMBER:'

export default function AttendanceScanPage() {
  const { profile, isAdmin, isPKS } = useAuth()
  const navigate = useNavigate()
  const { t } = useLang()
  const [ready, setReady] = useState(false)
  const [result, setResult] = useState(null)
  const [errDetail, setErrDetail] = useState('')
  const scannerRef = useRef(null)
  const processingRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      // Pra-cek: HTTPS wajib untuk mengakses kamera (kecuali localhost). Chrome
      // memblokir tanpa error yang jelas kalau situs di-load via HTTP.
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        setErrDetail('Perlu HTTPS. Buka lewat https:// (bukan http://).')
        setResult({ type: 'error', message: t('scan.cameraError') })
        return
      }
      if (!navigator?.mediaDevices?.getUserMedia) {
        setErrDetail('Browser tidak mendukung akses kamera (getUserMedia).')
        setResult({ type: 'error', message: t('scan.cameraError') })
        return
      }

      // Minta izin kamera LEBIH DULU lewat getUserMedia. Dua alasan: (1) di iOS
      // Safari & sebagian Android, enumerateDevices() hanya mengembalikan label
      // kamera setelah izin diberikan — tanpa langkah ini filter regex kita
      // sering tak match apa pun; (2) memaksa prompt izin muncul sekali di
      // awal, bukan setelah html5-qrcode mencoba start dan gagal senyap.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        stream.getTracks().forEach(tr => tr.stop())
      } catch (err) {
        const name = err?.name || 'Error'
        let hint = err?.message || ''
        if (name === 'NotAllowedError') hint = 'Izin kamera ditolak. Aktifkan di pengaturan situs.'
        else if (name === 'NotFoundError') hint = 'Tidak ada kamera terdeteksi.'
        else if (name === 'NotReadableError') hint = 'Kamera sedang dipakai aplikasi lain.'
        setErrDetail(`${name}: ${hint}`)
        setResult({ type: 'error', message: t('scan.cameraError') })
        return
      }
      if (cancelled) return

      const { Html5Qrcode } = await import('html5-qrcode')
      if (cancelled) return
      const scanner = new Html5Qrcode('qr-reader', { verbose: false })
      scannerRef.current = scanner

      // TANPA qrbox: seluruh frame kamera jadi area pindai (full).
      const config = { fps: 10 }

      // Kandidat kamera, dicoba berurutan sampai ada yang berhasil start.
      // Pilih lensa belakang UTAMA (1x) lebih dulu — HP multi-lensa sering
      // memilih ultra-wide (0.5x). Hindari label ultra/tele/macro.
      const candidates = []
      try {
        const cams = await Html5Qrcode.getCameras()
        if (cams?.length) {
          const back = cams.filter(c => /back|rear|environment|belakang/i.test(c.label))
          const pool = back.length ? back : cams
          const main = pool.find(c => !/(ultra|0\.5|tele|macro|depth|monochrome|fisheye)/i.test(c.label)) || pool[0]
          if (main?.id) candidates.push({ deviceId: { exact: main.id } })
        }
      } catch { /* enumerasi gagal — fallback facingMode di bawah */ }
      candidates.push({ facingMode: { ideal: 'environment' } })
      candidates.push({ facingMode: 'environment' })
      candidates.push({ facingMode: 'user' })
      if (cancelled) return

      let started = false
      let lastErr = null
      for (const cam of candidates) {
        if (cancelled) return
        try {
          await scanner.start(cam, config, handleScan, () => {})
          started = true
          break
        } catch (err) {
          lastErr = err
          try { await scanner.stop() } catch { /* belum berjalan */ }
        }
      }

      if (cancelled) {
        if (started) { try { await scanner.stop() } catch { /* noop */ } }
        return
      }
      if (started) {
        setReady(true)
      } else {
        const name = lastErr?.name || 'Error'
        const msg = lastErr?.message || String(lastErr || '')
        console.error('[scan] gagal memulai kamera:', lastErr)
        setErrDetail(`${name}: ${msg}`)
        setResult({ type: 'error', message: t('scan.cameraError') })
      }
    })()

    return () => {
      cancelled = true
      const scanner = scannerRef.current
      if (scanner) {
        scanner.stop().catch(() => {}).then(() => { try { scanner.clear() } catch { /* noop */ } })
      }
    }
  }, [])

  async function handleScan(decodedText) {
    if (processingRef.current) return
    const text = (decodedText || '').trim()
    const known = [CLASS_PREFIX, EVENT_PREFIX, KOMSEL_PREFIX, SUNDAY_PREFIX, REDEEM_PREFIX, MEMBER_PREFIX]
    if (!known.some(p => text.startsWith(p))) return
    processingRef.current = true

    if (text.startsWith(CLASS_PREFIX)) {
      await handleClass(text.slice(CLASS_PREFIX.length))
    } else if (text.startsWith(EVENT_PREFIX)) {
      await handleEvent(text.slice(EVENT_PREFIX.length))
    } else if (text.startsWith(KOMSEL_PREFIX)) {
      await handleKomsel(text.slice(KOMSEL_PREFIX.length))
    } else if (text.startsWith(SUNDAY_PREFIX)) {
      await handleSunday()
    } else if (text.startsWith(MEMBER_PREFIX)) {
      await handleMember(text.slice(MEMBER_PREFIX.length))
    } else {
      await handleRedeem(text.slice(REDEEM_PREFIX.length))
    }
  }

  async function handleClass(rest) {
    const [classId, sessionStr] = rest.split(':')
    const sessionNo = sessionStr ? Number(sessionStr) : null
    try {
      const cls = await classesService.getById(classId)
      const label = t('scan.classLabel', { name: cls.name }) + (sessionNo ? t('scan.sessionSuffix', { no: sessionNo }) : '')
      try {
        await classAttendanceService.checkIn(classId, profile.user_id, sessionNo)
        setResult({ type: 'success', message: t('scan.classSuccess', { label }) })
      } catch (err) {
        setResult({ type: 'duplicate', message: err.message || t('scan.classDuplicate', { label }) })
      }
    } catch {
      setResult({ type: 'error', message: t('scan.classInvalid') })
    }
  }

  async function handleEvent(eventId) {
    try {
      const ev = await eventsService.getById(eventId)
      try {
        await eventAttendanceService.checkIn(eventId, profile.user_id)
        setResult({ type: 'success', message: t('scan.eventSuccess', { name: ev.name }) })
      } catch (err) {
        if (err.message === 'not_registered') {
          setResult({ type: 'error', message: t('scan.eventNotRegistered', { name: ev.name }) })
        } else {
          setResult({ type: 'duplicate', message: err.message || t('scan.eventDuplicate', { name: ev.name }) })
        }
      }
    } catch {
      setResult({ type: 'error', message: t('scan.eventInvalid') })
    }
  }

  async function handleKomsel(sessionId) {
    try {
      const session = await komselService.getSessionById(sessionId)
      try {
        await komselService.checkInSession(session, profile.user_id)
        setResult({ type: 'success', message: `Kehadiran komsel "${session.komsel?.name || ''}" tercatat. +1 poin! 🎉` })
      } catch (err) {
        setResult({ type: 'duplicate', message: err.message || 'Kehadiran sesi ini sudah tercatat.' })
      }
    } catch {
      setResult({ type: 'error', message: 'Sesi komsel tidak ditemukan atau sudah berakhir.' })
    }
  }

  async function handleSunday() {
    try {
      await pointsService.checkInSunday(profile.user_id)
      setResult({ type: 'success', message: 'Kehadiran ibadah minggu tercatat. +1 poin! 🎉' })
    } catch (err) {
      setResult({ type: 'duplicate', message: err.message || 'Kehadiran ibadah hari ini sudah tercatat.' })
    }
  }

  async function handleRedeem(ticketId) {
    try {
      const res = await pointsService.redeemTicket(ticketId)
      if (res?.ok) {
        setResult({ type: 'success', message: `Penukaran berhasil: ${res.product || 'produk'} (−${res.cost} poin). Sisa poin: ${res.balance}.` })
      } else if (res?.reason === 'insufficient') {
        setResult({ type: 'error', message: `Poin tidak cukup. Butuh ${res.needed}, poin Anda ${res.balance}.` })
      } else if (res?.reason === 'used') {
        setResult({ type: 'duplicate', message: 'Tiket ini sudah digunakan atau tidak berlaku.' })
      } else {
        setResult({ type: 'error', message: 'Tiket tidak ditemukan.' })
      }
    } catch (err) {
      setResult({ type: 'error', message: err.message || 'Gagal memproses penukaran.' })
    }
  }

  // Verifikasi kartu QR personal jemaat (ESC-MEMBER:<nij>). Hanya Admin/Super
  // Admin/PKS yang boleh scan — jemaat biasa tidak boleh membaca data jemaat lain.
  async function handleMember(nij) {
    if (!isAdmin && !isPKS) {
      setResult({ type: 'error', message: 'Hanya Admin/PKS yang dapat memverifikasi kartu jemaat.' })
      return
    }
    try {
      const member = await usersService.getByNij(nij)
      if (!member) {
        setResult({ type: 'error', message: 'Kartu tidak valid — jemaat tidak ditemukan.' })
        return
      }
      setResult({ type: 'member', member })
    } catch {
      setResult({ type: 'error', message: 'Gagal memverifikasi kartu.' })
    }
  }

  function scanAgain() {
    setResult(null)
    setErrDetail('')
    processingRef.current = false
  }

  return (
    <div className="pb-4">
      <GradientHeader title={t('scan.title')} subtitle={t('scan.subtitle')} back={() => navigate(-1)} />

      <div className="px-4 pt-4 space-y-4">
        <Card className={`p-3 overflow-hidden ${result ? 'hidden' : ''}`}>
          <div
            id="qr-reader"
            className="rounded-xl overflow-hidden w-full"
            style={{ minHeight: 260 }}
          />
          {!ready && (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Spinner />
              <p className="text-xs text-gray-400">{t('scan.preparingCamera')}</p>
            </div>
          )}
        </Card>

        {!result && ready && (
          <p className="text-center text-sm text-gray-500 flex items-center justify-center gap-1.5">
            <ScanLine size={15} /> {t('scan.aim')}
          </p>
        )}

        {result && result.type === 'member' && (
          <Card className="p-5 flex flex-col items-center text-center gap-3 animate-fade-in-up">
            <Avatar name={result.member.name} src={result.member.photo_url} size="xl" />
            <div>
              <p className="text-base font-semibold text-gray-900">{result.member.name}</p>
              <p className="text-xs text-gray-400">NIJ: {result.member.nij}</p>
            </div>
            <StatusBadge status={result.member.status} />
            <p className="text-sm text-gray-700">{result.member.points ?? 0} poin</p>
            {isCardExpired(result.member.membership_card_issued_at) && (
              <p className="text-xs text-red-500 font-medium">Kartu jemaat kedaluwarsa</p>
            )}
            <Button onClick={scanAgain}><RotateCcw size={15} /> {t('scan.scanAgain')}</Button>
          </Card>
        )}

        {result && result.type !== 'member' && (
          <Card className="p-5 flex flex-col items-center text-center gap-3 animate-fade-in-up">
            {result.type === 'success' && <CheckCircle2 size={40} className="text-green-500" />}
            {result.type === 'duplicate' && <CheckCircle2 size={40} className="text-amber-500" />}
            {result.type === 'error' && <XCircle size={40} className="text-red-500" />}
            <p className="text-sm text-gray-700">{result.message}</p>
            {result.type === 'error' && errDetail && (
              <p className="text-[11px] text-gray-400 break-all max-w-full">{errDetail}</p>
            )}

            {/* Panduan spesifik saat izin kamera ditolak. Setelah "Block" tersimpan,
                Chrome tidak akan menampilkan prompt lagi — user WAJIB reset izin
                secara manual. Cara berbeda antara APK (TWA) & PWA (Chrome). */}
            {result.type === 'error' && errDetail.includes('NotAllowed') && (
              <div className="w-full mt-2 text-left">
                {isRunningAsTwa() ? (
                  <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                    <p className="text-xs font-semibold text-amber-900 mb-2">Cara mengaktifkan kamera di APK ESC Siantan:</p>
                    <ol className="list-decimal ml-4 text-[11px] text-amber-900 space-y-1">
                      <li>Buka <b>Pengaturan HP → Aplikasi</b></li>
                      <li>Cari & buka <b>ESC Siantan</b></li>
                      <li>Ketuk <b>Izin → Kamera</b></li>
                      <li>Pilih <b>Izinkan</b> (bukan Tanya/Tolak)</li>
                      <li>Buka lagi aplikasi ESC Siantan</li>
                    </ol>
                    <p className="text-[10px] text-amber-800 mt-2 italic">Di Vivo/Xiaomi kadang tersembunyi di "Izin Tambahan" atau "Pengaturan Pribadi".</p>
                  </div>
                ) : (
                  <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                    <p className="text-xs font-semibold text-amber-900 mb-2">Cara mengaktifkan kamera di Chrome:</p>
                    <ol className="list-decimal ml-4 text-[11px] text-amber-900 space-y-1">
                      <li>Ketuk ikon <b>gembok/i</b> di sebelah alamat situs</li>
                      <li>Ketuk <b>Izin</b> (atau "Site settings")</li>
                      <li>Pada <b>Kamera</b>, pilih <b>Izinkan</b></li>
                      <li>Muat ulang halaman ini</li>
                    </ol>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 flex-wrap justify-center">
              {result.type === 'error' && (
                <Button variant="secondary" onClick={() => window.location.reload()}>
                  Muat ulang halaman
                </Button>
              )}
              <Button onClick={scanAgain}><RotateCcw size={15} /> {t('scan.scanAgain')}</Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
