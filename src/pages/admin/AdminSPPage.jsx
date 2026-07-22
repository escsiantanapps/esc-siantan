import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronRight, Plus, X, FileText, Pencil, Trash2, Tag } from 'lucide-react'
import { spService } from '@/services/spService'
import { spCategoriesService } from '@/services/spCategoriesService'
import { usersService } from '@/services/usersService'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useBackClose } from '@/hooks/useBackClose'
import { Card, PageHeader, Spinner, EmptyState, StatusBadge, Avatar, Button, Input, Select, Textarea } from '@/components/ui'
import { useLang } from '@/hooks/useLang'
import { truncate } from '@/lib/utils'

const emptyCategoryForm = { name: '', level: 1, description: '' }

export default function AdminSPPage() {
  const { t } = useLang()
  const { profile } = useAuth()
  const { toast, confirm } = useToast()
  
  const isGembala = profile?.role === 'Gembala'

  // Tab: 'list', 'issue', atau 'categories'
  const [tab, setTab] = useState('list')
  
  // State untuk list view
  const [members, setMembers] = useState([])
  const [stats, setStats] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [loading, setLoading] = useState(true)
  
  // State untuk issue SP form
  const [showIssueModal, setShowIssueModal] = useState(false)
  const [categories, setCategories] = useState([])
  const [searchUser, setSearchUser] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [form, setForm] = useState({ category_id: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  
  // State untuk categories tab (CRUD kategori SP)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm)
  const [categorySaving, setCategorySaving] = useState(false)
  const [categoryError, setCategoryError] = useState('')
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  
  useBackClose(showIssueModal, () => setShowIssueModal(false))
  useBackClose(showCategoryModal, () => setShowCategoryModal(false))

  // Load data untuk list view
  useEffect(() => {
    if (tab === 'list') {
      loadList()
    } else if (tab === 'categories') {
      loadCategories()
    }
  }, [tab, selectedCategory])

  // Load categories untuk issue form
  useEffect(() => {
    spCategoriesService.getAll()
      .then(cats => {
        setCategories(cats)
        // Set default category ke yang level terendah (bukan Aman)
        const nonAman = cats.filter(c => c.name !== 'Aman')
        if (nonAman.length > 0 && !form.category_id) {
          setForm(p => ({ ...p, category_id: nonAman[0].category_id }))
        }
      })
      .catch(() => {})
  }, [])

  function loadList() {
    setLoading(true)
    Promise.all([
      spService.getAllWithActiveSP(selectedCategory),
      spService.getStats()
    ])
      .then(([members, stats]) => {
        setMembers(members)
        setStats(stats)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  // Search user (debounced)
  useEffect(() => {
    if (!searchUser.trim()) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(() => {
      usersService.getAll({ search: searchUser, limit: 10, page: 1 })
        .then(({ data }) => setSearchResults(data))
        .catch(() => setSearchResults([]))
    }, 300)
    return () => clearTimeout(timer)
  }, [searchUser])

  function openIssueModal() {
    setShowIssueModal(true)
    setSelectedUser(null)
    setSearchUser('')
    setSearchResults([])
    setForm({ 
      category_id: categories.filter(c => c.name !== 'Aman')[0]?.category_id || '', 
      notes: '' 
    })
    setError('')
  }

  function selectUser(user) {
    setSelectedUser(user)
    setSearchUser('')
    setSearchResults([])
  }

  async function handleIssueSP() {
    setError('')
    if (!selectedUser) { setError('Pilih jemaat terlebih dahulu.'); return }
    if (!form.category_id) { setError('Pilih kategori SP.'); return }
    if (!form.notes.trim()) { setError('Keterangan SP wajib diisi.'); return }

    setSaving(true)
    try {
      await spService.issue({
        user_id: selectedUser.user_id,
        category_id: form.category_id,
        notes: form.notes.trim(),
        issued_by: profile.user_id,
      })
      setShowIssueModal(false)
      toast.success(`SP berhasil diterbitkan kepada ${selectedUser.name}.`)
      loadList()
    } catch (err) {
      setError(err.message || 'Gagal menerbitkan SP.')
      toast.error(err.message || 'Gagal menerbitkan SP.')
    } finally {
      setSaving(false)
    }
  }

  // === Fungsi untuk tab Kategori SP ===
  
  function loadCategories() {
    setCategoriesLoading(true)
    spCategoriesService.getAll()
      .then(cats => {
        setCategories(cats)
      })
      .catch(() => {})
      .finally(() => setCategoriesLoading(false))
  }

  function setCatForm(key, val) { setCategoryForm(p => ({ ...p, [key]: val })) }

  function openCreateCategory() {
    setEditingCategory(null)
    setCategoryForm(emptyCategoryForm)
    setCategoryError('')
    setShowCategoryModal(true)
  }

  function openEditCategory(item) {
    setEditingCategory(item)
    setCategoryForm({ 
      name: item.name || '', 
      level: item.level || 1, 
      description: item.description || '' 
    })
    setCategoryError('')
    setShowCategoryModal(true)
  }

  async function handleSubmitCategory() {
    setCategoryError('')
    if (!categoryForm.name.trim()) { setCategoryError('Nama kategori SP wajib diisi.'); return }
    if (!categoryForm.level || categoryForm.level < 0) { setCategoryError('Level harus diisi dengan angka positif.'); return }
    setCategorySaving(true)
    try {
      if (editingCategory) {
        await spCategoriesService.update(editingCategory.category_id, categoryForm)
      } else {
        await spCategoriesService.create(categoryForm)
      }
      setShowCategoryModal(false)
      toast.success(editingCategory ? 'Kategori SP berhasil diperbarui.' : 'Kategori SP berhasil dibuat.')
      loadCategories()
    } catch (err) {
      setCategoryError(err.message || 'Gagal menyimpan kategori SP.')
      toast.error(err.message || 'Gagal menyimpan kategori SP.')
    } finally {
      setCategorySaving(false)
    }
  }

  async function handleDeleteCategory(item) {
    const ok = await confirm({
      title: 'Hapus kategori SP?',
      message: `Kategori "${item.name}" akan dihapus. SP yang sudah diterbitkan dengan kategori ini akan gagal dihapus (data dilindungi).`,
      confirmText: 'Hapus',
      danger: true,
    })
    if (!ok) return
    try {
      await spCategoriesService.delete(item.category_id)
      toast.success('Kategori SP berhasil dihapus.')
      loadCategories()
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus kategori SP. Pastikan tidak ada SP yang masih menggunakan kategori ini.')
    }
  }

  const totalWithSP = stats.reduce((sum, s) => sum + s.count, 0)

  return (
    <div>
      <PageHeader
        title="Surat Peringatan"
        subtitle={
          tab === 'list' ? `${totalWithSP} jemaat memiliki SP aktif` : 
          tab === 'categories' ? 'Kelola kategori Surat Peringatan' :
          'Terbitkan SP kepada jemaat'
        }
        action={
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant={tab === 'list' ? 'primary' : 'ghost'} onClick={() => setTab('list')}>
              Daftar SP
            </Button>
            {!isGembala && (
              <Button size="sm" variant={tab === 'issue' ? 'primary' : 'ghost'} onClick={() => { setTab('issue'); openIssueModal() }}>
                <Plus size={15} /> Terbitkan SP
              </Button>
            )}
            {!isGembala && (
              <Button size="sm" variant={tab === 'categories' ? 'primary' : 'ghost'} onClick={() => setTab('categories')}>
                <Tag size={15} /> Kategori
              </Button>
            )}
          </div>
        }
      />

      {/* Tab: Daftar jemaat dengan SP aktif */}
      {tab === 'list' && (
        <>
          {/* Filter by category */}
          <div className="flex gap-2 mb-4 overflow-x-auto">
            <button
              onClick={() => setSelectedCategory('')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
                ${!selectedCategory ? 'gradient-main text-white' : 'bg-control text-gray-500'}`}
            >
              Semua ({totalWithSP})
            </button>
            {stats.filter(s => s.name !== 'Aman').map(s => (
              <button
                key={s.category_id}
                onClick={() => setSelectedCategory(s.category_id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
                  ${selectedCategory === s.category_id ? 'gradient-main text-white' : 'bg-control text-gray-500'}`}
              >
                {s.name} ({s.count})
              </button>
            ))}
          </div>

          {/* Stats cards */}
          {!loading && !selectedCategory && stats.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              {stats.filter(s => s.name !== 'Aman').map(s => (
                <Card key={s.category_id} className="p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{s.count}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.name}</p>
                </Card>
              ))}
            </div>
          )}

          {loading && <div className="flex justify-center py-12"><Spinner /></div>}

          {!loading && members.length === 0 && (
            <EmptyState 
              icon={AlertTriangle} 
              title="Belum ada jemaat dengan SP aktif" 
              description="Terbitkan SP kepada jemaat dari tab 'Terbitkan SP'." 
            />
          )}

          {!loading && members.length > 0 && (
            <Card className="divide-y divide-gray-100">
              {members.map(m => (
                <Link 
                  key={m.user_id} 
                  to={`/admin/jemaat/${m.user_id}`} 
                  className="flex items-center gap-3 p-3.5 hover:bg-gray-50 transition-colors"
                >
                  <Avatar name={m.name} src={m.photo_url} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {m.sp_notes ? truncate(m.sp_notes, 60) : t(`role.${m.role}`)}
                    </p>
                  </div>
                  <StatusBadge status={m.sp_level} />
                  <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                </Link>
              ))}
            </Card>
          )}
        </>
      )}

      {/* Modal: Terbitkan SP */}
      {showIssueModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-4 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Terbitkan SP</h2>
              <button onClick={() => setShowIssueModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

            {/* Step 1: Pilih jemaat */}
            {!selectedUser ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">Langkah 1: Cari dan pilih jemaat</p>
                <Input
                  placeholder="Cari nama jemaat..."
                  value={searchUser}
                  onChange={e => setSearchUser(e.target.value)}
                  autoFocus
                />
                {searchResults.length > 0 && (
                  <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-64 overflow-y-auto">
                    {searchResults.map(u => (
                      <button
                        key={u.user_id}
                        onClick={() => selectUser(u)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
                      >
                        <Avatar name={u.name} src={u.photo_url} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                          <p className="text-xs text-gray-400">{u.phone}</p>
                        </div>
                        {u.sp_level !== 'Aman' && <StatusBadge status={u.sp_level} />}
                      </button>
                    ))}
                  </div>
                )}
                {searchUser && searchResults.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">Tidak ada hasil.</p>
                )}
              </div>
            ) : (
              <>
                {/* Step 2: Form issue SP */}
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">Langkah 2: Isi detail SP</p>
                  
                  {/* Selected user */}
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <Avatar name={selectedUser.name} src={selectedUser.photo_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{selectedUser.name}</p>
                      <p className="text-xs text-gray-400">{selectedUser.phone}</p>
                    </div>
                    <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-gray-600">
                      <X size={16} />
                    </button>
                  </div>

                  {/* Category */}
                  <Select
                    label="Kategori SP"
                    required
                    value={form.category_id}
                    onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}
                  >
                    <option value="">Pilih kategori...</option>
                    {categories.filter(c => c.name !== 'Aman').map(c => (
                      <option key={c.category_id} value={c.category_id}>
                        {c.name} (Level {c.level})
                      </option>
                    ))}
                  </Select>

                  {/* Notes */}
                  <Textarea
                    label="Keterangan SP"
                    required
                    rows={4}
                    placeholder="Tuliskan alasan/keterangan pemberian SP ini..."
                    value={form.notes}
                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowIssueModal(false)}>
                    Batal
                  </Button>
                  <Button className="flex-1" loading={saving} onClick={handleIssueSP}>
                    <FileText size={15} /> Terbitkan SP
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {/* Tab: Kategori SP (CRUD) */}
      {tab === 'categories' && (
        <>
          <div className="flex justify-end mb-4">
            <Button size="sm" onClick={openCreateCategory}>
              <Plus size={15} /> Tambah Kategori
            </Button>
          </div>

          {categoriesLoading && <div className="flex justify-center py-12"><Spinner /></div>}

          {!categoriesLoading && categories.length === 0 && (
            <EmptyState 
              icon={Tag} 
              title="Belum ada kategori SP" 
              description="Buat kategori untuk mengelompokkan tingkat surat peringatan (SP 1, SP 2, SP 3, dll)." 
            />
          )}

          {!categoriesLoading && categories.length > 0 && (
            <Card className="divide-y divide-gray-100">
              {categories.map(item => (
                <div key={item.category_id} className="flex items-center gap-3 p-3.5">
                  <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                    <AlertTriangle size={20} className="text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Level {item.level} {item.description && `· ${item.description}`}
                    </p>
                  </div>
                  <button onClick={() => openEditCategory(item)} className="p-2 text-gray-400 hover:text-brand-500 shrink-0">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => handleDeleteCategory(item)} className="p-2 text-gray-400 hover:text-red-500 shrink-0">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {/* Modal: CRUD Kategori SP */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-4 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                {editingCategory ? 'Edit Kategori SP' : 'Tambah Kategori SP'}
              </h2>
              <button onClick={() => setShowCategoryModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {categoryError && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{categoryError}</div>}

            <Input 
              label="Nama Kategori" 
              required 
              placeholder="cth. SP 1, SP 2, Peringatan Keras" 
              value={categoryForm.name} 
              onChange={e => setCatForm('name', e.target.value)} 
            />

            <Input 
              label="Level (semakin tinggi = semakin parah)" 
              type="number" 
              required 
              placeholder="1" 
              value={categoryForm.level} 
              onChange={e => setCatForm('level', parseInt(e.target.value) || 1)} 
            />

            <Textarea 
              label="Deskripsi (opsional)" 
              rows={3} 
              placeholder="Penjelasan singkat tentang kategori ini" 
              value={categoryForm.description} 
              onChange={e => setCatForm('description', e.target.value)} 
            />

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={() => setShowCategoryModal(false)}>
                Batal
              </Button>
              <Button className="flex-1" loading={categorySaving} onClick={handleSubmitCategory}>
                {editingCategory ? 'Simpan' : 'Tambah'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
