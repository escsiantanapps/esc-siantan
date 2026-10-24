import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, BookOpenText, X } from 'lucide-react'
import { useLang } from '@/hooks/useLang'
import { Button } from '@/components/ui'
import bibleBooks from '@/data/bibleBooks.json'
import { bibleVersions } from '@/data/bibleVersions'
import { paginateExplanation } from '@/lib/bibleExplanationPages'
import { bibleService } from '@/services/bibleService'
import { bibleExplanationService } from '@/services/bibleExplanationService'

function getReading(location) {
  let saved
  try { saved = JSON.parse(localStorage.getItem('esc-bible-reading')) } catch { /* Bacaan terakhir mungkin belum tersimpan. */ }
  const candidate = location.state?.reading || saved
  const book = bibleBooks.find(item => item.id === candidate?.book)
  const chapter = Number(candidate?.chapter)
  if (!book || !Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) return { book: 1, chapter: 1, translation: 'tb' }
  const translation = Object.hasOwn(bibleVersions, candidate.translation) && bibleVersions[candidate.translation].books.includes(book.id)
    ? candidate.translation : 'tb'
  return { book: book.id, chapter, translation }
}

export default function BibleExplanationPage() {
  const { t } = useLang()
  const location = useLocation()
  const reading = getReading(location)
  const book = bibleBooks[reading.book - 1]
  const key = `${reading.book}:${reading.chapter}`
  const pageTopRef = useRef(null)
  const verseTriggerRef = useRef(null)
  const closeVerseRef = useRef(null)
  const [state, setState] = useState({ key: '', status: 'loading', explanation: null })
  const [pageState, setPageState] = useState({ key: '', index: 0 })
  const [verseSelection, setVerseSelection] = useState(null)
  const [verseState, setVerseState] = useState({ key: '', status: 'loading', verses: [] })

  useEffect(() => {
    pageTopRef.current?.parentElement?.scrollTo({ top: 0, behavior: 'auto' })
  }, [key])

  useEffect(() => {
    let active = true
    bibleExplanationService.get(reading.book, reading.chapter)
      .then(explanation => { if (active) setState({ key, status: 'ready', explanation }) })
      .catch(() => { if (active) setState({ key, status: 'error', explanation: null }) })
    return () => { active = false }
  }, [reading.book, reading.chapter, key])

  const status = state.key === key ? state.status : 'loading'
  const explanation = state.key === key ? state.explanation : null
  const pages = useMemo(() => paginateExplanation(explanation), [explanation])
  const pageIndex = pageState.key === key ? Math.min(pageState.index, pages.length - 1) : 0
  const page = pages[pageIndex] || []
  const selected = verseSelection?.chapterKey === key ? verseSelection : null
  const selectedKey = selected ? `${key}:${reading.translation}:${selected.start}-${selected.end}` : ''

  useEffect(() => {
    if (!selected) return undefined
    let active = true
    bibleService.getChapter(reading.book, reading.chapter, reading.translation)
      .then(verses => {
        if (!active) return
        const matching = verses.filter(item => item.verse <= selected.end && (item.endVerse || item.verse) >= selected.start)
        setVerseState({ key: selectedKey, status: matching.length ? 'ready' : 'error', verses: matching })
      })
      .catch(() => { if (active) setVerseState({ key: selectedKey, status: 'error', verses: [] }) })
    return () => { active = false }
  }, [selected, selectedKey, reading.book, reading.chapter, reading.translation])

  useEffect(() => {
    if (!selected) return undefined
    closeVerseRef.current?.querySelector('button')?.focus()
    function handleKeyDown(event) {
      if (event.key === 'Escape') setVerseSelection(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      verseTriggerRef.current?.focus()
    }
  }, [selected])

  function changePage(nextIndex) {
    setPageState({ key, index: nextIndex })
    pageTopRef.current?.parentElement?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openVerse(block, event) {
    verseTriggerRef.current = event.currentTarget
    setVerseState({ key: '', status: 'loading', verses: [] })
    setVerseSelection({ chapterKey: key, start: block.start, end: block.end, reference: block.reference })
  }

  const groups = ['outline', 'explanation', 'reflection'].map(section => ({
    section,
    blocks: page.filter(block => block.section === section),
  })).filter(group => group.blocks.length)
  const verseStatus = verseState.key === selectedKey ? verseState.status : 'loading'
  const backToAdmin = location.state?.returnTo === '/admin/alkitab'

  return (
    <div className="min-h-full bg-gray-50" ref={pageTopRef}>
      <header className="app-top-safe sticky top-0 z-40 flex items-center gap-3 border-b border-gray-200 bg-gray-100 px-4 pt-3 pb-3">
        <Link to={backToAdmin ? '/admin/alkitab' : '/alkitab'} state={backToAdmin ? { reading } : undefined} aria-label={t('quality.back')} className="w-11 h-11 shrink-0 rounded-full bg-control flex items-center justify-center text-gray-900 active:bg-control-hover transition-colors"><ArrowLeft size={21} /></Link>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{t('nav.bible')}</p>
          <h1 className="font-display text-lg font-bold text-gray-900 truncate">{t('bible.explanation')}</h1>
        </div>
      </header>
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center mb-4"><BookOpenText size={25} /></div>
        <h2 className="font-display text-xl font-bold text-gray-900">{book.name} {reading.chapter}</h2>
        {status === 'loading' && <p className="mt-6 text-sm text-gray-600">{t('bible.explanationLoading')}</p>}
        {status === 'error' && <p className="mt-6 text-sm text-red-700">{t('bible.explanationError')}</p>}
        {status === 'ready' && explanation && pages.length > 0 ? (
          <>
            <div className="mt-6 space-y-5">
              {groups.map(({ section, blocks }) => (
                <section key={section} className="rounded-2xl border border-gray-200 bg-gray-100 p-5">
                  <h3 className="font-display font-bold text-gray-900">{t(section === 'explanation' ? 'bible.sectionExplanation' : `bible.${section}`)}</h3>
                  <div className="mt-3 space-y-4">
                    {blocks.map((block, index) => (
                      <p key={`${section}-${index}`} className="text-[1.02rem] leading-8 text-gray-800 whitespace-pre-line">
                        {block.reference && <Button type="button" variant="secondary" size="sm" onClick={event => openVerse(block, event)} aria-label={t('bible.verseLabel', { verses: block.reference })} className="mr-2 min-h-11 px-2.5 font-bold" style={{ backgroundColor: 'var(--color-brand-50)', borderColor: 'var(--color-brand-200)', color: 'var(--color-brand-700)' }}>{block.reference}</Button>}
                        {block.text}
                      </p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            {pages.length > 1 && <nav aria-label={t('bible.explanation')} className="mt-6 flex items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-gray-100 p-3">
              <Button type="button" variant="secondary" className="min-h-11" disabled={pageIndex === 0} onClick={() => changePage(pageIndex - 1)}>{t('bible.previous')}</Button>
              <span aria-live="polite" className="text-center text-xs font-semibold text-gray-700">{t('bible.explanationPage', { current: pageIndex + 1, total: pages.length })}</span>
              <Button type="button" variant="secondary" className="min-h-11" disabled={pageIndex === pages.length - 1} onClick={() => changePage(pageIndex + 1)}>{t('bible.next')}</Button>
            </nav>}
          </>
        ) : status === 'ready' && (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-100 p-5">
            <p className="text-sm text-gray-700 leading-7">{t('bible.explanationPending')}</p>
          </div>
        )}
      </div>

      {selected && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="bible-verse-dialog-title" onClick={() => setVerseSelection(null)}>
        <section className="w-full max-w-md max-h-[80dvh] overflow-y-auto rounded-2xl border border-gray-300 bg-gray-100 p-5" onClick={event => event.stopPropagation()}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="bible-verse-dialog-title" className="font-display text-lg font-bold text-gray-900">{book.name} {reading.chapter}:{selected.reference}</h2>
              <p className="mt-1 text-xs text-gray-600">{t(`bible.translation${reading.translation.toUpperCase()}`)}</p>
            </div>
            <div ref={closeVerseRef}><Button type="button" variant="ghost" size="sm" aria-label={t('bible.closeVerse')} onClick={() => setVerseSelection(null)} className="min-h-11 min-w-11 p-0"><X size={20} /></Button></div>
          </div>
          {verseStatus === 'loading' && <p className="mt-5 text-sm text-gray-600">{t('bible.verseLoading')}</p>}
          {verseStatus === 'error' && <p className="mt-5 text-sm text-red-700">{t('bible.verseUnavailable')}</p>}
          {verseStatus === 'ready' && <div className="mt-5 space-y-3">
            {verseState.verses.map((verse, index) => <p key={`${verse.verse}-${index}`} className="text-sm leading-7 text-gray-900"><span className="mr-2 font-bold text-brand-700">{verse.endVerse > verse.verse ? `${verse.verse}–${verse.endVerse}` : verse.verse}</span>{verse.text}</p>)}
          </div>}
        </section>
      </div>}
    </div>
  )
}
