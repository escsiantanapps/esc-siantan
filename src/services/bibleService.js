import { supabase } from '@/lib/supabase'
import { fetchApi } from '@/lib/utils'

const cache = new Map()
const CACHE_PREFIX = 'esc-tb-v2:'
const CACHE_INDEX = 'esc-tb-v2-index'
const CACHE_LIMIT = 120
let oldCacheCleared = false

function clearOldCache() {
  if (oldCacheCleared) return
  oldCacheCleared = true
  try {
    const oldKeys = JSON.parse(localStorage.getItem('esc-tb-v1-index') || '[]')
    if (Array.isArray(oldKeys)) oldKeys.forEach(key => localStorage.removeItem(`esc-tb-v1:${key}`))
    localStorage.removeItem('esc-tb-v1-index')
  } catch { /* Kegagalan pembersihan cache lama tidak menghalangi pembacaan. */ }
}

function loadSavedChapter(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_PREFIX + key))
    if (Array.isArray(saved) && saved.every(item => Number.isInteger(item.verse) && typeof item.text === 'string')) return saved
  } catch { /* Cache perangkat mungkin dinonaktifkan atau penuh. */ }
  return null
}

function saveChapter(key, verses) {
  try {
    const previous = JSON.parse(localStorage.getItem(CACHE_INDEX) || '[]')
    const keys = [...previous.filter(item => item !== key), key]
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(verses))
    while (keys.length > CACHE_LIMIT) localStorage.removeItem(CACHE_PREFIX + keys.shift())
    localStorage.setItem(CACHE_INDEX, JSON.stringify(keys))
  } catch { /* Gagal menyimpan cache tidak menghalangi pembacaan. */ }
}

export const bibleService = {
  async getChapter(book, chapter, translation = 'tb') {
    clearOldCache()
    const key = translation === 'tb' ? `${book}:${chapter}` : `${translation}:${book}:${chapter}`
    if (cache.has(key)) return cache.get(key)
    const saved = loadSavedChapter(key)
    if (saved) { cache.set(key, saved); return saved }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('SESSION_NOT_FOUND')

    // Di localhost, fungsi Vercel dijalankan oleh middleware Vite agar pratinjau tidak tergantung deploy produksi.
    const request = import.meta.env.DEV ? fetch : fetchApi
    const response = await request('/api/bible-chapter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ book, chapter, translation }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !Array.isArray(result.verses)) throw new Error(result.error || 'BIBLE_CHAPTER_UNAVAILABLE')
    cache.set(key, result.verses)
    saveChapter(key, result.verses)
    return result.verses
  },
}
