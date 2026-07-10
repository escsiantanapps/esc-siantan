import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Plus, Trash2, Pencil, X, FileSpreadsheet, ChevronDown, ChevronRight, BarChart3, FileText, Upload } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { booksService } from '@/services/booksService'
import { mediaService } from '@/services/contentService'
import { Card, PageHeader, Input, Textarea, Button, Spinner, EmptyState, Badge, Avatar, Checkbox } from '@/components/ui'
import { downloadXlsx } from '@/lib/exportXlsx'
import { formatDate } from '@/lib/utils'

// Disiplin Baca (Admin) — kelola buku program & rekap progres anggota (halaman
// tercapai + catatan poin bacaan). Hardcode ID mengikuti pola halaman admin.
const TABS = [{ key: 'buku', label: 'Buku' }, { key: 'rekap', label: 'Rekap' }]
const EMPTY = { title: '', author: '', total_pages: '', description: '', pdf_url: '', is_active: true }
const MAX_PDF_MB = 25

export default function AdminBooksPage() {
  const { profile } = useAuth()
  const { toast, confirm } = useToast()
  const [tab, setTab] = useState('buku')
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null) // book_id sedang diedit
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)

  function load() {
    setLoading(true)
    booksService.listBooks().then(setBooks).catch(() => setBooks([])).finally(() => setLoading(false))
  }
  useEffect(load, [])

  function openNew() { setEditing(null); setForm(EMPTY); setShowForm(true) }
  function openEdit(b) {
    setEditing(b.book_id)
    setForm({ title: b.title, author: b.author || '', total_pages: b.total_pages || '', description: b.description || '', pdf_url: b.pdf_url || '', is_active: b.is_active })
    setShowForm(true)
  }
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function uploadPdf(file) {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { toast.error('File harus PDF.'); return }
    if (file.size > MAX_PDF_MB * 1024 * 1024) { toast.error(`PDF maksimal ${MAX_PDF_MB} MB.`); return }
    setUploadingPdf(true)
    try {
      const { url } = await mediaService.uploadPdf('books', file)
      set('pdf_url', url)
      toast.success('PDF terunggah.')
    } catch (err) { toast.error(err.message || 'Gagal mengunggah PDF.') }
    finally { setUploadingPdf(false) }
  }

  async function save() {
    if (!form.title.trim()) { toast.error('Judul buku wajib diisi.'); return }
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(), author: form.author.trim() || null,
        total_pages: form.total_pages ? Number(form.total_pages) : null,
        description: form.description.trim() || null, pdf_url: form.pdf_url || null, is_active: form.is_active,
      }
      if (editing) await booksService.updateBook(editing, payload)
      else await booksService.createBook({ ...payload, totalPages: payload.total_pages, pdfUrl: payload.pdf_url, createdBy: profile.user_id })
      toast.success('Buku tersimpan.')
      setShowForm(false); load()
    } catch (err) { toast.error(err.message || 'Gagal menyimpan buku.') }
    finally { setSaving(false) }
  }

  async function remove(b) {
    const ok = await confirm({ title: 'Hapus buku?', message: `Buku "${b.title}" beserta seluruh catatan bacaan anggota akan dihapus permanen.`, confirmText: 'Hapus', danger: true })
    if (!ok) return
    try { await booksService.deleteBook(b.book_id); toast.success('Buku dihapus.'); load() }
    catch (err) { toast.error(err.message || 'Gagal menghapus buku.') }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Disiplin Baca" subtitle="Kelola buku program & rekap progres membaca jemaat" />

      <div className="flex items-center gap-1 p-1 bg-control rounded-xl mb-4">
        {TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === key ? 'bg-surface text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'buku' && (
        <>
          <Button className="w-full mb-3" onClick={openNew}><Plus size={15} /> Tambah Buku</Button>
          {loading ? <div className="flex justify-center py-8"><Spinner /></div>
            : books.length === 0 ? <EmptyState icon={BookOpen} title="Belum ada buku" description="Tambahkan buku program membaca." />
            : (
              <Card className="divide-y divide-gray-100">
                {books.map(b => (
                  <div key={b.book_id} className="flex items-center gap-3 p-3.5">
                    <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0"><BookOpen size={16} className="text-brand-500" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{b.title}</p>
                      <p className="text-[11px] text-gray-400 truncate">{b.author || '—'} · {b.total_pages || '?'} hal{b.pdf_url && ' · PDF'}{!b.is_active && ' · nonaktif'}</p>
                    </div>
                    <button onClick={() => openEdit(b)} className="p-2 text-gray-400 hover:text-brand-500"><Pencil size={15} /></button>
                    <button onClick={() => remove(b)} className="p-2 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                  </div>
                ))}
              </Card>
            )}
        </>
      )}

      {tab === 'rekap' && <RecapTab books={books} loading={loading} toast={toast} />}

      {/* Modal form buku */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <Card className="w-full sm:max-w-md p-4 space-y-3 max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{editing ? 'Edit Buku' : 'Tambah Buku'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <Input label="Judul" value={form.title} onChange={e => set('title', e.target.value)} />
            <Input label="Penulis" value={form.author} onChange={e => set('author', e.target.value)} />
            <Input label="Total Halaman" type="number" min="1" value={form.total_pages} onChange={e => set('total_pages', e.target.value)} />
            <Textarea label="Deskripsi" rows={2} value={form.description} onChange={e => set('description', e.target.value)} />

            {/* Upload PDF (bucket task-files, publik) */}
            <div>
              <label className="text-sm text-gray-600 font-medium">File PDF (maks {MAX_PDF_MB} MB)</label>
              {form.pdf_url ? (
                <div className="mt-1 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                  <FileText size={16} className="text-brand-500 shrink-0" />
                  <a href={form.pdf_url} target="_blank" rel="noreferrer" className="text-sm text-brand-600 truncate flex-1">Lihat PDF</a>
                  <button onClick={() => set('pdf_url', '')} className="text-gray-400 hover:text-red-500"><X size={15} /></button>
                </div>
              ) : (
                <label className="mt-1 flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 cursor-pointer hover:bg-gray-50">
                  {uploadingPdf ? <Spinner size="sm" /> : <Upload size={16} />}
                  {uploadingPdf ? 'Mengunggah...' : 'Pilih file PDF'}
                  <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={uploadingPdf}
                    onChange={e => uploadPdf(e.target.files?.[0])} />
                </label>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <Checkbox checked={form.is_active} onChange={e => set('is_active', e.target.checked)} /> Aktif (tampil untuk jemaat)
            </label>
            <Button className="w-full" loading={saving} onClick={save}>Simpan</Button>
          </Card>
        </div>
      )}
    </div>
  )
}

// Rekap: pilih buku → progres per anggota (halaman tertinggi + jumlah catatan)
// dari catatan reading_notes; bisa buka detail catatan & export Excel.
function RecapTab({ books, loading, toast }) {
  const [bookId, setBookId] = useState('')
  const [notes, setNotes] = useState([])
  const [busy, setBusy] = useState(false)
  const [openUser, setOpenUser] = useState(null)

  useEffect(() => { if (!bookId && books.length) setBookId(books[0].book_id) }, [books, bookId])
  useEffect(() => {
    if (!bookId) return
    setBusy(true)
    booksService.getBookNotes(bookId).then(setNotes).catch(() => setNotes([])).finally(() => setBusy(false))
  }, [bookId])

  const book = books.find(b => b.book_id === bookId)
  // Agregasi per anggota.
  const perUser = useMemo(() => {
    const map = {}
    for (const n of notes) {
      const u = (map[n.user_id] ||= { name: n.users?.name || '-', photo: n.users?.photo_url, maxPage: 0, count: 0, notes: [] })
      u.maxPage = Math.max(u.maxPage, n.page || 0)
      u.count += 1
      u.notes.push(n)
    }
    return Object.values(map).sort((a, b) => b.maxPage - a.maxPage)
  }, [notes])

  function exportXlsx() {
    if (perUser.length === 0) { toast.info('Belum ada data untuk diekspor.'); return }
    const total = book?.total_pages
    downloadXlsx({
      filename: `rekap-baca-${book?.title || ''}.xlsx`,
      sheetName: 'Rekap Baca',
      titleLines: ['ESC Siantan', 'Rekap Disiplin Baca', `${book?.title || ''}${total ? ` — ${total} halaman` : ''}`],
      headers: ['Nama', 'Halaman Tercapai', 'Persentase', 'Jumlah Catatan'],
      rows: perUser.map(u => [u.name, u.maxPage, total ? `${Math.min(100, Math.round((u.maxPage / total) * 100))}%` : '-', u.count]),
    })
  }

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>
  if (books.length === 0) return <EmptyState icon={BookOpen} title="Belum ada buku" description="Tambahkan buku dulu di tab Buku." />

  return (
    <div>
      <div className="flex items-end gap-2 mb-3">
        <div className="flex-1">
          <label className="text-sm text-gray-600 font-medium">Pilih Buku</label>
          <select value={bookId} onChange={e => setBookId(e.target.value)}
            className="w-full mt-1 px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl">
            {books.map(b => <option key={b.book_id} value={b.book_id}>{b.title}</option>)}
          </select>
        </div>
        <Button variant="outline" size="sm" onClick={exportXlsx}><FileSpreadsheet size={15} /> Excel</Button>
      </div>

      {busy ? <div className="flex justify-center py-8"><Spinner /></div>
        : perUser.length === 0 ? <EmptyState icon={BarChart3} title="Belum ada yang membaca" description="Catatan bacaan jemaat akan muncul di sini." />
        : (
          <Card className="divide-y divide-gray-100">
            {perUser.map(u => {
              const pct = book?.total_pages ? Math.min(100, Math.round((u.maxPage / book.total_pages) * 100)) : 0
              const isOpen = openUser === u.name
              return (
                <div key={u.name}>
                  <button onClick={() => setOpenUser(isOpen ? null : u.name)} className="w-full flex items-center gap-3 p-3 text-left">
                    <Avatar name={u.name} src={u.photo} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full gradient-main" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] text-gray-400 shrink-0">hal {u.maxPage}{book?.total_pages ? `/${book.total_pages}` : ''}</span>
                      </div>
                    </div>
                    <Badge color="gray">{u.count}</Badge>
                    {isOpen ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 space-y-2">
                      {u.notes.map(n => (
                        <div key={n.note_id} className="rounded-lg bg-gray-50 p-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <Badge color="orange">hal {n.page}</Badge>
                            <span className="text-[10px] text-gray-400">{formatDate(n.created_at, 'd MMM yyyy · HH:mm')}</span>
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{n.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </Card>
        )}
    </div>
  )
}
