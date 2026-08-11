import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Church, Download, FileSpreadsheet, Play, Pause, Square } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'
import { pointsService } from '@/services/pointsService'
import { Card, PageHeader, Input, Spinner, EmptyState, Badge, Button } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { downloadXlsx } from '@/lib/exportXlsx'

function todayISO() { return new Date().toISOString().slice(0, 10) }

export default function AdminSundayPage() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const isGembala = profile?.role === 'Gembala'
  const [date, setDate] = useState(todayISO())
  const [session, setSession] = useState(null)   // sesi aktif untuk tanggal terpilih (bila ada)
  const [qr, setQr] = useState('')
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  // Muat sesi ibadah aktif untuk tanggal terpilih. QR ibadah = token sesi acak
  // dengan jendela waktu (anti-curang v63) + pause/resume (v70) — QR tetap
  // konsisten saat di-pause untuk mencegah jemaat absen sebelum jam ibadah tiba.
  useEffect(() => {
    pointsService.getActiveSundaySession(date).then(setSession).catch(() => setSession(null))
  }, [date])

  // Render QR dari session_id sesi aktif.
  useEffect(() => {
    if (!session) { setQr(''); return }
    QRCode.toDataURL(`ESC-SUNDAY:${session.session_id}`, {
      width: 512,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#111827', light: '#FFFFFF' },
    })
      .then(setQr).catch(() => setQr(''))
  }, [session])

  useEffect(() => {
    setLoading(true)
    pointsService.getSundayAttendance(date).then(setRows).catch(() => setRows([])).finally(() => setLoading(false))
  }, [date])

  async function openSession() {
    setBusy(true)
    try {
      const s = await pointsService.openSundaySession(profile.user_id, date)
      setSession(s)
      toast.success('Sesi ibadah dibuka. Tampilkan QR di pintu masuk.')
    } catch (err) {
      toast.error(err.message || 'Gagal membuka sesi ibadah.')
    } finally { setBusy(false) }
  }

  async function pauseSession() {
    if (!session) return
    setBusy(true)
    try {
      const s = await pointsService.pauseSundaySession(session.session_id)
      setSession(s)
      toast.info('Sesi dijeda. Jemaat tidak bisa scan QR hingga di-resume.')
    } catch (err) {
      toast.error(err.message || 'Gagal menjeda sesi.')
    } finally { setBusy(false) }
  }

  async function resumeSession() {
    if (!session) return
    setBusy(true)
    try {
      const s = await pointsService.resumeSundaySession(session.session_id)
      setSession(s)
      toast.success('Sesi dilanjutkan. Jemaat bisa scan QR kembali.')
    } catch (err) {
      toast.error(err.message || 'Gagal melanjutkan sesi.')
    } finally { setBusy(false) }
  }

  async function closeSession() {
    if (!session) return
    setBusy(true)
    try {
      await pointsService.closeSundaySession(session.session_id)
      setSession(null)
      toast.info('Sesi ibadah ditutup permanen. QR tidak berlaku lagi.')
    } catch (err) {
      toast.error(err.message || 'Gagal menutup sesi.')
    } finally { setBusy(false) }
  }

  async function exportXlsx() {
    if (rows.length === 0) { toast.info('Belum ada kehadiran untuk diekspor.'); return }
    await downloadXlsx({
      filename: `ibadah-minggu-${date}.xlsx`,
      sheetName: 'Kehadiran Ibadah',
      titleLines: ['ESC Siantan', 'Kehadiran Ibadah Minggu', `Tanggal: ${formatDate(date)}`],
      headers: ['Nama', 'No. HP', 'Waktu Scan'],
      rows: rows.map(r => [r.users?.name || '-', r.users?.phone || '', formatDate(r.scanned_at, 'HH:mm')]),
    })
  }

  return (
    <div>
      <PageHeader title="Ibadah Minggu" subtitle="QR kehadiran & rekap jemaat hadir" />

      <Card className="p-4 mb-4">
        <div className="max-w-xs mb-4">
          <Input label="Tanggal" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>

        {!session ? (
          <div className="flex flex-col items-center text-center gap-3 py-2">
            <p className="text-sm text-gray-500 max-w-xs">
              Buka sesi saat ibadah dimulai. QR otomatis dibuat &amp; berlaku
              sepanjang hari (bisa di-pause untuk mencegah scan sebelum ibadah tiba,
              atau ditutup permanen). Jemaat memindainya lewat menu Scan untuk
              mencatat kehadiran &amp; mendapat 1 poin.
            </p>
            {!isGembala && (
              <Button onClick={openSession} disabled={busy}>
                {busy ? <Spinner size="sm" /> : <Play size={15} />} Buka Sesi Ibadah
              </Button>
            )}
            {isGembala && <p className="text-xs text-gray-400 italic">Gembala hanya bisa memantau kehadiran.</p>}
          </div>
        ) : (
          <div className="flex flex-col items-center text-center gap-3">
            {qr ? <img src={qr} alt="QR Ibadah" className="w-64 max-w-full rounded-xl border border-gray-100 [image-rendering:pixelated]" /> : <Spinner />}
            <Badge color={session.is_paused ? 'yellow' : 'green'}>
              {session.is_paused ? 'Sesi dijeda — scan ditolak' : 'Sesi aktif — jemaat bisa scan'}
            </Badge>
            <p className="text-xs text-gray-400 max-w-xs">
              {session.is_paused
                ? 'QR tidak berubah saat dijeda. Klik Resume untuk melanjutkan sesi.'
                : 'Tampilkan/cetak QR ini di pintu masuk. QR ini acak & hanya berlaku selama sesi — jangan sebar fotonya di grup.'}
            </p>
            <div className="flex items-center gap-3 flex-wrap justify-center">
              {qr && (
                <a href={qr} download={`QR-Ibadah-${date}.png`} className="inline-flex items-center gap-1.5 text-sm text-brand-500 font-medium">
                  <Download size={15} /> Unduh QR
                </a>
              )}
              {!isGembala && (session.is_paused ? (
                <Button onClick={resumeSession} disabled={busy}>
                  {busy ? <Spinner size="sm" /> : <Play size={14} />} Resume Sesi
                </Button>
              ) : (
                <Button variant="secondary" onClick={pauseSession} disabled={busy}>
                  {busy ? <Spinner size="sm" /> : <Pause size={14} />} Pause Sesi
                </Button>
              ))}
              {!isGembala && (
                <Button variant="secondary" onClick={closeSession} disabled={busy}>
                  <Square size={14} /> Tutup Permanen
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-gray-900">Hadir ({rows.length})</p>
        {rows.length > 0 && (
          <button onClick={exportXlsx} className="text-xs text-brand-500 flex items-center gap-1">
            <FileSpreadsheet size={13} /> Export Excel
          </button>
        )}
      </div>

      {loading && <div className="flex justify-center py-8"><Spinner /></div>}
      {!loading && rows.length === 0 && (
        <EmptyState icon={Church} title="Belum ada kehadiran" description="Kehadiran jemaat pada tanggal ini akan muncul di sini." />
      )}
      {!loading && rows.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {rows.map(r => (
            <div key={r.attendance_id} className="flex items-center justify-between gap-2 p-3.5">
              <p className="text-sm font-medium text-gray-900 truncate">{r.users?.name || '-'}</p>
              <Badge color="green">{formatDate(r.scanned_at, 'HH:mm')}</Badge>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
