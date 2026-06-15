import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, XCircle, ScanLine, RotateCcw } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { classesService } from '@/services/contentService'
import { classAttendanceService } from '@/services/attendanceService'
import { Card, Spinner, GradientHeader, Button } from '@/components/ui'

const QR_PREFIX = 'ESC-ABSEN:'

export default function ClassAttendanceScanPage() {
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
    if (!decodedText.startsWith(QR_PREFIX)) return
    processingRef.current = true

    const classId = decodedText.slice(QR_PREFIX.length)
    try {
      const cls = await classesService.getById(classId)
      try {
        await classAttendanceService.checkIn(classId, profile.user_id)
        setResult({ type: 'success', message: `Absen berhasil untuk kelas "${cls.name}".` })
      } catch (err) {
        setResult({ type: 'duplicate', message: err.message || `Kamu sudah absen untuk kelas "${cls.name}" hari ini.` })
      }
    } catch {
      setResult({ type: 'error', message: 'Kode QR tidak valid atau kelas tidak ditemukan.' })
    }
  }

  function scanAgain() {
    setResult(null)
    processingRef.current = false
  }

  return (
    <div className="pb-4">
      <GradientHeader title="Absen Kelas" subtitle="Pindai kode QR di lokasi kelas" back={() => navigate(-1)} />

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
            <ScanLine size={15} /> Arahkan kamera ke kode QR kelas
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
