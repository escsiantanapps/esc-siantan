import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BellRing, CalendarDays, ChevronLeft, ChevronRight, Copy, Pencil, Plus, Printer, RefreshCw, Save, Search, Send, Trash2, X } from 'lucide-react'
import { useLang } from '@/hooks/useLang'
import { useToast } from '@/hooks/useToast'
import { Badge, Button, Checkbox, EmptyState, Input, Select, Spinner, Textarea } from '@/components/ui'
import MonthlyScheduleMatrix from '@/components/serviceSchedule/MonthlyScheduleMatrix'
import ScheduleOwnedFields from '@/components/serviceSchedule/ScheduleOwnedFields'
import ScheduleAccessPositions from '@/components/serviceSchedule/ScheduleAccessPositions'
import { buildScheduleMatrix, formatScheduleDate, formatScheduleMonth, getMonthDates, printMonthlySchedule, shiftScheduleMonth } from '@/lib/serviceScheduleMatrix'
import { defaultMonthCopyDateMap, validateMonthCopyDateMap } from '@/lib/monthlyScheduleCopy'
import './monthlyScheduleWorkspace.css'

const currentMonth = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
const newEntry = serviceDate => ({ section_id: `SEC-${crypto.randomUUID()}`, service_date: serviceDate,
  title: '', source_type: 'Ibadah', event_id: null, class_id: null, class_session_no: null,
  start_time: '', end_time: '', location: '', dress_code: '', pic: '', notes: '', ministry_ids: [] })
const monthDraftKey = (userId, month) => 'esc:monthly-schedule-form:v1:' + userId + ':' + month
function readMonthDraft(userId, month, sundays) {
  const initial = { dates: sundays, selectedDate: sundays[0] || '', entries: sundays[0] ? [newEntry(sundays[0])] : [] }
  if (!userId || typeof window === 'undefined') return initial
  try {
    const saved = JSON.parse(window.localStorage.getItem(monthDraftKey(userId, month)))
    if (!saved || !Array.isArray(saved.dates) || !Array.isArray(saved.entries)) return initial
    const dates = [...new Set(saved.dates.filter(date => typeof date === 'string' && date.startsWith(month + '-') && /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort()
    if (!dates.length) return initial
    const entries = saved.entries.filter(item => item && dates.includes(item.service_date) && typeof item.section_id === 'string')
      .map(item => ({ ...newEntry(item.service_date), ...item, ministry_ids: Array.isArray(item.ministry_ids) ? item.ministry_ids : [] }))
    return { dates, selectedDate: dates.includes(saved.selectedDate) ? saved.selectedDate : dates[0], entries }
  } catch { return initial }
}
function readSavedMonthDraft(schedule) {
  const ministriesByOccurrence = new Map()
  for (const part of schedule.parts || []) {
    const selected = ministriesByOccurrence.get(part.occurrence_id) || []
    if (!selected.includes(part.ministry_id)) selected.push(part.ministry_id)
    ministriesByOccurrence.set(part.occurrence_id, selected)
  }
  const entries = (schedule.occurrences || []).map(item => ({
    occurrence_id: item.occurrence_id, section_id: item.section_id,
    service_date: item.service_date, title: item.title || '', source_type: item.source_type || 'Ibadah',
    event_id: item.event_id || null, class_id: item.class_id || null,
    class_session_no: item.class_session_no || null,
    start_time: String(item.start_time || '').slice(0, 5),
    end_time: String(item.end_time || '').slice(0, 5),
    location: item.location || '', dress_code: item.dress_code || '',
    pic: item.pic || '', notes: item.notes || '',
    ministry_ids: ministriesByOccurrence.get(item.occurrence_id) || [],
  }))
  const dates = [...new Set(entries.map(item => item.service_date))].sort()
  return { dates, selectedDate: dates[0] || '', entries }
}
function assignedDraftParts(schedule) {
  const rostersById = new Map((schedule?.rosters || []).map(item => [item.roster_id, item]))
  return new Set((schedule?.parts || [])
    .filter(part => rostersById.get(part.roster_id)?.service_roster_slots?.some(slot => slot.user_id))
    .map(part => `${part.occurrence_id}:${part.ministry_id}`))
}
function removedDraftAssignments(schedule, entries) {
  if (!schedule) return []
  const selectedByOccurrence = new Map(entries.filter(item => item.occurrence_id)
    .map(item => [item.occurrence_id, new Set(item.ministry_ids)]))
  const rostersById = new Map((schedule.rosters || []).map(item => [item.roster_id, item]))
  return (schedule.parts || []).flatMap(part => {
    if (selectedByOccurrence.get(part.occurrence_id)?.has(part.ministry_id)) return []
    const roster = rostersById.get(part.roster_id)
    return (roster?.service_roster_slots || []).filter(slot => slot.user_id)
      .map(slot => ({ slot_id: slot.slot_id, user_id: slot.user_id }))
  }).sort((a, b) => a.slot_id.localeCompare(b.slot_id))
}
const timeLabel = item => `${String(item.start_time || '').slice(0, 5)} - ${String(item.end_time || '').slice(0, 5)}`
const statusColor = value => value === 'Terbit' ? 'green' : value === 'Dibatalkan' ? 'red' : 'amber'
const errorKey = error => {
  const text = String(error?.message || '')
  if (error?.code === 'PGRST202' && text.includes('update_service_schedule_month_draft_v124')) return 'schedMonth.editDraftMigrationRequired'
  if (error?.code === 'PGRST202' && text.includes('_v125')) return 'schedMonth.ownedFieldsMigrationRequired'
  if (error?.code === 'PGRST202' && text.includes('add_service_schedule_ministry_to_section_v123')) return 'schedMonth.addMinistryMigrationRequired'
  if (error?.code === 'PGRST202' && text.includes('_v122')) return 'schedMonth.copyMigrationRequired'
  if (error?.code === 'PGRST202' && text.includes('return_service_schedule_month_to_draft_v121')) return 'schedMonth.returnMigrationRequired'
  if (text.includes('Pelayan pada bulan sumber sudah tidak aktif')) return 'schedMonth.copyMemberInactive'
  if (text.includes('Posisi pada bulan sumber sudah Nonaktif')) return 'schedMonth.copyPositionInactive'
  if (text.includes('Pilih ulang Event') || text.includes('Pilih ulang Kelas')) return 'schedMonth.copySourceLinkRequired'
  if (text.includes('Bulan tujuan sudah memiliki jadwal aktif')) return 'schedMonth.restoreBlocked'
  if (text.includes('Pemetaan tanggal') || text.includes('Tanggal tujuan')) return 'schedMonth.copyDateInvalid'
  if (text.includes('Bulan ini sudah memiliki jadwal aktif')) return 'schedMonth.restoreBlocked'
  if (text.includes('kehadiran tercatat')) return 'schedMonth.returnAttendanceBlocked'
  if (text.includes('yang pernah terbit tidak dapat diganti')) return 'schedMonth.editPublishedLocked'
  if (text.includes('Kosongkan pelayan kegiatan')) return 'schedMonth.editAssignedBlocked'
  if (error?.code === 'PGRST202' && text.includes('reassign_and_sync_service_schedule_draft_positions_v111')) return 'schedMonth.migrationRequired'
  if (['PGRST200', 'PGRST202', 'PGRST205', '42P01', '42703'].includes(error?.code)) return 'schedMonth.migrationRequired'
  if (text.includes('schedule_position_assigned')) return 'schedMonth.syncBlocked'
  if (text.includes('schedule_ministry_membership_required')) return 'schedMonth.membershipRequired'
  if (error?.code === '42501' || text.includes('not_authorized')) return 'sched.noAccess'
  if (error?.code === '23P01' || text.includes('schedule_conflict')) return 'schedMonth.conflictBlocked'
  if (error?.code === '40001' || text.includes('schedule_changed') || text.includes('concurrent') || text.includes('stale')) return 'schedMonth.changed'
  if (text.includes('Kosongkan seluruh') || text.includes('clear_assignments')) return 'schedMonth.timeLocked'
  return 'sched.saveFailed'
}

function Modal({ title, onClose, children, busy = false, className = '' }) {
  const { t } = useLang()
  const { registerToastHost } = useToast()
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    const unregisterToastHost = registerToastHost(dialog)
    return () => { unregisterToastHost(); if (dialog.open) dialog.close() }
  }, [registerToastHost])
  return <dialog ref={ref} className={`monthly-dialog ${className}`.trim()} onCancel={event => { event.preventDefault(); if (!busy) onClose() }} aria-labelledby="monthly-dialog-title">
    <header className="monthly-dialog-header"><h2 id="monthly-dialog-title">{title}</h2><Button variant="ghost" disabled={busy} onClick={onClose} aria-label={t('common.close')} title={t('common.close')}><X size={18} /></Button></header>
    {children}
  </dialog>
}

export function MonthlyScheduleWorkspace({ api, profile, initialMonth, renderLegacy, ministryHref }) {
  const { t, lang } = useLang()
  const { toast, confirm } = useToast()
  const [params, setParams] = useSearchParams()
  const rosterId = params.get('rosterId') || ''
  const [view, setView] = useState(rosterId && !api.resolveRosterMonth ? 'legacy' : 'monthly')
  const [rosterLinkState, setRosterLinkState] = useState({ rosterId: '', error: '' })
  const [rosterLinkAttempt, setRosterLinkAttempt] = useState(0)
  const [month, setMonth] = useState(initialMonth || currentMonth())
  const [grants, setGrants] = useState(null)
  const [positions, setPositions] = useState([])
  const [ministries, setMinistries] = useState([])
  const [events, setEvents] = useState([])
  const [classes, setClasses] = useState([])
  const [months, setMonths] = useState([])
  const [monthId, setMonthId] = useState('')
  const [schedule, setSchedule] = useState(null)
  const [ownedFieldData, setOwnedFieldData] = useState({ fields: [], occurrences: [] })
  const [ownedFieldsLoading, setOwnedFieldsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [editDraftOpen, setEditDraftOpen] = useState(false)
  const [positionEditor, setPositionEditor] = useState(null)
  const [occurrenceEditor, setOccurrenceEditor] = useState(null)
  const [ministryAdder, setMinistryAdder] = useState(null)
  const [ministryFilter, setMinistryFilter] = useState('')
  const [activityFilter, setActivityFilter] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const catalogRequest = useRef(0)
  const monthsRequest = useRef(0)
  const initialMonthChecked = useRef(Boolean(initialMonth))
  // Auth menyegarkan objek profil Admin setiap 15 detik; hanya perubahan hak yang perlu memuat ulang katalog.
  const accessProfile = useMemo(() => ({
    user_id: profile?.user_id, role: profile?.role,
    role_secondary: profile?.role_secondary, status: profile?.status,
  }), [profile?.user_id, profile?.role, profile?.role_secondary, profile?.status])
  const canManageAll = grants?.some(item => item.manager_role === 'Admin') || false
  const managedMinistryIds = useMemo(() => grants?.map(item => item.ministry_id) || [], [grants])
  const isDraft = schedule?.month.status === 'Draft'
  const assignedCount = schedule?.rosters.reduce((count, roster) =>
    count + (roster.service_roster_slots || []).filter(slot => slot.user_id).length, 0) || 0
  const matrix = useMemo(() => schedule ? buildScheduleMatrix(schedule, { ministryFilter, activityFilter }) : null, [schedule, ministryFilter, activityFilter])

  useEffect(() => {
    if (!rosterId) return undefined
    if (!api.resolveRosterMonth) { setView('legacy'); return undefined }
    let active = true
    setRosterLinkState({ rosterId: '', error: '' })
    // Tautan push lama tetap menggunakan rosterId, tetapi aksi bulanan tidak boleh lewat editor individual.
    api.resolveRosterMonth(rosterId).then(link => {
      if (!active) return
      if (link) {
        setMonth(link.month_date.slice(0, 7)); setMonthId(link.month_id); setView('monthly')
        setParams(current => { const next = new URLSearchParams(current); next.delete('rosterId'); return next }, { replace: true })
      } else setView('legacy')
      setRosterLinkState({ rosterId, error: '' })
    }).catch(error => { if (active) setRosterLinkState({ rosterId, error: errorKey(error) }) })
    return () => { active = false }
  }, [api, rosterId, setParams, rosterLinkAttempt])
  useEffect(() => {
    if (!rosterId) setView(current => current === 'legacy' ? 'monthly' : current)
  }, [rosterId])

  const loadCatalog = useCallback(async () => {
    const request = ++catalogRequest.current
    setLoadError('')
    try {
      const access = await api.listManagedMinistries(accessProfile)
      if (request !== catalogRequest.current) return
      setGrants(access)
      if (!access.length) return
      const [positionRows, ministryRows, eventRows, classRows] = await Promise.all([
        api.listPositions(), api.listMinistries(), api.listEvents(), api.listClasses(),
      ])
      if (request !== catalogRequest.current) return
      setPositions(positionRows); setMinistries(ministryRows)
      setEvents(eventRows); setClasses(classRows)
    } catch (error) { if (request === catalogRequest.current) setLoadError(errorKey(error)) }
  }, [api, accessProfile])

  useEffect(() => {
    setGrants(null); setSchedule(null); setMonthId('')
    loadCatalog()
    return () => { catalogRequest.current += 1 }
  }, [loadCatalog])

  const loadMonths = useCallback(async () => {
    const request = ++monthsRequest.current
    if (!grants?.length) { setLoading(false); return }
    setLoading(true); setLoadError('')
    try {
      const rows = await api.listMonths(month)
      if (request !== monthsRequest.current) return
      if (!initialMonthChecked.current) {
        initialMonthChecked.current = true
        if (!rows.length && api.findNextMonth) {
          const nextMonth = await api.findNextMonth(month)
          if (request !== monthsRequest.current) return
          if (nextMonth) { setMonth(nextMonth); return }
        }
      }
      setMonths(rows)
      setMonthId(current => rows.some(row => row.month_id === current) ? current : rows[0]?.month_id || '')
    } catch (error) { if (request === monthsRequest.current) { setLoadError(errorKey(error)); setMonths([]); setMonthId('') } }
    finally { if (request === monthsRequest.current) setLoading(false) }
  }, [api, grants, month])
  useEffect(() => { loadMonths(); return () => { monthsRequest.current += 1 } }, [loadMonths])
  useEffect(() => {
    if (!grants?.length || canManageAll) {
      setOwnedFieldData({ fields: [], occurrences: [] })
      return undefined
    }
    let active = true
    setOwnedFieldsLoading(true)
    api.listOwnedScheduleFields(month).then(data => {
      if (active) setOwnedFieldData(data)
    }).catch(error => {
      if (active) { setOwnedFieldData({ fields: [], occurrences: [] }); setLoadError(errorKey(error)) }
    }).finally(() => { if (active) setOwnedFieldsLoading(false) })
    return () => { active = false }
  }, [api, grants, canManageAll, month])
  useEffect(() => {
    if (!canManageAll && !loading && !ownedFieldsLoading && ownedFieldData.fields.length && !months.length)
      setView(current => current === 'monthly' ? 'fields' : current)
  }, [canManageAll, loading, ownedFieldsLoading, ownedFieldData.fields.length, months.length])
  useEffect(() => {
    if (!monthId) { setSchedule(null); return undefined }
    let active = true
    setLoading(true); setSchedule(null)
    api.getMonth(monthId).then(data => { if (active) { setSchedule(data); setSelectedDate('') } })
      .catch(error => { if (active) setLoadError(errorKey(error)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, monthId])

  async function reloadSchedule() {
    if (monthId) setSchedule(await api.getMonth(monthId))
  }
  async function reload() {
    try {
      await loadCatalog(); await loadMonths(); await reloadSchedule()
      if (!canManageAll && grants?.length) setOwnedFieldData(await api.listOwnedScheduleFields(month))
    }
    catch (error) { toast.error(t(errorKey(error))) }
  }
  async function save(action, done, successKey = 'schedMonth.saved', refreshSchedule = true) {
    if (busy) return
    setBusy(true)
    try { await action(); if (refreshSchedule) await reloadSchedule(); done?.(); toast.success(t(successKey)) }
    catch (error) { toast.error(t(errorKey(error))) }
    finally { setBusy(false) }
  }
  async function saveOwnedField(occurrence, field, value) {
    if (busy) return
    setBusy(true)
    try {
      await api.updateOwnedScheduleField(occurrence.occurrence_id, field, value.trim(), occurrence[field] || '')
      setOwnedFieldData(await api.listOwnedScheduleFields(month))
      if (monthId) await reloadSchedule()
      toast.success(t('schedMonth.ownedFieldSaved'))
    } catch (error) {
      if (error?.code === '40001') {
        try { setOwnedFieldData(await api.listOwnedScheduleFields(month)) } catch { /* Daftar dapat dimuat lagi lewat tombol segarkan. */ }
      }
      toast.error(t(errorKey(error)))
    }
    finally { setBusy(false) }
  }
  async function notify(rosterIds, kind) {
    let result = { sent: 0, failedRecipients: 0, fcm: { sent: 0 }, duplicate: rosterIds.length > 0 }
    try {
      if (api.notifyMonth) result = await api.notifyMonth(monthId, kind)
      else {
        // Adaptor localhost tanpa jaringan tetap dapat mensimulasikan notifikasi per roster.
        const results = await Promise.allSettled(rosterIds.map(id => api.notify(id, kind)))
        for (const item of results) {
          if (item.status === 'rejected') { result.failedRecipients += 1; result.duplicate = false; continue }
          result.sent += item.value?.sent || 0
          result.fcm.sent += item.value?.fcm?.sent || 0
          result.failedRecipients += item.value?.failedRecipients || 0
          result.duplicate = result.duplicate && !!item.value?.duplicate
        }
      }
    } catch { result.failedRecipients += 1 }
    if (result.failedRecipients > 0 && kind !== 'Manual') toast.info(t(kind === 'Terbit' ? 'sched.publishedPushFailed' : 'sched.cancelPushFailed'), 5000)
    return result
  }
  async function sendReminder() {
    if (busy || !await confirm({ title: t('sched.remindTitle'), message: t('sched.remindMessage'), confirmText: t('sched.remind') })) return
    setBusy(true)
    try {
      const result = await notify(schedule.rosters.map(item => item.roster_id), 'Manual')
      const sent = (result.sent || 0) + (result.fcm?.sent || 0)
      if (result.failedRecipients > 0) {
        if (sent) toast.info(t('sched.reminderPartial'), 5000)
        else toast.error(t('sched.reminderFailed'))
      } else if (result.duplicate) toast.info(t('sched.reminderAlready'))
      else if (!sent) toast.info(t('sched.reminderNoPush'), 5000)
      else toast.success(t('sched.reminderSent'))
    } catch { toast.error(t('sched.reminderFailed')) }
    finally { setBusy(false) }
  }
  async function publishMonth() {
    const stats = buildScheduleMatrix(schedule).stats
    if (!await confirm({ title: t('schedMonth.publishTitle'), message: t(stats.empty > 0 ? 'schedMonth.publishIncomplete' : 'schedMonth.publishMessage', { empty: stats.empty }), confirmText: t('sched.publish') })) return
    setBusy(true)
    try {
      const ids = await api.publishMonth(monthId)
      await reloadSchedule(); toast.success(t('schedMonth.monthPublished'))
      await notify(ids || [], 'Terbit')
    } catch (error) { toast.error(t(errorKey(error))) }
    finally { setBusy(false) }
  }
  async function returnMonthToDraft() {
    const wasPublished = schedule?.month.status === 'Terbit'
    if (!await confirm({ title: t(wasPublished ? 'schedMonth.cancelTitle' : 'schedMonth.restoreTitle'),
      message: t(wasPublished ? 'schedMonth.cancelMessage' : 'schedMonth.restoreMessage'),
      confirmText: t(wasPublished ? 'schedMonth.cancelMonth' : 'schedMonth.restoreMonth'), danger: wasPublished })) return
    setBusy(true)
    try {
      const ids = await api.returnMonthToDraft(monthId)
      await reloadSchedule(); await loadMonths()
      toast.success(t(wasPublished ? 'schedMonth.retracted' : 'schedMonth.restored'))
      if (wasPublished) await notify(ids || [], 'Dibatalkan')
    }
    catch (error) { toast.error(t(errorKey(error))) }
    finally { setBusy(false) }
  }
  async function openDraftEditor(setOpen) {
    if (busy || loading || !canManageAll || !isDraft) return
    setBusy(true)
    try {
      const [positionRows, latestSchedule] = await Promise.all([api.listPositions(), api.getMonth(monthId)])
      setPositions(positionRows)
      setSchedule(latestSchedule)
      if (latestSchedule.month.status !== 'Draft') { toast.error(t('schedMonth.editDraftOnly')); return }
      setOpen(true)
    } catch (error) { toast.error(t(errorKey(error))) }
    finally { setBusy(false) }
  }
  async function deleteMonthDraft() {
    if (busy || loading || !canManageAll || !isDraft) return
    const expectedAssigned = schedule.rosters.reduce((count, roster) =>
      count + (roster.service_roster_slots || []).filter(slot => slot.user_id).length, 0)
    if (!await confirm({
      title: t('schedMonth.deleteDraftTitle'),
      message: t('schedMonth.deleteDraftMessage', { assigned: expectedAssigned }),
      confirmText: t('schedMonth.deleteDraft'),
      danger: true,
    })) return
    setBusy(true)
    try {
      const deletedAssigned = await api.deleteMonthDraft(monthId, expectedAssigned)
      setSchedule(null); setMonthId(''); setSelectedDate('')
      await loadMonths()
      toast.success(t('schedMonth.draftDeleted', { assigned: deletedAssigned }))
    } catch (error) {
      const changed = error?.code === '22023'
      toast.error(t(['PGRST202', 'PGRST205'].includes(error?.code) ? 'schedMonth.deleteMigrationRequired'
        : changed ? 'schedMonth.changed' : errorKey(error)))
      try {
        if (changed) { setSchedule(null); setMonthId(''); await loadMonths() }
        else await reloadSchedule()
      } catch { /* Sesi lain mungkin sudah menghapus bulan ini. */ }
    } finally { setBusy(false) }
  }
  async function clearAllAssignments(expectedVersion, expectedAssigned, confirmation) {
    if (busy || loading || !canManageAll || !isDraft) return
    setBusy(true)
    try {
      await api.clearMonthAssignments(monthId, expectedVersion, expectedAssigned, confirmation)
      await reloadSchedule()
      setClearOpen(false)
      toast.success(t('schedMonth.assignmentsCleared', { assigned: expectedAssigned }))
    } catch (error) {
      toast.error(t(errorKey(error)))
      if (error?.code === '40001') {
        setClearOpen(false)
        try { await reloadSchedule() } catch { /* Bulan mungkin telah berubah di sesi lain. */ }
      }
    } finally { setBusy(false) }
  }
  function exportPdf() {
    if (!printMonthlySchedule(schedule, { t, locale: lang, ministryFilter, activityFilter, restricted: !canManageAll })) toast.error(t('schedMonth.popupBlocked'))
  }
  if (rosterId && api.resolveRosterMonth) {
    if (rosterLinkState.rosterId !== rosterId) return <div className="py-16 text-center"><Spinner /></div>
    if (rosterLinkState.error) return <div className="monthly-error" role="alert">{t(rosterLinkState.error)}<Button variant="outline" onClick={() => setRosterLinkAttempt(current => current + 1)}>{t('schedMonth.retry')}</Button></div>
  }
  if (grants === null && !loadError) return <div className="py-16 text-center"><Spinner /></div>
  if (grants?.length === 0) return <EmptyState icon={CalendarDays} title={t('sched.noAccess')} description={t('sched.noAccessDesc')} />

  return <div className="monthly-workspace">
    <header className="monthly-heading"><h1>{t('schedMonth.title')}</h1><Button variant="ghost" aria-label={t('schedMonth.refresh')} title={t('schedMonth.refresh')} onClick={reload} disabled={busy}><RefreshCw size={18} /></Button></header>
    <div className={`monthly-access-scope${canManageAll ? ' is-admin' : ' is-manager'}`} role="note">
      <strong>{t(canManageAll ? 'schedMonth.accessAdmin' : 'schedMonth.accessManager')}</strong>
      <span>{t(canManageAll ? 'schedMonth.accessAdminHint' : 'schedMonth.accessManagerHint')}</span>
    </div>
    <nav className="monthly-tabs" aria-label={t('schedMonth.views')}>
      {[['monthly', 'schedMonth.monthly'], ...(!canManageAll && ownedFieldData.fields.length ? [['fields', 'schedMonth.ownedFields']] : []), ...(canManageAll ? [['settings', 'sched.accessPositions']] : [])].map(([id, label]) => <button type="button" key={id} disabled={busy} aria-pressed={view === id} onClick={() => {
        setView(id)
        if (rosterId) setParams(current => { const next = new URLSearchParams(current); next.delete('rosterId'); return next }, { replace: true })
      }}>{t(label)}</button>)}
    </nav>
    {loadError && <div className="monthly-error" role="alert">{t(loadError)}<Button variant="outline" onClick={reload}>{t('schedMonth.retry')}</Button></div>}
    {view === 'settings' && canManageAll ? <ScheduleAccessPositions api={api} ministries={ministries} positions={positions} onChange={async () => { await loadCatalog(); await reloadSchedule() }} ministryHref={ministryHref} /> : view === 'fields' && !canManageAll && ownedFieldData.fields.length ? <ScheduleOwnedFields data={ownedFieldData} month={month} onMonthChange={setMonth} loading={ownedFieldsLoading} busy={busy} onSave={saveOwnedField} /> : view === 'legacy' && rosterId && renderLegacy ? renderLegacy(view) : <>
      <div className="monthly-toolbar">
        <div className="monthly-month"><Button variant="outline" disabled={busy} aria-label={t('schedMonth.previousMonth')} title={t('schedMonth.previousMonth')} onClick={() => setMonth(shiftScheduleMonth(month, -1).slice(0, 7))}><ChevronLeft size={18} /></Button><Input type="month" aria-label={t('sched.month')} value={month} disabled={busy} onChange={event => event.target.value && setMonth(event.target.value)} /><Button variant="outline" disabled={busy} aria-label={t('sched.nextMonth')} title={t('sched.nextMonth')} onClick={() => setMonth(shiftScheduleMonth(month, 1).slice(0, 7))}><ChevronRight size={18} /></Button></div>
        {months.length > 1 && <Select aria-label={t('schedMonth.monthVersion')} disabled={busy} value={monthId} onChange={event => setMonthId(event.target.value)}>{months.map(item => <option key={item.month_id} value={item.month_id}>{item.name} / {t(`sched.status.${item.status}`)}</option>)}</Select>}
        {canManageAll && !months.some(item => item.status !== 'Dibatalkan') && <Button onClick={() => setCreateOpen(true)} disabled={busy}><Plus size={16} />{t('schedMonth.createMonth')}</Button>}
        {canManageAll && !months.some(item => item.status !== 'Dibatalkan') && <Button variant="outline" onClick={() => setCopyOpen(true)} disabled={busy}><Copy size={16} />{t('schedMonth.copyMonth')}</Button>}
        {schedule && <Button variant="outline" onClick={exportPdf} disabled={busy}><Printer size={16} />{t('sched.pdf')}</Button>}
        {canManageAll && isDraft && <Button variant="outline" onClick={() => openDraftEditor(setEditDraftOpen)} disabled={busy || loading}><Pencil size={16} />{t('schedMonth.editDraft')}</Button>}
        {canManageAll && isDraft && <Button onClick={publishMonth} disabled={busy || loading} loading={busy}><Send size={16} />{t('schedMonth.publishMonth')}</Button>}
        {canManageAll && isDraft && <Button variant="danger" onClick={deleteMonthDraft} disabled={busy || loading}><Trash2 size={16} />{t('schedMonth.deleteDraft')}</Button>}
        {canManageAll && isDraft && schedule?.month.definition?.copied_from_month_id && assignedCount > 0 && <Button variant="outline" onClick={() => setClearOpen(true)} disabled={busy || loading}><Trash2 size={16} />{t('schedMonth.clearAllAssignments')}</Button>}
        {canManageAll && schedule?.month.status === 'Terbit' && <Button variant="outline" onClick={sendReminder} disabled={busy || loading} loading={busy}><BellRing size={16} />{t('sched.remind')}</Button>}
        {canManageAll && schedule?.month.status === 'Terbit' && <Button variant="danger" onClick={returnMonthToDraft} disabled={busy || loading} loading={busy}>{t('schedMonth.cancelMonth')}</Button>}
        {canManageAll && schedule?.month.status === 'Dibatalkan' && !months.some(item => item.month_id !== monthId && item.status !== 'Dibatalkan') && <Button variant="outline" onClick={returnMonthToDraft} disabled={busy || loading} loading={busy}>{t('schedMonth.restoreMonth')}</Button>}
      </div>
      {loading ? <div className="py-16 text-center"><Spinner /></div> : !schedule ? <EmptyState icon={CalendarDays} title={t('schedMonth.emptyMonth')} description={t(canManageAll ? 'schedMonth.emptyMonthAdmin' : 'schedMonth.emptyMonthManager')} /> : <>
        <div className="monthly-toolbar monthly-filters"><Select aria-label={t('schedMonth.filterActivity')} value={activityFilter} onChange={event => setActivityFilter(event.target.value)}><option value="">{t('schedMonth.allActivities')}</option>{schedule.sections.map(item => <option key={item.key} value={item.key}>{item.title}</option>)}</Select><Select aria-label={t('schedMonth.filterMinistry')} value={ministryFilter} onChange={event => setMinistryFilter(event.target.value)}><option value="">{t('schedMonth.allMinistries')}</option>{ministries.map(item => <option key={item.ministry_id} value={item.ministry_id}>{item.name}</option>)}</Select><Badge color={statusColor(schedule.month.status)}>{t(`sched.status.${schedule.month.status}`)}</Badge><span className="monthly-summary">{t('schedMonth.fillSummary', { assigned: matrix.stats.assigned, capacity: matrix.stats.capacity })}</span></div>
        <MonthlyScheduleMatrix schedule={schedule} managedMinistryIds={managedMinistryIds} canManageAll={canManageAll} ministryFilter={ministryFilter} activityFilter={activityFilter} selectedDate={selectedDate} onDateChange={setSelectedDate} readonly={busy} onEditPosition={setPositionEditor} onEditOccurrence={setOccurrenceEditor} onAddMinistry={setMinistryAdder} />
      </>}
    </>}
    {createOpen && <MonthCreator profileId={profile?.user_id} month={month} ministries={ministries} positions={positions} events={events} classes={classes} busy={busy} onClose={() => setCreateOpen(false)} onSave={payload => save(async () => { const id = await api.createMonthDirect(payload); if (profile?.user_id) { try { window.localStorage.removeItem(monthDraftKey(profile.user_id, month)) } catch { /* Jadwal sudah dibuat di database. */ } } await loadMonths(); setMonthId(id) }, () => setCreateOpen(false), 'schedMonth.monthCreated', false)} />}
    {editDraftOpen && schedule && <MonthCreator schedule={schedule} month={month} ministries={ministries} positions={positions} events={events} classes={classes} busy={busy} onClose={() => setEditDraftOpen(false)} onSave={payload => save(() => api.updateMonthDraft(monthId, schedule.month.version, payload.entries, payload.expectedRemovedAssignments, payload.confirmation), () => setEditDraftOpen(false), 'schedMonth.draftUpdated')} />}
    {copyOpen && <CopyMonthDialog api={api} month={month} events={events} classes={classes} busy={busy} onClose={() => setCopyOpen(false)} onSave={payload => save(async () => { const id = await api.copyMonth(payload); await loadMonths(); setMonthId(id) }, () => setCopyOpen(false), 'schedMonth.monthCopied', false)} />}
    {clearOpen && schedule && isDraft && schedule.month.definition?.copied_from_month_id && <ClearAssignmentsDialog assigned={assignedCount} version={schedule.month.version} busy={busy} onClose={() => setClearOpen(false)} onSave={clearAllAssignments} />}
    {positionEditor && <PositionEditor context={positionEditor} api={api} canManageAll={canManageAll} isAdmin={profile?.role === 'Admin'} busy={busy} onClose={() => setPositionEditor(null)} onSave={payload => save(() => api.setPosition(payload), () => setPositionEditor(null), 'sched.assignmentSaved')} />}
    {ministryAdder && schedule && <AddMinistryDialog context={ministryAdder} positions={positions} busy={busy} onClose={() => setMinistryAdder(null)} onSave={() => save(() => api.addMinistryToSection(monthId, ministryAdder.sectionId, ministryAdder.ministry.ministry_id, schedule.month.version), () => setMinistryAdder(null), 'schedMonth.ministryAdded')} />}
    {occurrenceEditor && <OccurrenceEditor occurrence={occurrenceEditor} month={month} busy={busy} onClose={() => setOccurrenceEditor(null)} onSave={data => save(() => api.updateOccurrence(occurrenceEditor.occurrence_id, data), () => setOccurrenceEditor(null))} />}
  </div>
}

function MonthCreator({ profileId, month, schedule, ministries, positions, events, classes, onClose, onSave, busy }) {
  const { t, lang } = useLang()
  const isEdit = !!schedule
  const sundays = useMemo(() => getMonthDates(month), [month])
  const [initial] = useState(() => isEdit ? readSavedMonthDraft(schedule) : readMonthDraft(profileId, month, sundays))
  const [dates, setDates] = useState(initial.dates)
  const [selectedDate, setSelectedDate] = useState(initial.selectedDate)
  const [entries, setEntries] = useState(initial.entries)
  const [saveFailed, setSaveFailed] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [error, setError] = useState('')
  const [pendingRemoval, setPendingRemoval] = useState(null)
  const assignedParts = useMemo(() => assignedDraftParts(schedule), [schedule])
  const assignedAt = (item, ministryId) => !!item.occurrence_id && assignedParts.has(`${item.occurrence_id}:${ministryId}`)
  const assignedOn = item => item.ministry_ids.some(ministryId => assignedAt(item, ministryId))
  const assignedInSection = sectionId => entries.some(item => item.section_id === sectionId && assignedOn(item))
  const publishedBefore = !!schedule?.month?.published_at
  const publishedSection = item => publishedBefore && schedule.occurrences?.some(row => row.section_id === item.section_id)
  const copyEntryToDate = (item, date) => {
    const copy = structuredClone(item)
    delete copy.occurrence_id
    return { ...copy, service_date: date }
  }
  useEffect(() => { setPendingRemoval(null) }, [entries])
  useEffect(() => {
    if (!profileId || isEdit) return
    try {
      window.localStorage.setItem(monthDraftKey(profileId, month), JSON.stringify({ dates, selectedDate, entries }))
      setSaveFailed(false)
    } catch { setSaveFailed(true) }
  }, [profileId, month, dates, selectedDate, entries, isEdit])
  const [year, number] = month.split('-').map(Number)
  const maxDate = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10)
  const dateEntries = entries.filter(item => item.service_date === selectedDate)
  const activePositions = ministryId => positions.filter(item => item.is_active && item.ministry_id === ministryId)
  const sectionCount = new Set(entries.map(item => item.section_id)).size
  const previousDate = [...dates].reverse().find(date => date < selectedDate && entries.some(item => item.service_date === date))
  const emptyLaterDates = dates.filter(date => date > selectedDate && !entries.some(item => item.service_date === date))
  const dateLabel = date => new Date(date + 'T00:00:00Z').toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' })

  function updateEntry(target, change) {
    const shared = Object.fromEntries(['title', 'source_type', 'event_id', 'class_id', ...(Object.hasOwn(change, 'source_type') ? ['class_session_no'] : [])].filter(key => Object.hasOwn(change, key)).map(key => [key, change[key]]))
    setEntries(current => current.map(item => item.section_id === target.section_id
      ? { ...item, ...shared, ...(item.service_date === target.service_date ? change : {}) } : item))
    setError('')
  }
  function copyDate(from, to) {
    setEntries(current => [...current, ...current.filter(item => item.service_date === from).map(item => copyEntryToDate(item, to))])
    setError('')
  }
  function submit(event) {
    event.preventDefault()
    const empty = dates.find(date => !entries.some(item => item.service_date === date))
    if (empty) { setSelectedDate(empty); setError('schedMonth.directDateEmpty'); return }
    const ministryUnion = new Map()
    for (const item of entries) {
      if (!ministryUnion.has(item.section_id)) ministryUnion.set(item.section_id, new Set())
      for (const id of item.ministry_ids) ministryUnion.get(item.section_id).add(id)
    }
    if (!entries.length || entries.length > 124 || sectionCount > 12
      || entries.some(item => item.ministry_ids.length > 20)
      || [...ministryUnion.values()].some(ids => ids.size > 20)) { setError('schedMonth.directLimit'); return }
    for (const item of entries) {
      if (!item.title.trim() || !item.start_time || !item.end_time || item.end_time <= item.start_time) { setSelectedDate(item.service_date); setError('schedMonth.directEntryInvalid'); return }
      if (item.source_type === 'Kelas' && !item.class_id || item.source_type === 'Event' && !item.event_id) { setSelectedDate(item.service_date); setError('schedMonth.directSourceRequired'); return }
      if (!item.ministry_ids.length || item.ministry_ids.some(id => !activePositions(id).length
        && !(isEdit && schedule.parts?.some(part => part.occurrence_id === item.occurrence_id && part.ministry_id === id)))) {
        setSelectedDate(item.service_date); setError('schedMonth.directMinistryRequired'); return
      }
    }
    const normalizedEntries = [...entries].sort((a, b) => a.service_date.localeCompare(b.service_date)).map(item => ({
      ...item, title: item.title.trim(), class_session_no: item.source_type === 'Kelas' ? Number(item.class_session_no) || 1 : null,
      event_id: item.source_type === 'Event' ? item.event_id : null, class_id: item.source_type === 'Kelas' ? item.class_id : null,
    }))
    if (!isEdit) { onSave({ month, entries: normalizedEntries }); return }

    const previousOccurrences = new Map((schedule.occurrences || []).map(item => [item.occurrence_id, item]))
    for (const updated of normalizedEntries) {
      if (!updated.occurrence_id) continue
      const previous = previousOccurrences.get(updated.occurrence_id)
      if (!previous || !updated.ministry_ids.some(ministryId => assignedAt(updated, ministryId))) continue
      const changed = updated.service_date !== previous.service_date
        || updated.start_time !== String(previous.start_time || '').slice(0, 5)
        || updated.end_time !== String(previous.end_time || '').slice(0, 5)
        || updated.source_type !== previous.source_type
        || updated.event_id !== (previous.event_id || null)
        || updated.class_id !== (previous.class_id || null)
        || updated.class_session_no !== (previous.class_session_no || null)
      if (changed) { setSelectedDate(updated.service_date); setError('schedMonth.editAssignedBlocked'); return }
    }
    const removedAssignments = removedDraftAssignments(schedule, normalizedEntries)
    const fingerprint = JSON.stringify(normalizedEntries)
    if (removedAssignments.length > 0 && (pendingRemoval?.count !== removedAssignments.length || pendingRemoval?.fingerprint !== fingerprint)) {
      setPendingRemoval({ count: removedAssignments.length, fingerprint })
      setError('')
      return
    }
    onSave({ month, entries: normalizedEntries, expectedRemovedAssignments: removedAssignments,
      confirmation: removedAssignments.length ? 'HAPUS PENUGASAN' : null })
  }
  return <Modal title={t(isEdit ? 'schedMonth.editDraft' : 'schedMonth.createMonth')} onClose={onClose} busy={busy}><form onSubmit={submit}>
    <div className="monthly-dialog-body">
      {isEdit && <p className="monthly-muted">{t('schedMonth.editDraftHint')}{publishedBefore && ` ${t('schedMonth.editPublishedHint')}`}</p>}
      <div className="monthly-direct-toolbar"><h3 className="monthly-subheading">{t('schedMonth.dates')}</h3>
        <div className="monthly-inline"><Input type="date" min={month + '-01'} max={maxDate} label={t('schedMonth.addDate')} value={newDate} disabled={busy} onChange={event => setNewDate(event.target.value)} /><Button type="button" variant="outline" disabled={!newDate || busy || newDate.slice(0, 7) !== month || dates.includes(newDate)} onClick={() => { setDates(current => [...current, newDate].sort()); setSelectedDate(newDate); setNewDate(''); setError('') }} aria-label={t('schedMonth.addDate')} title={t('schedMonth.addDate')}><Plus size={18} /></Button></div>
      </div>
      <div className="monthly-direct-dates" role="tablist" aria-label={t('schedMonth.dates')}>{dates.map(date => <div className="monthly-direct-date" key={date}>
        <button type="button" role="tab" aria-selected={selectedDate === date} onClick={() => setSelectedDate(date)} disabled={busy}>{dateLabel(date)} <span>{entries.filter(item => item.service_date === date).length}</span></button>
        <Button type="button" variant="ghost" disabled={busy || dates.length === 1} onClick={() => { const remaining = dates.filter(item => item !== date); setDates(remaining); setEntries(current => current.filter(item => item.service_date !== date)); if (selectedDate === date) setSelectedDate(remaining[0] || ''); setError('') }} aria-label={t('schedMonth.removeDate', { date })} title={t('schedMonth.removeDate', { date })}><X size={14} /></Button>
      </div>)}</div>
      <div className="monthly-direct-actions"><h3 className="monthly-subheading">{t('schedMonth.activitiesOnDate', { date: dateLabel(selectedDate) })}</h3><div className="monthly-direct-commands">
        {!dateEntries.length && previousDate && <Button type="button" variant="outline" disabled={busy} onClick={() => copyDate(previousDate, selectedDate)}><Copy size={16} />{t('schedMonth.copyPreviousDate')}</Button>}
        {!!dateEntries.length && !!emptyLaterDates.length && <Button type="button" variant="outline" disabled={busy} onClick={() => { setEntries(current => [...current, ...emptyLaterDates.flatMap(date => dateEntries.map(item => copyEntryToDate(item, date)))]); setError('') }}><Copy size={16} />{t('schedMonth.copyToEmptyDates')}</Button>}
        <Button type="button" variant="outline" disabled={busy || sectionCount >= 12} onClick={() => { setEntries(current => [...current, newEntry(selectedDate)]); setError('') }}><Plus size={16} />{t('schedMonth.addActivity')}</Button>
      </div></div>
      {!dateEntries.length && <p className="monthly-muted">{t('schedMonth.directDateEmpty')}</p>}
      {dateEntries.map((item, index) => <section className="monthly-direct-entry" key={item.section_id}>
        <div className="monthly-direct-entry-heading"><h4>{t('schedMonth.activityNumber', { number: index + 1 })}</h4><Button type="button" variant="ghost" disabled={busy} onClick={() => { setEntries(current => current.filter(entry => entry !== item)); setError('') }} aria-label={t('schedMonth.removeActivity')} title={t('schedMonth.removeActivity')}><Trash2 size={16} /></Button></div>
        <div className="monthly-editor-grid">
          <Input label={t('sched.scheduleTitle')} required maxLength={120} value={item.title} disabled={busy} onChange={event => updateEntry(item, { title: event.target.value })} />
          <Select label={t('sched.sourceType')} value={item.source_type} disabled={busy || (isEdit && (assignedInSection(item.section_id) || publishedSection(item)))} onChange={event => updateEntry(item, { source_type: event.target.value, event_id: null, class_id: null, class_session_no: event.target.value === 'Kelas' ? 1 : null })}>{['Ibadah', 'Kelas', 'Event'].map(type => <option key={type} value={type}>{t('sched.source.' + type)}</option>)}</Select>
          {item.source_type === 'Kelas' && <><Select required label={t('sched.class')} value={item.class_id || ''} disabled={busy || (isEdit && (assignedInSection(item.section_id) || publishedSection(item)))} onChange={event => updateEntry(item, { class_id: event.target.value })}><option value="">{t('sched.chooseClass')}</option>{classes.map(row => <option key={row.class_id} value={row.class_id}>{row.name}</option>)}</Select><Input required type="number" min="1" max="1000" label={t('sched.sessionNo')} value={item.class_session_no || 1} disabled={busy || (isEdit && (assignedInSection(item.section_id) || publishedSection(item)))} onChange={event => updateEntry(item, { class_session_no: Number(event.target.value) })} /></>}
          {item.source_type === 'Event' && <Select required label={t('sched.event')} value={item.event_id || ''} disabled={busy || (isEdit && (assignedInSection(item.section_id) || publishedSection(item)))} onChange={event => updateEntry(item, { event_id: event.target.value })}><option value="">{t('sched.chooseEvent')}</option>{events.map(row => <option key={row.event_id} value={row.event_id}>{row.name || row.title}</option>)}</Select>}
          <Input required type="time" label={t('sched.startTime')} value={item.start_time} disabled={busy || (isEdit && (assignedOn(item) || (publishedBefore && item.occurrence_id)))} onChange={event => updateEntry(item, { start_time: event.target.value })} />
          <Input required type="time" label={t('sched.endTime')} value={item.end_time} disabled={busy || (isEdit && (assignedOn(item) || (publishedBefore && item.occurrence_id)))} onChange={event => updateEntry(item, { end_time: event.target.value })} />
        </div>
        <fieldset className="monthly-direct-ministries"><legend>{t('sched.ministry')}</legend><div className="monthly-direct-ministry-options">{ministries.map(ministry => {
          const jobs = activePositions(ministry.ministry_id)
          return <Checkbox key={ministry.ministry_id} label={<span className="monthly-direct-ministry-label"><strong>{ministry.name}</strong><small>{jobs.length ? t('schedMonth.jobsPreview', { jobs: jobs.map(job => job.name + ' (' + (job.default_slots || 1) + ')').join(' · ') }) : t('schedMonth.noJobs')}</small></span>} checked={item.ministry_ids.includes(ministry.ministry_id)} disabled={busy || (!jobs.length && !item.ministry_ids.includes(ministry.ministry_id))} onChange={event => updateEntry(item, { ministry_ids: event.target.checked ? [...item.ministry_ids, ministry.ministry_id] : item.ministry_ids.filter(id => id !== ministry.ministry_id) })} />
        })}</div>
          {!ministries.some(ministry => activePositions(ministry.ministry_id).length) && <p className="monthly-error" role="alert">{t('schedMonth.noPositionsForPart')}</p>}
        </fieldset>
        <details className="monthly-direct-details"><summary>{t('schedMonth.moreDetails')}</summary><div className="monthly-editor-grid">
          <Input label={t('sched.location')} value={item.location} maxLength={160} disabled={busy} onChange={event => updateEntry(item, { location: event.target.value })} />
          <Input label={t('sched.dressCode')} value={item.dress_code} maxLength={120} disabled={busy} onChange={event => updateEntry(item, { dress_code: event.target.value })} />
          <Input label={t('schedMonth.pic')} value={item.pic} maxLength={120} disabled={busy} onChange={event => updateEntry(item, { pic: event.target.value })} />
        </div><Textarea label={t('sched.notes')} maxLength={1000} value={item.notes} disabled={busy} onChange={event => updateEntry(item, { notes: event.target.value })} /></details>
      </section>)}
      {error && <p className="monthly-error" role="alert">{t(error)}</p>}
      {!isEdit && <p className={saveFailed ? 'monthly-error' : 'monthly-muted'} role={saveFailed ? 'alert' : 'status'}>{t(saveFailed ? 'schedMonth.localDraftFailed' : 'schedMonth.localDraftSaved')}</p>}
      {pendingRemoval && <p className="monthly-error" role="alert">{t('schedMonth.editRemoveConfirm', { count: pendingRemoval.count })}</p>}
    </div><footer className="monthly-dialog-footer"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('sched.close')}</Button>{pendingRemoval && <Button type="button" variant="outline" disabled={busy} onClick={() => setPendingRemoval(null)}>{t('schedMonth.editRemoveBack')}</Button>}<Button type="submit" variant={pendingRemoval ? 'danger' : undefined} disabled={!entries.length} loading={busy}><CalendarDays size={16} />{t(pendingRemoval ? 'schedMonth.editRemoveAndSave' : isEdit ? 'schedMonth.saveDraft' : 'schedMonth.createMonth', { count: pendingRemoval?.count })}</Button></footer>
  </form></Modal>
}

function CopyMonthDialog({ api, month, events, classes, busy, onClose, onSave }) {
  const { t, lang } = useLang()
  const [sources, setSources] = useState([])
  const [sourceMonthId, setSourceMonthId] = useState('')
  const [source, setSource] = useState(null)
  const [loadingSources, setLoadingSources] = useState(true)
  const [loadingSource, setLoadingSource] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [dateMap, setDateMap] = useState({})
  const [sourceLinks, setSourceLinks] = useState({})
  const [copyAssignments, setCopyAssignments] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.listCopySources().then(rows => {
      if (!active) return
      const available = (rows || []).filter(item => item.month_id && item.month_date?.slice(0, 7) !== month)
      setSources(available)
      setSourceMonthId(available.find(item => item.month_date < `${month}-01`)?.month_id || available[0]?.month_id || '')
    }).catch(() => { if (active) setLoadError('schedMonth.copySourcesFailed') })
      .finally(() => { if (active) setLoadingSources(false) })
    return () => { active = false }
  }, [api, month])

  useEffect(() => {
    if (!sourceMonthId) { setSource(null); return undefined }
    let active = true
    setLoadingSource(true)
    setSource(null)
    setLoadError('')
    setError('')
    api.getMonth(sourceMonthId).then(data => {
      if (!active) return
      const dates = [...new Set((data.occurrences || []).map(item => item.service_date))].sort()
      setSource(data)
      setDateMap(defaultMonthCopyDateMap(dates, month))
      setSourceLinks({})
      setCopyAssignments(true)
      setLoadError('')
    }).catch(() => { if (active) setLoadError('schedMonth.copySourceFailed') })
      .finally(() => { if (active) setLoadingSource(false) })
    return () => { active = false }
  }, [api, sourceMonthId, month])

  const sourceDates = useMemo(() => [...new Set((source?.occurrences || []).map(item => item.service_date))].sort(), [source])
  const sourceSections = useMemo(() => (source?.sections || []).filter(item => item.source_type === 'Event' || item.source_type === 'Kelas'), [source])
  const assigned = useMemo(() => (source?.rosters || []).reduce((count, roster) =>
    count + (roster.service_roster_slots || []).filter(slot => slot.user_id).length, 0), [source])
  const [year, number] = month.split('-').map(Number)
  const lastDate = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10)

  function submit(event) {
    event.preventDefault()
    const dateError = validateMonthCopyDateMap(sourceDates, month, dateMap)
    if (dateError) { setError(dateError); return }
    if (sourceSections.some(section => !(sourceLinks[section.section_id]?.[section.source_type === 'Event' ? 'event_id' : 'class_id']))) {
      setError('schedMonth.copySourceLinkRequired')
      return
    }
    setError('')
    onSave({ sourceMonthId, targetMonth: month, dateMap, sourceLinks, copyAssignments })
  }

  return <Modal title={t('schedMonth.copyMonth')} onClose={onClose} busy={busy} className="monthly-member-dialog"><form onSubmit={submit}>
    <div className="monthly-dialog-body">
      <p className="monthly-muted">{t('schedMonth.copyMonthHint')}</p>
      {loadingSources ? <div className="py-8 text-center"><Spinner /></div> : !sources.length && !loadError
        ? <p className="monthly-muted">{t('schedMonth.copyNoSources')}</p>
        : <Select label={t('schedMonth.copySourceMonth')} value={sourceMonthId} disabled={busy || loadingSource} onChange={event => setSourceMonthId(event.target.value)}>
          {sources.map(item => <option key={item.month_id} value={item.month_id}>{item.name || formatScheduleMonth(item.month_date, lang)} / {t(`sched.status.${item.status}`)}</option>)}
        </Select>}
      {loadingSource && <div className="py-8 text-center"><Spinner /></div>}
      {loadError && <p className="monthly-error" role="alert">{t(loadError)}</p>}
      {source && <>
        <p className="monthly-muted">{t('schedMonth.copyDateHint')}</p>
        {sourceDates.map(date => <div className="monthly-editor-grid" key={date}>
          <div>
            <strong className="monthly-subheading">{formatScheduleDate(date, lang, { weekday: 'long', year: 'numeric' })}</strong>
            <p className="monthly-muted">{source.occurrences.filter(item => item.service_date === date).map(item => item.title).join(' · ')}</p>
          </div>
          <Input type="date" aria-required="true" min={`${month}-01`} max={lastDate} label={t('schedMonth.copyTargetDate')} value={dateMap[date] || ''} disabled={busy}
            onChange={event => { setDateMap(current => ({ ...current, [date]: event.target.value })); setError('') }} />
        </div>)}
        {sourceSections.map(section => {
          const isEvent = section.source_type === 'Event'
          const linkKey = isEvent ? 'event_id' : 'class_id'
          const choices = isEvent ? events : classes
          return <Select key={section.section_id} aria-required="true" label={t('schedMonth.copyTargetSource', { activity: section.title })}
            value={sourceLinks[section.section_id]?.[linkKey] || ''} disabled={busy}
            onChange={event => { setSourceLinks(current => ({ ...current, [section.section_id]: { [linkKey]: event.target.value } })); setError('') }}>
            <option value="">{t(isEvent ? 'sched.chooseEvent' : 'sched.chooseClass')}</option>
            {choices.map(item => <option key={isEvent ? item.event_id : item.class_id} value={isEvent ? item.event_id : item.class_id}>{item.name || item.title}</option>)}
          </Select>
        })}
        <Checkbox checked={copyAssignments} disabled={busy} onChange={event => setCopyAssignments(event.target.checked)} label={t('schedMonth.copyAssignments', { assigned })} />
        {error && <p className="monthly-error" role="alert">{t(error)}</p>}
      </>}
    </div>
    <footer className="monthly-dialog-footer"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('sched.close')}</Button><Button type="submit" disabled={!source || loadingSource || busy} loading={busy}><Copy size={16} />{t('schedMonth.copyMonth')}</Button></footer>
  </form></Modal>
}

function ClearAssignmentsDialog({ assigned, version, busy, onClose, onSave }) {
  const { t } = useLang()
  const [verification, setVerification] = useState('')
  const expectedWord = 'KOSONGKAN'
  return <Modal title={t('schedMonth.clearAllAssignments')} onClose={onClose} busy={busy} className="monthly-member-dialog"><form onSubmit={event => {
    event.preventDefault()
    if (verification.trim().toLocaleUpperCase('id-ID') === expectedWord) onSave(version, assigned, expectedWord)
  }}>
    <div className="monthly-dialog-body">
      <p>{t('schedMonth.clearAllMessage', { assigned })}</p>
      <Input label={t('schedMonth.clearVerificationLabel')} value={verification} disabled={busy} autoComplete="off" autoCapitalize="characters"
        onChange={event => setVerification(event.target.value)} />
    </div>
    <footer className="monthly-dialog-footer"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('sched.close')}</Button><Button type="submit" variant="danger" disabled={busy || verification.trim().toLocaleUpperCase('id-ID') !== expectedWord} loading={busy}><Trash2 size={16} />{t('schedMonth.clearAllAssignments')}</Button></footer>
  </form></Modal>
}

function AddMinistryDialog({ context, positions, busy, onClose, onSave }) {
  const { t } = useLang()
  const { ministry, sectionTitle } = context
  const jobs = positions.filter(position => position.is_active && position.ministry_id === ministry.ministry_id)
  return <Modal title={t('schedMonth.addMinistryAllDates')} onClose={onClose} busy={busy} className="monthly-member-dialog">
    <div className="monthly-dialog-body">
      <p>{t('schedMonth.addMinistryConfirm', { ministry: ministry.ministry_name, activity: sectionTitle })}</p>
      {jobs.length ? <p className="monthly-muted">{t('schedMonth.jobsPreview', { jobs: jobs.map(job => `${job.name} (${job.default_slots})`).join(' · ') })}</p>
        : <p className="monthly-error" role="alert">{t('schedMonth.noPositionsForPart')}</p>}
    </div>
    <footer className="monthly-dialog-footer"><Button variant="outline" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button><Button disabled={!jobs.length} loading={busy} onClick={onSave}><Plus size={16} />{t('schedMonth.addMinistryAllDates')}</Button></footer>
  </Modal>
}

function PositionEditor({ context, api, canManageAll, isAdmin, onClose, onSave, busy }) {
  const { t } = useLang()
  const { occurrence, position, roster, slots } = context
  const [selected, setSelected] = useState(() => slots.filter(slot => slot.user_id).map(slot => slot.user_id))
  const [notes, setNotes] = useState(() => Object.fromEntries(slots.filter(slot => slot.user_id).map(slot => [slot.user_id, slot.assignment_note || ''])))
  const [query, setQuery] = useState('')
  const [members, setMembers] = useState([])
  const [names, setNames] = useState(() => new Map(slots.filter(slot => slot.user_id).map(slot => [slot.user_id, slot.users?.name || t('schedMonth.unavailableMember')])))
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [previewChecking, setPreviewChecking] = useState(false)
  const [error, setError] = useState('')
  const [conflicts, setConflicts] = useState([])
  useEffect(() => {
    let active = true
    setLoading(true)
    const timer = setTimeout(() => api.listMembers(position.ministry_id, query, canManageAll || isAdmin)
      .then(rows => { if (active) { setMembers(rows); setNames(current => new Map([...current, ...rows.map(item => [item.user_id, item.name])])) } })
      .catch(() => { if (active) { setMembers([]); setError('schedMonth.membersFailed') } })
      .finally(() => { if (active) setLoading(false) }), 200)
    return () => { active = false; clearTimeout(timer) }
  }, [api, canManageAll, isAdmin, position.ministry_id, query])
  useEffect(() => {
    let active = true
    if (!selected.length) { setConflicts([]); setPreviewChecking(false); return undefined }
    setConflicts([])
    setPreviewChecking(true)
    const timer = setTimeout(() => {
      Promise.all(selected.map(async userId => {
        const ownSlot = slots.find(slot => slot.user_id === userId)
        const rows = await api.findConflicts(userId, roster.roster_id, ownSlot?.slot_id)
        return rows.map(item => ({ ...item, memberId: userId }))
      })).then(rows => { if (active) setConflicts(rows.flat()) })
        .catch(() => { if (active) setError('schedMonth.conflictsFailed') })
        .finally(() => { if (active) setPreviewChecking(false) })
    }, 180)
    return () => { active = false; clearTimeout(timer) }
  }, [api, selected, roster.roster_id, slots])
  async function submit(event) {
    event.preventDefault(); setChecking(true); setError(''); setConflicts([])
    try {
      const findings = []
      for (const userId of selected) {
        const ownSlot = slots.find(slot => slot.user_id === userId)
        const rows = await api.findConflicts(userId, roster.roster_id, ownSlot?.slot_id)
        for (const item of rows) findings.push({ ...item, memberId: userId })
      }
      if (findings.length) { setConflicts(findings); return }
      // Catatan personel lama tidak boleh ikut saat satu slot diisi pengganti.
      const selectedNotes = Object.fromEntries(selected.map(id => [id, notes[id] || '']))
      await onSave({ rosterId: roster.roster_id, positionId: position.position_id, userIds: selected,
        expectedUserIds: slots.filter(slot => slot.user_id).map(slot => slot.user_id), notes: selectedNotes })
    } catch (err) { setError(errorKey(err)) }
    finally { setChecking(false) }
  }
  return <Modal title={t('sched.chooseMember')} onClose={onClose} busy={busy || checking} className="monthly-member-dialog"><form onSubmit={submit}>
    <div className="monthly-dialog-body"><div className="monthly-context"><strong>{position.name} / {occurrence.title}</strong><span>{occurrence.service_date} / {timeLabel(occurrence)} / {position.ministry_name}</span></div>
      <Input icon={Search} aria-label={t('sched.searchMember')} placeholder={t('sched.searchMember')} value={query} disabled={busy || checking} onChange={event => setQuery(event.target.value)} />
      <p className="monthly-muted">{t('schedMonth.selectedCount', { count: selected.length, capacity: slots.length })}</p>
      {!!selected.length && <div className="monthly-date-picks">{selected.map(id => <Button type="button" key={id} variant="outline" disabled={busy || checking} onClick={() => { setSelected(current => current.filter(item => item !== id)); setConflicts([]) }} aria-label={t('schedMonth.removeMember', { name: names.get(id) || '-' })}>{names.get(id) || '-'}<X size={14} /></Button>)}</div>}
      {!!selected.length && <div className="monthly-person-notes">{selected.map(id => <Input key={id} label={t('schedMonth.personNoteFor', { name: names.get(id) || '-' })} placeholder={t('schedMonth.personNoteExample')} maxLength={100} value={notes[id] || ''} disabled={busy || checking} onChange={event => setNotes(current => ({ ...current, [id]: event.target.value }))} />)}</div>}
      <div className="monthly-member-list">{loading ? <Spinner size="sm" /> : !members.length ? <p>{t('sched.noMembers')}</p> : members.map(member => <Checkbox key={member.user_id} label={member.name} checked={selected.includes(member.user_id)} disabled={busy || checking || (slots.length !== 1 && !selected.includes(member.user_id) && selected.length >= slots.length)} onChange={event => { setSelected(current => event.target.checked ? (slots.length === 1 ? [member.user_id] : [...current, member.user_id]) : current.filter(id => id !== member.user_id)); setConflicts([]) }} />)}</div>
      {previewChecking && <p className="monthly-muted" role="status">{t('schedMonth.checkingConflicts')}</p>}
      {conflicts.length > 0 && <div className="monthly-error" role="alert"><strong>{t('schedMonth.conflictWarning')}</strong>{conflicts.map((item, index) => <p key={index}>{t('schedMonth.conflictItem', { name: names.get(item.memberId) || '-', title: item.title, date: item.service_date, time: timeLabel(item), position: item.position_names, ministry: item.ministry_name })}</p>)}</div>}
      {error && <p className="monthly-error" role="alert">{t(error)}</p>}
    </div><footer className="monthly-dialog-footer"><Button type="button" variant="outline" disabled={busy || checking} onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" disabled={previewChecking || conflicts.length > 0} loading={busy || checking}><Save size={16} />{t('schedMonth.saveAssignments')}</Button></footer>
  </form></Modal>
}


function OccurrenceEditor({ occurrence, month, onClose, onSave, busy }) {
  const { t } = useLang()
  const [form, setForm] = useState({ title: occurrence.title, service_date: occurrence.service_date, start_time: String(occurrence.start_time).slice(0, 5), end_time: String(occurrence.end_time).slice(0, 5), location: occurrence.location || '', dress_code: occurrence.dress_code || '', notes: occurrence.notes || '', pic: occurrence.pic || '' })
  const [error, setError] = useState('')
  const field = (key, label, type = 'text', required = false) => <Input key={key} label={t(label)} type={type} required={required} disabled={busy} value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} />
  return <Modal title={t('schedMonth.editOccurrence')} onClose={onClose} busy={busy}><form onSubmit={event => { event.preventDefault(); if (form.end_time <= form.start_time) { setError('schedMonth.invalidTime'); return } if (form.service_date.slice(0, 7) !== month) { setError('schedMonth.dateOutsideMonth'); return } onSave(form) }}><div className="monthly-dialog-body"><div className="monthly-editor-grid">{field('title', 'sched.scheduleTitle', 'text', true)}{field('service_date', 'sched.date', 'date', true)}{field('start_time', 'sched.startTime', 'time', true)}{field('end_time', 'sched.endTime', 'time', true)}{field('location', 'sched.location')}{field('dress_code', 'sched.dressCode')}{field('pic', 'schedMonth.pic')}</div><Textarea label={t('sched.notes')} value={form.notes} disabled={busy} maxLength={1000} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} />{error && <p className="monthly-error" role="alert">{t(error)}</p>}</div><footer className="monthly-dialog-footer"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" loading={busy}><Save size={16} />{t('common.save')}</Button></footer></form></Modal>
}
