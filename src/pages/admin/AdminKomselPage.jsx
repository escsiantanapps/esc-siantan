import { useEffect, useState } from 'react'
import { Users, Plus, Pencil, Trash2, X, Eye } from 'lucide-react'
import { komselService } from '@/services/contentService'
import { useToast } from '@/hooks/useToast'
import { Card, PageHeader, Button, Input, Spinner, EmptyState, Avatar } from '@/components/ui'

const emptyForm = { name: '', leader_name: '', max_capacity: '' }

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

  useEffect(() => { load() }, [])

  function load() {
    setLoading(true)
    komselService.getAll().then(setKomsel).catch(() => {}).finally(() => setLoading(false))
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
      leader_name: item.leader_name || '',
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
                {item.leader_name && <p className="text-xs text-gray-400 mt-0.5 truncate">PKS: {item.leader_name}</p>}
                {item.max_capacity && <p className="text-xs text-gray-400 mt-0.5">Kapasitas: {item.max_capacity}</p>}
              </div>
              <button onClick={() => viewMembers(item)} className="p-2 text-gray-400 hover:text-blue-500 shrink-0">
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
            <Input label="Nama PKS / Leader" value={form.leader_name} onChange={e => set('leader_name', e.target.value)} />
            <Input label="Kapasitas Maksimal" type="number" min="0" value={form.max_capacity} onChange={e => set('max_capacity', e.target.value)} />

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
    </div>
  )
}
