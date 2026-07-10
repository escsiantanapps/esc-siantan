import { useEffect, useState } from 'react'
import { Tag, Plus, Pencil, Trash2, X } from 'lucide-react'
import { taskCategoriesService } from '@/services/tasksService'
import { usersService } from '@/services/usersService'
import { useToast } from '@/hooks/useToast'
import { useBackClose } from '@/hooks/useBackClose'
import { Card, PageHeader, Button, Input, Checkbox, Spinner, EmptyState } from '@/components/ui'

const emptyForm = { name: '', ministry_ids: [] }

export default function AdminTaskCategoriesPage() {
  const { toast, confirm } = useToast()
  const [categories, setCategories] = useState([])
  const [ministries, setMinistries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useBackClose(showModal, () => setShowModal(false))

  useEffect(() => {
    load()
    usersService.getAllMinistries().then(setMinistries).catch(() => {})
  }, [])

  function load() {
    setLoading(true)
    taskCategoriesService.getAll().then(setCategories).catch(() => {}).finally(() => setLoading(false))
  }

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

  function toggleMinistry(mid) {
    setForm(p => ({
      ...p,
      ministry_ids: p.ministry_ids.includes(mid) ? p.ministry_ids.filter(m => m !== mid) : [...p.ministry_ids, mid],
    }))
  }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  function openEdit(item) {
    setEditing(item)
    setForm({ name: item.name || '', ministry_ids: item.ministry_ids || [] })
    setError('')
    setShowModal(true)
  }

  async function handleSubmit() {
    setError('')
    if (!form.name.trim()) { setError('Nama kategori wajib diisi.'); return }
    setSaving(true)
    try {
      if (editing) {
        await taskCategoriesService.update(editing.category_id, form)
      } else {
        await taskCategoriesService.create(form)
      }
      setShowModal(false)
      toast.success(editing ? 'Kategori berhasil diperbarui.' : 'Kategori berhasil dibuat.')
      load()
    } catch (err) {
      setError(err.message || 'Gagal menyimpan kategori.')
      toast.error(err.message || 'Gagal menyimpan kategori.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item) {
    const ok = await confirm({
      title: 'Hapus kategori tugas?',
      message: `Kategori "${item.name}" akan dihapus. Tugas yang memakainya akan kehilangan kategori (perlu dipilih ulang saat diedit).`,
      confirmText: 'Hapus',
      danger: true,
    })
    if (!ok) return
    try {
      await taskCategoriesService.delete(item.category_id)
      toast.success('Kategori berhasil dihapus.')
      load()
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus kategori.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Kategori Tugas"
        subtitle="Khusus Super Admin — batasi kategori tugas ke ministry tertentu"
        action={<Button size="sm" onClick={openCreate}><Plus size={15} /> Tambah</Button>}
      />

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && categories.length === 0 && (
        <EmptyState icon={Tag} title="Belum ada kategori tugas" description="Buat kategori untuk mengelompokkan & membatasi akses tugas per ministry." />
      )}

      {!loading && categories.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {categories.map(item => (
            <div key={item.category_id} className="flex items-center gap-3 p-3.5">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                <Tag size={20} className="text-indigo-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {item.ministry_ids.length === 0
                    ? 'Terbuka untuk semua ministry'
                    : `${item.ministry_ids.length} ministry dibatasi`}
                </p>
              </div>
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
              <h2 className="text-sm font-semibold text-gray-900">{editing ? 'Edit Kategori' : 'Tambah Kategori'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

            <Input label="Nama Kategori" required placeholder="cth. Komsel Youth" value={form.name} onChange={e => set('name', e.target.value)} />

            <div className="space-y-2">
              <p className="text-sm text-gray-600 font-medium">Batasi ke Ministry (opsional)</p>
              {ministries.length === 0 ? (
                <p className="text-sm text-gray-400">Belum ada data ministry.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2">
                  {ministries.map(m => (
                    <Checkbox key={m.ministry_id} label={m.name} checked={form.ministry_ids.includes(m.ministry_id)} onChange={() => toggleMinistry(m.ministry_id)} />
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400">Kosongkan agar kategori ini terbuka untuk semua ministry/role.</p>
            </div>

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
