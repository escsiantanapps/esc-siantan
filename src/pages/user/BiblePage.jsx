import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpenText, ChevronLeft, ChevronRight, UserRound } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { Button, Select } from '@/components/ui'
import bibleBooks from '@/data/bibleBooks.json'
import { bibleVersions } from '@/data/bibleVersions'
import { bibleService } from '@/services/bibleService'

const READING_KEY = 'esc-bible-reading'
const DEFAULT_READING = { book: 1, chapter: 1, translation: 'tb' }

function savedReading() {
  try {
    const reading = JSON.parse(localStorage.getItem(READING_KEY))
    const book = bibleBooks.find(item => item.id === reading?.book)
    const translation = Object.hasOwn(bibleVersions, reading?.translation) ? reading.translation : 'tb'
    if (book && bibleVersions[translation].books.includes(reading.book) && Number.isInteger(reading.chapter) && reading.chapter >= 1 && reading.chapter <= book.chapters) return { ...reading, translation }
  } catch { /* Penyimpanan perangkat mungkin dinonaktifkan. */ }
  return DEFAULT_READING
}

export default function BiblePage() {
  const { profile } = useAuth()
  const { t } = useLang()
  const [reading, setReading] = useState(savedReading)
  const [retry, setRetry] = useState(0)
  const [chapterState, setChapterState] = useState({ key: '', status: 'loading', verses: [] })
  const book = bibleBooks[reading.book - 1]
  const title = `${book.name} ${reading.chapter}`
  const readingKey = `${reading.translation}:${reading.book}:${reading.chapter}`
  const availableBooks = bibleBooks.filter(item => bibleVersions[reading.translation].books.includes(item.id))

  useEffect(() => {
    let active = true
    setChapterState({ key: readingKey, status: 'loading', verses: [] })
    bibleService.getChapter(reading.book, reading.chapter, reading.translation)
      .then(verses => { if (active) setChapterState({ key: readingKey, status: 'ready', verses }) })
      .catch(() => { if (active) setChapterState({ key: readingKey, status: 'error', verses: [] }) })
    return () => { active = false }
  }, [reading.book, reading.chapter, reading.translation, readingKey, retry])

  const status = chapterState.key === readingKey ? chapterState.status : 'loading'

  function saveReading(next) {
    setReading(next)
    try { localStorage.setItem(READING_KEY, JSON.stringify(next)) } catch { /* Navigasi tetap berfungsi tanpa penyimpanan lokal. */ }
  }

  function moveChapter(direction) {
    if (direction < 0 && reading.chapter > 1) return saveReading({ ...reading, chapter: reading.chapter - 1 })
    if (direction > 0 && reading.chapter < book.chapters) return saveReading({ ...reading, chapter: reading.chapter + 1 })
    const nextBook = availableBooks[availableBooks.findIndex(item => item.id === reading.book) + direction]
    if (nextBook) saveReading({ ...reading, book: nextBook.id, chapter: direction < 0 ? nextBook.chapters : 1 })
  }

  function selectTranslation(translation) {
    const nextBook = bibleVersions[translation].books.includes(reading.book) ? reading.book : bibleVersions[translation].books[0]
    saveReading({ translation, book: nextBook, chapter: nextBook === reading.book ? reading.chapter : 1 })
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-xl border-b border-gray-200">
        <div className="app-top-safe px-4 pt-3 pb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide uppercase text-brand-600">{t('bible.reader')}</p>
            <h1 className="font-display text-xl font-bold text-gray-900 truncate">{t('nav.bible')}</h1>
          </div>
          <Link to="/profil" aria-label={t('nav.profile')} className="w-11 h-11 shrink-0 rounded-full gradient-main flex items-center justify-center text-white overflow-hidden border-2 border-surface active:scale-95 transition-transform">
            {profile?.photo_url ? <img src={profile.photo_url} alt="" className="w-full h-full object-cover" /> : <UserRound size={21} aria-hidden="true" />}
          </Link>
        </div>
        <div className="px-4 pb-3 flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <Select label={t('bible.book')} value={reading.book} onChange={event => saveReading({ ...reading, book: Number(event.target.value), chapter: 1 })} className="bible-control border-gray-200 text-gray-900 font-semibold min-h-11">
              <optgroup label={t('bible.oldTestament')}>
                {availableBooks.filter(item => item.id <= 39).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </optgroup>
              <optgroup label={t('bible.newTestament')}>
                {availableBooks.filter(item => item.id >= 40).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </optgroup>
            </Select>
          </div>
          <div className="w-20 shrink-0">
            <Select label={t('bible.chapter')} value={reading.chapter} onChange={event => saveReading({ ...reading, chapter: Number(event.target.value) })} className="bible-control border-gray-200 text-gray-900 font-semibold min-h-11">
              {Array.from({ length: book.chapters }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
            </Select>
          </div>
        </div>
        <div className="px-4 pb-3">
          <Select label={t('bible.translation')} value={reading.translation} onChange={event => selectTranslation(event.target.value)} className="bible-control border-gray-200 text-gray-900 font-semibold min-h-11">
            {Object.keys(bibleVersions).map(version => <option key={version} value={version}>{t(`bible.translation${version.toUpperCase()}`)}</option>)}
          </Select>
        </div>
      </header>

      <main className="px-5 pt-7 pb-8">
        <section aria-live="polite">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{t(`bible.translation${reading.translation.toUpperCase()}`)}</p>
          <h2 className="font-display text-2xl font-bold text-gray-900 mt-1">{title}</h2>
          {status === 'loading' && <p className="text-sm text-gray-600 mt-8">{t('bible.loading')}</p>}
          {status === 'error' && (
            <div className="mt-8">
              <p className="text-sm text-red-700">{t('bible.unavailable')}</p>
              <Button variant="secondary" onClick={() => setRetry(value => value + 1)} className="bible-control mt-3">{t('bible.retry')}</Button>
            </div>
          )}
          {status === 'ready' && (
            <div className="mt-6 space-y-5">
              {chapterState.verses.map(({ verse, endVerse, text }, index) => (
                <p key={`${verse}-${index}`} className="text-[1.06rem] leading-[1.9] text-gray-900">
                  <sup className="text-xs font-bold text-brand-600 mr-1.5 select-none">{endVerse > verse ? `${verse}–${endVerse}` : verse}</sup>{text}
                </p>
              ))}
            </div>
          )}
        </section>

        <Link to="/alkitab/penjelasan" state={{ reading }} className="mt-5 min-h-16 px-4 rounded-2xl border border-gray-200 bg-surface flex items-center gap-3 active:scale-[0.99] transition-transform">
          <span className="bible-control w-10 h-10 rounded-xl text-brand-700 flex items-center justify-center shrink-0"><BookOpenText size={21} aria-hidden="true" /></span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-sm text-gray-900">{t('bible.explanation')}</span>
            <span className="block text-xs text-gray-500 mt-0.5">{t('bible.studyGuide')}</span>
          </span>
          <ChevronRight size={18} className="text-gray-500" aria-hidden="true" />
        </Link>

        <div className="flex justify-between gap-3 mt-8">
          <Button variant="secondary" onClick={() => moveChapter(-1)} disabled={reading.book === availableBooks[0].id && reading.chapter === 1} className="bible-control min-h-11 flex-1 justify-center"><ChevronLeft size={18} />{t('bible.previous')}</Button>
          <Button variant="secondary" onClick={() => moveChapter(1)} disabled={reading.book === availableBooks.at(-1).id && reading.chapter === book.chapters} className="bible-control min-h-11 flex-1 justify-center">{t('bible.next')}<ChevronRight size={18} /></Button>
        </div>
      </main>
    </div>
  )
}
