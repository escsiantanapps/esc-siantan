import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deleteResponseFiles, deleteUnusedNews, filterResponseCandidates, isReferencedByNews, parseResponseFilter, prepareResponseBulk, scanResponseFiles, scanUnusedNews } from '../api/_handlers/storage-cleanup.js'
import { isAllowedResponseArchiveCutoff, latestResponseArchiveCutoff, responseSnapshotPayload } from '../src/lib/archiveRetention.js'

const NOW = Date.parse('2026-10-12T00:00:00Z')
const OLD = '2026-09-01T00:00:00Z'

test('Arsip respons: tanggal cutoff paling baru adalah enam bulan WIB, termasuk akhir bulan', () => {
  assert.equal(latestResponseArchiveCutoff(new Date('2026-10-12T00:00:00Z')), '2026-04-12')
  assert.equal(latestResponseArchiveCutoff(new Date('2026-08-31T18:00:00Z')), '2026-03-01')
  assert.equal(isAllowedResponseArchiveCutoff('2026-04-12', new Date('2026-10-12T00:00:00Z')), true)
  assert.equal(isAllowedResponseArchiveCutoff('2026-04-13', new Date('2026-10-12T00:00:00Z')), false)
  assert.equal(isAllowedResponseArchiveCutoff('2026-02-30', new Date('2026-10-12T00:00:00Z')), false)
})

test('Arsip respons: sidik isi stabil saat urutan baris dan kunci JSON berubah', () => {
  const first = [
    { response_id: 'B', form_id: 'F', volunteer_id: 'U', submitted_at: OLD, data_json: { b: 2, a: { y: 1, x: 2 } } },
    { response_id: 'A', form_id: 'F', volunteer_id: 'U', submitted_at: OLD, data_json: { answer: 1 } },
  ]
  const second = [
    first[1], { ...first[0], data_json: { a: { x: 2, y: 1 }, b: 2 } },
  ]
  assert.equal(responseSnapshotPayload(first), responseSnapshotPayload(second))
  assert.notEqual(responseSnapshotPayload(first), responseSnapshotPayload([
    second[0], { ...second[1], data_json: { a: { x: 2, y: 1 }, b: 3 } },
  ]))
})

function fixture({ files = {}, news = [], failRemove = [] } = {}) {
  const removed = []
  const pages = []
  const admin = {
    storage: {
      from(bucket) {
        assert.equal(bucket, 'task-files')
        return {
          async list(folder, options) {
            pages.push({ folder, offset: options.offset })
            return { data: (files[folder] || []).slice(options.offset, options.offset + options.limit), error: null }
          },
          async remove(paths) {
            if (failRemove.includes(paths[0])) return { error: new Error('storage gagal') }
            removed.push(...paths)
            return { data: paths, error: null }
          },
        }
      },
    },
    from(table) {
      assert.equal(table, 'news')
      return {
        select() { return this },
        order() { return this },
        async range(from, to) { return { data: news.slice(from, to + 1), error: null } },
      }
    },
  }
  return { admin, removed, pages }
}

test('Audit news memaginasi folder, menolak file baru, dan melindungi URL yang masih dipakai', async () => {
  const many = Array.from({ length: 1001 }, (_, i) => ({
    id: String(i), name: `file-${i}.pdf`, created_at: OLD, metadata: { size: 1024 },
  }))
  const f = fixture({
    files: {
      news: [{ id: null, name: 'pdf' }, { id: null, name: 'video' }],
      'news/pdf': many,
      'news/video': [
        { id: 'used', name: 'used.mp4', created_at: OLD, metadata: { size: 900 } },
        { id: 'new', name: 'new.mp4', created_at: '2026-10-11T00:00:00Z', metadata: { size: 800 } },
      ],
    },
    news: [{ news_id: 'n1', video_urls: ['https://example.test/storage/v1/object/public/task-files/news/video/used.mp4'] }],
  })
  const result = await scanUnusedNews(f.admin, NOW)
  assert.equal(result.scannedFiles, 1003)
  assert.equal(result.candidates.length, 1001)
  assert.ok(result.candidates.every(file => file.path.startsWith('news/pdf/')))
  assert.ok(f.pages.some(page => page.folder === 'news/pdf' && page.offset === 1000))
  assert.equal(isReferencedByNews('news/video/used.mp4', [JSON.stringify({ url: 'news/video/used.mp4' })]), true)
})

test('Hapus hanya kandidat news yang dicek ulang; path lain dan file aktif ditolak', async () => {
  const f = fixture({
    files: { news: [
      { id: 'orphan', name: 'orphan.pdf', created_at: OLD, metadata: { size: 2048 } },
      { id: 'used', name: 'used.pdf', created_at: OLD, metadata: { size: 1024 } },
    ] },
    news: [{ news_id: 'n1', pdf_files: [{ url: 'https://example.test/task-files/news/used.pdf' }] }],
  })
  const invalid = await deleteUnusedNews(f.admin, ['responses/u/file.pdf'], NOW)
  assert.equal(invalid.status, 400)
  const stale = await deleteUnusedNews(f.admin, ['news/used.pdf'], NOW)
  assert.equal(stale.status, 409)
  assert.deepEqual(f.removed, [])
  const allowed = await deleteUnusedNews(f.admin, ['news/orphan.pdf'], NOW)
  assert.equal(allowed.status, 200)
  assert.deepEqual(allowed.body.deleted, ['news/orphan.pdf'])
  assert.equal(allowed.body.freedBytes, 2048)
  assert.deepEqual(f.removed, ['news/orphan.pdf'])
})

test('Penghapusan parsial dilaporkan dan tidak mengklaim ruang file yang gagal', async () => {
  const f = fixture({
    files: { news: [
      { id: 'one', name: 'one.pdf', created_at: OLD, metadata: { size: 100 } },
      { id: 'two', name: 'two.pdf', created_at: OLD, metadata: { size: 200 } },
    ] },
    failRemove: ['news/two.pdf'],
  })
  const result = await deleteUnusedNews(f.admin, ['news/one.pdf', 'news/two.pdf'], NOW)
  assert.deepEqual(result.body.deleted, ['news/one.pdf'])
  assert.deepEqual(result.body.failed, ['news/two.pdf'])
  assert.equal(result.body.freedBytes, 100)
  assert.deepEqual(f.removed, ['news/one.pdf'])
})

function responseFixture({ failRemove = false, secondFile = false } = {}) {
  const url = path => `https://example.test/storage/v1/object/public/task-files/${path}`
  const rows = {
    form_responses: [
      { response_id: 'R1', volunteer_id: 'U1', form_id: 'F1', data_json: {
        note: 'Jawaban tetap ada', photo: url('responses/u/large.jpg'),
        ...(secondFile ? { document: url('responses/u/second.jpg') } : {}),
      } },
      { response_id: 'R2', volunteer_id: 'U1', form_id: 'F1', data_json: { photo: url('responses/u/shared.jpg') } },
      { response_id: 'R3', volunteer_id: 'U1', form_id: 'F1', data_json: { photo: url('responses/u/shared.jpg') } },
    ],
    registration_prerequisites: [{ id: 'P1', data_json: { photo: url('responses/u/prereq.jpg') } }],
  }
  const removed = []
  const audits = []
  const files = ['large.jpg', 'shared.jpg', 'prereq.jpg', 'orphan.jpg', 'recent.jpg', ...(secondFile ? ['second.jpg'] : [])].map((name, i) => ({
    id: name, name, created_at: name === 'recent.jpg' ? '2026-10-11T00:00:00Z' : OLD,
    metadata: { size: name === 'second.jpg' ? 1000 : 5000 - i * 1000 },
  }))
  const admin = {
    storage: { from() { return {
      async list(folder) { return { data: folder === 'responses' ? [{ id: null, name: 'u' }]
        : folder === 'responses/u' ? files : [], error: null } },
      async remove(paths) {
        if (failRemove) return { error: new Error('gagal') }
        removed.push(...paths)
        return { error: null }
      },
    } } },
    from(table) {
      const q = {
        action: null, filters: [], payload: null,
        select() { return this }, order() { return this },
        range(from, to) { return Promise.resolve({ data: rows[table].slice(from, to + 1), error: null }) },
        update(payload) { this.action = 'update'; this.payload = payload; return this },
        eq(column, value) { this.filters.push([column, value]); return this },
        insert(payload) { audits.push(payload); return Promise.resolve({ error: null }) },
        then(resolve) {
          const row = rows[table].find(item => this.filters.every(([column, value]) =>
            column === 'data_json' ? JSON.stringify(item[column]) === value : item[column] === value))
          if (row) Object.assign(row, this.payload)
          resolve({ data: row ? [row] : [], error: null })
        },
      }
      return q
    },
  }
  return { admin, rows, removed, audits }
}

test('Lampiran SOP dan yatim lama dipilih menurut ukuran; file prasyarat, bersama, dan yatim baru dikecualikan', async () => {
  const f = responseFixture()
  const result = await scanResponseFiles(f.admin, NOW)
  assert.equal(result.scannedFiles, 5)
  assert.deepEqual(result.candidates.map(file => file.path), ['responses/u/large.jpg', 'responses/u/orphan.jpg'])
  assert.equal(result.candidates[1].orphan, true)
})

test('Hapus lampiran menjaga jawaban teks dan mencatat audit; kegagalan Storage memulihkan tautan', async () => {
  const path = 'responses/u/large.jpg'
  const caller = { user_id: 'A1', name: 'Admin', role: 'Super Admin' }
  const success = responseFixture()
  const result = await deleteResponseFiles(success.admin, [path], caller, NOW)
  assert.deepEqual(result.body.deleted, [path])
  assert.equal(result.body.freedBytes, 5000)
  assert.deepEqual(success.rows.form_responses[0].data_json, { note: 'Jawaban tetap ada', photo: null })
  assert.deepEqual(success.removed, [path])
  assert.equal(success.audits[0].record_id, 'R1')

  const failed = responseFixture({ failRemove: true })
  const retry = await deleteResponseFiles(failed.admin, [path], caller, NOW)
  assert.deepEqual(retry.body.failed, [path])
  assert.equal(failed.rows.form_responses[0].data_json.photo.includes(path), true)
  assert.equal(failed.audits.length, 0)
})

test('File yatim lama bisa dihapus dan diaudit tanpa mengubah respons', async () => {
  const f = responseFixture()
  const before = JSON.stringify(f.rows.form_responses)
  const result = await deleteResponseFiles(f.admin, ['responses/u/orphan.jpg'],
    { user_id: 'A1', name: 'Admin', role: 'Super Admin' }, NOW)
  assert.deepEqual(result.body.deleted, ['responses/u/orphan.jpg'])
  assert.equal(result.body.freedBytes, 2000)
  assert.equal(JSON.stringify(f.rows.form_responses), before)
  assert.equal(f.audits[0].table_name, 'storage.objects')
  assert.equal(f.audits[0].old_data.orphan, true)
})

test('Dua lampiran pada respons yang sama dapat dihapus dalam satu batch tanpa menghapus teks', async () => {
  const f = responseFixture({ secondFile: true })
  const result = await deleteResponseFiles(f.admin,
    ['responses/u/large.jpg', 'responses/u/second.jpg'],
    { user_id: 'A1', name: 'Admin', role: 'Super Admin' }, NOW)
  assert.deepEqual(result.body.failed, [])
  assert.deepEqual(result.body.deleted, ['responses/u/large.jpg', 'responses/u/second.jpg'])
  assert.deepEqual(f.rows.form_responses[0].data_json, {
    note: 'Jawaban tetap ada', photo: null, document: null,
  })
})

test('Filter bulan memakai tanggal unggah WIB dan persiapan massal mencakup lebih dari 200 hasil', () => {
  const files = Array.from({ length: 250 }, (_, index) => ({
    path: `responses/u/photo-${index}.jpg`, size: 2 * 1024 * 1024,
    createdAt: index === 0 ? '2026-08-31T18:00:00Z' : '2026-09-15T00:00:00Z',
    orphan: index % 2 === 0, formId: 'F1',
  }))
  const filter = parseResponseFilter({ month: '2026-09', status: 'orphan', minBytes: 1024 * 1024, query: 'photo' })
  assert.equal(filterResponseCandidates(files, filter).length, 125)
  const all = prepareResponseBulk(files, parseResponseFilter({ month: '2026-09' }))
  assert.equal(all.candidateCount, 250)
  assert.equal(all.paths.length, 250)
  assert.equal(all.candidateBytes, 250 * 2 * 1024 * 1024)
  assert.equal(parseResponseFilter({ month: '2026-13' }), null)
  assert.equal(parseResponseFilter({ status: 'unknown' }), null)
  assert.equal(parseResponseFilter({ minBytes: -1 }), null)
})

test('Penghapusan menolak file yang tidak lagi cocok dengan jenis pada filter', async () => {
  const f = responseFixture()
  const caller = { user_id: 'A1', name: 'Admin', role: 'Super Admin' }
  const result = await deleteResponseFiles(f.admin, ['responses/u/large.jpg'], caller, NOW,
    { status: 'orphan' })
  assert.equal(result.status, 409)
  assert.deepEqual(f.removed, [])
  assert.equal(f.rows.form_responses[0].data_json.note, 'Jawaban tetap ada')
})
