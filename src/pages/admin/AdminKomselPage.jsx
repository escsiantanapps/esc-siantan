import { useEffect, useState } from 'react'
import { Users, Plus, Pencil, Trash2, X, Eye, Crown, Search, UserPlus } from 'lucide-react'
import { komselService } from '@/services/contentService'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { Card, PageHeader, Button, Input, Spinner, EmptyState, Avatar, Badge } from '@/components/ui'

const emptyForm = { name: '', max_capacity: '' }

export default function AdminKomselPage() {
  const { toast, confirm } = useToast()
  const { t } = useLang()
  const [komsel, setKomsel] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [membersView, setMembersView] = useState(null)
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)

  const [leaderMap, setLeaderMap] = useState({})
  const [pksView, setPksView] = useState(null)
  const [leaders, setLeaders] = useState([])
  const [leadersLoading, setLeadersLoading] = useState(false)
  const [pksQuery, setPksQuery] = useState('')
  const [pksResults, setPksResults] = useState([])
  const [pksBusy, setPksBusy] = useState(false)

  useEffect(() => { load() }, [])

  function load() {
    setLoading(true)
    Promise.all([
      komselService.getAll(),
      komselService.getLeaderNamesByKomsel().catch(() => ({})),
    ])
      .then(([list, map]) => { setKomsel(list); setLeaderMap(map) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  async function openPks(item) {
    setPksView(item)
    setPksQuery('')
    setPksResults([])
    setLeadersLoading(true)
    try {
      setLeaders(await komselService.getLeaders(item.komsel_id))
    } catch {
      setLeaders([])
    } finally {
      setLeadersLoading(false)
    }
  }

  // Cari jemaat saat mengetik (debounce ringan).
  useEffect(() => {
    if (!pksView) return
    const t = setTimeout(() => {
      komselService.searchUsers(pksQuery).then(setPksResults).catch(() => setPksResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [pksQuery, pksView])

  async function addPks(user) {
    if (leaders.some(l => l.user_id === user.user_id)) return
    setPksBusy(true)
    try {
      await komselService.addLeader(pksView.komsel_id, user.user_id)
      setLeaders(await komselService.getLeaders(pksView.komsel_id))
      setLeaderMap(await komselService.getLeaderNamesByKomsel())
      toast.success(t('akom.assigned', { name: user.name }))
    } catch (err) {
      toast.error(err.message || t('akom.assignFailed'))
    } finally {
      setPksBusy(false)
    }
  }

  async function removePks(user) {
    setPksBusy(true)
    try {
      await komselService.removeLeader(pksView.komsel_id, user.user_id)
      setLeaders(await komselService.getLeaders(pksView.komsel_id))
      setLeaderMap(await komselService.getLeaderNamesByKomsel())
      toast.success(t('akom.removed', { name: user.name }))
    } catch (err) {
      toast.error(err.message || t('akom.removeFailed'))
    } finally {
      setPksBusy(false)
    }
  }

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  function openEdit(item) {
    setEditing(item)
    setForm({
      name: item.name || '',
      max_capacity: item.max_capacity ?? '',
    })
    setError('')
    setShowModal(true)
  }

  async function handleSubmit() {
    setError('')
    if (!form.name.trim()) { setError(t('akom.nameRequired')); return }
    setSaving(true)
    try {
      const payload = { ...form, max_capacity: form.max_capacity === '' ? null : Number(form.max_capacity) }
      if (editing) {
        await komselService.update(editing.komsel_id, payload)
      } else {
        await komselService.create(payload)
      }
      setShowModal(false)
      toast.success(editing ? t('akom.updated') : t('akom.created'))
      load()
    } catch (err) {
      setError(err.message || t('akom.saveFailed'))
      toast.error(err.message || t('akom.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item) {
    const ok = await confirm({
      title: t('akom.deleteTitle'),
      message: t('akom.deleteMsg', { name: item.name }),
      confirmText: t('a.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await komselService.delete(item.komsel_id)
      toast.success(t('akom.deleted'))
      load()
    } catch (err) {
      toast.error(err.message || t('akom.deleteFailed'))
    }
  }

  async function viewMembers(item) {
    setMembersView(item)
    setMembersLoading(true)
    try {
      const data = await komselService.getMembers(item.komsel_id)
      setMembers(data)
    } catch {
      setMembers([])
    } finally {
      setMembersLoading(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={t('akom.title')}
        subtitle={t('akom.subtitle', { count: komsel.length })}
        action={<Button size="sm" onClick={openCreate}><Plus size={15} /> {t('akom.add')}</Button>}
      />

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && komsel.length === 0 && (
        <EmptyState icon={Users} title={t('akom.empty')} description={t('akom.emptyDesc')} />
      )}

      {!loading && komsel.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {komsel.map(item => (
            <div key={item.komsel_id} className="flex items-center gap-3 p-3.5">
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                <Users size={20} className="text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {t('akom.pksLabel', { names: leaderMap[item.komsel_id]?.length ? leaderMap[item.komsel_id].join(', ') : t('akom.pksNone') })}
                </p>
                {item.max_capacity && <p className="text-xs text-gray-400 mt-0.5">{t('akom.capacity', { n: item.max_capacity })}</p>}
              </div>
              <button onClick={() => openPks(item)} title={t('akom.managePks')} className="p-2 text-gray-400 hover:text-amber-500 shrink-0">
                <Crown size={16} />
              </button>
              <button onClick={() => viewMembers(item)} title={t('akom.membersBtn')} className="p-2 text-gray-400 hover:text-blue-500 shrink-0">
                <Eye size={16} />
              </button>
              <button onClick={() => openEdit(item)} className="p-2 text-gray-400 hover:text-brand-500 shrink-0">
                <Pencil size={16} />
              </button>
              <button onClick={() => handleDelete(item)} className="p-2 text-gray-400 hover:text-red-500 shrink-0">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </Card>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-4 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{editing ? t('akom.editTitle') : t('akom.addTitle')}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

            <Input label={t('akom.nameLabel')} required value={form.name} onChange={e => set('name', e.target.value)} />
            <Input label={t('akom.maxCapacity')} type="number" min="0" value={form.max_capacity} onChange={e => set('max_capacity', e.target.value)} />
            <p className="text-xs text-gray-400">{t('akom.crownHint')}</p>

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
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-4 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{t('akom.membersOf', { name: membersView.name })}</h2>
              <button onClick={() => setMembersView(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {membersLoading && <div className="flex justify-center py-8"><Spinner /></div>}

            {!membersLoading && members.length === 0 && (
              <EmptyState icon={Users} title={t('akom.noMembers')} description={t('akom.noMembersDesc')} />
            )}

            {!membersLoading && members.length > 0 && (
              <div className="space-y-2">
                {members.map(m => (
                  <div key={m.user_id} className="flex items-center gap-3 px-1 py-1.5">
                    <Avatar name={m.name} src={m.photo_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                      <p className="text-xs text-gray-400">{t(`role.${m.role}`)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Modal Kelola PKS */}
      {pksView && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-4 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <Crown size={16} className="text-amber-500" /> {t('akom.pksOf', { name: pksView.name })}
              </h2>
              <button onClick={() => setPksView(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {/* PKS saat ini */}
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-2">{t('akom.currentPks')}</p>
              {leadersLoading ? (
                <div className="flex justify-center py-4"><Spinner size="sm" /></div>
              ) : leaders.length === 0 ? (
                <p className="text-sm text-gray-400">{t('akom.noPks')}</p>
              ) : (
                <div className="space-y-2">
                  {leaders.map(l => (
                    <div key={l.user_id} className="flex items-center gap-3 px-1">
                      <Avatar name={l.name} src={l.photo_url} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{l.name}</p>
                        <p className="text-xs text-gray-400">{t(`role.${l.role}`)}</p>
                      </div>
                      <button
                        onClick={() => removePks(l)} disabled={pksBusy}
                        className="text-xs text-red-500 hover:text-red-600 disabled:opacity-50 px-2 py-1"
                      >
                        {t('akom.revoke')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tambah PKS */}
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-400 mb-2">{t('akom.addPks')}</p>
              <Input
                icon={Search}
                placeholder={t('akom.searchMember')}
                value={pksQuery}
                onChange={e => setPksQuery(e.target.value)}
              />
              <div className="mt-2 space-y-1 max-h-52 overflow-y-auto">
                {pksResults.length === 0 ? (
                  <p className="text-xs text-gray-400 px-1 py-2">{t('akom.typeToSearch')}</p>
                ) : pksResults.map(u => {
                  const already = leaders.some(l => l.user_id === u.user_id)
                  return (
                    <button
                      key={u.user_id}
                      onClick={() => addPks(u)}
                      disabled={already || pksBusy}
                      className="w-full flex items-center gap-3 px-1 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-left"
                    >
                      <Avatar name={u.name} src={u.photo_url} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                        <p className="text-xs text-gray-400">{t(`role.${u.role}`)}</p>
                      </div>
                      {already
                        ? <Badge color="green">PKS</Badge>
                        : <UserPlus size={16} className="text-brand-500 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
