import { useEffect, useState } from 'react'
import { Church, Plus, Pencil, Trash2, X, Users, Search, RefreshCw, UserPlus, UserMinus } from 'lucide-react'
import { ministriesService } from '@/services/contentService'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { useBackClose } from '@/hooks/useBackClose'
import { Card, PageHeader, Button, Input, Textarea, Spinner, EmptyState, Avatar, StatusBadge } from '@/components/ui'

const emptyForm = { name: '', description: '' }

export default function AdminMinistryPage() {
  const { toast, confirm } = useToast()
  const { t } = useLang()
  const { profile } = useAuth()
  const isGembala = profile?.role === 'Gembala'
  const [ministries, setMinistries] = useState([])
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
  useBackClose(Boolean(membersView), closeMembers)

  useEffect(() => { load() }, [])

  function load() {
    setLoading(true)
    ministriesService.getAll().then(setMinistries).catch(() => {}).finally(() => setLoading(false))
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
    setForm({ name: item.name || '', description: item.description || '' })
    setError('')
    setShowModal(true)
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
      if (editing) {
        await ministriesService.update(editing.ministry_id, form)
      } else {
        await ministriesService.create(form)
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

  return (
    <div>
      <PageHeader
        title={t('amin.title')}
        subtitle={t('amin.subtitle', { count: ministries.length })}
        action={!isGembala && <Button size="sm" onClick={openCreate}><Plus size={15} /> {t('amin.add')}</Button>}
      />

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && ministries.length === 0 && (
        <EmptyState icon={Church} title={t('amin.empty')} description={t('amin.emptyDesc')} />
      )}

      {!loading && ministries.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {ministries.map(item => (
            <div key={item.ministry_id} className="flex items-center gap-3 p-3.5">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
                <Church size={20} className="text-purple-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                {item.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.description}</p>}
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

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={() => setShowModal(false)}>{t('a.cancel')}</Button>
              <Button className="flex-1" loading={saving} onClick={handleSubmit}>
                {editing ? t('a.save') : t('a.add')}
              </Button>
            </div>
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
