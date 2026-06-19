import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { Calendar, MapPin, Plus, Pencil, QrCode, Users, X, Download } from 'lucide-react'
import { eventsService } from '@/services/contentService'
import { eventAttendanceService } from '@/services/attendanceService'
import { Card, PageHeader, Button, Spinner, EmptyState, StatusBadge, Badge, Avatar } from '@/components/ui'
import { useLang } from '@/hooks/useLang'
import { formatDate } from '@/lib/utils'

export default function AdminEventsPage() {
  const { t } = useLang()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  const [qrModal, setQrModal] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState('')

  const [rekapModal, setRekapModal] = useState(null)
  const [rekap, setRekap] = useState([])
  const [rekapLoading, setRekapLoading] = useState(false)

  useEffect(() => {
    eventsService.getAll().then(setEvents).catch(() => {}).finally(() => setLoading(false))
  }, [])

  // Render QR absensi event.
  useEffect(() => {
    if (!qrModal) { setQrDataUrl(''); return }
    QRCode.toDataURL(`ESC-EVENT:${qrModal.event_id}`, { width: 320, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [qrModal])

  // Rekap: gabungkan pendaftar + status hadir.
  useEffect(() => {
    if (!rekapModal) return
    setRekapLoading(true)
    Promise.all([
      eventsService.getRegistrations(rekapModal.event_id),
      eventAttendanceService.getByEvent(rekapModal.event_id),
    ])
      .then(([regs, att]) => {
        const attended = new Set((att || []).map(a => a.user_id))
        setRekap((regs || []).map(r => ({
          user_id: r.user_id,
          name: r.users?.name || '-',
          role: r.users?.role || '',
          present: attended.has(r.user_id),
        })))
      })
      .catch(() => setRekap([]))
      .finally(() => setRekapLoading(false))
  }, [rekapModal])

  const presentCount = rekap.filter(r => r.present).length

  return (
    <div>
      <PageHeader
        title={t('aevt.title')}
        subtitle={t('aevt.subtitle', { count: events.length })}
        action={<Link to="/admin/events/baru"><Button size="sm"><Plus size={15} /> {t('aevt.add')}</Button></Link>}
      />

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && events.length === 0 && (
        <EmptyState icon={Calendar} title={t('aevt.empty')} description={t('aevt.emptyDesc')} />
      )}

      {!loading && events.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {events.map(ev => (
            <div key={ev.event_id} className="flex items-center gap-3 p-3.5">
              {ev.thumbnail_url ? (
                <img src={ev.thumbnail_url} alt={ev.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                  <Calendar size={20} className="text-red-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{ev.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(ev.event_date)}{ev.event_time ? ` · ${ev.event_time}` : ''}</p>
                {ev.location && (
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><MapPin size={11} /> {ev.location}</p>
                )}
              </div>
              <StatusBadge status={ev.status} />
              <button onClick={() => setRekapModal(ev)} title={t('aevt.rekap')} className="p-2 text-gray-400 hover:text-blue-500 shrink-0">
                <Users size={16} />
              </button>
              <button onClick={() => setQrModal(ev)} title={t('a.qrAttendance')} className="p-2 text-gray-400 hover:text-green-500 shrink-0">
                <QrCode size={16} />
              </button>
              <Link to={`/admin/events/${ev.event_id}/edit`} title={t('a.edit')} className="p-2 text-gray-400 hover:text-brand-500 shrink-0">
                <Pencil size={16} />
              </Link>
            </div>
          ))}
        </Card>
      )}

      {/* Modal QR Absensi Event */}
      {qrModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm p-5 space-y-4 text-center">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{t('aevt.qrTitle')}</h2>
              <button onClick={() => setQrModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-600">{qrModal.name}</p>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Absensi Event" className="w-full rounded-xl border border-gray-100" />
            ) : (
              <div className="flex justify-center py-10"><Spinner /></div>
            )}
            <p className="text-xs text-gray-400">{t('aevt.qrHint')}</p>
            {qrDataUrl && (
              <a href={qrDataUrl} download={`QR-Event-${qrModal.name}.png`}>
                <Button variant="outline" className="w-full"><Download size={15} /> {t('a.downloadQr')}</Button>
              </a>
            )}
          </Card>
        </div>
      )}

      {/* Modal Rekap Pendaftar */}
      {rekapModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-4 space-y-3 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{t('aevt.rekap')}</h2>
              <button onClick={() => setRekapModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-400">{rekapModal.name}</p>

            {!rekapLoading && rekap.length > 0 && (
              <div className="flex gap-2">
                <div className="flex-1 bg-gray-50 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-bold text-gray-900">{rekap.length}</p>
                  <p className="text-[11px] text-gray-400">{t('aevt.registered')}</p>
                </div>
                <div className="flex-1 bg-green-50 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-bold text-green-600">{presentCount}</p>
                  <p className="text-[11px] text-gray-400">{t('aevt.present')}</p>
                </div>
              </div>
            )}

            {rekapLoading && <div className="flex justify-center py-8"><Spinner /></div>}

            {!rekapLoading && rekap.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">{t('aevt.noRegistrants')}</p>
            )}

            {!rekapLoading && rekap.length > 0 && (
              <div className="divide-y divide-gray-100">
                {rekap.map(r => (
                  <div key={r.user_id} className="py-2.5 flex items-center gap-3">
                    <Avatar name={r.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                      <p className="text-xs text-gray-400">{r.role}</p>
                    </div>
                    {r.present
                      ? <Badge color="green">{t('aevt.present')}</Badge>
                      : <Badge color="gray">{t('aevt.notYet')}</Badge>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
