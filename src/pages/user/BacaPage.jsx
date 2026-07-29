import { useCallback, useEffect, useState } from 'react'
import { BookOpen, ChevronDown, ChevronUp, Plus, X, Trash2, NotebookPen, FileText } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { booksService } from '@/services/booksService'
import { Card, Spinner, GradientHeader, EmptyState, Button, Input, Textarea, Badge } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import PdfCover from '@/components/PdfCover'
import PdfViewerModal from '@/components/PdfViewerModal'

// Disiplin Baca (anggota) — daftar buku program + setor "poin bacaan" (pesan
// yang didapat + halaman yang dicapai). Progres = halaman tertinggi.
export default function BacaPage() {
  const { profile } = useAuth()
  const { toast, confirm } = useToast()
  const { t } = useLang()
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(null) // buku terpilih (modal)
  const [myNotes, setMyNotes] = useState([])
  const [page, setPage] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [reading, setReading] = useState(false)
  const [readerPanelOpen, setReaderPanelOpen] = useState(false)
  const readingPageKey = active && profile?.user_id
    ? `esc-reading-page:${profile.user_id}:${active.book_id}`
    : null

  const closeReader = useCallback(() => setReading(false), [])
  const saveReadingPage = useCallback((currentPage) => {
    if (!readingPageKey) return
    try {
      localStorage.setItem(readingPageKey, String(currentPage))
    } catch {
      // Penyimpanan privat/perangkat penuh tidak boleh menghentikan pembaca.
    }
    setPage(String(currentPage))
  }, [readingPageKey])

  function load() {
    if (!profile?.user_id) return
    setLoading(true)
    booksService.getBooksWithMyProgress(profile.user_id)
      .then(setBooks).catch(() => setBooks([])).finally(() => setLoading(false))
  }
  useEffect(load, [profile?.user_id])

  async function openBook(bk) {
    setActive(bk); setPage(bk.myPage ? String(bk.myPage) : ''); setContent('')
    setReading(false); setReaderPanelOpen(false)
    try {
      const all = await booksService.getMyNotes(profile.user_id)
      setMyNotes(all.filter(n => n.book_id === bk.book_id))
    } catch { setMyNotes([]) }
  }

  async function submitNote() {
    const c = content.trim()
    if (!c) { toast.error(t('baca.contentRequired')); return }
    const p = Number(page) || 0
    if (active.total_pages && p > active.total_pages) { toast.error(t('baca.pageOver', { total: active.total_pages })); return }
    setSaving(true)
    try {
      await booksService.addNote({ bookId: active.book_id, userId: profile.user_id, page: p, content: c })
      toast.success(t('baca.noteSaved'))
      setContent('')
      const all = await booksService.getMyNotes(profile.user_id)
      setMyNotes(all.filter(n => n.book_id === active.book_id))
      load()
    } catch (err) {
      toast.error(err.message || t('baca.noteFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function removeNote(n) {
    const ok = await confirm({ title: t('baca.delTitle'), message: t('baca.delMsg'), confirmText: t('common.delete'), danger: true })
    if (!ok) return
    try {
      await booksService.deleteNote(n.note_id)
      setMyNotes(prev => prev.filter(x => x.note_id !== n.note_id))
      load()
    } catch (err) { toast.error(err.message || t('baca.noteFailed')) }
  }

  return (
    <div className="pb-6">
      <GradientHeader title={t('baca.title')} subtitle={t('baca.subtitle')} />

      <div className="px-4 -mt-2 pt-4">
        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : books.length === 0 ? (
          <EmptyState icon={BookOpen} title={t('baca.empty')} description={t('baca.emptyDesc')} />
        ) : (
          <div className="space-y-3">
            {books.map(bk => {
              const pct = bk.total_pages ? Math.min(100, Math.round((bk.myPage / bk.total_pages) * 100)) : 0
              const done = bk.total_pages && bk.myPage >= bk.total_pages
              return (
                <Card key={bk.book_id} className="p-4" onClick={() => openBook(bk)} role="button">
                  <div className="flex items-start gap-3">
                    <PdfCover
                      url={bk.pdf_url}
                      label={t('baca.coverAlt', { title: bk.title })}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{bk.title}</p>
                      {bk.author && <p className="text-xs text-gray-400 truncate">{bk.author}</p>}
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                          <span>{t('baca.pageOf', { page: bk.myPage, total: bk.total_pages || '?' })}</span>
                          <span>{bk.myNoteCount} {t('baca.notesUnit')}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full gradient-main" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                    {done && <Badge color="green">{t('baca.done')}</Badge>}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal setor poin bacaan */}
      {active && !reading && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <Card className="w-full sm:max-w-md p-4 space-y-4 max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-2xl">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-900 truncate">{active.title}</h2>
                {active.author && <p className="text-xs text-gray-400">{active.author}</p>}
              </div>
              <button
                type="button"
                onClick={() => setActive(null)}
                className="flex h-11 w-11 items-center justify-center rounded-full text-gray-400 hover:bg-control hover:text-gray-600"
                aria-label={t('common.close')}
              >
                <X size={18} />
              </button>
            </div>

            {active.description && <p className="text-xs text-gray-500 leading-relaxed">{active.description}</p>}

            {active.pdf_url && (
              <div className="flex justify-center">
                <PdfCover
                  url={active.pdf_url}
                  label={t('baca.coverAlt', { title: active.title })}
                  className="w-28"
                />
              </div>
            )}

            {active.pdf_url && (
              <Button variant="outline" className="w-full" onClick={() => setReading(true)}>
                <FileText size={16} /> {t('baca.readAndNote')}
              </Button>
            )}

            {/* Buku tanpa PDF tetap memakai formulir biasa di modal detail. */}
            {!active.pdf_url && (
              <div className="space-y-2.5 border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5"><NotebookPen size={14} /> {t('baca.addNote')}</p>
                <div className="w-32">
                  <Input label={t('baca.pageLabel')} type="number" min="0" value={page} onChange={e => setPage(e.target.value)} placeholder="0" />
                </div>
                <Textarea label={t('baca.contentLabel')} rows={3} value={content} onChange={e => setContent(e.target.value)} placeholder={t('baca.contentPlaceholder')} />
                <Button className="w-full" loading={saving} onClick={submitNote}><Plus size={15} /> {t('baca.submit')}</Button>
              </div>
            )}

            {/* Riwayat catatan saya */}
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 mb-2">{t('baca.myNotes')} ({myNotes.length})</p>
              {myNotes.length === 0 ? (
                <p className="text-xs text-gray-400">{t('baca.noNotes')}</p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {myNotes.map(n => (
                    <div key={n.note_id} className="rounded-lg border border-gray-100 p-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <Badge color="orange">{t('baca.pageShort', { page: n.page })}</Badge>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400">{formatDate(n.created_at, 'd MMM yyyy')}</span>
                          <button onClick={() => removeNote(n)} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{n.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {reading && active?.pdf_url && (
        <PdfViewerModal
          file={{ url: active.pdf_url, name: active.title }}
          onClose={closeReader}
          initialPage={(() => {
            try {
              return Number(localStorage.getItem(readingPageKey)) || active.myPage || 1
            } catch {
              return active.myPage || 1
            }
          })()}
          onPageChange={saveReadingPage}
          bottomPanel={(
            <div className="border-t border-gray-200 bg-surface">
              <button
                type="button"
                onClick={() => setReaderPanelOpen((open) => !open)}
                className="flex min-h-14 w-full items-center gap-2 px-4 text-left text-gray-800 transition-colors hover:bg-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-500"
                aria-expanded={readerPanelOpen}
                aria-label={t(readerPanelOpen ? 'baca.closeNotePanel' : 'baca.openNotePanel')}
              >
                <NotebookPen size={18} className="shrink-0 text-brand-500" />
                <span className="flex-1 text-sm font-semibold">{t('baca.addNote')}</span>
                {page && <span className="text-xs text-gray-400">{t('baca.pageShort', { page })}</span>}
                {readerPanelOpen ? <ChevronDown size={19} /> : <ChevronUp size={19} />}
              </button>

              {readerPanelOpen && (
                <div className="max-h-[45dvh] space-y-3 overflow-y-auto border-t border-gray-100 px-4 py-3">
                  <div className="w-32">
                    <Input
                      label={t('baca.pageLabel')}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={page}
                      onChange={e => setPage(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <Textarea
                    label={t('baca.contentLabel')}
                    rows={3}
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder={t('baca.contentPlaceholder')}
                  />
                  <Button className="w-full" loading={saving} onClick={submitNote}>
                    <Plus size={15} /> {t('baca.submit')}
                  </Button>
                </div>
              )}
            </div>
          )}
        />
      )}
    </div>
  )
}
