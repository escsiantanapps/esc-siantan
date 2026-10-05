import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BellRing, CalendarDays, ChevronLeft, ChevronRight, Copy, Plus, Printer, RefreshCw, Save, Search, Send, Trash2, X } from 'lucide-react'
import { useLang } from '@/hooks/useLang'
import { useToast } from '@/hooks/useToast'
import { Badge, Button, Checkbox, EmptyState, Input, Select, Spinner, Textarea } from '@/components/ui'
import MonthlyScheduleMatrix from '@/components/serviceSchedule/MonthlyScheduleMatrix'
import ScheduleAccessPositions from '@/components/serviceSchedule/ScheduleAccessPositions'
import { buildScheduleMatrix, getMonthDates, printMonthlySchedule, shiftScheduleMonth } from '@/lib/serviceScheduleMatrix'
import './monthlyScheduleWorkspace.css'

const currentMonth = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
const newEntry = serviceDate => ({ section_id: `SEC-${crypto.randomUUID()}`, service_date: serviceDate,
  title: '', source_type: 'Ibadah', event_id: null, class_id: null, class_session_no: null,
  start_time: '', end_time: '', location: '', dress_code: '', pic: '', notes: '', ministry_ids: [] })
const timeLabel = item => `${String(item.start_time || '').slice(0, 5)} - ${String(item.end_time || '').slice(0, 5)}`
const statusColor = value => value === 'Terbit' ? 'green' : value === 'Dibatalkan' ? 'red' : 'amber'
const errorKey = error => {
  const text = String(error?.message || '')
  if (['PGRST200', 'PGRST202', 'PGRST205', '42P01', '42703'].includes(error?.code)) return 'schedMonth.migrationRequired'
  if (error?.code === '42501' || text.includes('not_authorized')) return 'sched.noAccess'
  if (error?.code === '23P01' || text.includes('schedule_conflict')) return 'schedMonth.conflictBlocked'
  if (error?.code === '40001' || text.includes('schedule_changed') || text.includes('concurrent') || text.includes('stale')) return 'schedMonth.changed'
  if (text.includes('Kosongkan seluruh') || text.includes('clear_assignments')) return 'schedMonth.timeLocked'
  return 'sched.saveFailed'
}

function Modal({ title, onClose, children, busy = false }) {
  const { t } = useLang()
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => { if (dialog.open) dialog.close() }
  }, [])
  return <dialog ref={ref} className="monthly-dialog" onCancel={event => { event.preventDefault(); if (!busy) onClose() }} aria-labelledby="monthly-dialog-title">
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
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [positionEditor, setPositionEditor] = useState(null)
  const [occurrenceEditor, setOccurrenceEditor] = useState(null)
  const [ministryFilter, setMinistryFilter] = useState('')
  const [activityFilter, setActivityFilter] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const catalogRequest = useRef(0)
  const monthsRequest = useRef(0)
  const canManageAll = ['Admin', 'Super Admin'].includes(profile?.role) && !!grants?.length
  const managedMinistryIds = useMemo(() => grants?.map(item => item.ministry_id) || [], [grants])
  const isDraft = schedule?.month.status === 'Draft'
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

  const loadCatalog = useCallback(async () => {
    const request = ++catalogRequest.current
    setLoadError('')
    try {
      const access = await api.listManagedMinistries(profile)
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
  }, [api, profile])

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
      setMonths(rows)
      setMonthId(current => rows.some(row => row.month_id === current) ? current : rows[0]?.month_id || '')
    } catch (error) { if (request === monthsRequest.current) { setLoadError(errorKey(error)); setMonths([]); setMonthId('') } }
    finally { if (request === monthsRequest.current) setLoading(false) }
  }, [api, grants, month])
  useEffect(() => { loadMonths(); return () => { monthsRequest.current += 1 } }, [loadMonths])
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
    try { await loadCatalog(); await loadMonths(); await reloadSchedule() }
    catch (error) { toast.error(t(errorKey(error))) }
  }
  async function save(action, done, successKey = 'schedMonth.saved', refreshSchedule = true) {
    if (busy) return
    setBusy(true)
    try { await action(); if (refreshSchedule) await reloadSchedule(); done?.(); toast.success(t(successKey)) }
    catch (error) { toast.error(t(errorKey(error))) }
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
    const allowIncomplete = stats.empty > 0
    if (!await confirm({ title: t('schedMonth.publishTitle'), message: t(allowIncomplete ? 'schedMonth.publishIncomplete' : 'schedMonth.publishMessage', { empty: stats.empty }), confirmText: t('sched.publish') })) return
    setBusy(true)
    try {
      const ids = await api.publishMonth(monthId, allowIncomplete)
      await reloadSchedule(); toast.success(t('schedMonth.monthPublished'))
      await notify(ids || [], 'Terbit')
    } catch (error) { toast.error(t(errorKey(error))) }
    finally { setBusy(false) }
  }
  async function cancelMonth() {
    if (!await confirm({ title: t('schedMonth.cancelTitle'), message: t('schedMonth.cancelMessage'), confirmText: t('sched.cancelRoster'), danger: true })) return
    setBusy(true)
    try { const ids = await api.cancelMonth(monthId); await reloadSchedule(); await loadMonths(); toast.success(t('sched.cancelled')); await notify(ids || [], 'Dibatalkan') }
    catch (error) { toast.error(t(errorKey(error))) }
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
    <nav className="monthly-tabs" aria-label={t('schedMonth.views')}>
      {[['monthly', 'schedMonth.monthly'], ...(canManageAll ? [['settings', 'sched.accessPositions']] : []), ...(renderLegacy ? [['legacy', 'schedMonth.legacy']] : [])].map(([id, label]) => <button type="button" key={id} disabled={busy} aria-pressed={view === id} onClick={() => setView(id)}>{t(label)}</button>)}
    </nav>
    {loadError && <div className="monthly-error" role="alert">{t(loadError)}<Button variant="outline" onClick={reload}>{t('schedMonth.retry')}</Button></div>}
    {view === 'settings' && canManageAll ? <ScheduleAccessPositions api={api} ministries={ministries} positions={positions} onChange={async () => { await loadCatalog(); await reloadSchedule() }} ministryHref={ministryHref} /> : view === 'legacy' ? renderLegacy?.(view) : <>
      <div className="monthly-toolbar">
        <div className="monthly-month"><Button variant="outline" disabled={busy} aria-label={t('schedMonth.previousMonth')} title={t('schedMonth.previousMonth')} onClick={() => setMonth(shiftScheduleMonth(month, -1).slice(0, 7))}><ChevronLeft size={18} /></Button><Input type="month" aria-label={t('sched.month')} value={month} disabled={busy} onChange={event => event.target.value && setMonth(event.target.value)} /><Button variant="outline" disabled={busy} aria-label={t('sched.nextMonth')} title={t('sched.nextMonth')} onClick={() => setMonth(shiftScheduleMonth(month, 1).slice(0, 7))}><ChevronRight size={18} /></Button></div>
        {months.length > 1 && <Select aria-label={t('schedMonth.monthVersion')} disabled={busy} value={monthId} onChange={event => setMonthId(event.target.value)}>{months.map(item => <option key={item.month_id} value={item.month_id}>{item.name} / {t(`sched.status.${item.status}`)}</option>)}</Select>}
        {canManageAll && !months.some(item => item.status !== 'Dibatalkan') && <Button onClick={() => setCreateOpen(true)} disabled={busy}><Plus size={16} />{t('schedMonth.createMonth')}</Button>}
        {schedule && <Button variant="outline" onClick={exportPdf} disabled={busy}><Printer size={16} />{t('sched.pdf')}</Button>}
        {canManageAll && isDraft && <Button onClick={publishMonth} disabled={busy || loading} loading={busy}><Send size={16} />{t('schedMonth.publishMonth')}</Button>}
        {canManageAll && isDraft && <Button variant="danger" onClick={deleteMonthDraft} disabled={busy || loading}><Trash2 size={16} />{t('schedMonth.deleteDraft')}</Button>}
        {canManageAll && schedule?.month.status === 'Terbit' && <Button variant="outline" onClick={sendReminder} disabled={busy || loading} loading={busy}><BellRing size={16} />{t('sched.remind')}</Button>}
        {canManageAll && schedule?.month.status === 'Terbit' && <Button variant="danger" onClick={cancelMonth} disabled={busy || loading} loading={busy}>{t('schedMonth.cancelMonth')}</Button>}
      </div>
      {loading ? <div className="py-16 text-center"><Spinner /></div> : !schedule ? <EmptyState icon={CalendarDays} title={t('schedMonth.emptyMonth')} description={t(canManageAll ? 'schedMonth.emptyMonthAdmin' : 'schedMonth.emptyMonthManager')} /> : <>
        <div className="monthly-toolbar monthly-filters"><Select aria-label={t('schedMonth.filterActivity')} value={activityFilter} onChange={event => setActivityFilter(event.target.value)}><option value="">{t('schedMonth.allActivities')}</option>{schedule.sections.map(item => <option key={item.key} value={item.key}>{item.title}</option>)}</Select><Select aria-label={t('schedMonth.filterMinistry')} value={ministryFilter} onChange={event => setMinistryFilter(event.target.value)}><option value="">{t('schedMonth.allMinistries')}</option>{ministries.map(item => <option key={item.ministry_id} value={item.ministry_id}>{item.name}</option>)}</Select><Badge color={statusColor(schedule.month.status)}>{t(`sched.status.${schedule.month.status}`)}</Badge><span className="monthly-summary">{t('schedMonth.fillSummary', { assigned: matrix.stats.assigned, capacity: matrix.stats.capacity })}</span></div>
        <MonthlyScheduleMatrix schedule={schedule} managedMinistryIds={managedMinistryIds} canManageAll={canManageAll} ministryFilter={ministryFilter} activityFilter={activityFilter} selectedDate={selectedDate} onDateChange={setSelectedDate} readonly={busy} onEditPosition={setPositionEditor} onEditOccurrence={setOccurrenceEditor} />
      </>}
    </>}
    {createOpen && <MonthCreator month={month} ministries={ministries} positions={positions} events={events} classes={classes} busy={busy} onClose={() => setCreateOpen(false)} onSave={payload => save(async () => { const id = await api.createMonthDirect(payload); await loadMonths(); setMonthId(id) }, () => setCreateOpen(false), 'schedMonth.monthCreated', false)} />}
    {positionEditor && <PositionEditor context={positionEditor} api={api} canManageAll={canManageAll} busy={busy} onClose={() => setPositionEditor(null)} onSave={payload => save(() => api.setPosition(payload), () => setPositionEditor(null), 'sched.assignmentSaved')} />}
    {occurrenceEditor && <OccurrenceEditor occurrence={occurrenceEditor} month={month} busy={busy} onClose={() => setOccurrenceEditor(null)} onSave={data => save(() => api.updateOccurrence(occurrenceEditor.occurrence_id, data), () => setOccurrenceEditor(null))} />}
  </div>
}

function MonthCreator({ month, ministries, positions, events, classes, onClose, onSave, busy }) {
  const { t, lang } = useLang()
  const sundays = useMemo(() => getMonthDates(month), [month])
  const [dates, setDates] = useState(sundays)
  const [selectedDate, setSelectedDate] = useState(sundays[0] || '')
  const [entries, setEntries] = useState(() => sundays[0] ? [newEntry(sundays[0])] : [])
  const [newDate, setNewDate] = useState('')
  const [error, setError] = useState('')
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
    setEntries(current => [...current, ...current.filter(item => item.service_date === from).map(item => ({ ...structuredClone(item), service_date: to }))])
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
      if (!item.ministry_ids.length || item.ministry_ids.some(id => !activePositions(id).length)) { setSelectedDate(item.service_date); setError('schedMonth.directMinistryRequired'); return }
    }
    onSave({ month, entries: [...entries].sort((a, b) => a.service_date.localeCompare(b.service_date)).map(item => ({
      ...item, title: item.title.trim(), class_session_no: item.source_type === 'Kelas' ? Number(item.class_session_no) || 1 : null,
      event_id: item.source_type === 'Event' ? item.event_id : null, class_id: item.source_type === 'Kelas' ? item.class_id : null,
    })) })
  }
  return <Modal title={t('schedMonth.createMonth')} onClose={onClose} busy={busy}><form onSubmit={submit}>
    <div className="monthly-dialog-body">
      <div className="monthly-direct-toolbar"><h3 className="monthly-subheading">{t('schedMonth.dates')}</h3>
        <div className="monthly-inline"><Input type="date" min={month + '-01'} max={maxDate} label={t('schedMonth.addDate')} value={newDate} disabled={busy} onChange={event => setNewDate(event.target.value)} /><Button type="button" variant="outline" disabled={!newDate || busy || newDate.slice(0, 7) !== month || dates.includes(newDate)} onClick={() => { setDates(current => [...current, newDate].sort()); setSelectedDate(newDate); setNewDate(''); setError('') }} aria-label={t('schedMonth.addDate')} title={t('schedMonth.addDate')}><Plus size={18} /></Button></div>
      </div>
      <div className="monthly-direct-dates" role="tablist" aria-label={t('schedMonth.dates')}>{dates.map(date => <div className="monthly-direct-date" key={date}>
        <button type="button" role="tab" aria-selected={selectedDate === date} onClick={() => setSelectedDate(date)} disabled={busy}>{dateLabel(date)} <span>{entries.filter(item => item.service_date === date).length}</span></button>
        <Button type="button" variant="ghost" disabled={busy || dates.length === 1} onClick={() => { const remaining = dates.filter(item => item !== date); setDates(remaining); setEntries(current => current.filter(item => item.service_date !== date)); if (selectedDate === date) setSelectedDate(remaining[0] || ''); setError('') }} aria-label={t('schedMonth.removeDate', { date })} title={t('schedMonth.removeDate', { date })}><X size={14} /></Button>
      </div>)}</div>
      <div className="monthly-direct-actions"><h3 className="monthly-subheading">{t('schedMonth.activitiesOnDate', { date: dateLabel(selectedDate) })}</h3><div className="monthly-direct-commands">
        {!dateEntries.length && previousDate && <Button type="button" variant="outline" disabled={busy} onClick={() => copyDate(previousDate, selectedDate)}><Copy size={16} />{t('schedMonth.copyPreviousDate')}</Button>}
        {!!dateEntries.length && !!emptyLaterDates.length && <Button type="button" variant="outline" disabled={busy} onClick={() => { setEntries(current => [...current, ...emptyLaterDates.flatMap(date => dateEntries.map(item => ({ ...structuredClone(item), service_date: date })))]); setError('') }}><Copy size={16} />{t('schedMonth.copyToEmptyDates')}</Button>}
        <Button type="button" variant="outline" disabled={busy || sectionCount >= 12} onClick={() => { setEntries(current => [...current, newEntry(selectedDate)]); setError('') }}><Plus size={16} />{t('schedMonth.addActivity')}</Button>
      </div></div>
      {!dateEntries.length && <p className="monthly-muted">{t('schedMonth.directDateEmpty')}</p>}
      {dateEntries.map((item, index) => <section className="monthly-direct-entry" key={item.section_id}>
        <div className="monthly-direct-entry-heading"><h4>{t('schedMonth.activityNumber', { number: index + 1 })}</h4><Button type="button" variant="ghost" disabled={busy} onClick={() => { setEntries(current => current.filter(entry => entry !== item)); setError('') }} aria-label={t('schedMonth.removeActivity')} title={t('schedMonth.removeActivity')}><Trash2 size={16} /></Button></div>
        <div className="monthly-editor-grid">
          <Input label={t('sched.scheduleTitle')} required maxLength={120} value={item.title} disabled={busy} onChange={event => updateEntry(item, { title: event.target.value })} />
          <Select label={t('sched.sourceType')} value={item.source_type} disabled={busy} onChange={event => updateEntry(item, { source_type: event.target.value, event_id: null, class_id: null, class_session_no: event.target.value === 'Kelas' ? 1 : null })}>{['Ibadah', 'Kelas', 'Event'].map(type => <option key={type} value={type}>{t('sched.source.' + type)}</option>)}</Select>
          {item.source_type === 'Kelas' && <><Select required label={t('sched.class')} value={item.class_id || ''} disabled={busy} onChange={event => updateEntry(item, { class_id: event.target.value })}><option value="">{t('sched.chooseClass')}</option>{classes.map(row => <option key={row.class_id} value={row.class_id}>{row.name}</option>)}</Select><Input required type="number" min="1" max="1000" label={t('sched.sessionNo')} value={item.class_session_no || 1} disabled={busy} onChange={event => updateEntry(item, { class_session_no: Number(event.target.value) })} /></>}
          {item.source_type === 'Event' && <Select required label={t('sched.event')} value={item.event_id || ''} disabled={busy} onChange={event => updateEntry(item, { event_id: event.target.value })}><option value="">{t('sched.chooseEvent')}</option>{events.map(row => <option key={row.event_id} value={row.event_id}>{row.name || row.title}</option>)}</Select>}
          <Input required type="time" label={t('sched.startTime')} value={item.start_time} disabled={busy} onChange={event => updateEntry(item, { start_time: event.target.value })} />
          <Input required type="time" label={t('sched.endTime')} value={item.end_time} disabled={busy} onChange={event => updateEntry(item, { end_time: event.target.value })} />
        </div>
        <fieldset className="monthly-direct-ministries"><legend>{t('sched.ministry')}</legend><div className="monthly-direct-ministry-options">{ministries.map(ministry => <Checkbox key={ministry.ministry_id} label={ministry.name} checked={item.ministry_ids.includes(ministry.ministry_id)} disabled={busy || !activePositions(ministry.ministry_id).length} onChange={event => updateEntry(item, { ministry_ids: event.target.checked ? [...item.ministry_ids, ministry.ministry_id] : item.ministry_ids.filter(id => id !== ministry.ministry_id) })} />)}</div>
          {item.ministry_ids.map(id => { const ministry = ministries.find(row => row.ministry_id === id); const available = activePositions(id); const capacity = available.reduce((sum, row) => sum + (row.default_slots || 1), 0); return <p className="monthly-direct-positions" key={id}>{ministry?.name}: {available.map(row => row.name).join(', ')} ({t('schedMonth.capacity', { count: capacity })})</p> })}
          {!ministries.some(ministry => activePositions(ministry.ministry_id).length) && <p className="monthly-error" role="alert">{t('schedMonth.noPositionsForPart')}</p>}
        </fieldset>
        <details className="monthly-direct-details"><summary>{t('schedMonth.moreDetails')}</summary><div className="monthly-editor-grid">
          <Input label={t('sched.location')} value={item.location} maxLength={160} disabled={busy} onChange={event => updateEntry(item, { location: event.target.value })} />
          <Input label={t('sched.dressCode')} value={item.dress_code} maxLength={120} disabled={busy} onChange={event => updateEntry(item, { dress_code: event.target.value })} />
          <Input label={t('schedMonth.pic')} value={item.pic} maxLength={120} disabled={busy} onChange={event => updateEntry(item, { pic: event.target.value })} />
        </div><Textarea label={t('sched.notes')} maxLength={1000} value={item.notes} disabled={busy} onChange={event => updateEntry(item, { notes: event.target.value })} /></details>
      </section>)}
      {error && <p className="monthly-error" role="alert">{t(error)}</p>}
    </div><footer className="monthly-dialog-footer"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" disabled={!entries.length} loading={busy}><CalendarDays size={16} />{t('sched.createDraft')}</Button></footer>
  </form></Modal>
}

function PositionEditor({ context, api, canManageAll, onClose, onSave, busy }) {
  const { t } = useLang()
  const { occurrence, position, roster, slots } = context
  const [selected, setSelected] = useState(() => slots.filter(slot => slot.user_id).map(slot => slot.user_id))
  const [query, setQuery] = useState('')
  const [members, setMembers] = useState([])
  const [names, setNames] = useState(() => new Map(slots.filter(slot => slot.user_id).map(slot => [slot.user_id, slot.users?.name || t('schedMonth.unavailableMember')])))
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [conflicts, setConflicts] = useState([])
  useEffect(() => {
    let active = true
    setLoading(true)
    const timer = setTimeout(() => api.listMembers(position.ministry_id, query, canManageAll)
      .then(rows => { if (active) { setMembers(rows); setNames(current => new Map([...current, ...rows.map(item => [item.user_id, item.name])])) } })
      .catch(() => { if (active) { setMembers([]); setError('schedMonth.membersFailed') } })
      .finally(() => { if (active) setLoading(false) }), 200)
    return () => { active = false; clearTimeout(timer) }
  }, [api, canManageAll, position.ministry_id, query])
  async function submit(event) {
    event.preventDefault(); setChecking(true); setError(''); setConflicts([])
    try {
      const findings = []
      for (const userId of selected) {
        const ownSlot = slots.find(slot => slot.user_id === userId)
        const rows = await api.findConflicts(userId, roster.roster_id, ownSlot?.slot_id)
        for (const item of rows) findings.push({ ...item, memberName: names.get(userId) || '-' })
      }
      if (findings.length) { setConflicts(findings); return }
      await onSave({ rosterId: roster.roster_id, positionId: position.position_id, userIds: selected,
        expectedUserIds: slots.filter(slot => slot.user_id).map(slot => slot.user_id) })
    } catch (err) { setError(errorKey(err)) }
    finally { setChecking(false) }
  }
  return <Modal title={t('sched.chooseMember')} onClose={onClose} busy={busy || checking}><form onSubmit={submit}>
    <div className="monthly-dialog-body"><div className="monthly-context"><strong>{position.name} / {occurrence.title}</strong><span>{occurrence.service_date} / {timeLabel(occurrence)} / {position.ministry_name}</span></div>
      <Input icon={Search} aria-label={t('sched.searchMember')} placeholder={t('sched.searchMember')} value={query} disabled={busy || checking} onChange={event => setQuery(event.target.value)} />
      <p className="monthly-muted">{t('schedMonth.selectedCount', { count: selected.length, capacity: slots.length })}</p>
      {!!selected.length && <div className="monthly-date-picks">{selected.map(id => <Button type="button" key={id} variant="outline" disabled={busy || checking} onClick={() => { setSelected(current => current.filter(item => item !== id)); setConflicts([]) }} aria-label={t('schedMonth.removeMember', { name: names.get(id) || '-' })}>{names.get(id) || '-'}<X size={14} /></Button>)}</div>}
      <div className="monthly-member-list">{loading ? <Spinner size="sm" /> : !members.length ? <p>{t('sched.noMembers')}</p> : members.map(member => <Checkbox key={member.user_id} label={member.name} checked={selected.includes(member.user_id)} disabled={busy || checking || (!selected.includes(member.user_id) && selected.length >= slots.length)} onChange={event => { setSelected(current => event.target.checked ? [...current, member.user_id] : current.filter(id => id !== member.user_id)); setConflicts([]) }} />)}</div>
      {conflicts.length > 0 && <div className="monthly-error" role="alert"><strong>{t('schedMonth.conflictBlocked')}</strong>{conflicts.map((item, index) => <p key={index}>{t('schedMonth.conflictItem', { name: item.memberName, title: item.title, date: item.service_date, time: timeLabel(item), position: item.position_names, ministry: item.ministry_name })}</p>)}</div>}
      {error && <p className="monthly-error" role="alert">{t(error)}</p>}
    </div><footer className="monthly-dialog-footer"><Button type="button" variant="outline" disabled={busy || checking} onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" loading={busy || checking}><Save size={16} />{t('schedMonth.saveAssignments')}</Button></footer>
  </form></Modal>
}


function OccurrenceEditor({ occurrence, month, onClose, onSave, busy }) {
  const { t } = useLang()
  const [form, setForm] = useState({ title: occurrence.title, service_date: occurrence.service_date, start_time: String(occurrence.start_time).slice(0, 5), end_time: String(occurrence.end_time).slice(0, 5), location: occurrence.location || '', dress_code: occurrence.dress_code || '', notes: occurrence.notes || '', pic: occurrence.pic || '' })
  const [error, setError] = useState('')
  const field = (key, label, type = 'text', required = false) => <Input key={key} label={t(label)} type={type} required={required} disabled={busy} value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} />
  return <Modal title={t('schedMonth.editOccurrence')} onClose={onClose} busy={busy}><form onSubmit={event => { event.preventDefault(); if (form.end_time <= form.start_time) { setError('schedMonth.invalidTime'); return } if (form.service_date.slice(0, 7) !== month) { setError('schedMonth.dateOutsideMonth'); return } onSave(form) }}><div className="monthly-dialog-body"><div className="monthly-editor-grid">{field('title', 'sched.scheduleTitle', 'text', true)}{field('service_date', 'sched.date', 'date', true)}{field('start_time', 'sched.startTime', 'time', true)}{field('end_time', 'sched.endTime', 'time', true)}{field('location', 'sched.location')}{field('dress_code', 'sched.dressCode')}{field('pic', 'schedMonth.pic')}</div><Textarea label={t('sched.notes')} value={form.notes} disabled={busy} maxLength={1000} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} />{error && <p className="monthly-error" role="alert">{t(error)}</p>}</div><footer className="monthly-dialog-footer"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" loading={busy}><Save size={16} />{t('common.save')}</Button></footer></form></Modal>
}
