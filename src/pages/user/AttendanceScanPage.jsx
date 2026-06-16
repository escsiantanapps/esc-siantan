import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, XCircle, ScanLine, RotateCcw } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { classesService, eventsService } from '@/services/contentService'
import { classAttendanceService, eventAttendanceService } from '@/services/attendanceService'
import { Card, Spinner, GradientHeader, Button } from '@/components/ui'

const CLASS_PREFIX = 'ESC-ABSEN:'
const EVENT_PREFIX = 'ESC-EVENT:'

export default function AttendanceScanPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [result, setResult] = useState(null)
  const scannerRef = useRef(null)
  const processingRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (cancelled) return
      const scanner = new Html5Qrcode('qr-reader')
      scannerRef.current = scanner
      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 230 },
        handleScan,
        () => {}
      ).then(() => !cancelled && setReady(true))
        .catch(() => setResult({ type: 'error', message: 'Tidak dapat mengakses kamera. Pastikan izin kamera diaktifkan.' }))
    })

    return () => {
      cancelled = true
      const scanner = scannerRef.current
      if (scanner) scanner.stop().then(() => scanner.clear()).catch(() => {})
    }
  }, [])

  async function handleScan(decodedText) {
    if (processingRef.current) return
    const text = (decodedText || '').trim()
    if (!text.startsWith(CLASS_PREFIX) && !text.startsWith(EVENT_PREFIX)) return
    processingRef.current = true

    if (text.startsWith(CLASS_PREFIX)) {
      await handleClass(text.slice(CLASS_PREFIX.length))
    } else {
      await handleEvent(text.slice(EVENT_PREFIX.length))
    }
  }

  async function handleClass(rest) {
    const [classId, sessionStr] = rest.split(':')
    const sessionNo = sessionStr ? Number(sessionStr) : null
    try {
      const cls = await classesService.getById(classId)
      const label = `kelas "${cls.name}"${sessionNo ? ` — Sesi ${sessionNo}` : ''}`
      try {
        await classAttendanceService.checkIn(classId, profile.user_id, sessionNo)
        setResult({ type: 'success', message: `Absen berhasil untuk ${label}.` })
      } catch (err) {
        setResult({ type: 'duplicate', message: err.message || `Kamu sudah absen untuk ${label}.` })
      }
    } catch {
      setResult({ type: 'error', message: 'Kode QR tidak valid atau kelas tidak ditemukan.' })
    }
  }

  async function handleEvent(eventId) {
    try {
      const ev = await eventsService.getById(eventId)
      try {
        await eventAttendanceService.checkIn(eventId, profile.user_id)
        setResult({ type: 'success', message: `Absen berhasil untuk event "${ev.name}".` })
      } catch (err) {
        if (err.message === 'not_registered') {
          setResult({ type: 'error', message: `Kamu belum mendaftar di event "${ev.name}", jadi belum bisa absen.` })
        } else {
          setResult({ type: 'duplicate', message: err.message || `Kamu sudah absen untuk event "${ev.name}".` })
        }
      }
    } catch {
      setResult({ type: 'error', message: 'Kode QR tidak valid atau event tidak ditemukan.' })
    }
  }

  function scanAgain() {
    setResult(null)
    processingRef.current = false
  }

  return (
    <div className="pb-4">
      <GradientHeader title="Absensi" subtitle="Pindai kode QR kelas atau event" back={() => navigate(-1)} />

      <div className="px-4 pt-4 space-y-4">
        <Card className={`p-3 overflow-hidden ${result ? 'hidden' : ''}`}>
          <div id="qr-reader" className="rounded-xl overflow-hidden" />
          {!ready && (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Spinner />
              <p className="text-xs text-gray-400">Menyiapkan kamera...</p>
            </div>
          )}
        </Card>

        {!result && ready && (
          <p className="text-center text-sm text-gray-500 flex items-center justify-center gap-1.5">
            <ScanLine size={15} /> Arahkan kamera ke kode QR
          </p>
        )}

        {result && (
          <Card className="p-5 flex flex-col items-center text-center gap-3 animate-fade-in-up">
            {result.type === 'success' && <CheckCircle2 size={40} className="text-green-500" />}
            {result.type === 'duplicate' && <CheckCircle2 size={40} className="text-amber-500" />}
            {result.type === 'error' && <XCircle size={40} className="text-red-500" />}
            <p className="text-sm text-gray-700">{result.message}</p>
            <Button onClick={scanAgain}><RotateCcw size={15} /> Scan Lagi</Button>
          </Card>
        )}
      </div>
    </div>
  )
}
