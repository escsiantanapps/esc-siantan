import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Save, ShieldCheck, Trash2, X } from 'lucide-react'
import { useLang } from '@/hooks/useLang'
import { useToast } from '@/hooks/useToast'
import { Badge, Button, Checkbox, Input, Select, Spinner } from '@/components/ui'

const emptyPosition = () => ({ name: '', default_slots: 1, sort_order: 0, is_active: true })
const forbiddenRoles = ['Admin', 'Super Admin', 'Gembala']
const eligibleHead = head => head?.status === 'Aktif' && (head.role === 'Admin' || head.role === 'Volunteer' && !forbiddenRoles.includes(head.role_secondary))

export default function ScheduleAccessPositions({ api, ministries, positions, onChange, ministryHref }) {
  const { t } = useLang()
  const { toast, confirm } = useToast()
  const [ministryId, setMinistryId] = useState(ministries[0]?.ministry_id || '')
  const [managers, setManagers] = useState([])
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [grantMinistryId, setGrantMinistryId] = useState('')
  const [targetManagers, setTargetManagers] = useState([])
  const [checkingTarget, setCheckingTarget] = useState(false)
  const [targetError, setTargetError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingCandidates, setLoadingCandidates] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [position, setPosition] = useState(emptyPosition)
  const request = useRef(0)
  const ministry = ministries.find(item => item.ministry_id === ministryId)
  const head = ministry?.head
  const sourceHeadId = ministry?.head_user_id || ''
  const adminHead = head?.status === 'Aktif' && head.role === 'Admin'
  const headIsMember = candidates.some(item => item.user_id === head?.user_id && item.ministry_ids?.includes(ministryId))
  const headApproved = headIsMember && eligibleHead(head) && managers.some(item => item.user_id === head?.user_id
    && (item.manager_role === 'Ministry Head' || item.access_source === 'admin_mh'))
  const ministryPositions = positions.filter(item => item.ministry_id === ministryId)
    .sort((a, b) => Number(b.is_active) - Number(a.is_active)
      || Number(a.sort_order || 0) - Number(b.sort_order || 0)
      || a.name.localeCompare(b.name))
  const activePositions = ministryPositions.filter(item => item.is_active)
  const selectedUser = candidates.find(item => item.user_id === selectedUserId)
  const filteredCandidates = candidates.filter(item => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const targetMinistry = ministries.find(item => item.ministry_id === grantMinistryId)
  const alreadyManager = targetManagers.some(item => item.user_id === selectedUserId)
  const selectedIsHead = selectedUserId && targetMinistry?.head_user_id === selectedUserId
  const load = useCallback(async () => {
    const current = ++request.current
    setLoading(true); setError('')
    try {
      const rows = await api.listManagers(ministryId)
      if (current === request.current) setManagers(rows.filter(item => item.manager_role === 'Wakil'
        || item.access_source === 'admin_mh'
        || (item.manager_role === 'Ministry Head' && item.user_id === sourceHeadId)))
    } catch { if (current === request.current) setError('sched.loadFailed') }
    finally { if (current === request.current) setLoading(false) }
  }, [api, ministryId, sourceHeadId])
  useEffect(() => {
    if (!ministries.some(item => item.ministry_id === ministryId)) setMinistryId(ministries[0]?.ministry_id || '')
  }, [ministries, ministryId])
  useEffect(() => {
    setManagers([]); setPosition(emptyPosition())
    if (ministryId) load()
    else setLoading(false)
    return () => { request.current += 1 }
  }, [load, ministryId])
  useEffect(() => {
    let active = true
    setLoadingCandidates(true)
    const getCandidates = api.listManagerCandidates || (() => api.searchActiveUsers(''))
    getCandidates().then(rows => { if (active) setCandidates(rows) })
      .catch(() => { if (active) toast.error(t('sched.loadFailed')) })
      .finally(() => { if (active) setLoadingCandidates(false) })
    return () => { active = false }
  }, [api, t, toast])
  useEffect(() => {
    if (!grantMinistryId) { setTargetManagers([]); setTargetError(false); return undefined }
    let active = true
    setCheckingTarget(true); setTargetError(false)
    api.listManagers(grantMinistryId).then(rows => { if (active) setTargetManagers(rows) })
      .catch(() => { if (active) { setTargetManagers([]); setTargetError(true) } })
      .finally(() => { if (active) setCheckingTarget(false) })
    return () => { active = false }
  }, [api, grantMinistryId])
  async function change(action, success) {
    if (busy) return
    setBusy(true)
    try { await action(); await load(); await onChange(); toast.success(t(success)); return true }
    catch (failure) {
      const code = failure?.code === 'PGRST202' && String(failure?.message || '').includes('_v122')
        ? 'schedMonth.orderMigrationRequired' : String(failure?.message || '').includes('schedule_ministry_membership_required')
        ? 'schedMonth.membershipRequired' : ['PGRST200', 'PGRST202', 'PGRST205', '42703', '42P01'].includes(failure?.code)
          ? 'schedMonth.migrationRequired' : failure?.code === '42501' ? 'sched.noAccess' : 'sched.saveFailed'
      toast.error(t(code)); return false
    } finally { setBusy(false) }
  }
  async function grant(user, managerRole, targetId = ministryId) {
    const target = ministries.find(item => item.ministry_id === targetId)
    if (!target || !await confirm({ title: t('schedAccess.approveTitle'), message: t(user.role === 'Admin' ? 'schedAccess.approveAdminMessage' : 'schedAccess.approveMessage', { name: user.name, ministry: target.name }), confirmText: t('schedAccess.approve') })) return
    if (await change(() => api.grantManager({ ministryId: targetId, userId: user.user_id, managerRole, adminAccess: user.role === 'Admin' }), 'sched.accessGranted')) {
      setMinistryId(targetId); setSelectedUserId(''); setGrantMinistryId('')
    }
  }
  async function revoke(manager) {
    if (!await confirm({ title: t('sched.revokeTitle'), message: t('sched.revokeMessage', { name: manager.users?.name }), confirmText: t('sched.revoke'), danger: true })) return
    await change(() => api.revokeManager(ministryId, manager.user_id, manager.access_source === 'admin_mh'), 'sched.accessRevoked')
  }
  async function savePosition(event) {
    event.preventDefault()
    if (!position.name.trim()) return
    await change(async () => { await api.savePosition({ ...position, ministry_id: ministryId }); setPosition(emptyPosition()) }, 'sched.positionSaved')
  }
  async function deactivate(item) {
    if (!await confirm({ title: t('sched.deactivate'), message: t('schedAccess.deactivateMessage', { name: item.name }), confirmText: t('sched.deactivate'), danger: true })) return
    await change(() => api.removePosition(item.position_id), 'sched.positionSaved')
  }
  async function moveMinistry(index, direction) {
    const next = [...ministries.map(item => item.ministry_id)]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    await change(() => api.reorderMinistries(next), 'schedMonth.saved')
  }
  async function movePosition(item, direction) {
    const next = activePositions.map(positionItem => positionItem.position_id)
    const index = next.indexOf(item.position_id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    await change(() => api.reorderPositions(ministryId, next), 'sched.positionSaved')
  }
  return <section className="schedule-access">
    <section className="schedule-access-grant" aria-labelledby="schedule-access-grant-title">
      <h2 id="schedule-access-grant-title"><ShieldCheck size={18} />{t('schedAccess.grantTitle')}</h2>
      <p className="monthly-muted">{t('schedAccess.grantHint')}</p>
      <Input label={t('schedAccess.choosePerson')} placeholder={t('sched.searchManager')} value={query} disabled={busy || loadingCandidates} onChange={event => setQuery(event.target.value)} />
      {loadingCandidates ? <Spinner /> : <div className="schedule-access-candidates">
        {filteredCandidates.map(user => <button type="button" aria-pressed={selectedUserId === user.user_id} className="schedule-access-candidate" key={user.user_id} disabled={busy} onClick={() => { setSelectedUserId(user.user_id); setGrantMinistryId('') }}>{user.name}</button>)}
        {!filteredCandidates.length && <p className="monthly-muted">{t('schedAccess.noResults')}</p>}
      </div>}
      {selectedUser && <div className="schedule-access-grant-target">
        <strong>{selectedUser.name}</strong>
        <Select label={t('schedAccess.chooseMinistry')} value={grantMinistryId} disabled={busy} onChange={event => setGrantMinistryId(event.target.value)}>
          <option value="">{t('schedAccess.chooseMinistryPlaceholder')}</option>
          {ministries.filter(item => selectedUser.ministry_ids?.includes(item.ministry_id))
            .map(item => <option key={item.ministry_id} value={item.ministry_id}>{item.name}</option>)}
        </Select>
        {selectedIsHead && <p className="monthly-muted">{t('schedAccess.headUseApproval')}</p>}
        {alreadyManager && <p className="monthly-muted">{t('schedAccess.alreadyManager')}</p>}
        {targetError && <p className="monthly-error" role="alert">{t('sched.loadFailed')}</p>}
        <Button type="button" disabled={busy || !grantMinistryId || checkingTarget || targetError || selectedIsHead || alreadyManager} onClick={() => grant(selectedUser, 'Wakil', grantMinistryId)}><Plus size={16} />{t('schedAccess.approve')}</Button>
      </div>}
    </section>
    <section className="schedule-ministry-order" aria-labelledby="schedule-ministry-order-title">
      <h2 id="schedule-ministry-order-title">{t('sched.ministry')}</h2>
      <p className="monthly-muted">{t('schedAccess.orderHint')}</p>
      <div className="schedule-order-list">{ministries.map((item, index) => <div className="schedule-access-row schedule-order-row" key={item.ministry_id}>
        <strong>{item.name}</strong>
        <div className="schedule-order-actions">
          <Button type="button" variant="ghost" disabled={busy || index === 0} onClick={() => moveMinistry(index, -1)} aria-label={t('schedAccess.moveMinistryUp', { name: item.name })} title={t('schedAccess.moveMinistryUp', { name: item.name })}><ArrowUp size={17} aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" disabled={busy || index === ministries.length - 1} onClick={() => moveMinistry(index, 1)} aria-label={t('schedAccess.moveMinistryDown', { name: item.name })} title={t('schedAccess.moveMinistryDown', { name: item.name })}><ArrowDown size={17} aria-hidden="true" /></Button>
        </div>
      </div>)}</div>
    </section>
    <div className="monthly-toolbar"><Select label={t('sched.ministry')} value={ministryId} disabled={busy} onChange={event => setMinistryId(event.target.value)}>{ministries.map(item => <option key={item.ministry_id} value={item.ministry_id}>{item.name}</option>)}</Select></div>
    {error && <div className="monthly-error" role="alert">{t(error)}<Button variant="outline" onClick={load}>{t('schedMonth.retry')}</Button></div>}
    {ministry && <div className="schedule-access-grid">
      <section aria-labelledby="schedule-access-title">
        <h2 id="schedule-access-title"><ShieldCheck size={18} />{t('sched.managersTitle')}</h2>
        <div className="schedule-access-head">
          <div><span className="monthly-muted">{t('schedAccess.headSource')}</span><strong>{head?.name || t('amin.noMinistryHead')}</strong></div>
          {ministryHref && <Link to={ministryHref} className="text-sm text-brand-600 underline">{t('admin.nav.ministry')}</Link>}
        </div>
        {head && <div className="schedule-access-row"><span>{t('sched.role.Ministry Head')}</span>{headApproved ? <Badge color="green">{t('schedAccess.approved')}</Badge> : <Button variant="outline" disabled={busy || loading || loadingCandidates || !eligibleHead(head) || !headIsMember} onClick={() => grant(head, 'Ministry Head')}><Check size={16} />{t('schedAccess.approve')}</Button>}</div>}
        {head && adminHead && <p className="monthly-muted">{t('schedAccess.adminHeadInfo')}</p>}
        {head && !eligibleHead(head) && !adminHead && <p className="monthly-muted">{t('schedAccess.ineligibleHead')}</p>}
        {head && eligibleHead(head) && !loadingCandidates && !headIsMember && <p className="monthly-muted">{t('schedMonth.membershipRequired')}</p>}
        {loading ? <Spinner /> : <div className="schedule-access-list">{managers.map(manager => <div className="schedule-access-row" key={manager.user_id}><div><strong>{manager.users?.name || manager.user_id}</strong><span className="monthly-muted">{t(`sched.role.${manager.manager_role}`)}</span></div><Button variant="ghost" disabled={busy} title={t('sched.revoke')} aria-label={t('sched.revoke')} onClick={() => revoke(manager)}><Trash2 size={17} /></Button></div>)}</div>}
      </section>
      <section aria-labelledby="schedule-positions-title">
        <div className="schedule-position-heading"><h2 id="schedule-positions-title">{t('sched.positionsTitle')}</h2><span className="monthly-muted">{t('schedAccess.positionCount', { count: ministryPositions.length })}</span></div>
        <div className="schedule-access-list schedule-position-list">{ministryPositions.map(item => {
          const orderIndex = activePositions.findIndex(positionItem => positionItem.position_id === item.position_id)
          return <div className="schedule-access-row schedule-position-row" key={item.position_id}><div><strong>{item.name}</strong><span className="monthly-muted">{t('schedAccess.slotCount', { count: item.default_slots })}</span></div><div className="schedule-position-actions">
            {item.is_active && <div className="schedule-order-actions">
              <Button type="button" variant="ghost" disabled={busy || orderIndex === 0} onClick={() => movePosition(item, -1)} aria-label={t('schedAccess.movePositionUp', { name: item.name })} title={t('schedAccess.movePositionUp', { name: item.name })}><ArrowUp size={17} aria-hidden="true" /></Button>
              <Button type="button" variant="ghost" disabled={busy || orderIndex === activePositions.length - 1} onClick={() => movePosition(item, 1)} aria-label={t('schedAccess.movePositionDown', { name: item.name })} title={t('schedAccess.movePositionDown', { name: item.name })}><ArrowDown size={17} aria-hidden="true" /></Button>
            </div>}
            {!item.is_active && <Badge color="gray">{t('schedAccess.inactive')}</Badge>}
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setPosition({ ...item })} title={t('a.edit')} aria-label={t('a.edit')}><Pencil size={16} /></Button>
            {item.is_active && <Button type="button" variant="ghost" disabled={busy} onClick={() => deactivate(item)} title={t('sched.deactivate')} aria-label={t('sched.deactivate')}><Trash2 size={16} /></Button>}
          </div></div>
        })}</div>
        <form className="schedule-position-form" onSubmit={savePosition}>
          <Input label={t('sched.positionName')} required maxLength={100} value={position.name} disabled={busy} onChange={event => setPosition(current => ({ ...current, name: event.target.value }))} />
          <div className="monthly-editor-grid"><Input label={t('sched.defaultSlots')} type="number" required min="1" max="20" value={position.default_slots} disabled={busy} onChange={event => setPosition(current => ({ ...current, default_slots: event.target.value }))} /><Input label={t('sched.order')} type="number" required min="0" value={position.sort_order} disabled={busy} onChange={event => setPosition(current => ({ ...current, sort_order: event.target.value }))} /></div>
          <Checkbox label={t('schedAccess.activePosition')} checked={position.is_active} disabled={busy} onChange={event => setPosition(current => ({ ...current, is_active: event.target.checked }))} />
          <div className="monthly-inline"><Button type="submit" disabled={busy || loading} loading={busy}><Save size={16} />{t('common.save')}</Button>{position.position_id && <Button variant="ghost" disabled={busy} onClick={() => setPosition(emptyPosition())} aria-label={t('common.cancel')} title={t('common.cancel')}><X size={18} /></Button>}</div>
        </form>
      </section>
    </div>}
  </section>
}
