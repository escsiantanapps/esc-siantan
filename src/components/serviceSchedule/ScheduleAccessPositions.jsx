import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Pencil, Plus, Save, ShieldCheck, Trash2, X } from 'lucide-react'
import { useLang } from '@/hooks/useLang'
import { useToast } from '@/hooks/useToast'
import { Badge, Button, Checkbox, Input, Select, Spinner } from '@/components/ui'

const emptyPosition = () => ({ name: '', default_slots: 1, sort_order: 0, is_active: true })
const forbiddenRoles = ['Admin', 'Super Admin', 'Gembala']
const eligibleHead = head => head?.status === 'Aktif' && head.role === 'Volunteer' && !forbiddenRoles.includes(head.role_secondary)

export default function ScheduleAccessPositions({ api, ministries, positions, onChange, ministryHref }) {
  const { t } = useLang()
  const { toast, confirm } = useToast()
  const [ministryId, setMinistryId] = useState(ministries[0]?.ministry_id || '')
  const [managers, setManagers] = useState([])
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [position, setPosition] = useState(emptyPosition)
  const request = useRef(0)
  const ministry = ministries.find(item => item.ministry_id === ministryId)
  const head = ministry?.head
  const sourceHeadId = ministry?.head_user_id || ''
  const adminHead = head?.status === 'Aktif' && head.role === 'Admin'
  const headApproved = eligibleHead(head) && managers.some(item => item.user_id === head?.user_id && item.manager_role === 'Ministry Head')
  const ministryPositions = positions.filter(item => item.ministry_id === ministryId)
  const load = useCallback(async () => {
    const current = ++request.current
    setLoading(true); setError('')
    try {
      const rows = await api.listManagers(ministryId)
      if (current === request.current) setManagers(rows.filter(item => item.manager_role === 'Wakil'
        || (item.manager_role === 'Ministry Head' && item.user_id === sourceHeadId)))
    } catch { if (current === request.current) setError('sched.loadFailed') }
    finally { if (current === request.current) setLoading(false) }
  }, [api, ministryId, sourceHeadId])
  useEffect(() => {
    if (!ministries.some(item => item.ministry_id === ministryId)) setMinistryId(ministries[0]?.ministry_id || '')
  }, [ministries, ministryId])
  useEffect(() => {
    setManagers([]); setQuery(''); setCandidates([]); setPosition(emptyPosition())
    if (ministryId) load()
    else setLoading(false)
    return () => { request.current += 1 }
  }, [load, ministryId])
  useEffect(() => {
    let active = true
    setCandidates([]); setSearching(false)
    if (!query.trim()) return undefined
    setSearching(true)
    const timer = setTimeout(() => {
      api.searchActiveUsers(query.trim()).then(rows => { if (active) setCandidates(rows) })
        .catch(() => { if (active) toast.error(t('sched.loadFailed')) })
        .finally(() => { if (active) setSearching(false) })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [api, query, ministryId, t, toast])
  async function change(action, success) {
    if (busy) return
    setBusy(true)
    try { await action(); await load(); await onChange(); toast.success(t(success)) }
    catch (failure) {
      const code = ['PGRST200', 'PGRST202', 'PGRST205', '42703', '42P01'].includes(failure?.code)
        ? 'schedMonth.migrationRequired' : failure?.code === '42501' ? 'sched.noAccess' : 'sched.saveFailed'
      toast.error(t(code))
    } finally { setBusy(false) }
  }
  async function grant(user, managerRole) {
    if (!await confirm({ title: t('schedAccess.approveTitle'), message: t('schedAccess.approveMessage', { name: user.name, ministry: ministry.name }), confirmText: t('schedAccess.approve') })) return
    await change(() => api.grantManager({ ministryId, userId: user.user_id, managerRole }), 'sched.accessGranted')
  }
  async function revoke(manager) {
    if (!await confirm({ title: t('sched.revokeTitle'), message: t('sched.revokeMessage', { name: manager.users?.name }), confirmText: t('sched.revoke'), danger: true })) return
    await change(() => api.revokeManager(ministryId, manager.user_id), 'sched.accessRevoked')
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
  return <section className="schedule-access">
    <div className="monthly-toolbar"><Select label={t('sched.ministry')} value={ministryId} disabled={busy} onChange={event => setMinistryId(event.target.value)}>{ministries.map(item => <option key={item.ministry_id} value={item.ministry_id}>{item.name}</option>)}</Select></div>
    {error && <div className="monthly-error" role="alert">{t(error)}<Button variant="outline" onClick={load}>{t('schedMonth.retry')}</Button></div>}
    {ministry && <div className="schedule-access-grid">
      <section aria-labelledby="schedule-access-title">
        <h2 id="schedule-access-title"><ShieldCheck size={18} />{t('sched.managersTitle')}</h2>
        <div className="schedule-access-head">
          <div><span className="monthly-muted">{t('schedAccess.headSource')}</span><strong>{head?.name || t('amin.noMinistryHead')}</strong></div>
          {ministryHref && <Link to={ministryHref} className="text-sm text-brand-600 underline">{t('admin.nav.ministry')}</Link>}
        </div>
        {head && <div className="schedule-access-row"><span>{t('sched.role.Ministry Head')}</span>{adminHead ? <Badge color="gray">{t('schedAccess.adminPermissions')}</Badge> : headApproved ? <Badge color="green">{t('schedAccess.approved')}</Badge> : <Button variant="outline" disabled={busy || loading || !eligibleHead(head)} onClick={() => grant(head, 'Ministry Head')}><Check size={16} />{t('schedAccess.approve')}</Button>}</div>}
        {head && adminHead && <p className="monthly-muted">{t('schedAccess.adminHeadInfo')}</p>}
        {head && !eligibleHead(head) && !adminHead && <p className="monthly-muted">{t('schedAccess.ineligibleHead')}</p>}
        {loading ? <Spinner /> : <div className="schedule-access-list">{managers.map(manager => <div className="schedule-access-row" key={manager.user_id}><div><strong>{manager.users?.name || manager.user_id}</strong><span className="monthly-muted">{t(`sched.role.${manager.manager_role}`)}</span></div><Button variant="ghost" disabled={busy} title={t('sched.revoke')} aria-label={t('sched.revoke')} onClick={() => revoke(manager)}><Trash2 size={17} /></Button></div>)}</div>}
        <h3 className="monthly-subheading">{t('sched.deputy')}</h3>
        <Input aria-label={t('sched.searchManager')} placeholder={t('sched.searchManager')} value={query} disabled={busy || loading} onChange={event => setQuery(event.target.value)} />
        {searching ? <Spinner /> : query.trim() && <div className="schedule-access-list">{candidates.map(user => {
          const existing = managers.some(manager => manager.user_id === user.user_id)
          return <div key={user.user_id} className="schedule-access-row"><strong>{user.name}</strong><Button variant="ghost" disabled={busy || existing || user.user_id === head?.user_id} aria-label={t('schedAccess.approveDeputy', { name: user.name })} title={t('schedAccess.approveDeputy', { name: user.name })} onClick={() => grant(user, 'Wakil')}><Plus size={17} /></Button></div>
        })}{!candidates.length && <p className="monthly-muted">{t('schedAccess.noResults')}</p>}</div>}
      </section>
      <section aria-labelledby="schedule-positions-title">
        <h2 id="schedule-positions-title">{t('sched.positionsTitle')}</h2>
        <div className="schedule-access-list">{ministryPositions.map(item => <div className="schedule-access-row" key={item.position_id}><div><strong>{item.name}</strong><span className="monthly-muted">{t('schedAccess.slotCount', { count: item.default_slots })}</span></div>{!item.is_active && <Badge color="gray">{t('schedAccess.inactive')}</Badge>}<Button variant="ghost" disabled={busy} onClick={() => setPosition({ ...item })} title={t('a.edit')} aria-label={t('a.edit')}><Pencil size={16} /></Button>{item.is_active && <Button variant="ghost" disabled={busy} onClick={() => deactivate(item)} title={t('sched.deactivate')} aria-label={t('sched.deactivate')}><Trash2 size={16} /></Button>}</div>)}</div>
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
