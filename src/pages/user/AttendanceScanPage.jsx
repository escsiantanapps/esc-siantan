import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ImagePlus, XCircle, ScanLine, RotateCcw } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { classesService, eventsService, komselService } from '@/services/contentService'
import { ministryScheduleService } from '@/services/ministryScheduleService'
import { classAttendanceService, eventAttendanceService } from '@/services/attendanceService'
import { pointsService } from '@/services/pointsService'
import { usersService } from '@/services/usersService'
import { isCardExpired } from '@/components/MembershipCard'
import { Card, Spinner, GradientHeader, Button, StatusBadge, Avatar } from '@/components/ui'
import { useLang } from '@/hooks/useLang'

const CLASS_PREFIX = 'ESC-ABSEN:'
const EVENT_PREFIX = 'ESC-EVENT:'
const KOMSEL_PREFIX = 'ESC-KOMSEL:'
const SUNDAY_PREFIX = 'ESC-SUNDAY:'
const REDEEM_PREFIX = 'ESC-REDEEM:'
const MEMBER_PREFIX = 'ESC-MEMBER:'
const VOLUNTEER_PREFIX = 'ESC-VOLUNTEER:'
const KNOWN_PREFIXES = [CLASS_PREFIX, EVENT_PREFIX, KOMSEL_PREFIX, SUNDAY_PREFIX, REDEEM_PREFIX, MEMBER_PREFIX, VOLUNTEER_PREFIX]

export default function AttendanceScanPage() {
  const { profile, isAdmin, isPKS } = useAuth()
  const navigate = useNavigate()
  const { t } = useLang()
  const [ready, setReady] = useState(false)
  const [result, setResult] = useState(null)
  const [errDetail, setErrDetail] = useState('')
  const [retryTick, setRetryTick] = useState(0)
  const [galleryBusy, setGalleryBusy] = useState(false)
  const fileInputRef = useRef(null)
  const scannerRef = useRef(null)
  const processingRef = useRef(false)

  useEffect(() => {
    document.body.classList.add('attendance-scanner-open')
    return () => document.body.classList.remove('attendance-scanner-open')
  }, [])

  useEffect(() => {
    let cancelled = false
    setReady(false)

    ;(async () => {
      // Instansiasi pemindai sebelum meminta izin kamera. Dengan begitu foto
      // galeri tetap bisa dipindai ketika kamera tidak tersedia atau ditolak.
      const { Html5Qrcode } = await import('html5-qrcode')
      if (cancelled) return
      const scanner = new Html5Qrcode('qr-reader', { verbose: false })
      scannerRef.current = scanner

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

      try {
        // Minta izin kamera LEBIH DULU lewat getUserMedia. Dua alasan: (1) di iOS
        // Safari & sebagian Android, enumerateDevices() hanya mengembalikan label
        // kamera setelah izin diberikan — tanpa langkah ini filter regex kita
        // sering tak match apa pun; (2) memaksa prompt izin muncul sekali di
        // awal, bukan setelah html5-qrcode mencoba start dan gagal senyap.
        // Coba ideal environment (belakang) terlebih dahulu.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        stream.getTracks().forEach(tr => tr.stop())
      } catch (err) {
        // Jika gagal karena constraint (seperti OverconstrainedError di desktop), coba video: true
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          })
          stream.getTracks().forEach(tr => tr.stop())
        } catch (err2) {
          const name = err2?.name || 'Error'
          let hint = err2?.message || ''
          if (name === 'NotAllowedError') hint = 'Izin kamera ditolak. Aktifkan di pengaturan situs.'
          else if (name === 'NotFoundError') hint = 'Tidak ada kamera terdeteksi.'
          else if (name === 'NotReadableError') hint = 'Kamera sedang dipakai aplikasi lain.'
          setErrDetail(`${name}: ${hint}`)
          setResult({ type: 'error', message: t('scan.cameraError') })
          return
        }
      }
      if (cancelled) return

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
      candidates.push({}) // Fallback terakhir: kamera apa pun yang tersedia
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
  }, [retryTick])

  async function handleScan(decodedText) {
    if (processingRef.current) return
    const text = (decodedText || '').trim()
    if (!KNOWN_PREFIXES.some(p => text.startsWith(p))) return
    processingRef.current = true

    if (text.startsWith(CLASS_PREFIX)) {
      await handleClass(text.slice(CLASS_PREFIX.length))
    } else if (text.startsWith(EVENT_PREFIX)) {
      await handleEvent(text.slice(EVENT_PREFIX.length))
    } else if (text.startsWith(KOMSEL_PREFIX)) {
      await handleKomsel(text.slice(KOMSEL_PREFIX.length))
    } else if (text.startsWith(VOLUNTEER_PREFIX)) {
      await handleVolunteer(text.slice(VOLUNTEER_PREFIX.length))
    } else if (text.startsWith(SUNDAY_PREFIX)) {
      await handleSunday(text.slice(SUNDAY_PREFIX.length))
    } else if (text.startsWith(MEMBER_PREFIX)) {
      await handleMember(text.slice(MEMBER_PREFIX.length))
    } else {
      await handleRedeem(text.slice(REDEEM_PREFIX.length))
    }
  }

  async function handleGalleryFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || galleryBusy) return

    setGalleryBusy(true)
    setErrDetail('')
    try {
      const scanner = scannerRef.current
      if (!scanner) throw new Error('scanner_unavailable')
      if (ready) {
        try { await scanner.stop() } catch { /* kamera mungkin sudah berhenti */ }
        setReady(false)
      }
      const decodedText = (await scanner.scanFile(file, false)).trim()
      if (!KNOWN_PREFIXES.some(prefix => decodedText.startsWith(prefix))) {
        processingRef.current = false
        setResult({ type: 'error', message: t('scan.galleryInvalid') })
        return
      }
      setResult(null)
      processingRef.current = false
      await handleScan(decodedText)
    } catch {
      processingRef.current = false
      setResult({ type: 'error', message: t('scan.galleryNotDetected') })
    } finally {
      setGalleryBusy(false)
    }
  }

  // Absen Pelayanan Minggu (Volunteer terjadwal). Status telat dihitung server.
  async function handleVolunteer(scheduleId) {
    try {
      const sched = await ministryScheduleService.getById(scheduleId)
      const label = sched.label || sched.ministries?.name || 'Pelayanan'
      try {
        const rec = await ministryScheduleService.checkIn(scheduleId, profile.user_id)
        const late = rec.status === 'Terlambat'
        setResult({
          type: late ? 'duplicate' : 'success',
          message: late
            ? `Kehadiran pelayanan "${label}" tercatat — TERLAMBAT.`
            : `Kehadiran pelayanan "${label}" tercatat tepat waktu. ✅`,
        })
      } catch (err) {
        const dup = /sudah tercatat/i.test(err.message || '')
        setResult({ type: dup ? 'duplicate' : 'error', message: err.message || 'Gagal mencatat kehadiran pelayanan.' })
      }
    } catch {
      setResult({ type: 'error', message: 'Jadwal pelayanan tidak ditemukan atau sudah berakhir.' })
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
        if (refreshProfile) refreshProfile()
      } catch (err) {
        if (err.message === 'not_registered') {
          setResult({ type: 'error', message: `Anda belum mendaftar di kelas ini.` })
        } else {
          setResult({ type: 'duplicate', message: err.message || t('scan.classDuplicate', { label }) })
        }
      }
    } catch {
      setResult({ type: 'error', message: t('scan.classInvalid') })
    }
  }

  async function handleEvent(eventId) {
    try {
      const ev = await eventsService.getById(eventId)
      const label = ev.name
      try {
        await eventAttendanceService.checkIn(eventId, profile.user_id)
        setResult({ type: 'success', message: t('scan.eventSuccess', { label }) })
        if (refreshProfile) refreshProfile()
      } catch (err) {
        if (err.message === 'not_registered') {
          setResult({ type: 'error', message: t('scan.eventNotRegistered', { name: label }) })
        } else {
          setResult({ type: 'duplicate', message: err.message || t('scan.eventDuplicate', { name: label }) })
        }
      }
    } catch {
      setResult({ type: 'error', message: t('scan.eventInvalid') })
    }
  }

  async function handleKomsel(sessionId) {
    try {
      const session = await komselService.getSessionById(sessionId)
      
      // Proteksi: Pastikan user yang scan benar-benar anggota dari komsel ini
      if (profile.komsel_id !== session.komsel_id) {
        setResult({ 
          type: 'error', 
          message: `Gagal absen: Sesi ini untuk "${session.komsel?.name || 'Komsel Lain'}", sedangkan Anda terdaftar di komsel yang berbeda. Beri tahu PKS Anda!` 
        })
        return
      }

      try {
        const rec = await komselService.checkInSession(session, profile.user_id)
        const nm = session.komsel?.name || ''
        setResult({
          type: 'success',
          message: rec.points_awarded
            ? `Kehadiran komsel "${nm}" tercatat. +1 poin! 🎉`
            : `Kehadiran komsel "${nm}" tercatat. ✅ (tanpa poin — sebagai pemimpin atau sudah dapat poin komsel hari ini)`,
        })
      } catch (err) {
        setResult({ type: 'duplicate', message: err.message || 'Kehadiran sesi ini sudah tercatat.' })
      }
    } catch {
      setResult({ type: 'error', message: 'Sesi komsel tidak ditemukan atau sudah berakhir.' })
    }
  }

  // Absen ibadah minggu. QR kini berisi session_id acak (bukan tanggal statis
  // seperti dulu) — anti-curang v63. Pra-cek sesi di klien untuk pesan yang
  // jelas; gerbang sebenarnya = policy insert sunday_attendance di DB.
  async function handleSunday(sessionId) {
    if (!sessionId) {
      setResult({ type: 'error', message: 'QR ibadah tidak valid. Minta petugas menampilkan QR ibadah terbaru.' })
      return
    }
    try {
      const sess = await pointsService.getSundaySession(sessionId)
      if (!sess) {
        setResult({ type: 'error', message: 'Sesi ibadah tidak ditemukan. QR mungkin sudah kedaluwarsa — minta petugas membuka ulang.' })
        return
      }
      if (new Date(sess.expires_at).getTime() < Date.now()) {
        setResult({ type: 'error', message: 'Sesi ibadah sudah berakhir. Minta petugas menampilkan QR ibadah terbaru.' })
        return
      }
      await pointsService.checkInSunday(profile.user_id, sessionId)
      setResult({ type: 'success', message: 'Kehadiran ibadah minggu tercatat. +1 poin! 🎉' })
    } catch (err) {
      const dup = /sudah tercatat/i.test(err.message || '')
      setResult({ type: dup ? 'duplicate' : 'error', message: err.message || 'Gagal mencatat kehadiran ibadah.' })
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
    // Kalau kamera belum pernah aktif (mis. gagal karena izin ditolak), pemindai
    // tidak pernah start — reset UI saja tidak cukup. Picu ulang seluruh alur
    // permintaan izin + start kamera, supaya user yang baru saja mengizinkan
    // lewat pengaturan browser bisa langsung coba lagi tanpa reload halaman.
    if (!ready) setRetryTick(t => t + 1)
  }

  return (
    <div className={result ? 'pb-4' : ''}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleGalleryFile}
        aria-label={t('scan.galleryButton')}
      />

      <div className={result ? 'hidden' : 'fixed inset-0 z-[60] overflow-hidden bg-gray-950'}>
        <div
          id="qr-reader"
          className="attendance-qr-reader absolute inset-0 h-full w-full bg-gray-950"
        />

        {!ready && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-gray-950 text-white">
            <Spinner />
            <p className="text-xs text-gray-300">{t('scan.preparingCamera')}</p>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div
            className="aspect-square w-[min(72vw,18rem)] rounded-2xl border-2 border-white"
            style={{ boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.48)' }}
            aria-hidden="true"
          />
        </div>

        <div
          className="absolute inset-x-0 top-0 z-30 flex items-center gap-3 px-4 pb-4"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            aria-label={t('common.back')}
          >
            <ArrowLeft size={23} />
          </button>
          <div className="min-w-0 text-white">
            <h1 className="truncate text-lg font-semibold">{t('scan.title')}</h1>
            <p className="truncate text-xs text-white/75">{t('scan.subtitle')}</p>
          </div>
        </div>

        <div
          className="absolute inset-x-0 bottom-0 z-30 space-y-3 px-4 pt-10 text-center"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)',
            background: 'linear-gradient(to top, rgba(0,0,0,.82), rgba(0,0,0,.48), transparent)',
          }}
        >
          {ready && (
            <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-white">
              <ScanLine size={17} /> {t('scan.aim')}
            </p>
          )}
          <Button
            variant="secondary"
            className="w-full bg-white text-gray-900 hover:bg-gray-100"
            loading={galleryBusy}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus size={18} /> {t('scan.galleryButton')}
          </Button>
        </div>
      </div>

      {result && (
        <>
          <GradientHeader title={t('scan.title')} subtitle={t('scan.subtitle')} back={() => navigate(-1)} />
          <div className="space-y-4 px-4 pt-4">
            {result.type === 'error' && errDetail && (
              <div className="text-center space-y-1.5">
                <Button
                  variant="secondary"
                  className="w-full"
                  loading={galleryBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus size={18} /> {t('scan.galleryButton')}
                </Button>
                <p className="text-xs text-gray-400">{t('scan.galleryHint')}</p>
              </div>
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

            {/* Izin kamera ditolak: setelah "Block" tersimpan, browser/OS TIDAK
                akan menampilkan prompt lagi dari sini — user wajib reset izin
                secara manual. Instruksi lengkap & sadar-konteks (PWA terinstal /
                tab Chrome biasa) ada satu tempat di panel
                "Izin Kamera" pada Pengaturan (lihat CameraToggle.jsx), supaya
                tidak ada 2 versi panduan yang bisa berbeda/basi. */}
            {result.type === 'error' && errDetail.includes('NotAllowed') && (
              <div className="w-full mt-2 rounded-xl bg-amber-50 border border-amber-100 p-3 text-left">
                <p className="text-xs font-semibold text-amber-900 mb-1">Izin kamera ditolak</p>
                <p className="text-[11px] text-amber-900 mb-2">
                  Buka <b>Pengaturan → Izin Kamera</b> untuk panduan mengaktifkan
                  sesuai cara Anda membuka aplikasi ini.
                </p>
                <Button size="sm" onClick={() => navigate('/pengaturan')}>Buka Pengaturan</Button>
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
        </>
      )}
    </div>
  )
}
