// Ekstraksi lokal untuk berkas EWB yang disediakan operator; hasilnya tetap di folder scratch (diabaikan Git).
// Pemakaian: node tools/extract-ewb-bible.mjs tsi|bimk "C:\\...\\file.ewb" scratch/nama.json
import { DatabaseSync } from 'node:sqlite'
import { inflateSync } from 'node:zlib'
import { readFile, writeFile } from 'node:fs/promises'
import { bibleVersions } from '../src/data/bibleVersions.js'

const [translation, inputPath, outputPath] = process.argv.slice(2)
if (!['tsi', 'bimk'].includes(translation) || !inputPath || !outputPath) {
  throw new Error('Pakai: node tools/extract-ewb-bible.mjs tsi|bimk input.ewb output.json')
}

const metadata = JSON.parse(await readFile(new URL('../src/data/bibleBooks.json', import.meta.url), 'utf8'))
const db = new DatabaseSync(inputPath, { readOnly: true })
const header = db.prepare('SELECT name, abbrev_name FROM header LIMIT 1').get()
if (header?.abbrev_name?.toLowerCase() !== translation) throw new Error('Versi berkas tidak sesuai pilihan.')

const books = []
let verseCount = 0
let combinedCount = 0
let skippedSpanCount = 0

for (const source of db.prepare('SELECT rowid, name, book_info, verse_info FROM books ORDER BY rowid').all()) {
  if (!bibleVersions[translation].books.includes(source.rowid)) throw new Error(`Kitab ${source.rowid} tidak terdaftar pada versi ${translation}.`)
  const canonical = metadata[source.rowid - 1]
  const bookInfo = Buffer.from(source.book_info)
  const verseInfo = Buffer.from(source.verse_info)
  const streamRow = db.prepare('SELECT stream FROM streams WHERE rowid = ?').get(source.rowid)
  if (!streamRow || verseInfo.length % 8) throw new Error(`Indeks kitab ${source.rowid} tidak valid.`)
  const stream = inflateSync(streamRow.stream).toString('utf8')
  const chapterCount = bookInfo[0] || 1
  if (chapterCount !== canonical.chapters) throw new Error(`Jumlah pasal ${source.rowid} berbeda dari daftar aplikasi.`)
  const chapters = Array.from({ length: chapterCount }, () => [])
  let priorEnd = 0

  for (let index = 0; index < verseInfo.length / 8; index++) {
    const offset = index * 8
    const packed = verseInfo.readUIntLE(offset + 1, 3)
    const length = verseInfo[offset] + 256 * (packed & 3)
    const pointer = (packed >>> 2) & 0x7ffff
    const id = verseInfo.subarray(offset + 4, offset + 8)
    const verse = (id[0] >>> 2) + ((id[1] & 3) << 6)
    const chapter = (id[1] >>> 2) + ((id[2] & 3) << 6)
    const book = (id[2] >>> 2) + ((id[3] & 1) << 6)
    if (book !== source.rowid || chapter < 1 || chapter > chapterCount || verse < 1 || verse > 176) {
      throw new Error(`Identitas ayat tidak valid pada kitab ${source.rowid}, entri ${index}.`)
    }
    const gap = pointer - priorEnd
    if (![0, 1, 1024, 1023].includes(gap)) throw new Error(`Indeks teks bergeser ${gap} pada ${book} ${chapter}:${verse}.`)
    if (gap >= 1023) skippedSpanCount++
    const start = gap === 1 ? pointer - 1 : pointer
    const text = stream.slice(start + 2, pointer + length + 2).trim()
    if (!text || text.includes('\uFFFD')) throw new Error(`Teks rusak pada ${book} ${chapter}:${verse}.`)
    const verses = chapters[chapter - 1]
    verses.push({ verse, text })
    priorEnd = pointer + length
    verseCount++
  }

  for (let chapter = 1; chapter <= chapterCount; chapter++) {
    const verses = chapters[chapter - 1]
    if (!verses.length) throw new Error(`Pasal kosong: ${source.rowid} ${chapter}.`)
    // Zakharia 4 dalam BIMK menempatkan 10b–14 sebelum 6–10a pada indeks EWB.
    if (translation === 'bimk' && source.rowid === 38 && chapter === 4) {
      verses.sort((a, b) => a.verse - b.verse || (a.text.startsWith('a ') ? -1 : 1))
    }
    const segments = translation === 'bimk' && source.rowid === 41 && chapter === 16
      ? [verses.slice(0, -2), verses.slice(-2)] // Akhir panjang dan akhir singkat Markus disimpan terpisah.
      : [verses]
    for (const segment of segments) {
      if (segment[0].verse !== 1 && segment === verses) throw new Error(`Awal pasal tidak lengkap: ${source.rowid} ${chapter}.`)
      for (let index = 0; index < segment.length - 1; index++) {
        const current = segment[index]
        const next = segment[index + 1]
        if (next.verse < current.verse || (next.verse === current.verse && !(source.rowid === 38 && chapter === 4))) {
          throw new Error(`Urutan ayat tidak valid: ${source.rowid} ${chapter}:${next.verse}.`)
        }
        if (next.verse > current.verse + 1) {
          current.endVerse = next.verse - 1
          combinedCount++
        }
      }
    }
    const expectedLast = Math.max(bookInfo[chapter] || 0, ...verses.map(item => item.verse))
    const last = segments[0].at(-1)
    if (last.verse < expectedLast) {
      last.endVerse = expectedLast
      combinedCount++
    }
  }
  books.push({ id: source.rowid, chapters })
}

if (books.length !== bibleVersions[translation].books.length) throw new Error('Jumlah kitab tidak lengkap.')
await writeFile(outputPath, JSON.stringify({ format: 'ESC Bible Chapters', translation, books }))
console.log(`${header.name}: ${books.length} kitab, ${books.reduce((n, book) => n + book.chapters.length, 0)} pasal, ${verseCount} bagian ayat, ${combinedCount} rentang ayat gabungan, ${skippedSpanCount} rentang indeks dilewati.`)
