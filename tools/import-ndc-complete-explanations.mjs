// Impor penjelasan lengkap dari berkas operator tanpa menimpa edit Admin.
// Pemakaian: node tools/import-ndc-complete-explanations.mjs "ndc-semua-kitab-penjelasan (1).json" "MALEAKHI.json" [--include-damaged] [--apply]
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const [mainPath, malachiPath] = process.argv.slice(2)
if (!mainPath || !malachiPath) throw new Error('Berikan berkas gabungan NDC dan MALEAKHI.json.')
const includeDamaged = process.argv.includes('--include-damaged')

const [main, malachi, bibleBooks] = await Promise.all([
  readFile(mainPath, 'utf8').then(JSON.parse),
  readFile(malachiPath, 'utf8').then(JSON.parse),
  readFile(new URL('../src/data/bibleBooks.json', import.meta.url), 'utf8').then(JSON.parse),
])
const bookByName = new Map(bibleBooks.map(book => [book.name.toLocaleUpperCase('id-ID'), book]))
const sourceBooks = [...main.books.filter(book => book.book_name !== 'MALEAKHI'), ...malachi.books]
const sourceKeys = new Set()
const rows = []
const skipped = []
const damaged = []
const differingSections = []

function clean(value) {
  if (typeof value !== 'string' || value.includes('\0')) throw new Error('Teks sumber tidak valid.')
  return value.replace(/\r\n?/g, '\n')
    .replaceAll('â�¦', '…').replaceAll('â��', '—')
    .replaceAll('secarÃ¦khusus', 'secara khusus')
    .replaceAll('Ã¼', 'u').replaceAll('Ã¢', 'a').replaceAll('Ã§', 'e')
    .replaceAll('Sumber: NDC Ministry (ndcministry.org)', '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .trim()
}

function reflectionFromHtml(html) {
  if (typeof html !== 'string') return ''
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(match => clean(match[1].replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')))
    .filter(Boolean)
  return paragraphs.join('\n\n')
}

for (const sourceBook of sourceBooks) {
  const book = bookByName.get(sourceBook.book_name?.toLocaleUpperCase('id-ID'))
  if (!book) throw new Error(`Kitab tidak dikenal: ${sourceBook.book_name}`)
  for (const chapter of sourceBook.chapters || []) {
    const number = chapter.chapter_number
    const key = `${book.id}:${number}`
    if (!Number.isInteger(number) || number < 1 || number > book.chapters || sourceKeys.has(key)) throw new Error(`Pasal salah atau ganda: ${book.name} ${number}`)
    sourceKeys.add(key)

    const outline = clean(chapter.outline_text)
    const structured = chapter.sections?.length
      ? chapter.sections.map(section => `${clean(section.verse_reference)} ${clean(section.body_text)}`).join('\n\n')
      : ''
    const full = clean(chapter.detailed_explanation_text)
    const same = structured.replace(/\s+/g, ' ').trim() === full.replace(/\s+/g, ' ').trim()
    if (!same) differingSections.push(`${book.name} ${number}`)
    const explanation = same ? structured : full
    const reflection = chapter.self_reflection?.length
      ? chapter.self_reflection.map((item, index) => `${index + 1}. ${clean(item)}`).join('\n\n')
      : reflectionFromHtml(chapter.self_reflection_html)
    const missing = [!outline && 'outline', !explanation && 'penjelasan', !reflection && 'refleksi'].filter(Boolean)
    if (missing.length) { skipped.push(`${book.name} ${number}: ${missing.join(', ')}`); continue }
    if ([outline, explanation, reflection].some(value => /[�Ãâ]/u.test(value))) {
      damaged.push(`${book.name} ${number}`)
      if (!includeDamaged) {
        skipped.push(`${book.name} ${number}: teks sumber rusak`)
        continue
      }
    }
    rows.push({ book_id: book.id, chapter_number: number, introduction: outline, explanation, reflection })
  }
}
rows.sort((a, b) => a.book_id - b.book_id || a.chapter_number - b.chapter_number)
if (rows.length + skipped.length !== 1166 || sourceKeys.size !== 1166) throw new Error(`Jumlah sumber tidak sesuai: ${rows.length}/${sourceKeys.size}.`)
console.log(`Siap: ${rows.length} pasal lengkap; ${differingSections.length} memakai teks penjelasan penuh; ${skipped.length} pasal perlu perbaikan.`)
if (includeDamaged) console.log(`Teks rusak disertakan untuk diperbaiki Admin: ${damaged.join(', ')}.`)
if (skipped.length) console.log(`Perlu perbaikan sumber:\n${skipped.join('\n')}`)
console.log('Tidak tersedia dalam berkas: Mazmur 128–150.')

const env = {}
for (const line of (await readFile(new URL('../.env', import.meta.url), 'utf8')).replace(/^\uFEFF/, '').split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  if (match) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
}
const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim()
const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!url || !key) throw new Error('Konfigurasi Supabase tidak ditemukan.')
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const existing = []
for (let start = 0; ; start += 1000) {
  const { data, error } = await admin.from('bible_explanations').select('book_id, chapter_number').range(start, start + 999)
  if (error) throw error
  existing.push(...data)
  if (data.length < 1000) break
}
const present = new Set(existing.map(item => `${item.book_id}:${item.chapter_number}`))
const pending = rows.filter(row => !present.has(`${row.book_id}:${row.chapter_number}`))
console.log(`Sudah ada: ${rows.length - pending.length}; akan ditambahkan: ${pending.length}.`)
if (process.argv.includes('--apply')) {
  for (let start = 0; start < pending.length; start += 20) {
    const batch = pending.slice(start, start + 20)
    const { error } = await admin.from('bible_explanations').upsert(batch, { onConflict: 'book_id,chapter_number', ignoreDuplicates: true })
    if (error) throw new Error(`Impor batch ${start + 1}–${start + batch.length} gagal: ${error.message}`)
    if ((start + batch.length) % 100 === 0 || start + batch.length === pending.length) console.log(`Terkirim ${start + batch.length}/${pending.length} pasal.`)
  }

  for (let start = 0; start < pending.length; start += 100) {
    const batch = pending.slice(start, start + 100)
    const { data, error } = await admin.from('bible_explanations')
      .select('book_id, chapter_number, introduction, explanation, reflection')
      .in('book_id', [...new Set(batch.map(row => row.book_id))])
    if (error) throw error
    const found = new Map(data.map(row => [`${row.book_id}:${row.chapter_number}`, row]))
    for (const row of batch) {
      const saved = found.get(`${row.book_id}:${row.chapter_number}`)
      if (!saved || saved.introduction !== row.introduction || saved.explanation !== row.explanation || saved.reflection !== row.reflection) {
        throw new Error(`Verifikasi gagal: ${row.book_id}:${row.chapter_number}`)
      }
    }
  }
  console.log(`Selesai: ${pending.length} pasal baru diverifikasi; baris lama tidak diubah.`)
}
