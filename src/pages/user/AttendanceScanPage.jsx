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

function isIOSDevice() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.userAgent.includes('Mac') && 'ontouchend' in document)
}

function isStandalonePwa() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator.standalone === true
}

function normalizeCameraError(error) {
  const message = error?.message || String(error || '')
  let name = error?.name || 'Error'
  if (/notallowed|permission denied|permission dismissed/i.test(`${name} ${message}`)) name = 'NotAllowedError'
  else if (/notfound|requested device not found/i.test(`${name} ${message}`)) name = 'NotFoundError'
  else if (/notreadable|could not start video source|track starter failed/i.test(`${name} ${message}`)) name = 'NotReadableError'
  return { name, message }
}

async function startCameraWithTimeout(scanner, camera, config, onSuccess, timeoutMs = 12000) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => {
      const error = new Error('camera_start_timeout')
      error.name = 'CameraTimeoutError'
      reject(error)
    }, timeoutMs)
  })

  try {
    return await Promise.race([
      scanner.start(camera, config, onSuccess, () => {}),
      timeout,
    ])
  } finally {
    window.clearTimeout(timer)
  }
}

export default function AttendanceScanPage() {
  const { profile, isAdmin, isPKS, refreshProfile } = useAuth()
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
      // Konfigurasi format dan decoder memang merupakan opsi constructor pada
      // html5-qrcode 2.3.8, bukan opsi scanner.start().
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
      if (cancelled) return
      const iosDevice = isIOSDevice()
      const scanner = new Html5Qrcode('qr-reader', {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        // Implementasi BarcodeDetector WebKit berbeda-beda antar versi iOS.
        // Decoder ZXing bawaan lebih konsisten untuk QR panjang sesi ibadah.
        useBarCodeDetectorIfSupported: !iosDevice,
      })
      scannerRef.current = scanner

      if (typeof window !== 'undefined' && !window.isSecureContext) {
        setErrDetail(t('scan.cameraHttps'))
        setResult({ type: 'error', message: t('scan.cameraError') })
        return
      }
      if (!navigator?.mediaDevices?.getUserMedia) {
        setErrDetail(t('scan.cameraUnsupported'))
        setResult({ type: 'error', message: t('scan.cameraError') })
        return
      }

      // scanner.start() sendiri meminta izin kamera. Pra-panggilan getUserMedia()
      // sengaja dihapus karena membuka-menutup stream lalu langsung membukanya
      // lagi dapat membuat WebKit iPhone belum melepas perangkat kamera.
      const config = {
        fps: 10,
        // Crop dekode mengikuti kotak panduan. Di iPhone ini jauh lebih ringan
        // daripada memproses seluruh frame kamera portrait pada setiap iterasi.
        qrbox: (width, height) => {
          const edge = Math.floor(Math.min(width * 0.72, height * 0.9, 288))
          return { width: Math.max(180, edge), height: Math.max(180, edge) }
        },
      }
      const candidates = []

      if (iosDevice) {
        // Di iPhone jangan gunakan deviceId: WebKit lebih stabil bila memilih
        // kamera melalui facingMode dan tidak melakukan enumerasi lebih dulu.
        candidates.push({ facingMode: 'environment' })
        candidates.push({ facingMode: 'user' })
      } else {
        try {
          const cameras = await Html5Qrcode.getCameras()
          if (cameras?.length) {
            const backCameras = cameras.filter(camera => /back|rear|environment|belakang/i.test(camera.label))
            const pool = backCameras.length ? backCameras : cameras
            const mainCamera = pool.find(camera => !/(ultra|0\.5|tele|macro|depth|monochrome|fisheye)/i.test(camera.label)) || pool[0]
            if (mainCamera?.id) candidates.push({ deviceId: { exact: mainCamera.id } })
          }
        } catch { /* scanner.start() tetap bisa meminta izin lewat facingMode */ }

        candidates.push({ facingMode: 'environment' })
        candidates.push({ facingMode: 'user' })
      }
      if (cancelled) return

      let started = false
      let lastErr = null
      for (const cam of candidates) {
        if (cancelled) return
        try {
          await startCameraWithTimeout(scanner, cam, config, handleScan)
          const video = document.querySelector('#qr-reader video')
          if (video) {
            // Atribut ini sudah dipasang library, tetapi ditegaskan kembali agar
            // Safari tidak memindahkan video ke pemutar layar penuh.
            video.muted = true
            video.setAttribute('muted', 'true')
            video.setAttribute('playsinline', 'true')
          }
          started = true
          break
        } catch (err) {
          lastErr = err
          try { await scanner.stop() } catch { /* belum berjalan */ }
          const { name, message } = normalizeCameraError(err)
          // Bila izin ditolak, mencoba kamera lain hanya mengulang kegagalan dan
          // pada Safari dapat membuat prompt terasa macet.
          if (name === 'NotAllowedError' || name === 'CameraTimeoutError' || /permission/i.test(message)) break
        }
      }

      if (cancelled) {
        if (started) { try { await scanner.stop() } catch { /* noop */ } }
        return
      }
      if (started) {
        setReady(true)
      } else {
        const { name, message } = normalizeCameraError(lastErr)
        let hint = message
        if (name === 'NotAllowedError') hint = t('scan.cameraDenied')
        else if (name === 'NotFoundError') hint = t('scan.cameraNotFound')
        else if (name === 'NotReadableError') hint = t('scan.cameraBusy')
        else if (name === 'CameraTimeoutError') hint = t(isIOSDevice() ? 'scan.iosCameraTimeout' : 'scan.cameraTimeout')
        console.error('[scan] gagal memulai kamera:', lastErr)
        setErrDetail(`${name}: ${hint}`)
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
      const name = session.komsel?.name || t('scan.komselFallback')

      // Pra-cek untuk pesan cepat; RPC v79 tetap menjadi gerbang sebenarnya.
      if (profile.komsel_id !== session.komsel_id) {
        setResult({ type: 'error', message: t('scan.komselWrongGroup', { name }) })
        return
      }

      const rec = await komselService.checkInSession(session.session_id)
      if (!rec?.ok) {
        const keyByReason = {
          duplicate: 'scan.komselDuplicate',
          wrong_komsel: 'scan.komselWrongGroup',
          expired_session: 'scan.komselExpired',
          invalid_session: 'scan.komselInvalid',
          account_inactive: 'scan.komselInactive',
          not_authenticated: 'scan.komselNotAuthenticated',
        }
        const key = keyByReason[rec?.reason] || 'scan.komselFailed'
        setResult({
          type: rec?.reason === 'duplicate' ? 'duplicate' : 'error',
          message: t(key, { name }),
        })
        return
      }

      const key = rec.points_awarded
        ? 'scan.komselSuccess'
        : rec.reason === 'leader'
          ? 'scan.komselLeaderNoPoint'
          : rec.reason === 'already_today'
            ? 'scan.komselAlreadyToday'
            : 'scan.komselNotAwarded'
      setResult({
        type: rec.reason === 'not_awarded' ? 'error' : 'success',
        message: t(key, { name }),
      })
      if (refreshProfile) refreshProfile()
    } catch (err) {
      console.error('[scan] gagal mencatat absensi komsel:', err)
      setResult({ type: 'error', message: t('scan.komselFailed') })
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
            className="scanner-gallery-button w-full"
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
            {result.type === 'error' && errDetail.includes('NotAllowed') && !isIOSDevice() && (
              <div className="w-full mt-2 rounded-xl bg-amber-50 border border-amber-100 p-3 text-left">
                <p className="text-xs font-semibold text-amber-900 mb-1">Izin kamera ditolak</p>
                <p className="text-[11px] text-amber-900 mb-2">
                  Buka <b>Pengaturan → Izin Kamera</b> untuk panduan mengaktifkan
                  sesuai cara Anda membuka aplikasi ini.
                </p>
                <Button size="sm" onClick={() => navigate('/pengaturan')}>Buka Pengaturan</Button>
              </div>
            )}

            {result.type === 'error' && errDetail && isIOSDevice() && (
              <div className="w-full mt-2 rounded-xl bg-amber-50 border border-amber-100 p-3 text-left">
                <p className="text-xs font-semibold text-amber-900 mb-1">{t('scan.iosHelpTitle')}</p>
                <p className="text-[11px] text-amber-900">{t('scan.iosSafariHelp')}</p>
                {isStandalonePwa() && (
                  <p className="text-[11px] text-amber-900 mt-2">{t('scan.iosPwaHelp')}</p>
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
        </>
      )}
    </div>
  )
}
