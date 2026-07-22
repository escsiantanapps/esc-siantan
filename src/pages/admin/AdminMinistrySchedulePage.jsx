import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import {
  CalendarClock, Download, FileSpreadsheet, Plus, Trash2, ArrowLeft, Users, AlertTriangle, Search,
} from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { ministryScheduleService } from '@/services/ministryScheduleService'
import { Card, PageHeader, Input, Button, Spinner, EmptyState, Badge, Avatar, Checkbox } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { downloadXlsx } from '@/lib/exportXlsx'

function todayISO() { return new Date().toISOString().slice(0, 10) }
function ymOf(date) { return date.slice(0, 7) }

// Absen Pelayanan Minggu (Admin) — kelola jadwal pelayanan Volunteer per tanggal
// & ministry, tugaskan volunteer, set jam mulai, tampilkan QR ESC-VOLUNTEER, dan
// pantau rekap kehadiran (tepat waktu / terlambat + badge "3x telat" per bulan).
export default function AdminMinistrySchedulePage() {
  const { toast, confirm } = useToast()
  const { profile } = useAuth()
  const { t } = useLang()

  const isGembala = profile?.role === 'Gembala'

  const [date, setDate] = useState(todayISO())
  const [schedules, setSchedules] = useState([]) // sesi pada tanggal ini
  const [loading, setLoading] = useState(true)

  // Form buka sesi baru.
  const [newLabel, setNewLabel] = useState('')
  const [newTime, setNewTime] = useState('09:00')
  const [creating, setCreating] = useState(false)

  // Panel detail satu sesi.
  const [selected, setSelected] = useState(null) // schedule object
  const [members, setMembers] = useState([]) // kandidat roster (peran pelayanan)
  const [memberQuery, setMemberQuery] = useState('')
  const [assigned, setAssigned] = useState([]) // user_id[]
  const [startTime, setStartTime] = useState('09:00')
  const [qr, setQr] = useState('')
  const [attendance, setAttendance] = useState([])
  const [lateCounts, setLateCounts] = useState({})
  const [savingAssign, setSavingAssign] = useState(false)
  const [panelLoading, setPanelLoading] = useState(false)

  function loadList() {
    setLoading(true)
    ministryScheduleService.listByDate(date).catch(() => [])
      .then(schs => setSchedules(schs || []))
      .finally(() => setLoading(false))
  }
  useEffect(loadList, [date])

  // Cari kandidat roster (debounce) saat panel sesi terbuka.
  useEffect(() => {
    if (!selected) return
    const id = setTimeout(() => {
      ministryScheduleService.listAssignableUsers(memberQuery).then(setMembers).catch(() => {})
    }, 250)
    return () => clearTimeout(id)
  }, [memberQuery, selected])

  async function handleCreate() {
    const label = newLabel.trim()
    if (!label) { toast.error(t('apel.labelRequired')); return }
    setCreating(true)
    try {
      const sched = await ministryScheduleService.create({
        label,
        serviceDate: date,
        startTime: newTime || '09:00',
        createdBy: profile.user_id,
      })
      toast.success(t('apel.created'))
      setNewLabel('')
      loadList()
      openSchedule(sched)
    } catch (err) {
      toast.error(err.message || t('apel.createFailed'))
    } finally {
      setCreating(false)
    }
  }

  async function openSchedule(sched) {
    setSelected(sched)
    setPanelLoading(true)
    setStartTime((sched.start_time || '09:00').slice(0, 5))
    try {
      const [mem, asg, att, late, qrUrl] = await Promise.all([
        ministryScheduleService.listAssignableUsers('').catch(() => []),
        ministryScheduleService.getAssignments(sched.schedule_id).catch(() => []),
        ministryScheduleService.getAttendance(sched.schedule_id).catch(() => []),
        ministryScheduleService.getMonthlyLateCounts(ymOf(sched.service_date)).catch(() => ({})),
        QRCode.toDataURL(`ESC-VOLUNTEER:${sched.schedule_id}`, { width: 320, margin: 1 }).catch(() => ''),
      ])
      setMembers(mem); setAssigned(asg); setAttendance(att); setLateCounts(late); setQr(qrUrl)
    } finally {
      setPanelLoading(false)
    }
  }

  function closePanel() {
    setSelected(null)
    setMembers([]); setAssigned([]); setAttendance([]); setQr(''); setLateCounts({}); setMemberQuery('')
    loadList()
  }

  function toggleAssign(userId) {
    setAssigned(p => p.includes(userId) ? p.filter(u => u !== userId) : [...p, userId])
  }

  async function handleSavePanel() {
    if (!selected) return
    setSavingAssign(true)
    try {
      await ministryScheduleService.updateStartTime(selected.schedule_id, startTime)
      await ministryScheduleService.setAssignments(selected.schedule_id, assigned)
      toast.success(t('apel.saved'))
      // Muat ulang rekap (status telat bisa berubah bila jam mulai diubah untuk
      // kehadiran berikutnya — kehadiran lama tetap seperti saat scan).
      const att = await ministryScheduleService.getAttendance(selected.schedule_id).catch(() => [])
      setAttendance(att)
    } catch (err) {
      toast.error(err.message || t('apel.saveFailed'))
    } finally {
      setSavingAssign(false)
    }
  }

  async function handleDelete(sched) {
    const ok = await confirm({
      title: t('apel.deleteTitle'),
      message: t('apel.deleteMsg'),
      confirmText: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await ministryScheduleService.remove(sched.schedule_id)
      toast.success(t('apel.deleted'))
      if (selected?.schedule_id === sched.schedule_id) closePanel()
      else loadList()
    } catch (err) {
      toast.error(err.message || t('apel.deleteFailed'))
    }
  }

  async function exportXlsx() {
    if (attendance.length === 0) { toast.info(t('apel.exportEmpty')); return }
    await downloadXlsx({
      filename: `pelayanan-${selected.label || ''}-${selected.service_date}.xlsx`,
      sheetName: 'Absen Pelayanan',
      titleLines: ['ESC Siantan', 'Absen Pelayanan Minggu', `${selected.label || ''} — ${formatDate(selected.service_date)}`],
      headers: ['Nama', 'No. HP', 'Waktu Scan', 'Status'],
      rows: attendance.map(r => [
        r.users?.name || '-',
        r.users?.phone || '',
        formatDate(r.scanned_at, 'HH:mm'),
        r.status,
      ]),
    })
  }

  // ── Panel detail satu jadwal ──
  if (selected) {
    const isToday = selected.service_date === todayISO()
    return (
      <div className="max-w-2xl">
        <button onClick={closePanel} className="flex items-center gap-1 text-sm text-gray-500 mb-4">
          <ArrowLeft size={16} /> {t('common.back')}
        </button>

        <Card className="p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-semibold text-gray-900">{selected.label || '-'}</p>
              <p className="text-xs text-gray-400">{formatDate(selected.service_date)}</p>
            </div>
            <button onClick={() => handleDelete(selected)} className="p-2 text-gray-400 hover:text-red-500">
              <Trash2 size={16} />
            </button>
          </div>
          <div className="max-w-[180px] mt-3">
            <Input label={t('apel.startTime')} type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">{t('apel.graceNote')}</p>
        </Card>

        {panelLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <>
            {/* Penugasan volunteer */}
            <Card className="p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Users size={16} className="text-brand-500" />
                <p className="text-sm font-semibold text-gray-900">{t('apel.assignTitle')} ({assigned.length})</p>
              </div>
              <div className="mb-2.5">
                <Input
                  icon={Search}
                  placeholder={t('apel.searchAssignee')}
                  value={memberQuery}
                  onChange={e => setMemberQuery(e.target.value)}
                />
              </div>
              {members.length === 0 ? (
                <p className="text-sm text-gray-400">{t('apel.noMembers')}</p>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {members.map(m => (
                    <div
                      key={m.user_id}
                      onClick={() => toggleAssign(m.user_id)}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <span className="pointer-events-none">
                        <Checkbox checked={assigned.includes(m.user_id)} readOnly />
                      </span>
                      <Avatar name={m.name} src={m.photo_url} size="sm" />
                      <span className="text-sm text-gray-800 truncate flex-1">{m.name}</span>
                    </div>
                  ))}
                </div>
              )}
              <Button className="w-full mt-3" loading={savingAssign} onClick={handleSavePanel}>{t('apel.saveBtn')}</Button>
            </Card>

            {/* QR */}
            <Card className="p-4 mb-4 text-center">
              {qr ? <img src={qr} alt="QR Pelayanan" className="w-56 mx-auto rounded-xl border border-gray-100" /> : <Spinner />}
              <p className="text-xs text-gray-400 mt-3 max-w-sm mx-auto">{t('apel.qrHint')}</p>
              {!isToday && (
                <p className="text-[11px] text-amber-600 mt-1.5">{t('apel.qrDateNote')}</p>
              )}
              {qr && (
                <a href={qr} download={`QR-Pelayanan-${selected.service_date}.png`} className="inline-flex items-center gap-1.5 text-sm text-brand-500 font-medium mt-2">
                  <Download size={15} /> {t('apel.downloadQr')}
                </a>
              )}
            </Card>

            {/* Rekap kehadiran */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-900">{t('apel.recapTitle')} ({attendance.length})</p>
              {attendance.length > 0 && (
                <button onClick={exportXlsx} className="text-xs text-brand-500 flex items-center gap-1">
                  <FileSpreadsheet size={13} /> {t('apel.export')}
                </button>
              )}
            </div>
            {attendance.length === 0 ? (
              <EmptyState icon={CalendarClock} title={t('apel.recapEmpty')} description={t('apel.recapEmptyDesc')} />
            ) : (
              <Card className="divide-y divide-gray-100">
                {attendance.map(r => {
                  const late3 = (lateCounts[r.user_id] || 0) >= 3
                  return (
                    <div key={r.attendance_id} className="flex items-center gap-3 p-3.5">
                      <Avatar name={r.users?.name} src={r.users?.photo_url} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-900 truncate">{r.users?.name || '-'}</p>
                          {late3 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-1 py-0.5 shrink-0">
                              <AlertTriangle size={10} /> {t('apel.late3')}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 flex items-center gap-1">
                          {formatDate(r.scanned_at, 'HH:mm')}
                        </p>
                      </div>
                      <Badge color={r.status === 'Terlambat' ? 'red' : 'green'}>{r.status}</Badge>
                    </div>
                  )
                })}
              </Card>
            )}
          </>
        )}
      </div>
    )
  }

  // ── Daftar: pilih tanggal → buka sesi berlabel & kelola ──
  return (
    <div className="max-w-2xl">
      <PageHeader title={t('apel.title')} subtitle={t('apel.subtitle')} />

      <Card className="p-4 mb-4">
        <div className="max-w-xs mb-4">
          <Input label={t('apel.date')} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        {/* Buka sesi baru: label bebas (mis. "Minggu 1") + jam mulai. */}
        {!isGembala && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input label={t('apel.labelField')} placeholder={t('apel.labelPlaceholder')} value={newLabel} onChange={e => setNewLabel(e.target.value)} />
            </div>
            <div className="w-28">
              <Input label={t('apel.startTime')} type="time" value={newTime} onChange={e => setNewTime(e.target.value)} />
            </div>
            <Button loading={creating} onClick={handleCreate}><Plus size={15} /> {t('apel.openSession')}</Button>
          </div>
        )}
      </Card>

      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : schedules.length === 0 ? (
        <EmptyState icon={CalendarClock} title={t('apel.noSessions')} description={t('apel.noSessionsDesc')} />
      ) : (
        <Card className="divide-y divide-gray-100">
          {schedules.map(sched => (
            <div key={sched.schedule_id} className="flex items-center gap-3 p-3.5">
              <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                <CalendarClock size={16} className="text-brand-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{sched.label || '-'}</p>
                <p className="text-[11px] text-gray-400">{t('apel.startAt', { time: (sched.start_time || '').slice(0, 5) })}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => openSchedule(sched)}>{t('apel.open')}</Button>
              {!isGembala && (
                <button onClick={() => handleDelete(sched)} className="p-2 text-gray-400 hover:text-red-500">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
