import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import {
  CalendarClock, CalendarRange, ClipboardCheck, Download, FileSpreadsheet, Plus, Trash2, ArrowLeft, Users, UserCheck,
  UserX, AlertTriangle, Search, Clock3, RefreshCw,
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
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const [schedules, setSchedules] = useState([]) // sesi pada tanggal ini
  const [loading, setLoading] = useState(true)
  const [dateRecap, setDateRecap] = useState(null)
  const [recapLoading, setRecapLoading] = useState(true)
  const [recapError, setRecapError] = useState(false)
  const [monthlyRecap, setMonthlyRecap] = useState(null)
  const [monthlyLoading, setMonthlyLoading] = useState(true)
  const [monthlyError, setMonthlyError] = useState(false)

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
  async function loadDateRecap() {
    setRecapLoading(true)
    setRecapError(false)
    try {
      setDateRecap(await ministryScheduleService.getDateRecap(date))
    } catch {
      setDateRecap(null)
      setRecapError(true)
    } finally {
      setRecapLoading(false)
    }
  }
  useEffect(() => { loadDateRecap() }, [date])


  async function loadMonthlyRecap() {
    setMonthlyLoading(true)
    setMonthlyError(false)
    try {
      setMonthlyRecap(await ministryScheduleService.getMonthlyRecap(month))
    } catch {
      setMonthlyRecap(null)
      setMonthlyError(true)
    } finally {
      setMonthlyLoading(false)
    }
  }
  useEffect(() => { loadMonthlyRecap() }, [month])

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
      await Promise.all([loadDateRecap(), loadMonthlyRecap()])
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
    loadDateRecap()
    loadMonthlyRecap()
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
      else { loadList(); loadDateRecap(); loadMonthlyRecap() }
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

  async function exportDateRecap() {
    if (!dateRecap || dateRecap.rows.length === 0) { toast.info(t('apel.dateExportEmpty')); return }
    await downloadXlsx({
      filename: `rekap-pelayanan-${date}.xlsx`,
      sheetName: 'Rekap Pelayanan',
      titleLines: ['ESC Siantan', t('apel.dateExportTitle'), formatDate(date)],
      headers: [t('apel.exportName'), t('apel.exportSession'), t('apel.exportStartTime'), t('apel.exportScanTime'), t('apel.exportStatus')],
      rows: dateRecap.rows.map(row => [
        row.user?.name || '-',
        row.schedule?.label || '-',
        (row.schedule?.start_time || '').slice(0, 5),
        row.attendance ? formatDate(row.attendance.scanned_at, 'HH:mm') : '-',
        row.attendance?.status || t('apel.notYetStatus'),
      ]),
    })
  }

  async function exportMonthlyRecap() {
    if (!monthlyRecap || monthlyRecap.rows.length === 0) { toast.info(t('apel.monthlyExportEmpty')); return }
    await downloadXlsx({
      filename: `rekap-pelayanan-${month}.xlsx`,
      sheetName: 'Rekap Bulanan',
      titleLines: ['ESC Siantan', t('apel.monthlyExportTitle'), formatDate(`${month}-01`, 'MMMM yyyy')],
      headers: [t('apel.exportDate'), t('apel.exportName'), t('apel.exportSession'), t('apel.exportStartTime'), t('apel.exportScanTime'), t('apel.exportStatus')],
      rows: monthlyRecap.rows.map(row => [
        formatDate(row.schedule?.service_date),
        row.user?.name || '-',
        row.schedule?.label || '-',
        (row.schedule?.start_time || '').slice(0, 5),
        row.attendance ? formatDate(row.attendance.scanned_at, 'HH:mm') : '-',
        row.attendance?.status || t('apel.notYetStatus'),
      ]),
    })
  }

  function renderMonthlyRecap() {
    const stats = monthlyRecap?.stats || { sessions: 0, assigned: 0, attended: 0, onTime: 0, late: 0, notYet: 0 }
    const lateLeaders = monthlyRecap?.lateLeaders || []
    return (
      <Card className="p-4">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-500 flex items-center justify-center shrink-0">
              <CalendarRange size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{t('apel.monthRecapTitle')}</p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{formatDate(`${month}-01`, 'MMMM yyyy')}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              aria-label={t('apel.refreshMonthlyRecap')}
              title={t('apel.refreshMonthlyRecap')}
              onClick={loadMonthlyRecap}
              className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-gray-500 hover:bg-control hover:text-gray-800 transition-colors cursor-pointer"
            >
              <RefreshCw size={15} className={monthlyLoading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              aria-label={t('apel.exportMonthlyRecap')}
              title={t('apel.exportMonthlyRecap')}
              onClick={exportMonthlyRecap}
              className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-gray-500 hover:bg-control hover:text-gray-800 transition-colors cursor-pointer"
            >
              <FileSpreadsheet size={15} />
            </button>
          </div>
        </div>

        <div className="mb-4">
          <Input label={t('apel.month')} type="month" value={month} onChange={e => setMonth(e.target.value)} />
        </div>

        {monthlyLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : monthlyError ? (
          <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-700">
            {t('apel.monthlyLoadFailed')}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="rounded-xl bg-control p-3">
                <p className="text-[11px] text-gray-500">{t('apel.monthlySessions')}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{stats.sessions}</p>
              </div>
              <div className="rounded-xl bg-control p-3">
                <p className="text-[11px] text-gray-500">{t('apel.monthlyAssigned')}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{stats.assigned}</p>
              </div>
              <div className="rounded-xl bg-blue-50 p-3">
                <p className="text-[11px] text-blue-700">{t('apel.monthlyAttended')}</p>
                <p className="text-xl font-bold text-blue-800 mt-1">{stats.attended}</p>
              </div>
              <div className="rounded-xl bg-green-50 p-3">
                <p className="text-[11px] text-green-700">{t('apel.monthlyOnTime')}</p>
                <p className="text-xl font-bold text-green-800 mt-1">{stats.onTime}</p>
              </div>
              <div className="rounded-xl bg-red-50 p-3">
                <p className="text-[11px] text-red-700">{t('apel.monthlyLate')}</p>
                <p className="text-xl font-bold text-red-800 mt-1">{stats.late}</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-[11px] text-amber-700">{t('apel.monthlyNotYet')}</p>
                <p className="text-xl font-bold text-amber-800 mt-1">{stats.notYet}</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <AlertTriangle size={15} className="text-red-500" /> {t('apel.monthlyLateListTitle')}
              </p>
              <Badge color={lateLeaders.length > 0 ? 'red' : 'green'}>{lateLeaders.length}</Badge>
            </div>
            {lateLeaders.length === 0 ? (
              <div className="rounded-xl bg-green-50 border border-green-100 p-3 text-sm text-green-800">
                {t('apel.monthlyLateEmpty')}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {lateLeaders.map(row => (
                  <div key={row.user_id} className="flex items-center gap-2.5 rounded-xl p-2 hover:bg-control transition-colors">
                    <Avatar name={row.user?.name} src={row.user?.photo_url} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{row.user?.name || '-'}</p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {t('apel.monthlyLateCount', { n: row.lateCount })} · {t('apel.monthlyAttendanceCount', { attended: row.attendedCount, assigned: row.assignedCount })}
                      </p>
                    </div>
                    <Badge color="red">{row.lateCount}</Badge>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>
    )
  }
  function renderDateRecap() {
    const stats = dateRecap?.stats || { sessions: 0, assigned: 0, attended: 0, onTime: 0, late: 0, notYet: 0 }
    const lateRows = dateRecap?.lateRows || []
    const notYetRows = dateRecap?.notYetRows || []
    return (
      <Card className="p-4 xl:sticky xl:top-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-500 flex items-center justify-center shrink-0">
              <ClipboardCheck size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{t('apel.dateRecapTitle')}</p>
              <p className="text-xs text-gray-500 mt-0.5">{formatDate(date)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t('apel.refreshRecap')}
              title={t('apel.refreshRecap')}
              onClick={loadDateRecap}
              className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-gray-500 hover:bg-control hover:text-gray-800 transition-colors cursor-pointer"
            >
              <RefreshCw size={15} className={recapLoading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              aria-label={t('apel.exportDateRecap')}
              title={t('apel.exportDateRecap')}
              onClick={exportDateRecap}
              className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-gray-500 hover:bg-control hover:text-gray-800 transition-colors cursor-pointer"
            >
              <FileSpreadsheet size={15} />
            </button>
          </div>
        </div>

        {recapLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : recapError ? (
          <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-700">
            {t('apel.recapLoadFailed')}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="rounded-xl bg-control p-3">
                <p className="text-[11px] text-gray-500">{t('apel.recapSessions')}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{stats.sessions}</p>
              </div>
              <div className="rounded-xl bg-control p-3">
                <p className="text-[11px] text-gray-500">{t('apel.recapAssigned')}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{stats.assigned}</p>
              </div>
              <div className="rounded-xl bg-green-50 p-3">
                <p className="text-[11px] text-green-700">{t('apel.recapOnTime')}</p>
                <p className="text-xl font-bold text-green-800 mt-1">{stats.onTime}</p>
              </div>
              <div className="rounded-xl bg-red-50 p-3">
                <p className="text-[11px] text-red-700">{t('apel.recapLate')}</p>
                <p className="text-xl font-bold text-red-800 mt-1">{stats.late}</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <Clock3 size={15} className="text-red-500" /> {t('apel.lateListTitle')}
              </p>
              <Badge color={stats.late > 0 ? 'red' : 'green'}>{stats.late}</Badge>
            </div>
            {lateRows.length === 0 ? (
              <div className="rounded-xl bg-green-50 border border-green-100 p-3 text-sm text-green-800">
                {t('apel.lateListEmpty')}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {lateRows.map(row => (
                  <div key={row.attendance_id} className="flex items-center gap-2.5 rounded-xl p-2 hover:bg-control transition-colors">
                    <Avatar name={row.user?.name} src={row.user?.photo_url} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{row.user?.name || '-'}</p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {row.schedule?.label || '-'} · {formatDate(row.attendance?.scanned_at, 'HH:mm')}
                      </p>
                    </div>
                    <Badge color="red">{t('apel.lateStatus')}</Badge>
                  </div>
                ))}
              </div>
            )}

            {notYetRows.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-2">
                  <UserX size={15} className="text-amber-500" /> {t('apel.notYetTitle')}
                  <Badge color="amber" className="ml-auto">{notYetRows.length}</Badge>
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {notYetRows.map(row => (
                    <div key={`${row.schedule_id}:${row.user_id}`} className="flex items-center gap-2.5 p-2">
                      <Avatar name={row.user?.name} src={row.user?.photo_url} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-800 truncate">{row.user?.name || '-'}</p>
                        <p className="text-[11px] text-gray-500 truncate">{row.schedule?.label || '-'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.assigned > 0 && stats.notYet === 0 && (
              <p className="mt-4 pt-4 border-t border-gray-100 text-xs text-green-700 flex items-center gap-1.5">
                <UserCheck size={14} /> {t('apel.allAssignedPresent')}
              </p>
            )}
          </>
        )}
      </Card>
    )
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
    <div className="max-w-[1400px]">
      <PageHeader title={t('apel.title')} subtitle={t('apel.subtitle')} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div>
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
                    <button aria-label={t('common.delete')} onClick={() => handleDelete(sched)} className="p-2 text-gray-400 hover:text-red-500 cursor-pointer">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {renderMonthlyRecap()}
          {renderDateRecap()}
        </div>
      </div>
    </div>
  )
}
