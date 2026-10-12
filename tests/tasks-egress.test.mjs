import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { startHarness, fixture } from './harness.mjs'

let harness
before(async () => { harness = await startHarness() })
after(async () => { await harness?.close() })

// Seluruh backend memakai fixture. Simulasikan juga batas baris server yang
// lebih kecil dari range klien agar progres gabungan tidak terpotong diam-diam.
async function scenario(action, { rows = [], cap = 500, fail = false } = {}) {
  const f = await fixture(harness, { authenticated: false })
  const state = { rows, cap, fail }
  const queries = []
  await f.page.route('**/rest/v1/form_responses?*', async route => {
    const params = new URL(route.request().url()).searchParams
    queries.push(params)
    if (state.fail) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Simulasi gagal' }) })
    }
    let data = state.rows.filter(row => row.volunteer_id === params.get('volunteer_id')?.slice(3))
    const form = params.get('form_id')
    if (form?.startsWith('eq.')) data = data.filter(row => row.form_id === form.slice(3))
    if (form?.startsWith('in.')) {
      const ids = form.slice(4, -1).split(',').map(id => id.replaceAll('"', ''))
      data = data.filter(row => ids.includes(row.form_id))
    }
    if (params.has('submitted_at')) data = data.filter(row => row.submitted_at >= params.get('submitted_at').slice(4))
    if (params.has('order')) data.sort((a, b) => a.response_id.localeCompare(b.response_id))
    const count = data.length
    const offset = Number(params.get('offset') || 0)
    const limit = Math.min(Number(params.get('limit') || state.cap), state.cap)
    const fields = params.get('select').split(',').map(field => field.trim())
    data = data.slice(offset, offset + limit).map(row => Object.fromEntries(fields.map(field => [field, row[field]])))
    return route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-range': data.length ? `${offset}-${offset + data.length - 1}/${count}` : `*/${count}`,
        'access-control-expose-headers': 'Content-Range',
      },
      body: JSON.stringify(data),
    })
  })
  try {
    await f.goto('/login')
    await f.page.getByRole('heading', { name: 'Selamat Datang', exact: true }).waitFor()
    await action({ ...f, state, queries })
    assert.deepEqual(f.errors, [])
    assert.deepEqual(f.unexpected, [])
  } finally { await f.close() }
}

const row = (id, form, user = 'U1', time = '2026-10-06T00:00:00.000Z') => ({
  response_id: id, form_id: form, volunteer_id: user, submitted_at: time,
  data_json: { jawaban: 'Isi jawaban tidak diperlukan untuk progres' },
})

test('Progres: banyak form menjadi satu request; filter akun/periode tetap berlaku', async () => {
  await scenario(async f => {
    const counts = await f.page.evaluate(async () => {
      const { tasksService } = await import('/src/services/tasksService.js')
      return tasksService.getMyResponseCounts('U1', ['A', 'B', 'C', 'A'], '2026-10-01T00:00:00.000Z')
    })
    assert.deepEqual(counts, { A: 2, B: 1, C: 0 })
    assert.equal(f.queries.length, 1)
    assert.equal(f.queries[0].get('select'), 'form_id')
    assert.equal(f.queries[0].get('order'), 'response_id.asc')
  }, { rows: [row('1', 'A'), row('2', 'A'), row('3', 'B'), row('4', 'A', 'U2'), row('5', 'D'), row('6', 'B', 'U1', '2026-09-01T00:00:00.000Z')] })
})

test('Progres: lebih dari 1000 jawaban tetap utuh meski server membatasi 200 baris', async () => {
  await scenario(async f => {
    const counts = await f.page.evaluate(async () => {
      const { tasksService } = await import('/src/services/tasksService.js')
      return tasksService.getMyResponseCounts('U1', ['A', 'B'], '2026-10-01T00:00:00.000Z')
    })
    assert.deepEqual(counts, { A: 502, B: 501 })
    assert.equal(f.queries.length, 6)
    assert.deepEqual(f.queries.map(q => Number(q.get('offset'))), [0, 200, 400, 600, 800, 1000])
  }, { rows: Array.from({ length: 1003 }, (_, i) => row(String(i).padStart(4, '0'), i % 2 ? 'B' : 'A')), cap: 200 })
})

test('Progres: kosong tanpa request dan daftar besar dipecah tanpa hitungan ganda', async () => {
  await scenario(async f => {
    const result = await f.page.evaluate(async () => {
      const { tasksService } = await import('/src/services/tasksService.js')
      const empty = await tasksService.getMyResponseCounts('U1', [], '2026-10-01')
      const anonymous = await tasksService.getMyResponseCounts(null, ['A'], '2026-10-01')
      const counts = await tasksService.getMyResponseCounts('U1', Array.from({ length: 51 }, (_, i) => 'F' + i), '2026-10-01')
      return { empty, anonymous, counts }
    })
    assert.deepEqual(result.empty, {})
    assert.deepEqual(result.anonymous, { A: 0 })
    assert.equal(f.queries.length, 2)
    assert.equal(Object.keys(result.counts).length, 51)
    assert.equal(result.counts.F50, 1)
  }, { rows: [row('1', 'F50')] })
})

test('Progres: periode mingguan dan bulanan tetap berbeda', async () => {
  await scenario(async f => {
    await f.page.clock.install({ time: new Date('2026-10-07T05:00:00.000Z') })
    const result = await f.page.evaluate(async () => {
      const { tasksService } = await import('/src/services/tasksService.js')
      return {
        counts: await tasksService.getMyProgress('U1', [{ form_id: 'W' }, { form_id: 'M', period: 'bulan' }]),
        week: new Date(2026, 9, 5).toISOString(),
        month: new Date(2026, 9, 1).toISOString(),
      }
    })
    assert.deepEqual(result.counts, { W: 1, M: 2 })
    assert.equal(f.queries.length, 2)
    assert.equal(f.queries.find(q => q.get('form_id').includes('W')).get('submitted_at'), 'gte.' + result.week)
    assert.equal(f.queries.find(q => q.get('form_id').includes('M')).get('submitted_at'), 'gte.' + result.month)
  }, { rows: [row('1', 'W'), row('2', 'M'), row('3', 'W', 'U1', '2026-10-02T12:00:00.000Z'), row('4', 'M', 'U1', '2026-10-02T12:00:00.000Z')] })
})

test('Progres: kegagalan tidak menjadi nol sukses; pemanggilan berikutnya membaca data baru', async () => {
  await scenario(async f => {
    const fetchCounts = () => f.page.evaluate(async () => {
      const { tasksService } = await import('/src/services/tasksService.js')
      try { return await tasksService.getMyResponseCounts('U1', ['A'], '2026-10-01') }
      catch (error) { return { error: error.message } }
    })
    assert.deepEqual(await fetchCounts(), { error: 'Simulasi gagal' })
    // SDK dapat mengulang 503; hitung request sukses setelah seluruh retry gagal.
    const failedRequests = f.queries.length
    assert.ok(failedRequests >= 1)
    f.state.fail = false
    assert.deepEqual(await fetchCounts(), { A: 1 })
    f.state.rows.push(row('2', 'A'))
    assert.deepEqual(await fetchCounts(), { A: 2 })
    assert.equal(f.queries.length, failedRequests + 2)
  }, { rows: [row('1', 'A')], fail: true })
})

test('Riwayat SOP: waktu dan ID tersedia tanpa isi jawaban atau lampiran', async () => {
  await scenario(async f => {
    const history = await f.page.evaluate(async () => {
      const { tasksService } = await import('/src/services/tasksService.js')
      return tasksService.getMyResponseHistory('U1', 'A')
    })
    assert.deepEqual(history, [{ response_id: '1', submitted_at: '2026-10-06T00:00:00.000Z' }])
    assert.equal(f.queries[0].get('select'), 'response_id,submitted_at')
  }, { rows: [row('1', 'A'), row('2', 'B'), row('3', 'A', 'U2')] })
})
