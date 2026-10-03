import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BellRing, CalendarDays, ChevronLeft, ChevronRight, Copy, Plus, Printer, RefreshCw, Save, Search, Send, Settings2, Trash2, X } from 'lucide-react'
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
const newSection = () => ({ section_id: `SEC-${crypto.randomUUID()}`, title: '', source_type: 'Ibadah',
  event_id: null, class_id: null, class_session_no: null, start_time: '', end_time: '', location: '', dress_code: '', notes: '', parts: [] })
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
  const [templates, setTemplates] = useState([])
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
  const [templateEditor, setTemplateEditor] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [positionEditor, setPositionEditor] = useState(null)
  const [partEditor, setPartEditor] = useState(null)
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
      const [templateRows, positionRows, ministryRows, eventRows, classRows] = await Promise.all([
        api.listTemplates(), api.listPositions(), api.listMinistries(), api.listEvents(), api.listClasses(),
      ])
      if (request !== catalogRequest.current) return
      setTemplates(templateRows); setPositions(positionRows); setMinistries(ministryRows)
      setEvents(eventRows); setClasses(classRows)
    } catch (error) { if (request === catalogRequest.current) setLoadError(errorKey(error)) }
  }, [api, profile])

  useEffect(() => {
    setGrants(null); setSchedule(null); setMonthId(''); setTemplates([])
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
      {[['monthly', 'schedMonth.monthly'], ...(canManageAll ? [['templates', 'schedMonth.templates'], ['settings', 'sched.accessPositions']] : []), ...(renderLegacy ? [['legacy', 'schedMonth.legacy']] : [])].map(([id, label]) => <button type="button" key={id} disabled={busy} aria-pressed={view === id} onClick={() => setView(id)}>{t(label)}</button>)}
    </nav>
    {loadError && <div className="monthly-error" role="alert">{t(loadError)}<Button variant="outline" onClick={reload}>{t('schedMonth.retry')}</Button></div>}
    {view === 'settings' && canManageAll ? <ScheduleAccessPositions api={api} ministries={ministries} positions={positions} onChange={async () => { await loadCatalog(); await reloadSchedule() }} ministryHref={ministryHref} /> : view === 'legacy' ? renderLegacy?.(view) : view === 'templates' && canManageAll ? <section>
      <div className="monthly-toolbar"><h2>{t('schedMonth.templates')}</h2><Button onClick={() => setTemplateEditor({ name: '', definition: { sections: [newSection()] } })}><Plus size={16} />{t('schedMonth.newTemplate')}</Button></div>
      {!templates.length ? <EmptyState icon={Settings2} title={t('schedMonth.noTemplates')} /> : <div className="monthly-template-list">{templates.map(template => <div key={template.template_id} className="monthly-template-item"><div><h3>{template.name}</h3><p>{t('schedMonth.sectionCount', { count: template.definition.sections.length })}</p></div><Button variant="outline" onClick={() => setTemplateEditor(structuredClone(template))} aria-label={t('schedMonth.editTemplate')} title={t('schedMonth.editTemplate')}><Settings2 size={17} /></Button><Button variant="outline" onClick={() => setTemplateEditor({ ...structuredClone(template), template_id: undefined, name: t('schedMonth.copyName', { name: template.name }) })} aria-label={t('schedMonth.copyTemplate')} title={t('schedMonth.copyTemplate')}><Copy size={17} /></Button></div>)}</div>}
    </section> : <>
      <div className="monthly-toolbar">
        <div className="monthly-month"><Button variant="outline" disabled={busy} aria-label={t('schedMonth.previousMonth')} title={t('schedMonth.previousMonth')} onClick={() => setMonth(shiftScheduleMonth(month, -1).slice(0, 7))}><ChevronLeft size={18} /></Button><Input type="month" aria-label={t('sched.month')} value={month} disabled={busy} onChange={event => event.target.value && setMonth(event.target.value)} /><Button variant="outline" disabled={busy} aria-label={t('sched.nextMonth')} title={t('sched.nextMonth')} onClick={() => setMonth(shiftScheduleMonth(month, 1).slice(0, 7))}><ChevronRight size={18} /></Button></div>
        {months.length > 1 && <Select aria-label={t('schedMonth.monthVersion')} disabled={busy} value={monthId} onChange={event => setMonthId(event.target.value)}>{months.map(item => <option key={item.month_id} value={item.month_id}>{item.name} / {t(`sched.status.${item.status}`)}</option>)}</Select>}
        {canManageAll && !months.some(item => item.status !== 'Dibatalkan') && <Button onClick={() => setCreateOpen(true)} disabled={!templates.length || busy}><Plus size={16} />{t('schedMonth.createMonth')}</Button>}
        {schedule && <Button variant="outline" onClick={exportPdf} disabled={busy}><Printer size={16} />{t('sched.pdf')}</Button>}
        {canManageAll && isDraft && <Button onClick={publishMonth} disabled={busy || loading} loading={busy}><Send size={16} />{t('schedMonth.publishMonth')}</Button>}
        {canManageAll && schedule?.month.status === 'Terbit' && <Button variant="outline" onClick={sendReminder} disabled={busy || loading} loading={busy}><BellRing size={16} />{t('sched.remind')}</Button>}
        {canManageAll && schedule?.month.status === 'Terbit' && <Button variant="danger" onClick={cancelMonth} disabled={busy || loading} loading={busy}>{t('schedMonth.cancelMonth')}</Button>}
      </div>
      {loading ? <div className="py-16 text-center"><Spinner /></div> : !schedule ? <EmptyState icon={CalendarDays} title={t('schedMonth.emptyMonth')} description={t(canManageAll ? (!templates.length ? 'schedMonth.createTemplateFirst' : 'schedMonth.emptyMonthAdmin') : 'schedMonth.emptyMonthManager')} action={canManageAll && !templates.length ? <Button onClick={() => setView('templates')}><Plus size={16} />{t('schedMonth.newTemplate')}</Button> : undefined} /> : <>
        <div className="monthly-toolbar monthly-filters"><Select aria-label={t('schedMonth.filterActivity')} value={activityFilter} onChange={event => setActivityFilter(event.target.value)}><option value="">{t('schedMonth.allActivities')}</option>{schedule.sections.map(item => <option key={item.key} value={item.key}>{item.title}</option>)}</Select><Select aria-label={t('schedMonth.filterMinistry')} value={ministryFilter} onChange={event => setMinistryFilter(event.target.value)}><option value="">{t('schedMonth.allMinistries')}</option>{ministries.map(item => <option key={item.ministry_id} value={item.ministry_id}>{item.name}</option>)}</Select><Badge color={statusColor(schedule.month.status)}>{t(`sched.status.${schedule.month.status}`)}</Badge><span className="monthly-summary">{t('schedMonth.fillSummary', { assigned: matrix.stats.assigned, capacity: matrix.stats.capacity })}</span></div>
        <MonthlyScheduleMatrix schedule={schedule} managedMinistryIds={managedMinistryIds} canManageAll={canManageAll} ministryFilter={ministryFilter} activityFilter={activityFilter} selectedDate={selectedDate} onDateChange={setSelectedDate} readonly={busy} onEditPosition={setPositionEditor} onEditPart={({ part, occurrence }) => setPartEditor({ ...part, occurrence })} onEditOccurrence={setOccurrenceEditor} />
      </>}
    </>}
    {templateEditor && <TemplateEditor template={templateEditor} positions={positions} ministries={ministries} events={events} classes={classes} onClose={() => setTemplateEditor(null)} busy={busy} onSave={payload => save(async () => { await api.saveTemplate(payload); await loadCatalog() }, () => setTemplateEditor(null), 'schedMonth.templateSaved')} />}
    {createOpen && <MonthCreator templates={templates} month={month} busy={busy} onClose={() => setCreateOpen(false)} onSave={payload => save(async () => { const id = await api.createMonth(payload); await loadMonths(); setMonthId(id) }, () => setCreateOpen(false), 'schedMonth.monthCreated', false)} />}
    {positionEditor && <PositionEditor context={positionEditor} api={api} canManageAll={canManageAll} busy={busy} onClose={() => setPositionEditor(null)} onSave={payload => save(() => api.setPosition(payload), () => setPositionEditor(null), 'sched.assignmentSaved')} />}
    {partEditor && <PartEditor part={partEditor} busy={busy} onClose={() => setPartEditor(null)} onSave={data => save(() => api.updatePart(partEditor.roster_id, data), () => setPartEditor(null))} />}
    {occurrenceEditor && <OccurrenceEditor occurrence={occurrenceEditor} month={month} busy={busy} onClose={() => setOccurrenceEditor(null)} onSave={data => save(() => api.updateOccurrence(occurrenceEditor.occurrence_id, data), () => setOccurrenceEditor(null))} />}
  </div>
}

function TemplateEditor({ template, positions, ministries, events, classes, onClose, onSave, busy }) {
  const { t } = useLang()
  const [draft, setDraft] = useState(() => structuredClone(template))
  const [error, setError] = useState('')
  const sections = draft.definition.sections
  function updateSection(index, data) {
    setDraft(current => ({ ...current, definition: { sections: current.definition.sections.map((section, i) => i === index ? { ...section, ...data } : section) } }))
  }
  function changePart(sectionIndex, partIndex, data) {
    updateSection(sectionIndex, { parts: sections[sectionIndex].parts.map((part, i) => i === partIndex ? { ...part, ...data } : part) })
  }
  function togglePosition(sectionIndex, partIndex, position) {
    const selected = sections[sectionIndex].parts[partIndex].positions
    changePart(sectionIndex, partIndex, { positions: selected.some(item => item.position_id === position.position_id)
      ? selected.filter(item => item.position_id !== position.position_id)
      : [...selected, { position_id: position.position_id, capacity: position.default_slots || 1 }] })
  }
  function submit(event) {
    event.preventDefault()
    if (!sections.length || sections.some(section => !section.parts.length || section.parts.some(part => !part.positions.length))) { setError('schedMonth.positionsRequired'); return }
    if (sections.some(section => section.end_time <= section.start_time)) { setError('schedMonth.invalidTime'); return }
    setError(''); onSave({ ...draft, definition: { sections: sections.map(section => ({ ...section,
      class_session_no: section.source_type === 'Kelas' ? Number(section.class_session_no) || 1 : null,
    })) } })
  }
  return <Modal title={t(template.template_id ? 'schedMonth.editTemplate' : 'schedMonth.newTemplate')} onClose={onClose} busy={busy}>
    <form onSubmit={submit}>
      <div className="monthly-dialog-body"><Input label={t('schedMonth.templateName')} value={draft.name} required maxLength={120} disabled={busy} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} />
        {sections.map((section, index) => <fieldset key={section.section_id} className="monthly-section-editor">
          <legend>{t('schedMonth.activityNumber', { number: index + 1 })}</legend>
          <div className="monthly-editor-grid">
            <Input label={t('sched.scheduleTitle')} required maxLength={120} value={section.title} disabled={busy} onChange={event => updateSection(index, { title: event.target.value })} />
            <Select label={t('sched.sourceType')} value={section.source_type} disabled={busy} onChange={event => updateSection(index, { source_type: event.target.value, event_id: null, class_id: null, class_session_no: event.target.value === 'Kelas' ? 1 : null })}>{['Ibadah', 'Kelas', 'Event'].map(type => <option key={type} value={type}>{t(`sched.source.${type}`)}</option>)}</Select>
            {section.source_type === 'Kelas' && <><Select required label={t('sched.class')} value={section.class_id || ''} disabled={busy} onChange={event => updateSection(index, { class_id: event.target.value })}><option value="">{t('sched.chooseClass')}</option>{classes.map(item => <option key={item.class_id} value={item.class_id}>{item.name}</option>)}</Select><Input required type="number" min="1" max="1000" label={t('sched.sessionNo')} value={section.class_session_no || 1} disabled={busy} onChange={event => updateSection(index, { class_session_no: Number(event.target.value) })} /></>}
            {section.source_type === 'Event' && <Select required label={t('sched.event')} value={section.event_id || ''} disabled={busy} onChange={event => updateSection(index, { event_id: event.target.value })}><option value="">{t('sched.chooseEvent')}</option>{events.map(item => <option key={item.event_id} value={item.event_id}>{item.name}</option>)}</Select>}
            <Input required label={t('sched.startTime')} type="time" value={section.start_time} disabled={busy} onChange={event => updateSection(index, { start_time: event.target.value })} /><Input required label={t('sched.endTime')} type="time" value={section.end_time} disabled={busy} onChange={event => updateSection(index, { end_time: event.target.value })} />
            <Input label={t('sched.location')} value={section.location || ''} maxLength={160} disabled={busy} onChange={event => updateSection(index, { location: event.target.value })} /><Input label={t('sched.dressCode')} value={section.dress_code || ''} maxLength={120} disabled={busy} onChange={event => updateSection(index, { dress_code: event.target.value })} />
          </div>
          {section.parts.map((part, partIndex) => <div className="monthly-part-editor" key={part.ministry_id}>
            <div className="monthly-inline"><Select label={t('sched.ministry')} value={part.ministry_id} disabled={busy} onChange={event => changePart(index, partIndex, { ministry_id: event.target.value, positions: [] })}>{ministries.filter(item => item.ministry_id === part.ministry_id || !section.parts.some(existing => existing.ministry_id === item.ministry_id)).map(item => <option key={item.ministry_id} value={item.ministry_id}>{item.name}</option>)}</Select><Button type="button" variant="ghost" disabled={busy} aria-label={t('schedMonth.removePart')} title={t('schedMonth.removePart')} onClick={() => updateSection(index, { parts: section.parts.filter((item, i) => i !== partIndex) })}><Trash2 size={17} /></Button></div>
            <div className="monthly-position-options">{positions.filter(position => position.is_active && position.ministry_id === part.ministry_id).map(position => {
              const selection = part.positions.find(item => item.position_id === position.position_id)
              return <div className="monthly-inline" key={position.position_id}><Checkbox label={position.name} checked={!!selection} disabled={busy} onChange={() => togglePosition(index, partIndex, position)} />{selection && <Input type="number" min="1" max="20" required value={selection.capacity} disabled={busy} aria-label={t('schedMonth.positionCapacity', { position: position.name })} onChange={event => changePart(index, partIndex, { positions: part.positions.map(item => item.position_id === position.position_id ? { ...item, capacity: Number(event.target.value) } : item) })} />}</div>
            })}{!positions.some(position => position.is_active && position.ministry_id === part.ministry_id) && <p className="monthly-muted">{t('schedMonth.noPositionsForPart')}</p>}</div>
          </div>)}
          <div className="monthly-inline"><Button type="button" variant="outline" disabled={busy || section.parts.length >= ministries.length} onClick={() => { const ministry = ministries.find(item => !section.parts.some(part => part.ministry_id === item.ministry_id)); if (ministry) updateSection(index, { parts: [...section.parts, { ministry_id: ministry.ministry_id, positions: [] }] }) }}><Plus size={16} />{t('schedMonth.addPart')}</Button><Button type="button" variant="ghost" disabled={busy || sections.length === 1} onClick={() => setDraft(current => ({ ...current, definition: { sections: sections.filter((item, i) => i !== index) } }))}><Trash2 size={16} />{t('schedMonth.removeActivity')}</Button></div>
        </fieldset>)}
        <Button type="button" variant="outline" disabled={busy || sections.length >= 12} onClick={() => setDraft(current => ({ ...current, definition: { sections: [...sections, newSection()] } }))}><Plus size={16} />{t('schedMonth.addActivity')}</Button>
        {error && <p className="monthly-error" role="alert">{t(error)}</p>}
      </div>
      <footer className="monthly-dialog-footer"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" loading={busy}><Save size={16} />{t('common.save')}</Button></footer>
    </form>
  </Modal>
}

function MonthCreator({ templates, month, onClose, onSave, busy }) {
  const { t, lang } = useLang()
  const [templateId, setTemplateId] = useState(templates[0]?.template_id || '')
  const [dates, setDates] = useState(() => getMonthDates(month))
  const [newDate, setNewDate] = useState('')
  const [year, number] = month.split('-').map(Number)
  const maxDate = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10)
  return <Modal title={t('schedMonth.createMonth')} onClose={onClose} busy={busy}><form onSubmit={event => { event.preventDefault(); if (dates.length) onSave({ templateId, month, dates: [...dates].sort() }) }}>
    <div className="monthly-dialog-body"><Select required label={t('schedMonth.template')} value={templateId} disabled={busy} onChange={event => setTemplateId(event.target.value)}>{templates.map(item => <option key={item.template_id} value={item.template_id}>{item.name}</option>)}</Select>
      <h3 className="monthly-subheading">{t('schedMonth.dates')}</h3>
      <div className="monthly-date-picks">{dates.map(date => <Button key={date} type="button" variant="outline" disabled={busy} onClick={() => setDates(current => current.filter(item => item !== date))} aria-label={t('schedMonth.removeDate', { date })}><span>{new Date(`${date}T00:00:00Z`).toLocaleDateString(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span><X size={14} /></Button>)}</div>
      <div className="monthly-inline"><Input type="date" min={`${month}-01`} max={maxDate} label={t('schedMonth.addDate')} value={newDate} disabled={busy} onChange={event => setNewDate(event.target.value)} /><Button type="button" variant="outline" disabled={!newDate || busy || newDate.slice(0, 7) !== month || dates.includes(newDate)} onClick={() => { setDates(current => [...current, newDate].sort()); setNewDate('') }} aria-label={t('schedMonth.addDate')} title={t('schedMonth.addDate')}><Plus size={18} /></Button></div>
    </div><footer className="monthly-dialog-footer"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" disabled={!dates.length} loading={busy}><CalendarDays size={16} />{t('sched.createDraft')}</Button></footer>
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

function PartEditor({ part, onClose, onSave, busy }) {
  const { t } = useLang()
  const [form, setForm] = useState({ team_name: part.team_name || '', material: part.material || '', notes: part.notes || '' })
  return <Modal title={t('schedMonth.editPartTitle')} onClose={onClose} busy={busy}><form onSubmit={event => { event.preventDefault(); onSave(form) }}><div className="monthly-dialog-body"><div className="monthly-context"><strong>{part.ministry_name}</strong><span>{part.occurrence.title} / {part.occurrence.service_date}</span></div>{[['team_name', 'schedMonth.team'], ['material', 'schedMonth.material']].map(([key, label]) => <Input key={key} label={t(label)} maxLength={120} disabled={busy} value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} />)}<Textarea label={t('sched.notes')} maxLength={1000} disabled={busy} value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} /></div><footer className="monthly-dialog-footer"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" loading={busy}><Save size={16} />{t('common.save')}</Button></footer></form></Modal>
}

function OccurrenceEditor({ occurrence, month, onClose, onSave, busy }) {
  const { t } = useLang()
  const [form, setForm] = useState({ title: occurrence.title, service_date: occurrence.service_date, start_time: String(occurrence.start_time).slice(0, 5), end_time: String(occurrence.end_time).slice(0, 5), location: occurrence.location || '', dress_code: occurrence.dress_code || '', notes: occurrence.notes || '', pic: occurrence.pic || '' })
  const [error, setError] = useState('')
  const field = (key, label, type = 'text', required = false) => <Input key={key} label={t(label)} type={type} required={required} disabled={busy} value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} />
  return <Modal title={t('schedMonth.editOccurrence')} onClose={onClose} busy={busy}><form onSubmit={event => { event.preventDefault(); if (form.end_time <= form.start_time) { setError('schedMonth.invalidTime'); return } if (form.service_date.slice(0, 7) !== month) { setError('schedMonth.dateOutsideMonth'); return } onSave(form) }}><div className="monthly-dialog-body"><div className="monthly-editor-grid">{field('title', 'sched.scheduleTitle', 'text', true)}{field('service_date', 'sched.date', 'date', true)}{field('start_time', 'sched.startTime', 'time', true)}{field('end_time', 'sched.endTime', 'time', true)}{field('location', 'sched.location')}{field('dress_code', 'sched.dressCode')}{field('pic', 'schedMonth.pic')}</div><Textarea label={t('sched.notes')} value={form.notes} disabled={busy} maxLength={1000} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} />{error && <p className="monthly-error" role="alert">{t(error)}</p>}</div><footer className="monthly-dialog-footer"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" loading={busy}><Save size={16} />{t('common.save')}</Button></footer></form></Modal>
}
