import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Plus, ChevronRight, BarChart2, Bell, Tag, Pencil, Trash2, X } from 'lucide-react'
import { startOfWeek, startOfMonth } from 'date-fns'
import { tasksService, taskCategoriesService } from '@/services/tasksService'
import { evaluationService } from '@/services/evaluationService'
import { pushService } from '@/services/pushService'
import { usersService } from '@/services/usersService'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'
import { useBackClose } from '@/hooks/useBackClose'
import { Card, PageHeader, Button, Input, Checkbox, Spinner, EmptyState } from '@/components/ui'
import { useLang } from '@/hooks/useLang'

const TABS = ['Tugas & Form', 'Kategori Tugas']
const emptyForm = { name: '', ministry_ids: [] }

export default function AdminTasksPage() {
  const { t: tr } = useLang()
  const { toast, confirm } = useToast()
  const { profile } = useAuth()
  const isGembala = profile?.role === 'Gembala'
  const [activeTab, setActiveTab] = useState(0)

  // ── Tab 0: Tugas & Form ──
  const [templates, setTemplates] = useState([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [sendingId, setSendingId] = useState(null)

  // ── Tab 1: Kategori Tugas ──
  const [categories, setCategories] = useState([])
  const [ministries, setMinistries] = useState([])
  const [loadingCats, setLoadingCats] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useBackClose(showModal, () => setShowModal(false))

  useEffect(() => {
    tasksService.getTemplates().then(setTemplates).catch(() => {}).finally(() => setLoadingTemplates(false))
    loadCategories()
    usersService.getAllMinistries().then(setMinistries).catch(() => {})
  }, [])

  function loadCategories() {
    setLoadingCats(true)
    taskCategoriesService.getAll().then(setCategories).catch(() => {}).finally(() => setLoadingCats(false))
  }

  // ── Kirim pengingat push ──
  async function sendReminder(tpl) {
    const ok = await confirm({
      title: tr('atask.remindTitle'),
      message: tr('atask.remindMsg', { title: tpl.title }),
      confirmText: tr('atask.remind'),
    })
    if (!ok) return
    setSendingId(tpl.form_id)
    try {
      const periodStart = tpl.period === 'bulan'
        ? startOfMonth(new Date())
        : startOfWeek(new Date(), { weekStartsOn: 1 })
      const rows = await evaluationService.getEvaluation({
        formId: tpl.form_id, startDate: periodStart.toISOString(), endDate: new Date().toISOString(),
      })
      const userIds = rows.map(r => r.user.user_id)
      if (userIds.length === 0) { toast.info(tr('atask.noTarget')); return }
      const r = await pushService.broadcast({
        title: tr('atask.pushTitle'),
        body: tr('atask.pushBody', { title: tpl.title }),
        url: `/tugas/${tpl.form_id}`,
        userIds,
      })
      if ((r?.sent ?? 0) > 0) {
        toast.success(tr('atask.reminderSent', { n: r.sent }))
      } else if (r?.total) {
        const detail = r.errors?.[0]?.detail || 'Tidak diketahui'
        toast.error(`Gagal kirim ke ${r.total} perangkat. Sebab: ${detail}`)
      } else {
        const sysNote = r?.totalSystemWide != null
          ? ` (${r.totalSystemWide} aktif di sistem, tapi bukan dari ${r?.targetCount ?? 0} jemaat target tugas ini)`
          : ''
        toast.info(`Tidak ada dari jemaat target tugas ini yang mengaktifkan notifikasi push.${sysNote}`)
      }
    } catch (err) {
      toast.error(err.message || tr('atask.reminderFailed'))
    } finally {
      setSendingId(null)
    }
  }

  // ── CRUD Kategori Tugas ──
  function setField(key, val) { setForm(p => ({ ...p, [key]: val })) }

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
      loadCategories()
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
      loadCategories()
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus kategori.')
    }
  }

  return (
    <div>
      <PageHeader
        title={tr('atask.title')}
        subtitle={activeTab === 0
          ? tr('atask.subtitle', { count: templates.length })
          : 'Khusus Super Admin — batasi kategori tugas ke ministry tertentu'}
        action={isGembala ? null : (activeTab === 0
          ? <Link to="/admin/tugas/baru"><Button size="sm"><Plus size={15} /> {tr('atask.create')}</Button></Link>
          : <Button size="sm" onClick={openCreate}><Plus size={15} /> Tambah</Button>)}
      />

      {/* Tab bar — Gembala hanya lihat tab Tugas & Form */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {TABS.filter((_, i) => !isGembala || i === 0).map((tab, i) => {
          const tabIdx = isGembala ? 0 : i
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tabIdx)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tabIdx
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          )
        })}
      </div>

      {/* ── Tab 0: Tugas & Form ── */}
      {activeTab === 0 && (
        <>
          {loadingTemplates && <div className="flex justify-center py-12"><Spinner /></div>}

          {!loadingTemplates && templates.length === 0 && (
            <EmptyState icon={ClipboardList} title={tr('atask.empty')} description={tr('atask.emptyDesc')} />
          )}

          {!loadingTemplates && templates.length > 0 && (
            <Card className="divide-y divide-gray-100">
              {templates.map(t => (
                <div key={t.form_id} className="flex items-center gap-3 p-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{t.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {tr('atask.targetLine', { goal: t.weekly_goal || 1, period: t.period === 'bulan' ? tr('atask.perMonth') : tr('atask.perWeek'), fields: (t.fields_json || []).length })}
                    </p>
                  </div>
                  {!isGembala && (
                    <button
                      onClick={() => sendReminder(t)}
                      disabled={sendingId === t.form_id}
                      title={tr('atask.remind')}
                      className="text-xs text-amber-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-amber-50 flex-shrink-0 disabled:opacity-50"
                    >
                      <Bell size={13} /> {sendingId === t.form_id ? '…' : tr('atask.remind')}
                    </button>
                  )}
                  {!isGembala && (
                    <Link to={`/admin/tugas/${t.form_id}/edit`} className="text-xs text-brand-500 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-brand-50 flex-shrink-0">
                      {tr('a.edit')} <ChevronRight size={13} />
                    </Link>
                  )}
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {/* ── Tab 1: Kategori Tugas ── */}
      {activeTab === 1 && (
        <>
          {loadingCats && <div className="flex justify-center py-12"><Spinner /></div>}

          {!loadingCats && categories.length === 0 && (
            <EmptyState icon={Tag} title="Belum ada kategori tugas" description="Buat kategori untuk mengelompokkan & membatasi akses tugas per ministry." />
          )}

          {!loadingCats && categories.length > 0 && (
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
        </>
      )}

      {/* Modal tambah/edit kategori */}
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

            <Input label="Nama Kategori" required placeholder="cth. Komsel Youth" value={form.name} onChange={e => setField('name', e.target.value)} />

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
