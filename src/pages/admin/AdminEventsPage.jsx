import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { Calendar, MapPin, Plus, Pencil, QrCode, Users, X, Download, FileSpreadsheet, Trash2 } from 'lucide-react'
import { eventsService, prerequisiteService } from '@/services/contentService'
import { eventAttendanceService } from '@/services/attendanceService'
import { pushService } from '@/services/pushService'
import { useToast } from '@/hooks/useToast'
import { Card, PageHeader, Button, Input, Textarea, Spinner, EmptyState, StatusBadge, Badge, Avatar, ActionMenu, ActionItem } from '@/components/ui'
import { useLang } from '@/hooks/useLang'
import { useBackClose } from '@/hooks/useBackClose'
import { formatDate } from '@/lib/utils'
import { downloadXlsx } from '@/lib/exportXlsx'

export default function AdminEventsPage() {
  const { t } = useLang()
  const { toast, confirm } = useToast()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  const [qrModal, setQrModal] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState('')

  const [rekapModal, setRekapModal] = useState(null)
  const [rekap, setRekap] = useState([])
  const [rekapLoading, setRekapLoading] = useState(false)
  const [rekapDate, setRekapDate] = useState('')
  const [submissions, setSubmissions] = useState([])
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectNote, setRejectNote] = useState('')
  const [prereqBusy, setPrereqBusy] = useState(null)
  useBackClose(!!qrModal || !!rekapModal, () => { setQrModal(null); setRekapModal(null) })

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

  // Rekap: gabungkan pendaftar + status hadir, opsional filter tanggal hadir.
  useEffect(() => {
    if (!rekapModal) return
    loadRekap()
    // Load submissions kalau event pakai prasyarat atau wajib verifikasi.
    if ((Array.isArray(rekapModal.prerequisite_fields) && rekapModal.prerequisite_fields.length > 0) || rekapModal.require_approval) {
      prerequisiteService.getForTarget('event', rekapModal.event_id)
        .then(setSubmissions).catch(() => setSubmissions([]))
    } else {
      setSubmissions([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rekapModal, rekapDate])

  function loadRekap() {
    setRekapLoading(true)
    Promise.all([
      eventsService.getRegistrations(rekapModal.event_id),
      eventAttendanceService.getByEvent(rekapModal.event_id, { date: rekapDate }),
    ])
      .then(([regs, att]) => {
        const attended = new Set((att || []).map(a => a.user_id))
        setRekap((regs || []).map(r => ({
          ticket_id: r.ticket_id,
          user_id: r.user_id,
          name: r.users?.name || '-',
          role: r.users?.role || '',
          phone: r.users?.phone || '',
          present: attended.has(r.user_id),
        })))
      })
      .catch(() => setRekap([]))
      .finally(() => setRekapLoading(false))
  }

  async function reloadSubmissions() {
    const list = await prerequisiteService.getForTarget('event', rekapModal.event_id).catch(() => [])
    setSubmissions(list)
  }

  async function handleRemoveRegistrant(r) {
    const ok = await confirm({
      title: 'Hapus peserta?', message: `Peserta "${r.name}" akan dihapus dari event ini.`,
      confirmText: 'Hapus', danger: true,
    })
    if (!ok) return
    try {
      await eventsService.removeRegistration(r.ticket_id)
      toast.success('Peserta dihapus.')
      loadRekap()
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus peserta.')
    }
  }

  async function handleApproveSubmission(s) {
    setPrereqBusy(s.id)
    try {
      await prerequisiteService.approve(s.id, { kind: 'event', targetId: rekapModal.event_id, userId: s.user_id })
      pushService.broadcast({
        title: 'Pendaftaran Event Disetujui',
        body: `Pendaftaran Anda untuk event "${rekapModal.name}" telah disetujui.`,
        url: `/events/${rekapModal.event_id}`,
        userIds: [s.user_id],
      }).catch(() => {})
      toast.success('Peserta disetujui.')
      await reloadSubmissions()
      loadRekap()
    } catch (err) {
      toast.error(err.message || 'Gagal menyetujui.')
    } finally {
      setPrereqBusy(null)
    }
  }

  async function handleRejectSubmission(s) {
    if (!rejectNote.trim()) { toast.error('Alasan penolakan wajib diisi.'); return }
    setPrereqBusy(s.id)
    try {
      await prerequisiteService.reject(s.id, rejectNote.trim())
      pushService.broadcast({
        title: 'Pendaftaran Event Ditolak', body: rejectNote.trim(),
        url: `/events/${rekapModal.event_id}`, userIds: [s.user_id],
      }).catch(() => {})
      toast.success('Peserta ditolak.')
      setRejectingId(null); setRejectNote('')
      await reloadSubmissions()
    } catch (err) {
      toast.error(err.message || 'Gagal menolak.')
    } finally {
      setPrereqBusy(null)
    }
  }

  async function handleRemoveSubmission(s) {
    const ok = await confirm({
      title: 'Hapus pengajuan?',
      message: 'Kalau sudah disetujui, pendaftaran peserta ini juga ikut terhapus.',
      confirmText: 'Hapus', danger: true,
    })
    if (!ok) return
    setPrereqBusy(s.id)
    try {
      await prerequisiteService.remove(s.id)
      toast.success('Pengajuan dihapus.')
      await reloadSubmissions()
      loadRekap()
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus.')
    } finally {
      setPrereqBusy(null)
    }
  }

  async function exportRekap() {
    await downloadXlsx({
      filename: `pendaftar-${rekapModal.name}.xlsx`,
      sheetName: 'Pendaftar',
      titleLines: ['ESC Siantan', `Pendaftar Event: ${rekapModal.name}`],
      headers: [t('aoff.exportColName'), t('aoff.exportColPhone'), 'Role', t('aevt.present')],
      rows: rekap.map(r => [r.name, r.phone, r.role, r.present ? t('aevt.present') : t('aevt.notYet')]),
    })
  }

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
              <ActionMenu>
                <ActionItem icon={Users} label={t('aevt.rekap')} onClick={() => { setRekapDate(''); setRekapModal(ev) }} />
                <ActionItem icon={QrCode} label={t('a.qrAttendance')} onClick={() => setQrModal(ev)} />
                <ActionItem icon={Pencil} label={t('a.edit')} onClick={(e) => { e.preventDefault(); window.location.href = `/admin/events/${ev.event_id}/edit` }} />
              </ActionMenu>
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
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-400">{rekapModal.name}</p>
              {rekap.length > 0 && (
                <button onClick={exportRekap} className="text-xs text-brand-500 flex items-center gap-1 shrink-0">
                  <FileSpreadsheet size={13} /> {t('a.exportExcel')}
                </button>
              )}
            </div>
            <Input type="date" value={rekapDate} onChange={e => setRekapDate(e.target.value)} />
            <p className="text-[11px] text-gray-400 -mt-2">{t('aevt.dateFilterHint')}</p>

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
                  <div key={r.ticket_id || r.user_id} className="py-2.5 flex items-center gap-3">
                    <Avatar name={r.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                      <p className="text-xs text-gray-400">{r.role}</p>
                    </div>
                    {r.present
                      ? <Badge color="green">{t('aevt.present')}</Badge>
                      : <Badge color="gray">{t('aevt.notYet')}</Badge>}
                    <button
                      type="button" onClick={() => handleRemoveRegistrant(r)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                      aria-label="Hapus peserta"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* MODE B: submissions prasyarat (kalau event pakai formulir prasyarat) */}
            {((Array.isArray(rekapModal.prerequisite_fields) && rekapModal.prerequisite_fields.length > 0) || rekapModal.require_approval) && (
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Pengajuan & Verifikasi</p>
                {submissions.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-3">Belum ada pengajuan.</p>
                ) : (
                  <div className="space-y-2">
                    {submissions.map(s => (
                      <div key={s.id} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{s.users?.name || '-'}</p>
                            <p className="text-[10px] text-gray-400">{formatDate(s.created_at, 'd MMM yyyy, HH:mm')}</p>
                          </div>
                          <StatusBadge status={s.status} />
                        </div>
                        <div className="space-y-1.5">
                          {(rekapModal.prerequisite_fields || []).map(f => {
                            const val = s.data_json?.[f.key]
                            const isFile = f.type === 'file' && typeof val === 'string' && /^https?:\/\//.test(val)
                            return (
                              <div key={f.key} className="text-xs">
                                <p className="text-gray-400">{f.label}</p>
                                {isFile ? (
                                  <a href={val} target="_blank" rel="noopener noreferrer" className="text-brand-500 underline break-all">Buka file</a>
                                ) : (
                                  <p className="text-gray-700 whitespace-pre-line break-words">{val || '-'}</p>
                                )}
                              </div>
                            )
                          })}
                          {s.admin_note && <p className="text-[10px] text-gray-500 italic pt-1">Catatan admin: {s.admin_note}</p>}
                        </div>
                        {rejectingId === s.id ? (
                          <div className="space-y-2">
                            <Textarea rows={2} placeholder="Alasan penolakan (dikirim ke jemaat)" value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
                            <div className="flex gap-2">
                              <Button size="sm" variant="ghost" className="flex-1" onClick={() => { setRejectingId(null); setRejectNote('') }}>Batal</Button>
                              <Button size="sm" variant="danger" className="flex-1" loading={prereqBusy === s.id} onClick={() => handleRejectSubmission(s)}>Kirim Tolak</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            {s.status === 'Menunggu' && (
                              <>
                                <Button size="sm" className="flex-1" loading={prereqBusy === s.id} onClick={() => handleApproveSubmission(s)}>Setujui</Button>
                                <Button size="sm" variant="outline" className="flex-1" onClick={() => { setRejectingId(s.id); setRejectNote('') }}>Tolak</Button>
                              </>
                            )}
                            <button
                              type="button" onClick={() => handleRemoveSubmission(s)}
                              disabled={prereqBusy === s.id}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50"
                              aria-label="Hapus pengajuan"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
