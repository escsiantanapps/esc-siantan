import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpenText, Save } from 'lucide-react'
import { useLang } from '@/hooks/useLang'
import { useToast } from '@/hooks/useToast'
import { Button, Card, PageHeader, Select, Textarea } from '@/components/ui'
import bibleBooks from '@/data/bibleBooks.json'
import { bibleExplanationService } from '@/services/bibleExplanationService'

const EMPTY = { introduction: '', reflection: '' }

export default function AdminBiblePage() {
  const { t } = useLang()
  const { toast } = useToast()
  const [bookId, setBookId] = useState(14)
  const [chapterNumber, setChapterNumber] = useState(30)
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [hasContent, setHasContent] = useState(false)
  const book = bibleBooks[bookId - 1]

  useEffect(() => {
    let active = true
    bibleExplanationService.get(bookId, chapterNumber)
      .then(data => {
        if (!active) return
        setForm(data ? { introduction: data.introduction, reflection: data.reflection } : EMPTY)
        setHasContent(Boolean(data))
        setError('')
      })
      .catch(() => { if (active) { setForm(EMPTY); setHasContent(false); setError(t('bible.admin.loadError')) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [bookId, chapterNumber, t])

  function selectBook(value) {
    setBookId(Number(value))
    setChapterNumber(1)
    setLoading(true)
    setHasContent(false)
  }

  function selectChapter(value) {
    setChapterNumber(Number(value))
    setLoading(true)
    setHasContent(false)
  }

  async function save(event) {
    event.preventDefault()
    if (!form.introduction.trim() && !form.reflection.trim()) {
      setError(t('bible.admin.contentRequired'))
      return
    }
    setSaving(true)
    setError('')
    try {
      await bibleExplanationService.save({ bookId, chapterNumber, ...form })
      setHasContent(true)
      toast.success(t('bible.admin.saved'))
    } catch {
      setError(t('bible.admin.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title={t('bible.admin.title')} subtitle={t('bible.admin.subtitle')} />
      <Card className="p-5 max-w-3xl">
        <div className="flex items-center gap-3 mb-5">
          <span className="w-11 h-11 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center"><BookOpenText size={23} /></span>
          <div>
            <h2 className="font-display font-bold text-gray-900">{book.name} {chapterNumber}</h2>
            <p className="text-xs text-gray-500">{t(hasContent ? 'bible.admin.existing' : 'bible.admin.empty')}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <Select label={t('bible.book')} value={bookId} onChange={event => selectBook(event.target.value)} disabled={saving}>
            {bibleBooks.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
          <Select label={t('bible.chapter')} value={chapterNumber} onChange={event => selectChapter(event.target.value)} disabled={saving}>
            {Array.from({ length: book.chapters }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
          </Select>
        </div>
        {loading ? <p className="text-sm text-gray-600">{t('bible.explanationLoading')}</p> : (
          <form onSubmit={save} className="space-y-4">
            <Textarea label={t('bible.introduction')} rows={5} value={form.introduction} onChange={event => setForm(current => ({ ...current, introduction: event.target.value }))} placeholder={t('bible.admin.introductionHint')} />
            <Textarea label={t('bible.reflection')} rows={12} value={form.reflection} onChange={event => setForm(current => ({ ...current, reflection: event.target.value }))} placeholder={t('bible.admin.reflectionHint')} />
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={saving}><Save size={17} />{saving ? t('bible.admin.saving') : t('bible.admin.save')}</Button>
              <Link to="/alkitab/penjelasan" state={{ reading: { book: bookId, chapter: chapterNumber } }} className="text-sm font-semibold text-brand-700 hover:underline">{t('bible.admin.preview')}</Link>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}
