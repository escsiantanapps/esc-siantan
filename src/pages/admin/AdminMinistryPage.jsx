import { useEffect, useState } from 'react'
import { Church, Plus, Pencil, Trash2, X } from 'lucide-react'
import { ministriesService } from '@/services/contentService'
import { useToast } from '@/hooks/useToast'
import { Card, PageHeader, Button, Input, Textarea, Spinner, EmptyState } from '@/components/ui'

const emptyForm = { name: '', description: '' }

export default function AdminMinistryPage() {
  const { toast, confirm } = useToast()
  const [ministries, setMinistries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  function load() {
    setLoading(true)
    ministriesService.getAll().then(setMinistries).catch(() => {}).finally(() => setLoading(false))
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
    setForm({ name: item.name || '', description: item.description || '' })
    setError('')
    setShowModal(true)
  }

  async function handleSubmit() {
    setError('')
    if (!form.name.trim()) { setError('Nama ministry wajib diisi.'); return }
    setSaving(true)
    try {
      if (editing) {
        await ministriesService.update(editing.ministry_id, form)
      } else {
        await ministriesService.create(form)
      }
      setShowModal(false)
      toast.success(editing ? 'Ministry berhasil diperbarui.' : 'Ministry berhasil ditambahkan.')
      load()
    } catch (err) {
      setError(err.message || 'Gagal menyimpan ministry.')
      toast.error(err.message || 'Gagal menyimpan ministry.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item) {
    const ok = await confirm({
      title: 'Hapus ministry?',
      message: `Ministry "${item.name}" akan dihapus permanen.`,
      confirmText: 'Hapus',
      danger: true,
    })
    if (!ok) return
    try {
      await ministriesService.delete(item.ministry_id)
      toast.success('Ministry berhasil dihapus.')
      load()
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus ministry.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Kelola Ministry"
        subtitle={`${ministries.length} ministry`}
        action={<Button size="sm" onClick={openCreate}><Plus size={15} /> Tambah Ministry</Button>}
      />

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && ministries.length === 0 && (
        <EmptyState icon={Church} title="Belum ada ministry" description="Tambahkan pelayanan/ministry pertama." />
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
              <button onClick={() => openEdit(item)} className="p-2 text-gray-400 hover:text-orange-500 shrink-0">
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
              <h2 className="text-sm font-semibold text-gray-900">{editing ? 'Edit Ministry' : 'Tambah Ministry'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

            <Input label="Nama Ministry" required value={form.name} onChange={e => set('name', e.target.value)} />
            <Textarea label="Deskripsi" rows={3} value={form.description} onChange={e => set('description', e.target.value)} />

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={() => setShowModal(false)}>Batal</Button>
              <Button className="flex-1" loading={saving} onClick={handleSubmit}>
                {editing ? 'Simpan' : 'Tambah'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
