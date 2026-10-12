import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deleteUnusedNews, isReferencedByNews, scanUnusedNews } from '../api/_handlers/storage-cleanup.js'
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
