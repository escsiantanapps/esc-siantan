import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, BookOpenText } from 'lucide-react'
import { useLang } from '@/hooks/useLang'
import bibleBooks from '@/data/bibleBooks.json'
import { bibleExplanationService } from '@/services/bibleExplanationService'

export default function BibleExplanationPage() {
  const { t } = useLang()
  const location = useLocation()
  let savedReading
  try { savedReading = JSON.parse(localStorage.getItem('esc-bible-reading')) } catch { /* Bacaan terakhir mungkin belum tersimpan. */ }
  const reading = location.state?.reading || savedReading || { book: 14, chapter: 30 }
  const book = bibleBooks.find(item => item.id === reading?.book)
  const key = `${reading.book}:${reading.chapter}`
  const [state, setState] = useState({ key: '', status: 'loading', explanation: null })

  useEffect(() => {
    let active = true
    bibleExplanationService.get(reading.book, reading.chapter)
      .then(explanation => { if (active) setState({ key, status: 'ready', explanation }) })
      .catch(() => { if (active) setState({ key, status: 'error', explanation: null }) })
    return () => { active = false }
  }, [reading.book, reading.chapter, key])

  const status = state.key === key ? state.status : 'loading'
  const explanation = state.key === key ? state.explanation : null

  return (
    <div className="min-h-screen bg-surface">
      <header className="app-top-safe sticky top-0 z-40 bg-surface/95 backdrop-blur-xl border-b border-gray-200 px-4 pt-3 pb-3 flex items-center gap-3">
        <Link to="/alkitab" aria-label={t('quality.back')} className="w-11 h-11 rounded-full bg-control flex items-center justify-center text-gray-900 active:bg-control-hover transition-colors"><ArrowLeft size={21} /></Link>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{t('nav.bible')}</p>
          <h1 className="font-display text-lg font-bold text-gray-900 truncate">{t('bible.explanation')}</h1>
        </div>
      </header>
      <main className="px-5 py-7">
        <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center mb-4"><BookOpenText size={25} /></div>
        <h2 className="font-display text-xl font-bold text-gray-900">{book ? `${book.name} ${reading.chapter}` : t('bible.explanation')}</h2>
        {status === 'loading' && <p className="mt-6 text-sm text-gray-600">{t('bible.explanationLoading')}</p>}
        {status === 'error' && <p className="mt-6 text-sm text-red-700">{t('bible.explanationError')}</p>}
        {status === 'ready' && explanation ? (
          <div className="mt-6 space-y-5">
            {explanation.outline && <section className="rounded-2xl border border-gray-200 bg-surface p-5">
              <h3 className="font-display font-bold text-gray-900">{t('bible.outline')}</h3>
              <p className="text-sm text-gray-700 leading-7 mt-3 whitespace-pre-line">{explanation.outline}</p>
            </section>}
            {explanation.explanation && <section className="rounded-2xl border border-gray-200 bg-surface p-5">
              <h3 className="font-display font-bold text-gray-900">{t('bible.sectionExplanation')}</h3>
              <p className="text-sm text-gray-700 leading-7 mt-3 whitespace-pre-line">{explanation.explanation}</p>
            </section>}
            {explanation.reflection && <section className="rounded-2xl border border-gray-200 bg-surface p-5">
              <h3 className="font-display font-bold text-gray-900">{t('bible.reflection')}</h3>
              <p className="text-sm text-gray-700 leading-7 mt-3 whitespace-pre-line">{explanation.reflection}</p>
            </section>}
          </div>
        ) : status === 'ready' && (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-surface p-5">
            <p className="text-sm text-gray-700 leading-7">{t('bible.explanationPending')}</p>
          </div>
        )}
      </main>
    </div>
  )
}
