import { useEffect, useState } from 'react'
import { Church, Plus, Pencil, Trash2, X, Users, Search, RefreshCw, UserPlus, UserMinus, Building2, Network, Crown, ArrowUp, ArrowDown, Printer } from 'lucide-react'
import { ministriesService, ministryDepartmentsService } from '@/services/contentService'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { useBackClose } from '@/hooks/useBackClose'
import { Card, PageHeader, Button, Input, Textarea, Select, Spinner, EmptyState, Avatar, StatusBadge, Badge } from '@/components/ui'

const emptyForm = { name: '', description: '', department_id: '' }
const emptyDepartmentForm = { name: '', head_user_id: '' }

export default function AdminMinistryPage() {
  const { toast, confirm } = useToast()
  const { t } = useLang()
  const { profile } = useAuth()
  const isGembala = profile?.role === 'Gembala'
  const [ministries, setMinistries] = useState([])
  const [departments, setDepartments] = useState([])
  const [activeTab, setActiveTab] = useState('ministries')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [membersView, setMembersView] = useState(null)
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [availableMembers, setAvailableMembers] = useState([])
  const [availableMembersLoading, setAvailableMembersLoading] = useState(false)
  const [availableMemberSearch, setAvailableMemberSearch] = useState('')
  const [showAddMember, setShowAddMember] = useState(false)
  const [memberActionId, setMemberActionId] = useState(null)
  const [showDepartmentModal, setShowDepartmentModal] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState(null)
  const [departmentForm, setDepartmentForm] = useState(emptyDepartmentForm)
  const [departmentError, setDepartmentError] = useState('')
  const [departmentSaving, setDepartmentSaving] = useState(false)
  const [headCandidates, setHeadCandidates] = useState([])
  const [organizationSaving, setOrganizationSaving] = useState(false)

  function closeMembers() {
    setMembersView(null)
    setMembers([])
    setAvailableMembers([])
    setMembersError(false)
    setMemberSearch('')
    setAvailableMemberSearch('')
    setShowAddMember(false)
    setAvailableMembersLoading(false)
    setMemberActionId(null)
  }

  useBackClose(showModal, () => setShowModal(false))
  useBackClose(showDepartmentModal, () => setShowDepartmentModal(false))
  useBackClose(Boolean(membersView), closeMembers)

  useEffect(() => { load() }, [])

  function load() {
    setLoading(true)
    Promise.all([
      ministriesService.getAll(),
      ministryDepartmentsService.getAll(),
    ]).then(([loadedMinistries, loadedDepartments]) => {
      setMinistries(loadedMinistries)
      setDepartments(loadedDepartments)
    }).catch(() => {}).finally(() => setLoading(false))
  }

  function set(key, val) { setForm(previous => ({ ...previous, [key]: val })) }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  function openEdit(item) {
    setEditing(item)
    setForm({ name: item.name || '', description: item.description || '', department_id: item.department_id || '' })
    setError('')
    setShowModal(true)
  }

  async function openDepartmentModal(item = null) {
    setEditingDepartment(item)
    setDepartmentForm({ name: item?.name || '', head_user_id: item?.head_user_id || '' })
    setDepartmentError('')
    setShowDepartmentModal(true)
    try {
      setHeadCandidates(await ministryDepartmentsService.getHeadCandidates())
    } catch (err) {
      setDepartmentError(err.message || t('amin.departmentHeadsLoadFailed'))
    }
  }

  async function handleDepartmentSubmit() {
    setDepartmentError('')
    if (!departmentForm.name.trim()) { setDepartmentError(t('amin.departmentNameRequired')); return }
    if (!departmentForm.head_user_id) { setDepartmentError(t('amin.departmentHeadRequired')); return }
    setDepartmentSaving(true)
    try {
      if (editingDepartment) {
        await ministryDepartmentsService.update(editingDepartment.department_id, departmentForm)
      } else {
        await ministryDepartmentsService.create(departmentForm)
      }
      setShowDepartmentModal(false)
      toast.success(editingDepartment ? t('amin.departmentUpdated') : t('amin.departmentCreated'))
      load()
    } catch (err) {
      setDepartmentError(err.message || t('amin.departmentSaveFailed'))
      toast.error(err.message || t('amin.departmentSaveFailed'))
    } finally {
      setDepartmentSaving(false)
    }
  }

  async function handleDepartmentDelete(item) {
    const ok = await confirm({
      title: t('amin.departmentDeleteTitle'),
      message: t('amin.departmentDeleteMsg', { name: item.name }),
      confirmText: t('a.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await ministryDepartmentsService.delete(item.department_id)
      toast.success(t('amin.departmentDeleted'))
      load()
    } catch (err) {
      toast.error(err.message || t('amin.departmentDeleteFailed'))
    }
  }

  async function saveOrganization(changes) {
    if (organizationSaving || changes.length === 0) return
    setOrganizationSaving(true)
    try {
      await ministriesService.saveOrganization(changes)
      const changesById = new Map(changes.map(change => [change.ministry_id, change]))
      setMinistries(current => current.map(ministry => changesById.has(ministry.ministry_id)
        ? { ...ministry, ...changesById.get(ministry.ministry_id) }
        : ministry))
      toast.success(t('amin.organizationSaved'))
    } catch (err) {
      toast.error(err.message || t('amin.organizationSaveFailed'))
    } finally {
      setOrganizationSaving(false)
    }
  }

  function sortedMinistries(departmentId) {
    return ministries
      .filter(ministry => (ministry.department_id || null) === (departmentId || null))
      .sort((a, b) => (a.organization_order - b.organization_order) || a.name.localeCompare(b.name))
  }

  async function moveMinistry(ministry, targetDepartmentId) {
    const currentDepartmentId = ministry.department_id || null
    const nextDepartmentId = targetDepartmentId || null
    if (currentDepartmentId === nextDepartmentId) return
    const source = sortedMinistries(currentDepartmentId).filter(item => item.ministry_id !== ministry.ministry_id)
    const target = [...sortedMinistries(nextDepartmentId), ministry]
    const changes = [
      ...source.map((item, index) => ({ ministry_id: item.ministry_id, department_id: currentDepartmentId, organization_order: index + 1 })),
      ...target.map((item, index) => ({ ministry_id: item.ministry_id, department_id: nextDepartmentId, organization_order: index + 1 })),
    ]
    await saveOrganization(changes)
  }

  async function moveMinistryOrder(ministry, direction) {
    const bucket = sortedMinistries(ministry.department_id)
    const currentIndex = bucket.findIndex(item => item.ministry_id === ministry.ministry_id)
    const nextIndex = currentIndex + direction
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= bucket.length) return
    ;[bucket[currentIndex], bucket[nextIndex]] = [bucket[nextIndex], bucket[currentIndex]]
    await saveOrganization(bucket.map((item, index) => ({
      ministry_id: item.ministry_id,
      department_id: ministry.department_id || null,
      organization_order: index + 1,
    })))
  }

  async function openMembers(item, resetSearch = true) {
    setMembersView(item)
    setMembers([])
    setAvailableMembers([])
    setMembersError(false)
    if (resetSearch) setMemberSearch('')
    setAvailableMemberSearch('')
    setShowAddMember(false)
    setMembersLoading(true)
    setAvailableMembersLoading(true)
    try {
      const [currentMembers, candidates] = await Promise.all([
        ministriesService.getMembers(item.ministry_id),
        ministriesService.getAvailableMembers(item.ministry_id),
      ])
      setMembers(currentMembers)
      setAvailableMembers(candidates)
    } catch {
      setMembersError(true)
    } finally {
      setMembersLoading(false)
      setAvailableMembersLoading(false)
    }
  }

  async function handleAddMember(member) {
    if (!membersView) return
    setMemberActionId(`add:${member.user_id}`)
    try {
      await ministriesService.addMember(membersView.ministry_id, member.user_id)
      toast.success(t('amin.memberAdded', { name: member.name, ministry: membersView.name }))
      await openMembers(membersView, false)
    } catch (err) {
      toast.error(err.message || t('amin.memberActionFailed'))
    } finally {
      setMemberActionId(null)
    }
  }

  async function handleRemoveMember(member) {
    if (!membersView) return
    const ok = await confirm({
      title: t('amin.removeMemberTitle'),
      message: t('amin.removeMemberMsg', { name: member.name, ministry: membersView.name }),
      confirmText: t('amin.removeMember'),
      danger: true,
    })
    if (!ok) return

    setMemberActionId(`remove:${member.user_id}`)
    try {
      await ministriesService.removeMember(membersView.ministry_id, member.user_id)
      toast.success(t('amin.memberRemoved', { name: member.name, ministry: membersView.name }))
      await openMembers(membersView, false)
    } catch (err) {
      toast.error(err.message || t('amin.memberActionFailed'))
    } finally {
      setMemberActionId(null)
    }
  }

  async function handleSubmit() {
    setError('')
    if (!form.name.trim()) { setError(t('amin.nameRequired')); return }
    setSaving(true)
    try {
      // Select HTML mengembalikan string kosong; FK Department membutuhkan
      // NULL saat Ministry sengaja belum dikelompokkan.
      const ministryPayload = { ...form, department_id: form.department_id || null }
      if (editing) {
        await ministriesService.update(editing.ministry_id, ministryPayload)
      } else {
        await ministriesService.create(ministryPayload)
      }
      setShowModal(false)
      toast.success(editing ? t('amin.updated') : t('amin.created'))
      load()
    } catch (err) {
      setError(err.message || t('amin.saveFailed'))
      toast.error(err.message || t('amin.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item) {
    const ok = await confirm({
      title: t('amin.deleteTitle'),
      message: t('amin.deleteMsg', { name: item.name }),
      confirmText: t('a.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await ministriesService.delete(item.ministry_id)
      toast.success(t('amin.deleted'))
      load()
    } catch (err) {
      toast.error(err.message || t('amin.deleteFailed'))
    }
  }

  const normalizedSearch = memberSearch.trim().toLocaleLowerCase()
  const filteredMembers = normalizedSearch
    ? members.filter(member => member.name?.toLocaleLowerCase().includes(normalizedSearch))
    : members
  const normalizedAvailableSearch = availableMemberSearch.trim().toLocaleLowerCase()
  const filteredAvailableMembers = normalizedAvailableSearch
    ? availableMembers.filter(member => member.name?.toLocaleLowerCase().includes(normalizedAvailableSearch))
    : availableMembers
  const departmentsById = new Map(departments.map(department => [department.department_id, department]))
  const orphanMinistries = ministries
    .filter(ministry => !ministry.department_id)
    .sort((a, b) => (a.organization_order - b.organization_order) || a.name.localeCompare(b.name))

  return (
    <div>
      <PageHeader
        title={t('amin.title')}
        subtitle={t('amin.subtitle', { count: ministries.length })}
        action={!isGembala && <Button size="sm" onClick={openCreate}><Plus size={15} /> {t('amin.add')}</Button>}
      />

      <div role="tablist" aria-label={t('amin.tabsAria')} className="grid grid-cols-3 gap-2 mb-4">
        {[
          { id: 'ministries', label: t('amin.tabMinistries'), icon: Church },
          { id: 'departments', label: t('amin.tabDepartments'), icon: Building2 },
          { id: 'organization', label: t('amin.tabOrganization'), icon: Network },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            className={`min-h-11 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${activeTab === id ? 'gradient-main text-white' : 'bg-control text-gray-600 hover:bg-control-hover'}`}
          >
            <Icon size={16} /> <span className="hidden sm:inline">{label}</span><span className="sm:hidden">{id === 'organization' ? t('amin.tabOrganizationShort') : label}</span>
          </button>
        ))}
      </div>

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && activeTab === 'ministries' && ministries.length === 0 && (
        <EmptyState icon={Church} title={t('amin.empty')} description={t('amin.emptyDesc')} />
      )}

      {!loading && activeTab === 'ministries' && ministries.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {ministries.map(item => (
            <div key={item.ministry_id} className="flex items-center gap-3 p-3.5">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
                <Church size={20} className="text-purple-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                {item.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.description}</p>}
                {item.department_id && departmentsById.get(item.department_id) && (
                  <Badge color="purple" className="mt-1">{departmentsById.get(item.department_id).name}</Badge>
                )}
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="min-h-11 px-2.5 shrink-0"
                onClick={() => openMembers(item)}
                aria-label={t('amin.viewMembersAria', { name: item.name })}
              >
                <Users size={16} />
                <span className="hidden sm:inline">{t('amin.members')}</span>
              </Button>
              {!isGembala && (
                <button
                  onClick={() => openEdit(item)}
                  className="w-11 h-11 rounded-xl bg-control text-gray-500 hover:bg-control-hover hover:text-brand-500 transition-colors shrink-0 flex items-center justify-center cursor-pointer"
                  aria-label={t('amin.editAria', { name: item.name })}
                >
                  <Pencil size={16} />
                </button>
              )}
              {!isGembala && (
                <button
                  onClick={() => handleDelete(item)}
                  className="w-11 h-11 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors shrink-0 flex items-center justify-center cursor-pointer"
                  aria-label={t('amin.deleteAria', { name: item.name })}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </Card>
      )}

      {!loading && activeTab === 'departments' && (
        <div className="space-y-3">
          {!isGembala && (
            <Button className="w-full" variant="secondary" onClick={() => openDepartmentModal()}>
              <Plus size={16} /> {t('amin.addDepartment')}
            </Button>
          )}
          {departments.length === 0 ? (
            <EmptyState icon={Building2} title={t('amin.departmentEmpty')} description={t('amin.departmentEmptyDesc')} />
          ) : (
            <Card className="divide-y divide-gray-100">
              {departments.map(department => (
                <div key={department.department_id} className="flex items-center gap-3 p-3.5">
                  <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0"><Building2 size={20} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{department.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{t('amin.departmentHead')}: {department.head?.name || '-'}</p>
                  </div>
                  {!isGembala && <button type="button" onClick={() => openDepartmentModal(department)} className="w-11 h-11 rounded-xl bg-control text-gray-500 hover:bg-control-hover hover:text-brand-500 transition-colors flex items-center justify-center" aria-label={t('amin.editDepartmentAria', { name: department.name })}><Pencil size={16} /></button>}
                  {!isGembala && <button type="button" onClick={() => handleDepartmentDelete(department)} className="w-11 h-11 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors flex items-center justify-center" aria-label={t('amin.deleteDepartmentAria', { name: department.name })}><Trash2 size={16} /></button>}
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {!loading && activeTab === 'organization' && (
        <div id="organization-chart" className="organization-chart space-y-5" aria-label={t('amin.organizationChartAria')}>
          <div className="organization-poster print-only" style={{ '--poster-columns': departments.length }}>
            <div className="organization-poster-title">{t('amin.organizationPrintTitle')}</div>
            <div className="organization-poster-founder">{t('amin.founderGembala')}</div>
            <div className="organization-poster-rail" aria-hidden="true" />
            <div className="organization-poster-departments">
              {departments.map(department => {
                const departmentMinistries = sortedMinistries(department.department_id)
                return (
                  <section key={department.department_id} className="organization-poster-department">
                    <div className="organization-poster-leader">
                      <strong>{department.head?.name || '-'}</strong>
                      <span>{department.name}</span>
                    </div>
                    <div className="organization-poster-ministries">
                      {departmentMinistries.length > 0
                        ? departmentMinistries.map(ministry => <div key={ministry.ministry_id} className="organization-poster-ministry">{ministry.name}</div>)
                        : <div className="organization-poster-empty">{t('amin.noDepartmentMinistries')}</div>}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>
          <div className="organization-editor no-print">
            <div className="flex flex-col items-center text-center">
            <Card className="w-full max-w-sm p-3.5 border-brand-300 rounded-full">
              <div className="flex items-center justify-center gap-2 text-brand-700">
                <Crown size={18} />
                <p className="text-sm font-bold">{t('amin.founderGembala')}</p>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">{t('amin.founderGembalaHint')}</p>
            </Card>
            <div aria-hidden="true" className="h-8 w-px bg-gray-400" />
          </div>
          <div className="no-print flex flex-col items-center gap-2">
            {!isGembala && <p className="text-xs text-gray-500 text-center">{organizationSaving ? t('amin.organizationSaving') : t('amin.organizationControlsHint')}</p>}
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()}><Printer size={16} />{t('amin.printOrganization')}</Button>
          </div>
          {departments.length === 0 ? (
            <EmptyState icon={Network} title={t('amin.organizationEmpty')} description={t('amin.organizationEmptyDesc')} />
          ) : (
            <div className="sm:overflow-x-auto sm:pb-3">
              <div className="relative flex flex-col gap-4 px-1 sm:flex-row sm:gap-5 sm:min-w-max sm:px-6 sm:pt-6">
                <div aria-hidden="true" className="hidden sm:block absolute top-0 left-16 right-16 h-px bg-gray-400" />
                {departments.map(department => {
                const departmentMinistries = ministries
                  .filter(ministry => ministry.department_id === department.department_id)
                  .sort((a, b) => (a.organization_order - b.organization_order) || a.name.localeCompare(b.name))
                return (
                  <Card key={department.department_id} className="organization-department relative p-4 w-full sm:w-72 sm:shrink-0">
                    <div aria-hidden="true" className="hidden sm:block absolute -top-6 left-1/2 h-6 w-px bg-gray-400" />
                    <div className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-center">
                      <p className="text-xs font-semibold text-brand-700 uppercase tracking-wide">{department.name}</p>
                      <div className="mt-2 pt-2 border-t border-brand-200 flex items-center justify-center gap-2">
                        <Avatar name={department.head?.name} src={department.head?.photo_url} size="sm" />
                        <div className="min-w-0 text-left">
                          <p className="text-xs text-brand-600">{t('amin.departmentHead')}</p>
                          <p className="text-sm font-bold text-gray-900 truncate">{department.head?.name || '-'}</p>
                        </div>
                      </div>
                    </div>
                    <div aria-hidden="true" className="h-4 w-px bg-gray-300 mx-auto" />
                    <div className="border-l border-gray-300 pl-3 space-y-2 min-h-11">
                      {departmentMinistries.length > 0 ? departmentMinistries.map(ministry => (
                        <div key={ministry.ministry_id} className="rounded-xl bg-control p-2.5 space-y-2">
                          <button type="button" onClick={() => openMembers(ministry)} className="w-full text-left text-sm font-medium text-gray-700 hover:text-brand-600 transition-colors" aria-label={t('amin.viewMembersAria', { name: ministry.name })}>
                            <span className="flex items-center gap-2"><Users size={15} className="text-purple-500" /> {ministry.name}</span>
                          </button>
                          {!isGembala && <div className="no-print flex gap-1.5 items-center">
                            <button type="button" disabled={organizationSaving || departmentMinistries.indexOf(ministry) === 0} onClick={() => moveMinistryOrder(ministry, -1)} className="w-9 h-9 rounded-lg bg-surface border border-gray-200 text-gray-600 disabled:opacity-40" aria-label={t('amin.moveUpAria', { name: ministry.name })}><ArrowUp size={16} className="mx-auto" /></button>
                            <button type="button" disabled={organizationSaving || departmentMinistries.indexOf(ministry) === departmentMinistries.length - 1} onClick={() => moveMinistryOrder(ministry, 1)} className="w-9 h-9 rounded-lg bg-surface border border-gray-200 text-gray-600 disabled:opacity-40" aria-label={t('amin.moveDownAria', { name: ministry.name })}><ArrowDown size={16} className="mx-auto" /></button>
                            <select value={ministry.department_id || ''} disabled={organizationSaving} onChange={event => moveMinistry(ministry, event.target.value)} className="flex-1 min-w-0 h-9 rounded-lg border border-gray-200 bg-surface px-2 text-xs text-gray-700">
                              <option value="">{t('amin.noDepartment')}</option>
                              {departments.map(item => <option key={item.department_id} value={item.department_id}>{item.name}</option>)}
                            </select>
                          </div>}
                        </div>
                      )) : <p className="text-xs text-gray-400 py-1">{t('amin.noDepartmentMinistries')}</p>}
                    </div>
                  </Card>
                )
              })}
              </div>
            </div>
          )}
          <Card className="no-print p-4 min-h-20">
            <p className="text-xs font-semibold text-gray-500 mb-2">{t('amin.unassignedMinistries')}</p>
            {orphanMinistries.length > 0 ? <div className="grid gap-2 sm:grid-cols-2">{orphanMinistries.map(ministry => (
              <div key={ministry.ministry_id} className="rounded-xl bg-control p-2.5 space-y-2">
                <button type="button" onClick={() => openMembers(ministry)} className="w-full text-left text-sm font-medium text-gray-700 hover:text-brand-600 transition-colors" aria-label={t('amin.viewMembersAria', { name: ministry.name })}><span className="flex items-center gap-2"><Users size={15} className="text-purple-500" /> {ministry.name}</span></button>
                {!isGembala && <div className="no-print flex gap-1.5 items-center">
                  <button type="button" disabled={organizationSaving || orphanMinistries.indexOf(ministry) === 0} onClick={() => moveMinistryOrder(ministry, -1)} className="w-9 h-9 rounded-lg bg-surface border border-gray-200 text-gray-600 disabled:opacity-40" aria-label={t('amin.moveUpAria', { name: ministry.name })}><ArrowUp size={16} className="mx-auto" /></button>
                  <button type="button" disabled={organizationSaving || orphanMinistries.indexOf(ministry) === orphanMinistries.length - 1} onClick={() => moveMinistryOrder(ministry, 1)} className="w-9 h-9 rounded-lg bg-surface border border-gray-200 text-gray-600 disabled:opacity-40" aria-label={t('amin.moveDownAria', { name: ministry.name })}><ArrowDown size={16} className="mx-auto" /></button>
                  <select value="" disabled={organizationSaving} onChange={event => moveMinistry(ministry, event.target.value)} className="flex-1 min-w-0 h-9 rounded-lg border border-gray-200 bg-surface px-2 text-xs text-gray-700">
                    <option value="">{t('amin.moveToDepartment')}</option>
                    {departments.map(item => <option key={item.department_id} value={item.department_id}>{item.name}</option>)}
                  </select>
                </div>}
              </div>
            ))}</div> : <p className="text-xs text-gray-400">{t('amin.noUnassignedMinistries')}</p>}
          </Card>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-4 space-y-4 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{editing ? t('amin.editTitle') : t('amin.addTitle')}</h2>
              <button
                onClick={() => setShowModal(false)}
                className="w-11 h-11 -mr-2 rounded-xl text-gray-500 hover:bg-control hover:text-gray-700 transition-colors flex items-center justify-center cursor-pointer"
                aria-label={t('a.cancel')}
              >
                <X size={18} />
              </button>
            </div>

            {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

            <Input label={t('amin.nameLabel')} required value={form.name} onChange={event => set('name', event.target.value)} />
            <Textarea label={t('acls.description')} rows={3} value={form.description} onChange={event => set('description', event.target.value)} />
            <Select label={t('amin.departmentLabel')} value={form.department_id} onChange={event => set('department_id', event.target.value)}>
              <option value="">{t('amin.noDepartment')}</option>
              {departments.map(department => <option key={department.department_id} value={department.department_id}>{department.name}</option>)}
            </Select>

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={() => setShowModal(false)}>{t('a.cancel')}</Button>
              <Button className="flex-1" loading={saving} onClick={handleSubmit}>
                {editing ? t('a.save') : t('a.add')}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showDepartmentModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card role="dialog" aria-modal="true" className="w-full max-w-md p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{editingDepartment ? t('amin.editDepartmentTitle') : t('amin.addDepartmentTitle')}</h2>
              <button type="button" onClick={() => setShowDepartmentModal(false)} className="w-11 h-11 -mr-2 rounded-xl text-gray-500 hover:bg-control hover:text-gray-700 transition-colors flex items-center justify-center" aria-label={t('a.cancel')}><X size={18} /></button>
            </div>
            {departmentError && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{departmentError}</div>}
            <Input label={t('amin.departmentNameLabel')} required value={departmentForm.name} onChange={event => setDepartmentForm(previous => ({ ...previous, name: event.target.value }))} />
            <Select label={t('amin.departmentHead')} required value={departmentForm.head_user_id} onChange={event => setDepartmentForm(previous => ({ ...previous, head_user_id: event.target.value }))}>
              <option value="">{t('amin.selectDepartmentHead')}</option>
              {headCandidates.map(person => <option key={person.user_id} value={person.user_id}>{person.name} — {t('role.' + person.role)}</option>)}
            </Select>
            <div className="flex gap-2 pt-1"><Button variant="ghost" className="flex-1" onClick={() => setShowDepartmentModal(false)}>{t('a.cancel')}</Button><Button className="flex-1" loading={departmentSaving} onClick={handleDepartmentSubmit}>{editingDepartment ? t('a.save') : t('a.add')}</Button></div>
          </Card>
        </div>
      )}

      {membersView && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-4">
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="ministry-members-title"
            className="w-full max-w-lg max-h-[90dvh] overflow-hidden flex flex-col"
          >
            <div className="flex items-center gap-3 p-4 border-b border-gray-100">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                <Users size={19} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 id="ministry-members-title" className="text-base font-semibold text-gray-900 truncate">
                  {t('amin.membersOf', { name: membersView.name })}
                </h2>
                {!membersLoading && !membersError && (
                  <p className="text-xs text-gray-500 mt-0.5">{t('amin.memberCount', { count: members.length })}</p>
                )}
              </div>
              {!membersLoading && !membersError && (
                <Button
                  size="sm"
                  variant={showAddMember ? 'primary' : 'secondary'}
                  className="min-h-11 px-2.5 shrink-0"
                  onClick={() => setShowAddMember(value => !value)}
                  aria-expanded={showAddMember}
                  aria-label={t('amin.addMember')}
                >
                  <UserPlus size={16} />
                  <span className="hidden sm:inline">{t('amin.addMember')}</span>
                </Button>
              )}
              <button
                onClick={closeMembers}
                className="w-11 h-11 -mr-2 rounded-xl text-gray-500 hover:bg-control hover:text-gray-700 transition-colors flex items-center justify-center cursor-pointer shrink-0"
                aria-label={t('amin.closeMembers')}
              >
                <X size={19} />
              </button>
            </div>

            {showAddMember && !membersLoading && !membersError && (
              <div className="border-b border-gray-100 bg-gray-50 p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{t('amin.addMemberTitle')}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t('amin.addMemberHint')}</p>
                </div>
                <Input
                  label={t('amin.searchAvailableMembers')}
                  icon={Search}
                  value={availableMemberSearch}
                  onChange={event => setAvailableMemberSearch(event.target.value)}
                  placeholder={t('amin.searchAvailableMembersPlaceholder')}
                />
                {availableMembersLoading && <div className="flex justify-center py-4"><Spinner size="sm" /></div>}
                {!availableMembersLoading && availableMembers.length === 0 && (
                  <p className="text-xs text-gray-500 text-center py-2">{t('amin.noAvailableMembers')}</p>
                )}
                {!availableMembersLoading && availableMembers.length > 0 && filteredAvailableMembers.length === 0 && (
                  <p className="text-xs text-gray-500 text-center py-2">{t('amin.noAvailableMemberResults')}</p>
                )}
                {!availableMembersLoading && filteredAvailableMembers.length > 0 && (
                  <div className="max-h-52 overflow-y-auto space-y-1">
                    {filteredAvailableMembers.map(member => (
                      <button
                        key={member.user_id}
                        type="button"
                        disabled={memberActionId !== null}
                        onClick={() => handleAddMember(member)}
                        className="w-full min-h-11 flex items-center gap-3 rounded-xl p-2.5 text-left bg-surface hover:bg-control transition-colors disabled:opacity-50"
                        aria-label={t('amin.addMemberAria', { name: member.name })}
                      >
                        <Avatar name={member.name} src={member.photo_url} size="sm" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-gray-900 truncate">{member.name}</span>
                          <span className="block text-xs text-gray-500 mt-0.5">{t('role.' + member.role)}</span>
                        </span>
                        {memberActionId === `add:${member.user_id}` ? <Spinner size="sm" /> : <UserPlus size={17} className="text-brand-500 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!membersLoading && !membersError && members.length > 0 && (
              <div className="p-4 border-b border-gray-100">
                <Input
                  label={t('amin.searchMembers')}
                  icon={Search}
                  value={memberSearch}
                  onChange={event => setMemberSearch(event.target.value)}
                  placeholder={t('amin.searchMembersPlaceholder')}
                />
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4">
              {membersLoading && <div className="flex justify-center py-12"><Spinner /></div>}

              {!membersLoading && membersError && (
                <div className="flex flex-col items-center text-center py-10 px-4">
                  <div className="w-14 h-14 rounded-full bg-red-50 text-red-500 flex items-center justify-center mb-4">
                    <RefreshCw size={24} />
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{t('amin.membersLoadFailed')}</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-4 min-h-11"
                    onClick={() => openMembers(membersView, false)}
                  >
                    <RefreshCw size={15} /> {t('amin.retry')}
                  </Button>
                </div>
              )}

              {!membersLoading && !membersError && members.length === 0 && (
                <EmptyState icon={Users} title={t('amin.noMembers')} description={t('amin.noMembersDesc')} />
              )}

              {!membersLoading && !membersError && members.length > 0 && filteredMembers.length === 0 && (
                <EmptyState icon={Search} title={t('amin.noMemberResults')} description={t('amin.noMemberResultsDesc')} />
              )}

              {!membersLoading && !membersError && filteredMembers.length > 0 && (
                <div className="space-y-2">
                  {filteredMembers.map(member => (
                    <div key={member.user_id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-surface">
                      <Avatar name={member.name} src={member.photo_url} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{member.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{t('role.' + member.role)}</p>
                      </div>
                      <StatusBadge status={member.status} />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-11 px-2.5 text-red-600 hover:bg-red-50 hover:text-red-700 shrink-0"
                        loading={memberActionId === `remove:${member.user_id}`}
                        disabled={memberActionId !== null}
                        onClick={() => handleRemoveMember(member)}
                        aria-label={t('amin.removeMemberAria', { name: member.name })}
                      >
                        <UserMinus size={16} />
                        <span className="hidden sm:inline">{t('amin.removeMember')}</span>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
