import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, Gift, ImagePlus, QrCode, RotateCcw } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { useAuth } from '@/hooks/useAuth'
import { pointsService } from '@/services/pointsService'
import { Button, Card, Input, PageHeader, Spinner, StatusBadge } from '@/components/ui'

const COUPON_PREFIX = 'ESC-REWARD:'
const COUPON_PATTERN = /^RCP-[0-9a-f]{32}$/i

export default function AdminRewardScanPage() {
  const { t } = useLang()
  const { toast, confirm } = useToast()
  const { profile } = useAuth()
  const [manualCode, setManualCode] = useState('')
  const [cameraRunning, setCameraRunning] = useState(false)
  const [cameraBusy, setCameraBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [inspection, setInspection] = useState(null)
  const [error, setError] = useState('')
  const scannerRef = useRef(null)
  const handlingRef = useRef(false)
  const mountedRef = useRef(true)
  const fileRef = useRef(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      const scanner = scannerRef.current
      scannerRef.current = null
      if (scanner) scanner.stop().catch(() => {}).then(() => {
        try { scanner.clear() } catch { /* elemen sudah dilepas */ }
      })
    }
  }, [])

  async function stopCamera() {
    const scanner = scannerRef.current
    scannerRef.current = null
    if (!scanner) return
    try { await scanner.stop() } catch { /* kamera belum berjalan */ }
    try { scanner.clear() } catch { /* elemen mungkin sudah dilepas */ }
    if (mountedRef.current) setCameraRunning(false)
  }

  async function inspectCode(raw) {
    const code = raw.trim()
    const couponId = code.startsWith(COUPON_PREFIX) ? code.slice(COUPON_PREFIX.length) : code
    if (!COUPON_PATTERN.test(couponId)) {
      setError(t('rewardScan.invalidQr'))
      setInspection(null)
      return
    }
    setBusy(true)
    setError('')
    setInspection(null)
    try {
      const result = await pointsService.inspectRewardCoupon(couponId)
      if (!mountedRef.current) return
      if (!result?.ok) { setError(t('rewardScan.notFound')); return }
      setInspection({ ...result, couponId })
      setManualCode(couponId)
    } catch (err) {
      if (mountedRef.current) setError(err.message || t('rewardScan.inspectFailed'))
    } finally { if (mountedRef.current) setBusy(false) }
  }

  async function startCamera() {
    if (cameraBusy || cameraRunning) return
    setCameraBusy(true)
    setError('')
    try {
      if (!window.isSecureContext) throw new Error(t('rewardScan.httpsRequired'))
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
      if (!mountedRef.current) return
      const scanner = new Html5Qrcode('reward-coupon-reader', {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        useBarCodeDetectorIfSupported: !/iPad|iPhone|iPod/.test(navigator.userAgent),
      })
      scannerRef.current = scanner
      await scanner.start({ facingMode: 'environment' }, {
        fps: 10,
        qrbox: (width, height) => {
          const edge = Math.max(180, Math.min(280, Math.floor(Math.min(width, height) * 0.75)))
          return { width: edge, height: edge }
        },
      }, async decoded => {
        if (handlingRef.current) return
        handlingRef.current = true
        await stopCamera()
        if (mountedRef.current) await inspectCode(decoded)
        handlingRef.current = false
      }, () => {})
      if (!mountedRef.current) { await stopCamera(); return }
      setCameraRunning(true)
    } catch (err) {
      await stopCamera()
      if (mountedRef.current) setError(err.message || t('rewardScan.cameraFailed'))
    } finally { if (mountedRef.current) setCameraBusy(false) }
  }

  async function scanImage(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setCameraBusy(true)
    setError('')
    try {
      await stopCamera()
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
      if (!mountedRef.current) return
      const scanner = new Html5Qrcode('reward-coupon-reader', {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        useBarCodeDetectorIfSupported: false,
      })
      let decoded
      try { decoded = await scanner.scanFile(file, false) }
      finally { try { scanner.clear() } catch { /* dekoder gagal mulai */ } }
      if (mountedRef.current) await inspectCode(decoded)
    } catch (err) {
      if (mountedRef.current) setError(err.message || t('rewardScan.imageFailed'))
    } finally { if (mountedRef.current) setCameraBusy(false) }
  }

  async function confirmHandover() {
    if (!inspection || inspection.status !== 'Menunggu') return
    const ok = await confirm({
      title: t('rewardScan.confirmTitle'),
      message: t('rewardScan.confirmMessage', {
        member: inspection.member_name, product: inspection.product_name, cost: inspection.cost,
      }),
      confirmText: t('rewardScan.confirmAction'),
    })
    if (!ok) return
    setBusy(true)
    try {
      const result = await pointsService.confirmRewardCoupon(inspection.couponId)
      if (!result?.ok) { setError(t(`rewardScan.error.${result?.reason || 'unknown'}`)); return }
      setInspection(previous => ({ ...previous, status: 'Digunakan' }))
      toast.success(t('rewardScan.confirmed'))
    } catch (err) { setError(err.message || t('rewardScan.error.unknown')) }
    finally { setBusy(false) }
  }

  async function cancelAndRefund() {
    if (!inspection || inspection.status !== 'Menunggu') return
    const ok = await confirm({
      title: t('rewardScan.cancelTitle'),
      message: t('rewardScan.cancelMessage', { member: inspection.member_name, cost: inspection.cost }),
      confirmText: t('rewardScan.cancelAction'), danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const result = await pointsService.cancelRewardCoupon(inspection.couponId)
      if (!result?.ok) { setError(t(`rewardScan.error.${result?.reason || 'unknown'}`)); return }
      setInspection(previous => ({ ...previous, status: 'Dibatalkan' }))
      toast.success(t('rewardScan.cancelled'))
    } catch (err) { setError(err.message || t('rewardScan.error.unknown')) }
    finally { setBusy(false) }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('rewardScan.title')} subtitle={t('rewardScan.subtitle')} />
      <Card className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center"><QrCode size={20} /></div>
          <p className="text-sm text-gray-600 flex-1">{t('rewardScan.hint')}</p>
        </div>
        <div id="reward-coupon-reader" className="overflow-hidden rounded-xl bg-control" />
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" onClick={startCamera} loading={cameraBusy} disabled={cameraRunning || busy}>
            <Camera size={17} />{cameraRunning ? t('rewardScan.cameraOn') : t('rewardScan.openCamera')}
          </Button>
          {cameraRunning && <Button variant="outline" className="min-h-11" onClick={stopCamera}>{t('rewardScan.closeCamera')}</Button>}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={scanImage} />
          <Button variant="outline" className="min-h-11" disabled={cameraBusy || busy} onClick={() => fileRef.current?.click()}>
            <ImagePlus size={17} />{t('rewardScan.chooseImage')}
          </Button>
        </div>
        <div className="flex gap-2 items-end">
          <div className="flex-1"><Input label={t('rewardScan.manualLabel')} value={manualCode}
            onChange={event => setManualCode(event.target.value)} placeholder="RCP-..." /></div>
          <Button variant="outline" className="min-h-11" loading={busy} onClick={() => inspectCode(manualCode)}>{t('rewardScan.check')}</Button>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {busy && <div className="flex justify-center py-4"><Spinner /></div>}
      </Card>

      {inspection && (
        <Card className="p-5 mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Gift size={18} />{t('rewardScan.details')}</h2>
            <StatusBadge status={inspection.status} />
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div><dt className="text-gray-500">{t('rewardScan.member')}</dt><dd className="font-semibold text-gray-900">{inspection.member_name}</dd></div>
            <div><dt className="text-gray-500">{t('rewardScan.product')}</dt><dd className="font-semibold text-gray-900">{inspection.product_name}</dd></div>
            <div><dt className="text-gray-500">{t('rewardScan.cost')}</dt><dd className="font-semibold text-gray-900">{inspection.cost} {t('home.points.unit')}</dd></div>
          </dl>
          {inspection.status === 'Menunggu' ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={confirmHandover} loading={busy} className="flex-1 min-w-40 min-h-11"><CheckCircle2 size={17} />{t('rewardScan.confirmAction')}</Button>
              {profile?.role === 'Super Admin' &&
                <Button variant="outline" className="min-h-11" onClick={cancelAndRefund} disabled={busy}>{t('rewardScan.cancelAction')}</Button>}
            </div>
          ) : <p className="text-sm text-gray-600">{t(inspection.status === 'Digunakan' ? 'rewardScan.alreadyUsed' : 'rewardScan.alreadyCancelled')}</p>}
          <Button variant="ghost" onClick={() => { setInspection(null); setManualCode(''); setError('') }}><RotateCcw size={16} />{t('rewardScan.next')}</Button>
        </Card>
      )}
    </div>
  )
}
