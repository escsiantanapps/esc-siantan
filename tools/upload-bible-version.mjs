// Unggah JSON hasil ekstraksi privat ke Supabase Storage setelah hak publikasinya dipastikan operator.
// Pemakaian: node tools/upload-bible-version.mjs scratch/bible-tsi.json [--upload]
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { bibleVersions } from '../src/data/bibleVersions.js'

const sourcePath = process.argv[2]
if (!sourcePath) throw new Error('Berikan path JSON hasil ekstraksi.')
const source = JSON.parse(await readFile(sourcePath, 'utf8'))
const version = bibleVersions[source.translation]
if (source.format !== 'ESC Bible Chapters' || !version || source.translation === 'tb') throw new Error('Format atau versi tidak didukung.')
const metadata = JSON.parse(await readFile(new URL('../src/data/bibleBooks.json', import.meta.url), 'utf8'))
if (source.books?.length !== version.books.length) throw new Error('Jumlah kitab tidak sesuai.')

const files = []
let verseCount = 0
for (const book of source.books) {
  if (!version.books.includes(book.id) || book.chapters?.length !== metadata[book.id - 1].chapters) throw new Error(`Kitab ${book.id} tidak sesuai.`)
  for (let index = 0; index < book.chapters.length; index++) {
    const verses = book.chapters[index]
    if (!verses?.length || verses.some(item => !Number.isInteger(item.verse) || !item.text?.trim() || item.text.includes('\uFFFD'))) {
      throw new Error(`Ayat tidak valid pada ${book.id} ${index + 1}.`)
    }
    const body = Buffer.from(JSON.stringify(verses))
    if (body.length > 64 * 1024) throw new Error(`Pasal terlalu besar: ${book.id} ${index + 1}.`)
    files.push({ path: `${book.id}/${index + 1}.json`, body })
    verseCount += verses.length
  }
}
console.log(`${source.translation.toUpperCase()}: ${source.books.length} kitab, ${files.length} pasal, ${verseCount} bagian ayat tervalidasi.`)
if (!process.argv.includes('--upload')) process.exit(0)

const values = {}
for (const line of (await readFile(new URL('../.env', import.meta.url), 'utf8')).replace(/^\uFEFF/, '').split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
}
const url = (values.SUPABASE_URL || values.VITE_SUPABASE_URL || '').trim()
const key = (values.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!url || !key) throw new Error('Konfigurasi Supabase tidak lengkap.')
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: existing, error: bucketError } = await admin.storage.getBucket(version.bucket)
if (bucketError && bucketError.statusCode !== '404') throw bucketError
if (existing?.public) throw new Error('Bucket sudah ada tetapi bersifat publik.')
if (!existing) {
  const { error } = await admin.storage.createBucket(version.bucket, { public: false, fileSizeLimit: 64 * 1024, allowedMimeTypes: ['application/json'] })
  if (error) throw error
}

let cursor = 0
let completed = 0
async function worker() {
  while (cursor < files.length) {
    const file = files[cursor++]
    const { error } = await admin.storage.from(version.bucket).upload(file.path, file.body, { contentType: 'application/json', upsert: true })
    if (error) throw new Error(`Unggah ${file.path} gagal: ${error.message}`)
    completed++
    if (completed % 100 === 0 || completed === files.length) console.log(`Terunggah ${completed}/${files.length} pasal.`)
  }
}
await Promise.all(Array.from({ length: 5 }, worker))
for (const file of [files[0], files[Math.floor(files.length / 2)], files.at(-1)]) {
  const { data, error } = await admin.storage.from(version.bucket).download(file.path)
  if (error || !data || (await data.text()) !== file.body.toString()) throw new Error(`Verifikasi unggahan gagal: ${file.path}`)
}
console.log('Unggahan selesai dan sampel berkas berhasil diverifikasi.')
