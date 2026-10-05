import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BellRing, CalendarClock, ChevronLeft, MapPin, Plus, Printer, Search, Trash2, UserRound, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { useToast } from '@/hooks/useToast'
import { eventsService, classesService } from '@/services/contentService'
import { serviceRosterService } from '@/services/serviceRosterService'
import { printArchive } from '@/lib/printDoc'
import { formatDate } from '@/lib/utils'
import { Avatar, Badge, Button, Card, EmptyState, Input, PageHeader, Select, Spinner, Textarea } from '@/components/ui'

const nowMonth = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
const followingMonth = value => {
  const [year, month] = value.split('-').map(Number)
  return String(year + (month === 12 ? 1 : 0)) + '-' + String(month === 12 ? 1 : month + 1).padStart(2, '0')
}
const emptyForm = ministry_id => ({
  ministry_id: ministry_id || '', source_type: 'Ibadah', event_id: '', class_id: '',
  class_session_no: 1, title: '', service_date: '', start_time: '', end_time: '',
  location: '', dress_code: '', notes: '',
})
const timeText = r => [r.start_time, r.end_time].filter(Boolean).map(v => String(v).slice(0, 5)).join('-')
const completion = r => {
  const slots = r.service_roster_slots || []
  return { filled: slots.filter(s => s.user_id).length, total: slots.length }
}
const badgeColor = status => status === 'Terbit' ? 'green' : status === 'Dibatalkan' ? 'red' : 'amber'

function ScheduleCard({ roster, mine, onClick, t }) {
  const count = completion(roster)
  const roles = mine
    ? (roster.service_roster_slots || []).filter(s => s.user_id === mine).map(s => s.ministry_service_positions?.name).filter(Boolean)
    : []
  return (
    <button type="button" onClick={onClick} className="w-full min-h-11 text-left">
      <Card className="p-4 hover:bg-control">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <span className="text-[10px] uppercase">{new Date(`${roster.service_date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' })}</span>
            <b className="leading-4">{String(roster.service_date).slice(-2)}</b>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 font-semibold text-gray-900">{roster.title}</p>
              <Badge color={badgeColor(roster.status)}>{t(`sched.status.${roster.status}`)}</Badge>
            </div>
            <p className="mt-1 text-xs text-gray-500">{timeText(roster)}{roster.location ? ` · ${roster.location}` : ''}</p>
            <p className="mt-1 text-xs text-gray-500">
              {roles.length ? roles.join(', ') : t('sched.slotsFilled', count)} · {roster.ministries?.name || '-'}
            </p>
          </div>
        </div>
      </Card>
    </button>
  )
}

function Picker({ roster, slot, canPickAnyMember, onClose, onPick, t }) {
  const { confirm, toast } = useToast()
  const [query, setQuery] = useState('')
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [checkingId, setCheckingId] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    const request = canPickAnyMember
      ? serviceRosterService.searchActiveUsers(query)
      : serviceRosterService.listMinistryMembers(roster.ministry_id, query)
    request
      .then(rows => { if (active) setMembers(rows) })
      .catch(() => { if (active) setMembers([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [canPickAnyMember, query, roster.ministry_id])

  async function choose(member) {
    setCheckingId(member.user_id)
    try {
      const conflicts = await serviceRosterService.findConflicts(member.user_id, roster.roster_id, slot.slot_id)
      if (conflicts.length) {
        const details = conflicts.map(conflict => {
          const start = String(conflict.start_time || '').slice(0, 5)
          const end = String(conflict.end_time || '').slice(0, 5)
          const time = end ? `${start}-${end}` : t('sched.timeIncomplete', { start })
          const source = t(`sched.source.${conflict.source_type}`)
          return t('sched.conflictItem', {
            title: conflict.title,
            source,
            ministry: conflict.ministry_name,
            positions: conflict.position_names,
            time,
            location: conflict.location || '-',
          })
        })
        const proceed = await confirm({
          title: t('sched.conflictTitle'),
          message: t('sched.conflictMessage', {
            name: member.name,
            target: roster.title,
            time: timeText(roster),
            details: details.join('\n'),
          }),
          confirmText: t('sched.assignAnyway'), danger: true,
        })
        if (!proceed) return
      }
      await onPick(member.user_id, conflicts.length > 0)
    } catch {
      toast.error(t('sched.conflictCheckFailed'))
    } finally {
      setCheckingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 px-4 sm:items-center" role="dialog" aria-modal="true">
      <section className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-t-2xl border border-gray-200 bg-surface sm:rounded-2xl">
        <header className="flex items-center gap-3 border-b border-gray-100 p-4">
          <div className="min-w-0 flex-1"><h2 className="font-semibold text-gray-900">{t('sched.chooseMember')}</h2><p className="text-xs text-gray-500">{slot.ministry_service_positions?.name}</p></div>
          <button type="button" onClick={onClose} aria-label={t('sched.close')} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-control"><X size={18} /></button>
        </header>
        <div className="p-4"><Input icon={Search} value={query} onChange={e => setQuery(e.target.value)} placeholder={t('sched.searchMember')} /></div>
        <div className="max-h-[55vh] overflow-y-auto px-4 pb-4">
          {loading ? <div className="py-10 text-center"><Spinner size="sm" /></div> : members.length === 0
            ? <p className="py-10 text-center text-sm text-gray-500">{t('sched.noMembers')}</p>
            : members.map(member => (
              <button key={member.user_id} type="button" disabled={!!checkingId} onClick={() => choose(member)} className="flex min-h-14 w-full items-center gap-3 border-b border-gray-100 py-2 text-left last:border-0 hover:bg-control disabled:opacity-50">
                <Avatar name={member.name} src={member.photo_url} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{member.name}</span>
                {checkingId === member.user_id && <Spinner size="sm" />}
              </button>
            ))}
        </div>
      </section>
    </div>
  )
}

export default function ServiceSchedulesPage({ adminMode = false, initialTab = 'manage', legacyOnly = false, archiveOnly = false }) {
  const { profile } = useAuth()
  const { t } = useLang()
  const { toast, confirm } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedRosterId = searchParams.get('rosterId')
  const [tab, setTab] = useState(adminMode ? initialTab : 'mine')
  const [month, setMonth] = useState(nowMonth())
  const [managed, setManaged] = useState([])
  const [ministryId, setMinistryId] = useState('')
  const [rosters, setRosters] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [deepLinkLoading, setDeepLinkLoading] = useState(Boolean(requestedRosterId))
  const deepLinkRosterId = useRef(null)
  const [picker, setPicker] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [events, setEvents] = useState([])
  const [classes, setClasses] = useState([])
  const [busy, setBusy] = useState(false)
  const [positions, setPositions] = useState([])
  const [managers, setManagers] = useState([])
  const [managerQuery, setManagerQuery] = useState('')
  const [managerCandidates, setManagerCandidates] = useState([])
  const [managerRole, setManagerRole] = useState('Wakil')
  const [positionForm, setPositionForm] = useState({ name: '', default_slots: 1, sort_order: 0 })
  const [accessLoading, setAccessLoading] = useState(adminMode)

  const isAdmin = ['Admin', 'Super Admin'].includes(profile?.role)

  useEffect(() => {
    if (!requestedRosterId) {
      setDeepLinkLoading(false)
      const previousRosterId = deepLinkRosterId.current
      if (previousRosterId) {
        setSelected(current => current?.roster_id === previousRosterId ? null : current)
        deepLinkRosterId.current = null
      }
      return undefined
    }
    if (!profile?.user_id) return undefined
    let active = true
    deepLinkRosterId.current = requestedRosterId
    setDeepLinkLoading(true)
    serviceRosterService.getById(requestedRosterId)
      .then(roster => {
        if (!active) return
        if (!adminMode && !['Terbit', 'Dibatalkan'].includes(roster.status)) {
          throw new Error('Roster belum diterbitkan.')
        }
        setMonth(String(roster.service_date).slice(0, 7))
        setSelected(roster)
      })
      .catch(() => {
        if (!active) return
        setSelected(null)
        toast.error(t('sched.loadFailed'))
        setSearchParams(current => {
          const next = new URLSearchParams(current)
          next.delete('rosterId')
          return next
        }, { replace: true })
      })
      .finally(() => { if (active) setDeepLinkLoading(false) })
    return () => { active = false }
  }, [adminMode, profile?.user_id, requestedRosterId, setSearchParams, t, toast])

  function closeDetail() {
    setSelected(null)
    if (requestedRosterId) {
      setSearchParams(current => {
        const next = new URLSearchParams(current)
        next.delete('rosterId')
        return next
      }, { replace: true })
    }
  }

  useEffect(() => {
    if (!adminMode) return undefined
    let active = true
    Promise.all([serviceRosterService.listManagedMinistries(profile),
      archiveOnly ? Promise.resolve([]) : eventsService.getAll(),
      archiveOnly ? Promise.resolve([]) : classesService.getAll()])
      .then(([grants, eventRows, classRows]) => {
        if (!active) return
        setManaged(grants)
        setEvents(eventRows || [])
        setClasses(classRows || [])
        const first = grants[0]?.ministry_id || ''
        setMinistryId(first)
        setForm(emptyForm(first))
      })
      .catch(() => { if (active) toast.error(t('sched.loadFailed')) })
      .finally(() => { if (active) setAccessLoading(false) })
    return () => { active = false }
  }, [adminMode, archiveOnly, profile, t, toast])

  const load = useCallback(async () => {
    if (!profile?.user_id || archiveOnly) return
    setLoading(true)
    try {
      let rows = []
      if (tab === 'mine') rows = await serviceRosterService.listMine(profile.user_id, month)
      if (tab === 'all') rows = await serviceRosterService.listPublished(month)
      if (tab === 'manage' && ministryId) rows = await serviceRosterService.listManaged(month, ministryId, { legacyOnly })
      setRosters(rows)
    } catch {
      setRosters([])
      toast.error(t('sched.loadFailed'))
    } finally { setLoading(false) }
  }, [archiveOnly, legacyOnly, ministryId, month, profile?.user_id, t, tab, toast])

  useEffect(() => { load() }, [load])

  const loadSettings = useCallback(async () => {
    if (!ministryId) return
    try {
      const [positionRows, managerRows] = await Promise.all([
        serviceRosterService.listPositions(ministryId, { includeInactive: true }),
        isAdmin ? serviceRosterService.listManagers(ministryId) : Promise.resolve([]),
      ])
      setPositions(positionRows)
      setManagers(managerRows)
    } catch { toast.error(t('sched.loadFailed')) }
  }, [isAdmin, ministryId, t, toast])

  useEffect(() => { if (tab === 'settings') loadSettings() }, [loadSettings, tab])
  useEffect(() => {
    if (tab !== 'settings' || !managerQuery.trim()) { setManagerCandidates([]); return }
    const timer = setTimeout(() => serviceRosterService.searchActiveUsers(managerQuery).then(setManagerCandidates).catch(() => setManagerCandidates([])), 250)
    return () => clearTimeout(timer)
  }, [managerQuery, tab])

  function updateForm(key, value) { setForm(current => ({ ...current, [key]: value })) }
  function chooseEvent(id) {
    const item = events.find(row => row.event_id === id)
    setForm(current => ({ ...current, event_id: id, title: item?.name || current.title, service_date: item?.event_date || current.service_date, start_time: String(item?.event_time || current.start_time).slice(0, 5), location: item?.location || current.location }))
  }
  function chooseClass(id) {
    const item = classes.find(row => row.class_id === id)
    setForm(current => ({ ...current, class_id: id, title: item?.name || current.title, location: item?.location || current.location }))
  }

  async function createRoster(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const id = await serviceRosterService.create(form)
      setCreateOpen(false)
      setForm(emptyForm(ministryId))
      await load()
      setSelected(await serviceRosterService.getById(id))
      toast.success(t('sched.created'))
    } catch (error) { toast.error(error.message || t('sched.saveFailed')) }
    finally { setBusy(false) }
  }

  async function setSlot(slot, userId, allowConflict = false) {
    setBusy(true)
    try {
      await serviceRosterService.setSlot(slot.slot_id, userId, allowConflict)
      setSelected(await serviceRosterService.getById(selected.roster_id))
      setPicker(null)
      toast.success(t('sched.assignmentSaved'))
    } catch (error) {
      toast.error(error.message?.includes('schedule_conflict') ? t('sched.conflictChanged') : (error.message || t('sched.saveFailed')))
    }
    finally { setBusy(false) }
  }

  async function publish() {
    const count = completion(selected)
    let allowIncomplete = false
    if (count.filled < count.total) {
      allowIncomplete = await confirm({ title: t('sched.incompleteTitle'), message: t('sched.incompleteMessage', count), confirmText: t('sched.publishAnyway') })
      if (!allowIncomplete) return
    }
    setBusy(true)
    try {
      await serviceRosterService.publish(selected.roster_id, allowIncomplete)
      let push = { targetCount: count.filled }
      let notificationFailed = false
      try {
        push = await serviceRosterService.notify(selected.roster_id, 'Terbit')
        notificationFailed = push.failedRecipients > 0
      } catch {
        notificationFailed = true
      }
      setSelected(await serviceRosterService.getById(selected.roster_id))
      load()
      toast.success(t('sched.published', { count: push.targetCount || 0 }))
      if (notificationFailed) toast.info(t('sched.publishedPushFailed'), 5000)
    } catch (error) { toast.error(error.message || t('sched.saveFailed')) }
    finally { setBusy(false) }
  }

  async function cancelRoster() {
    if (!await confirm({ title: t('sched.cancelTitle'), message: t('sched.cancelMessage'), confirmText: t('sched.cancelRoster'), danger: true })) return
    setBusy(true)
    try {
      await serviceRosterService.cancel(selected.roster_id)
      let notificationFailed = false
      try {
        const push = await serviceRosterService.notify(selected.roster_id, 'Dibatalkan')
        notificationFailed = push.failedRecipients > 0
      } catch {
        notificationFailed = true
      }
      setSelected(null)
      load()
      toast.success(t('sched.cancelled'))
      if (notificationFailed) toast.info(t('sched.cancelPushFailed'), 5000)
    } catch (error) { toast.error(error.message || t('sched.saveFailed')) }
    finally { setBusy(false) }
  }

  async function sendReminder() {
    if (busy || !await confirm({
      title: t('sched.remindTitle'),
      message: t('sched.remindMessage'),
      confirmText: t('sched.remind'),
    })) return
    setBusy(true)
    try {
      const result = await serviceRosterService.notify(selected.roster_id, 'Manual')
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

  async function deleteDraft() {
    if (!await confirm({ title: t('sched.deleteTitle'), message: t('sched.deleteMessage'), confirmText: t('common.delete'), danger: true })) return
    try {
      await serviceRosterService.removeDraft(selected.roster_id)
      setSelected(null)
      load()
      toast.success(t('sched.deleted'))
    } catch (error) { toast.error(error.message || t('sched.saveFailed')) }
  }

  function exportRoster(roster) {
    const count = completion(roster)
    printArchive({
      title: t('sched.pdfTitle'), heading: roster.title,
      meta: [[t('sched.statusLabel'), t(`sched.status.${roster.status}`)], [t('sched.date'), formatDate(roster.service_date)], [t('sched.time'), timeText(roster)], [t('sched.location'), roster.location || '-'], [t('sched.ministry'), roster.ministries?.name || '-'], [t('sched.dressCode'), roster.dress_code || '-']],
      summary: [{ value: `${count.filled}/${count.total}`, label: t('sched.filledSlots') }],
      sections: [{ title: t('sched.team'), tableHeaders: [t('sched.position'), t('sched.member')], tableData: (roster.service_roster_slots || []).map(slot => [slot.ministry_service_positions?.name || '-', slot.users?.name || t('sched.emptySlot')]) }, ...(roster.notes ? [{ title: t('sched.notes'), text: roster.notes }] : [])],
      footer: t('sched.pdfFooter'),
    })
  }

  function exportMonth() {
    printArchive({
      title: t('sched.monthPdfTitle'),
      heading: `${managed.find(row => row.ministry_id === ministryId)?.name || ''} · ${month}`,
      summary: [{ value: rosters.length, label: t('sched.scheduleCount') }],
      sections: rosters.map(r => ({ title: `${formatDate(r.service_date)} · ${r.title}`, rows: [[t('sched.time'), timeText(r)], [t('sched.location'), r.location || '-'], [t('sched.statusLabel'), t(`sched.status.${r.status}`)], [t('sched.team'), (r.service_roster_slots || []).map(s => `${s.ministry_service_positions?.name}: ${s.users?.name || '-'}`).join('; ')]] })),
      footer: t('sched.pdfFooter'),
    })
  }

  async function savePosition(event) {
    event.preventDefault()
    try {
      await serviceRosterService.savePosition({ ...positionForm, ministry_id: ministryId, created_by: profile.user_id })
      setPositionForm({ name: '', default_slots: 1, sort_order: 0 })
      loadSettings()
      toast.success(t('sched.positionSaved'))
    } catch (error) { toast.error(error.message || t('sched.saveFailed')) }
  }

  async function grant(user) {
    try {
      await serviceRosterService.grantManager({ ministryId, userId: user.user_id, managerRole })
      setManagerQuery('')
      loadSettings()
      toast.success(t('sched.accessGranted'))
    } catch (error) { toast.error(error.message || t('sched.saveFailed')) }
  }

  async function revoke(row) {
    if (!await confirm({ title: t('sched.revokeTitle'), message: t('sched.revokeMessage', { name: row.users?.name || '' }), confirmText: t('sched.revoke'), danger: true })) return
    try {
      await serviceRosterService.revokeManager(ministryId, row.user_id)
      loadSettings()
      toast.success(t('sched.accessRevoked'))
    } catch (error) { toast.error(error.message || t('sched.saveFailed')) }
  }

  const slotGroups = useMemo(() => {
    const groups = new Map()
    for (const slot of selected?.service_roster_slots || []) {
      const key = slot.position_id
      if (!groups.has(key)) groups.set(key, { name: slot.ministry_service_positions?.name || '-', slots: [] })
      groups.get(key).slots.push(slot)
    }
    return [...groups.values()]
  }, [selected])

  if (archiveOnly && !requestedRosterId) return null
  if (adminMode && accessLoading) return <div className="py-20 text-center"><Spinner /></div>
  if (adminMode && managed.length === 0) return <EmptyState icon={CalendarClock} title={t('sched.noAccess')} description={t('sched.noAccessDesc')} />
  if (deepLinkLoading) return <div className="py-20 text-center"><Spinner /></div>

  if (selected) {
    const count = completion(selected)
    const editable = !archiveOnly && tab === 'manage' && selected.status === 'Draft'
    return (
      <div className={adminMode ? 'mx-auto max-w-5xl' : 'mx-auto max-w-3xl px-4 pt-4 pb-8'}>
        <button type="button" onClick={closeDetail} className="mb-3 flex min-h-11 items-center gap-2 text-sm font-medium text-gray-600"><ChevronLeft size={18} />{t('sched.back')}</button>
        <PageHeader title={selected.title} subtitle={`${formatDate(selected.service_date)} · ${timeText(selected)}`} action={adminMode ? <Button variant="outline" size="sm" className="min-h-11" onClick={() => exportRoster(selected)}><Printer size={16} />{t('sched.pdf')}</Button> : undefined} />
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap gap-2"><Badge color={badgeColor(selected.status)}>{t(`sched.status.${selected.status}`)}</Badge><Badge color={count.filled === count.total ? 'green' : 'amber'}>{t('sched.slotsFilled', count)}</Badge></div>
          <p className="mt-3 flex items-center gap-2 text-sm text-gray-600"><MapPin size={16} />{selected.location || '-'}</p>
          <p className="mt-2 text-sm text-gray-600">{t('sched.dressCode')}: {selected.dress_code || '-'}</p>
          {selected.notes && <p className="mt-3 border-t border-gray-100 pt-3 text-sm text-gray-600">{selected.notes}</p>}
        </Card>
        <div className="space-y-4">
          {slotGroups.length === 0 && <Card className="p-5 text-center"><p className="text-sm font-semibold text-gray-800">{t('sched.noPositionsTitle')}</p><p className="mt-1 text-xs text-gray-500">{t('sched.noPositionsDesc')}</p></Card>}
          {slotGroups.map(group => <Card key={group.name} className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">{group.name}</h2>
            <div className="space-y-2">{group.slots.map(slot => <div key={slot.slot_id} className="flex min-h-14 items-center gap-3 rounded-xl border border-gray-200 px-3 py-2">
              <Avatar name={slot.users?.name || '?'} src={slot.users?.photo_url} size="sm" />
              <span className={`min-w-0 flex-1 truncate text-sm ${slot.users ? 'font-medium text-gray-800' : 'text-gray-400'}`}>{slot.users?.name || t('sched.emptySlot')}</span>
              {editable && <><button type="button" onClick={() => setPicker(slot)} aria-label={t('sched.chooseMember')} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-brand-600 hover:bg-brand-50"><UserRound size={17} /></button>{slot.user_id && <button type="button" onClick={() => setSlot(slot, null)} aria-label={t('sched.clearSlot')} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-red-500 hover:bg-red-50"><X size={17} /></button>}</>}
            </div>)}</div>
          </Card>)}
        </div>
        {editable && <div className="sticky bottom-3 mt-5 flex gap-2 rounded-2xl border border-gray-200 bg-surface/95 p-3 backdrop-blur"><Button loading={busy} onClick={publish} className="min-h-11 flex-1">{t('sched.publish')}</Button><Button variant="danger" onClick={deleteDraft} className="min-h-11"><Trash2 size={16} />{t('common.delete')}</Button></div>}
        {!archiveOnly && tab === 'manage' && selected.status === 'Terbit' && <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="outline" loading={busy} onClick={sendReminder}><BellRing size={16} />{t('sched.remind')}</Button><Button variant="danger" loading={busy} onClick={cancelRoster}>{t('sched.cancelRoster')}</Button></div>}
        {!archiveOnly && picker && <Picker roster={selected} slot={picker} canPickAnyMember={isAdmin} onClose={() => setPicker(null)} onPick={(userId, allowConflict) => setSlot(picker, userId, allowConflict)} t={t} />}
      </div>
    )
  }

  const tabs = adminMode
    ? [{ id: 'manage', label: t('sched.manage') }, ...(!legacyOnly ? [{ id: 'settings', label: t('sched.accessPositions') }] : [])]
    : [{ id: 'mine', label: t('sched.mySchedule') }, { id: 'all', label: t('sched.allSchedules') }]

  return (
    <div className={adminMode ? 'mx-auto max-w-6xl' : 'mx-auto max-w-3xl px-4 pt-4 pb-8'}>
      <PageHeader title={t('sched.title')} subtitle={t(adminMode ? 'sched.adminSubtitle' : 'sched.subtitle')} />
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-control p-1">{tabs.map(item => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`min-h-11 whitespace-nowrap rounded-lg px-4 text-sm font-medium ${tab === item.id ? 'bg-surface text-brand-700' : 'text-gray-600'}`}>{item.label}</button>)}</div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        {['manage', 'settings'].includes(tab) ? <Select label={t('sched.ministry')} value={ministryId} onChange={e => { setMinistryId(e.target.value); setForm(emptyForm(e.target.value)) }}>{managed.map(row => <option key={row.ministry_id} value={row.ministry_id}>{row.name}</option>)}</Select> : <Input label={t('sched.month')} type="month" value={month} onChange={e => setMonth(e.target.value)} />}
        {tab === 'manage' && <div className="flex items-end gap-2"><Button variant="outline" disabled={!rosters.length} onClick={exportMonth}><Printer size={16} />{t('sched.pdf')}</Button><Button onClick={() => setCreateOpen(true)}><Plus size={17} />{t('sched.newSchedule')}</Button></div>}
      </div>
      {tab === 'manage' && <Input label={t('sched.month')} type="month" value={month} onChange={e => setMonth(e.target.value)} />}

      {tab === 'settings' ? <div className={`grid gap-5 ${isAdmin ? 'lg:grid-cols-2' : 'mx-auto max-w-2xl'}`}>
        {isAdmin && <Card className="p-4">
          <h2 className="font-semibold text-gray-900">{t('sched.managersTitle')}</h2><p className="mb-4 text-xs text-gray-500">{t('sched.managersDesc')}</p>
          {managers.map(row => <div key={row.user_id} className="flex min-h-14 items-center gap-3 border-b border-gray-100 py-2"><Avatar name={row.users?.name} src={row.users?.photo_url} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{row.users?.name}</p><p className="text-xs text-gray-500">{t(`sched.role.${row.manager_role}`)}</p></div><button type="button" onClick={() => revoke(row)} aria-label={t('sched.revoke')} className="flex min-h-11 min-w-11 items-center justify-center text-red-500"><Trash2 size={17} /></button></div>)}
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_8rem]"><Input icon={Search} value={managerQuery} onChange={e => setManagerQuery(e.target.value)} placeholder={t('sched.searchManager')} /><Select value={managerRole} onChange={e => setManagerRole(e.target.value)}><option value="Ministry Head">{t('sched.role.Ministry Head')}</option><option value="Wakil">{t('sched.role.Wakil')}</option></Select></div>
          {managerCandidates.length > 0 && <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-gray-200">{managerCandidates.map(user => <button key={user.user_id} type="button" onClick={() => grant(user)} className="flex min-h-12 w-full items-center border-b border-gray-100 px-3 text-left text-sm last:border-0 hover:bg-control"><span className="flex-1 truncate">{user.name}</span><Plus size={16} /></button>)}</div>}
        </Card>}
        <Card className="p-4">
          <h2 className="font-semibold text-gray-900">{t('sched.positionsTitle')}</h2><p className="mb-4 text-xs text-gray-500">{t('sched.positionsDesc')}</p>
          <form onSubmit={savePosition} className="mb-4 grid gap-2 sm:grid-cols-[1fr_5rem_5rem_auto]"><Input required value={positionForm.name} onChange={e => setPositionForm(f => ({ ...f, name: e.target.value }))} placeholder={t('sched.positionName')} /><Input required min="1" type="number" value={positionForm.default_slots} onChange={e => setPositionForm(f => ({ ...f, default_slots: e.target.value }))} aria-label={t('sched.defaultSlots')} /><Input type="number" value={positionForm.sort_order} onChange={e => setPositionForm(f => ({ ...f, sort_order: e.target.value }))} aria-label={t('sched.order')} /><Button type="submit"><Plus size={16} />{t('sched.add')}</Button></form>
          {positions.map(position => <div key={position.position_id} className="flex min-h-12 items-center gap-3 rounded-xl border border-gray-200 px-3"><span className={`min-w-0 flex-1 truncate text-sm ${position.is_active ? '' : 'text-gray-400 line-through'}`}>{position.name}</span><Badge>{t('sched.slotCount', { count: position.default_slots })}</Badge>{position.is_active && <button type="button" onClick={async () => { await serviceRosterService.removePosition(position.position_id); loadSettings() }} aria-label={t('sched.deactivate')} className="flex min-h-11 min-w-11 items-center justify-center text-red-500"><Trash2 size={16} /></button>}</div>)}
        </Card>
      </div> : loading ? <div className="py-20 text-center"><Spinner /></div> : rosters.length === 0 ? <EmptyState icon={CalendarClock} title={t('sched.emptyTitle')} description={t(tab === 'manage' ? 'sched.emptyManage' : tab === 'mine' ? 'sched.emptyMine' : 'sched.emptyDesc')} action={tab === 'mine' ? <Button variant="outline" onClick={() => setMonth(followingMonth(month))}>{t('sched.nextMonth')}</Button> : undefined} /> : <div className="grid gap-3 sm:grid-cols-2">{rosters.map(roster => <ScheduleCard key={roster.roster_id} roster={roster} mine={tab === 'mine' ? profile.user_id : null} onClick={() => setSelected(roster)} t={t} />)}</div>}

      {createOpen && <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/40 px-4 py-8"><form onSubmit={createRoster} className="mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-surface p-5">
        <div className="mb-4 flex items-start gap-3"><div className="flex-1"><h2 className="font-semibold">{t('sched.newSchedule')}</h2><p className="text-xs text-gray-500">{t('sched.draftHint')}</p></div><button type="button" onClick={() => setCreateOpen(false)} aria-label={t('sched.close')} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-control"><X size={18} /></button></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label={t('sched.sourceType')} value={form.source_type} onChange={e => setForm(current => ({ ...emptyForm(ministryId), source_type: e.target.value }))}><option value="Ibadah">{t('sched.source.Ibadah')}</option><option value="Event">{t('sched.source.Event')}</option><option value="Kelas">{t('sched.source.Kelas')}</option></Select>
          {form.source_type === 'Event' && <Select required label={t('sched.event')} value={form.event_id} onChange={e => chooseEvent(e.target.value)}><option value="">{t('sched.chooseEvent')}</option>{events.map(row => <option key={row.event_id} value={row.event_id}>{row.name}</option>)}</Select>}
          {form.source_type === 'Kelas' && <><Select required label={t('sched.class')} value={form.class_id} onChange={e => chooseClass(e.target.value)}><option value="">{t('sched.chooseClass')}</option>{classes.map(row => <option key={row.class_id} value={row.class_id}>{row.name}</option>)}</Select><Input label={t('sched.sessionNo')} type="number" min="1" value={form.class_session_no} onChange={e => updateForm('class_session_no', e.target.value)} /></>}
          <Input required label={t('sched.scheduleTitle')} value={form.title} onChange={e => updateForm('title', e.target.value)} /><Input required label={t('sched.date')} type="date" value={form.service_date} onChange={e => updateForm('service_date', e.target.value)} /><Input required label={t('sched.startTime')} type="time" value={form.start_time} onChange={e => updateForm('start_time', e.target.value)} /><Input required label={t('sched.endTime')} type="time" value={form.end_time} onChange={e => updateForm('end_time', e.target.value)} /><Input label={t('sched.location')} value={form.location} onChange={e => updateForm('location', e.target.value)} /><Input label={t('sched.dressCode')} value={form.dress_code} onChange={e => updateForm('dress_code', e.target.value)} /><Textarea label={t('sched.notes')} className="sm:col-span-2" value={form.notes} onChange={e => updateForm('notes', e.target.value)} />
        </div>
        <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t('sched.close')}</Button><Button type="submit" loading={busy}>{t('sched.createDraft')}</Button></div>
      </form></div>}
    </div>
  )
}
