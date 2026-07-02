import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Church, Download, FileSpreadsheet } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { pointsService } from '@/services/pointsService'
import { Card, PageHeader, Input, Spinner, EmptyState, Badge } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { downloadXlsx } from '@/lib/exportXlsx'

function todayISO() { return new Date().toISOString().slice(0, 10) }

export default function AdminSundayPage() {
  const { toast } = useToast()
  const [date, setDate] = useState(todayISO())
  const [qr, setQr] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  // QR berisi tanggal terpilih. Jemaat scan → kehadiran ibadah tanggal itu.
  // Catatan: RLS hanya mengizinkan insert utk current_date (anti-backdate).
  useEffect(() => {
    QRCode.toDataURL(`ESC-SUNDAY:${date}`, { width: 320, margin: 1 }).then(setQr).catch(() => setQr(''))
  }, [date])

  useEffect(() => {
    setLoading(true)
    pointsService.getSundayAttendance(date).then(setRows).catch(() => setRows([])).finally(() => setLoading(false))
  }, [date])

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

  const isToday = date === todayISO()

  return (
    <div>
      <PageHeader title="Ibadah Minggu" subtitle="QR kehadiran & rekap jemaat hadir" />

      <Card className="p-4 mb-4">
        <div className="max-w-xs mb-4">
          <Input label="Tanggal" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        {isToday ? (
          <div className="flex flex-col items-center text-center gap-3">
            {qr ? <img src={qr} alt="QR Ibadah" className="w-56 rounded-xl border border-gray-100" /> : <Spinner />}
            <p className="text-xs text-gray-400 max-w-xs">
              Tampilkan/cetak QR ini di pintu masuk. Jemaat memindainya lewat menu Scan untuk mencatat kehadiran &amp; mendapat 1 poin.
            </p>
            {qr && (
              <a href={qr} download={`QR-Ibadah-${date}.png`} className="inline-flex items-center gap-1.5 text-sm text-brand-500 font-medium">
                <Download size={15} /> Unduh QR
              </a>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-2">
            QR hanya bisa dibuat untuk tanggal hari ini (anti-backdate). Pilih tanggal hari ini untuk menampilkan QR.
          </p>
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
