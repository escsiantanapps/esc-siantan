import { useEffect, useState } from 'react'
import { Users, Plus, Pencil, Trash2, X, Eye, Crown, Search, UserPlus } from 'lucide-react'
import { komselService } from '@/services/contentService'
import { useToast } from '@/hooks/useToast'
import { Card, PageHeader, Button, Input, Spinner, EmptyState, Avatar, Badge } from '@/components/ui'

const emptyForm = { name: '', max_capacity: '' }

export default function AdminKomselPage() {
  const { toast, confirm } = useToast()
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
      toast.success(`${user.name} ditetapkan sebagai PKS.`)
    } catch (err) {
      toast.error(err.message || 'Gagal menetapkan PKS.')
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
      toast.success(`${user.name} dicabut dari PKS.`)
    } catch (err) {
      toast.error(err.message || 'Gagal mencabut PKS.')
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
    if (!form.name.trim()) { setError('Nama komsel wajib diisi.'); return }
    setSaving(true)
    try {
      const payload = { ...form, max_capacity: form.max_capacity === '' ? null : Number(form.max_capacity) }
      if (editing) {
        await komselService.update(editing.komsel_id, payload)
      } else {
        await komselService.create(payload)
      }
      setShowModal(false)
      toast.success(editing ? 'Komsel berhasil diperbarui.' : 'Komsel berhasil ditambahkan.')
      load()
    } catch (err) {
      setError(err.message || 'Gagal menyimpan komsel.')
      toast.error(err.message || 'Gagal menyimpan komsel.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item) {
    const ok = await confirm({
      title: 'Hapus komsel?',
      message: `Komsel "${item.name}" akan dihapus permanen.`,
      confirmText: 'Hapus',
      danger: true,
    })
    if (!ok) return
    try {
      await komselService.delete(item.komsel_id)
      toast.success('Komsel berhasil dihapus.')
      load()
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus komsel.')
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
        title="Kelola Komsel"
        subtitle={`${komsel.length} komsel`}
        action={<Button size="sm" onClick={openCreate}><Plus size={15} /> Tambah Komsel</Button>}
      />

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && komsel.length === 0 && (
        <EmptyState icon={Users} title="Belum ada komsel" description="Tambahkan kelompok komsel pertama." />
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
                  PKS: {leaderMap[item.komsel_id]?.length ? leaderMap[item.komsel_id].join(', ') : 'Belum ada'}
                </p>
                {item.max_capacity && <p className="text-xs text-gray-400 mt-0.5">Kapasitas: {item.max_capacity}</p>}
              </div>
              <button onClick={() => openPks(item)} title="Kelola PKS" className="p-2 text-gray-400 hover:text-amber-500 shrink-0">
                <Crown size={16} />
              </button>
              <button onClick={() => viewMembers(item)} title="Anggota" className="p-2 text-gray-400 hover:text-blue-500 shrink-0">
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
              <h2 className="text-sm font-semibold text-gray-900">{editing ? 'Edit Komsel' : 'Tambah Komsel'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

            <Input label="Nama Komsel" required value={form.name} onChange={e => set('name', e.target.value)} />
            <Input label="Kapasitas Maksimal" type="number" min="0" value={form.max_capacity} onChange={e => set('max_capacity', e.target.value)} />
            <p className="text-xs text-gray-400">PKS komsel ditetapkan lewat tombol mahkota pada daftar komsel.</p>

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={() => setShowModal(false)}>Batal</Button>
              <Button className="flex-1" loading={saving} onClick={handleSubmit}>
                {editing ? 'Simpan' : 'Tambah'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {membersView && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-4 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Anggota {membersView.name}</h2>
              <button onClick={() => setMembersView(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {membersLoading && <div className="flex justify-center py-8"><Spinner /></div>}

            {!membersLoading && members.length === 0 && (
              <EmptyState icon={Users} title="Belum ada anggota" description="Anggota komsel ini belum terdaftar." />
            )}

            {!membersLoading && members.length > 0 && (
              <div className="space-y-2">
                {members.map(m => (
                  <div key={m.user_id} className="flex items-center gap-3 px-1 py-1.5">
                    <Avatar name={m.name} src={m.photo_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                      <p className="text-xs text-gray-400">{m.role}</p>
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
                <Crown size={16} className="text-amber-500" /> PKS — {pksView.name}
              </h2>
              <button onClick={() => setPksView(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {/* PKS saat ini */}
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-2">PKS saat ini</p>
              {leadersLoading ? (
                <div className="flex justify-center py-4"><Spinner size="sm" /></div>
              ) : leaders.length === 0 ? (
                <p className="text-sm text-gray-400">Belum ada PKS untuk komsel ini.</p>
              ) : (
                <div className="space-y-2">
                  {leaders.map(l => (
                    <div key={l.user_id} className="flex items-center gap-3 px-1">
                      <Avatar name={l.name} src={l.photo_url} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{l.name}</p>
                        <p className="text-xs text-gray-400">{l.role}</p>
                      </div>
                      <button
                        onClick={() => removePks(l)} disabled={pksBusy}
                        className="text-xs text-red-500 hover:text-red-600 disabled:opacity-50 px-2 py-1"
                      >
                        Cabut
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tambah PKS */}
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-400 mb-2">Tambah PKS</p>
              <Input
                icon={Search}
                placeholder="Cari nama jemaat..."
                value={pksQuery}
                onChange={e => setPksQuery(e.target.value)}
              />
              <div className="mt-2 space-y-1 max-h-52 overflow-y-auto">
                {pksResults.length === 0 ? (
                  <p className="text-xs text-gray-400 px-1 py-2">Ketik untuk mencari jemaat.</p>
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
                        <p className="text-xs text-gray-400">{u.role}</p>
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
