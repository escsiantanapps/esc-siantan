// Unggah hasil ekstraksi TB lokal ke bucket privat tanpa menaruh ayat di GitHub.
// Pemakaian: node tools/upload-bible-tb.mjs "C:\\lokasi\\TB-extracted-for-review.json" [--dry-run]
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'bible-tb'

function readEnv(source) {
  const values = {}
  for (const line of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return values
}

function prepareBooks(source, metadata) {
  if (source?.format !== 'EasyWorship Bible Text' || source.books?.length !== 66) throw new Error('Format atau jumlah kitab tidak sesuai.')
  const files = []
  let verseCount = 0

  for (let bookIndex = 0; bookIndex < metadata.length; bookIndex++) {
    const book = source.books[bookIndex]
    if (book.chapters?.length !== metadata[bookIndex].chapters) throw new Error(`Jumlah pasal tidak sesuai pada kitab ${bookIndex + 1}.`)

    for (let chapterIndex = 0; chapterIndex < book.chapters.length; chapterIndex++) {
      let verses = book.chapters[chapterIndex]

      // Berkas EasyWorship ini menggandakan persis Yoel 3; hapus salinan kedua setelah memverifikasi isinya sama.
      if (bookIndex === 28 && chapterIndex === 2) {
        if (verses.length !== 42 || verses.slice(0, 21).some((verse, index) => verse.verse !== verses[index + 21].verse || verse.text !== verses[index + 21].text)) {
          throw new Error('Duplikasi Yoel 3 tidak sesuai pola yang telah diverifikasi.')
        }
        verses = verses.slice(0, 21)
      }

      for (let index = 0; index < verses.length; index++) {
        if (verses[index].verse !== index + 1 || typeof verses[index].text !== 'string' || !verses[index].text.trim() || verses[index].text.includes('\uFFFD')) {
          throw new Error(`Ayat tidak valid pada kitab ${bookIndex + 1} pasal ${chapterIndex + 1}.`)
        }
      }
      const body = Buffer.from(JSON.stringify(verses))
      if (body.length > 64 * 1024) throw new Error(`Pasal terlalu besar pada kitab ${bookIndex + 1} pasal ${chapterIndex + 1}.`)
      files.push({ path: `${bookIndex + 1}/${chapterIndex + 1}.json`, body })
      verseCount += verses.length
    }
  }

  if (files.length !== 1189 || verseCount !== 31102) throw new Error(`Jumlah akhir tidak sesuai: ${files.length} pasal, ${verseCount} ayat.`)
  return { files, verseCount }
}

async function main() {
  const sourcePath = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')
  if (!sourcePath || sourcePath === '--dry-run') throw new Error('Berikan path JSON hasil ekstraksi privat.')

  const [source, metadata] = await Promise.all([
    readFile(sourcePath, 'utf8').then(JSON.parse),
    readFile(new URL('../src/data/bibleBooks.json', import.meta.url), 'utf8').then(JSON.parse),
  ])
  const { files, verseCount } = prepareBooks(source, metadata)
  const bytes = files.reduce((sum, file) => sum + file.body.length, 0)
  console.log(`Terverifikasi: 66 kitab, ${files.length} pasal, ${verseCount} ayat, ${bytes} byte.`)
  if (dryRun) return

  const env = readEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'))
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim()
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !key) throw new Error('URL Supabase atau service role key tidak ditemukan di .env.')
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: existing } = await admin.storage.getBucket(BUCKET)
  if (existing?.public) throw new Error('Bucket bible-tb sudah ada tetapi bersifat publik.')
  if (!existing) {
    const { error } = await admin.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: 64 * 1024,
      allowedMimeTypes: ['application/json'],
    })
    if (error) throw error
    console.log('Bucket privat dibuat.')
  }

  let cursor = 0
  let completed = 0
  async function worker() {
    while (cursor < files.length) {
      const file = files[cursor++]
      let lastError
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await admin.storage.from(BUCKET).upload(file.path, file.body, {
          contentType: 'application/json', upsert: true,
        })
        if (!error) { lastError = null; break }
        lastError = error
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
      }
      if (lastError) throw new Error(`Unggah ${file.path} gagal: ${lastError.message}`)
      completed++
      if (completed % 100 === 0 || completed === files.length) console.log(`Terunggah ${completed}/${files.length} pasal.`)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))

  for (const index of [0, 500, files.length - 1]) {
    const file = files[index]
    const { data, error } = await admin.storage.from(BUCKET).download(file.path)
    if (error || !data || (await data.text()) !== file.body.toString()) throw new Error(`Verifikasi unggahan gagal: ${file.path}`)
  }
  console.log('Unggahan dan sampel verifikasi selesai; bucket tetap privat.')
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
