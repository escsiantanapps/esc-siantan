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
  const scannerRef = useRef(null)
  const processingRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const { Html5Qrcode } = await import('html5-qrcode')
      if (cancelled) return
      const scanner = new Html5Qrcode('qr-reader')
      scannerRef.current = scanner

      // Pilih kamera belakang UTAMA (1x). Tanpa ini, di HP multi-lensa browser
      // sering memilih lensa ultra-wide (0.5x). Hindari label ultra/tele/macro.
      let camera = { facingMode: 'environment' }
      try {
        const cams = await Html5Qrcode.getCameras()
        if (!cancelled && cams?.length) {
          const back = cams.filter(c => /back|rear|environment|belakang/i.test(c.label))
          const pool = back.length ? back : cams
          const main = pool.find(c => !/(ultra|0\.5|tele|macro|depth|monochrome|fisheye)/i.test(c.label)) || pool[0]
          if (main?.id) camera = { deviceId: { exact: main.id } }
        }
      } catch { /* fallback ke facingMode environment */ }
      if (cancelled) return

      scanner.start(
        camera,
        { fps: 10, qrbox: 230 },
        handleScan,
        () => {}
      ).then(() => !cancelled && setReady(true))
        .catch(() => setResult({ type: 'error', message: t('scan.cameraError') }))
    })()

    return () => {
      cancelled = true
      const scanner = scannerRef.current
      if (scanner) scanner.stop().then(() => scanner.clear()).catch(() => {})
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
    processingRef.current = false
  }

  return (
    <div className="pb-4">
      <GradientHeader title={t('scan.title')} subtitle={t('scan.subtitle')} back={() => navigate(-1)} />

      <div className="px-4 pt-4 space-y-4">
        <Card className={`p-3 overflow-hidden ${result ? 'hidden' : ''}`}>
          <div id="qr-reader" className="rounded-xl overflow-hidden" />
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
            <Button onClick={scanAgain}><RotateCcw size={15} /> {t('scan.scanAgain')}</Button>
          </Card>
        )}
      </div>
    </div>
  )
}
