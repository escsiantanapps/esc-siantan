import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sendRosterNotifications } from '../api/_lib/service-roster-notifications.js'

const previousFirebaseAccount = process.env.FIREBASE_SERVICE_ACCOUNT
before(() => { delete process.env.FIREBASE_SERVICE_ACCOUNT })
after(() => {
  if (previousFirebaseAccount === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT
  else process.env.FIREBASE_SERVICE_ACCOUNT = previousFirebaseAccount
})

const roster = {
  roster_id: 'QA-ROSTER/TAUTAN?1', version: 3,
  title: 'Ibadah Pagi QA', service_date: '2026-10-04',
  start_time: '08:00:00', location: 'Aula QA',
}

function databaseFixture(options = {}) {
  const state = {
    users: [{ user_id: 'QA-USER', status: 'Aktif' }],
    push_subscriptions: [{
      user_id: 'QA-USER', endpoint: 'https://push.example.invalid/qa',
      p256dh: 'qa-public-key', auth: 'qa-auth',
    }],
    errors: {}, logs: new Map(), queries: [], claims: [],
    ...options,
  }
  const matches = (row, filters) => filters.every(filter =>
    filter.operator === 'in'
      ? filter.value.includes(row[filter.column])
      : row[filter.column] === filter.value
  )
  function execute(query) {
    state.queries.push(query)
    const error = state.errors[query.table + ':' + query.operation]
    if (error) return { data: null, error }
    if (query.table === 'service_roster_notification_logs') {
      if (state.finalizationMismatch) return { data: [], error: null }
      const data = []
      for (const row of state.logs.values()) {
        if (!matches(row, query.filters)) continue
        Object.assign(row, query.payload)
        data.push({ notification_id: row.notification_id })
      }
      return { data, error: null }
    }
    const rows = state[query.table] || []
    const data = rows.filter(row => matches(row, query.filters))
    if (query.operation === 'delete') state[query.table] = rows.filter(row => !matches(row, query.filters))
    return { data, error: null }
  }
  const admin = {
    from(table) {
      const query = {
        table, operation: 'select', filters: [], payload: null,
        select() { return this },
        in(column, value) { this.filters.push({ column, value, operator: 'in' }); return this },
        eq(column, value) { this.filters.push({ column, value, operator: 'eq' }); return this },
        update(payload) { this.operation = 'update'; this.payload = payload; return this },
        delete() { this.operation = 'delete'; return this },
        then(resolve, reject) { return Promise.resolve(execute(this)).then(resolve, reject) },
      }
      return query
    },
    async rpc(name, params) {
      assert.equal(name, 'claim_service_roster_notification')
      state.claims.push(params)
      if (state.claimError) return { data: null, error: state.claimError }
      const key = JSON.stringify([params.p_roster_id, params.p_user_id, params.p_kind, params.p_roster_version])
      const existing = state.logs.get(key)
      if (existing && ['pending', 'sent'].includes(existing.delivery_status)) return { data: null, error: null }
      const token = 'qa-claim-' + state.claims.length
      state.logs.set(key, {
        notification_id: 'QA-LOG-' + state.claims.length,
        roster_id: params.p_roster_id, user_id: params.p_user_id,
        kind: params.p_kind, roster_version: params.p_roster_version,
        delivery_status: 'pending', claim_token: token,
      })
      return { data: token, error: null }
    },
  }
  return { admin, state }
}

function pushFixture(send = async () => {}) {
  const calls = []
  return {
    calls,
    webpush: {
      async sendNotification(subscription, payload) {
        calls.push({ subscription, payload: JSON.parse(payload) })
        return send(subscription, payload)
      },
    },
  }
}

function send(fixture, push, overrides = {}) {
  return sendRosterNotifications({
    admin: fixture.admin, webpush: push.webpush,
    roster, userIds: ['QA-USER'], kind: 'Terbit',
    ...overrides,
  })
}

test('Push jadwal: dua permintaan bersamaan hanya mengirim sekali melalui klaim aktif', async () => {
  const fixture = databaseFixture()
  let markStarted, releaseSend
  const started = new Promise(resolve => { markStarted = resolve })
  const sending = new Promise(resolve => { releaseSend = resolve })
  const push = pushFixture(async () => { markStarted(); await sending })
  const firstRequest = send(fixture, push, { userIds: ['QA-USER', 'QA-USER', null] })
  await started
  const secondResult = await send(fixture, push)
  assert.equal(secondResult.sent, 0)
  assert.equal(secondResult.duplicateCount, 1)
  assert.equal(secondResult.duplicate, true)
  releaseSend()
  const firstResult = await firstRequest
  assert.equal(firstResult.sent, 1)
  assert.equal(push.calls.length, 1)
  assert.equal(fixture.state.logs.size, 1)
  assert.equal([...fixture.state.logs.values()][0].delivery_status, 'sent')
})

test('Push jadwal: pengiriman gagal dicatat failed dan dapat diklaim ulang', async () => {
  const fixture = databaseFixture()
  let fail = true
  const push = pushFixture(async () => { if (fail) throw new Error('Simulasi koneksi push gagal') })
  const first = await send(fixture, push)
  assert.equal(first.sent, 0)
  assert.equal(first.failedRecipients, 1)
  assert.equal([...fixture.state.logs.values()][0].delivery_status, 'failed')
  fail = false
  const retry = await send(fixture, push)
  assert.equal(retry.sent, 1)
  assert.equal(retry.failedRecipients, 0)
  assert.equal(retry.duplicateCount, 0)
  assert.equal(fixture.state.claims.length, 2)
  assert.equal([...fixture.state.logs.values()][0].delivery_status, 'sent')
})

test('Push jadwal: pengguna tanpa subscription tidak dibuatkan log terkirim', async () => {
  const fixture = databaseFixture({ push_subscriptions: [] })
  const push = pushFixture()
  const result = await send(fixture, push)
  assert.equal(result.sent, 0)
  assert.equal(result.noSubscriptionCount, 1)
  assert.equal(fixture.state.claims.length, 0)
  assert.equal(fixture.state.logs.size, 0)
  assert.equal(push.calls.length, 0)
})

test('Push jadwal: akun Nonaktif tidak dikirim meski masih punya subscription', async () => {
  const fixture = databaseFixture({ users: [{ user_id: 'QA-USER', status: 'Nonaktif' }] })
  const push = pushFixture()
  const result = await send(fixture, push)
  assert.equal(result.targetCount, 0)
  assert.equal(result.sent, 0)
  assert.equal(fixture.state.claims.length, 0)
  assert.equal(fixture.state.logs.size, 0)
  assert.equal(push.calls.length, 0)
  assert.equal(fixture.state.queries.some(query => query.table === 'push_subscriptions'), false)
})

for (const table of ['users', 'push_subscriptions']) {
  test('Push jadwal: error query ' + table + ' ditolak sebelum push', async () => {
    const error = new Error('Simulasi query ' + table + ' gagal')
    const fixture = databaseFixture({ errors: { [table + ':select']: error } })
    const push = pushFixture()
    await assert.rejects(send(fixture, push), candidate => candidate === error)
    assert.equal(push.calls.length, 0)
    assert.equal(fixture.state.claims.length, 0)
  })
}

test('Push jadwal: error klaim tidak dilaporkan sebagai sukses', async () => {
  const error = new Error('Simulasi klaim gagal')
  const fixture = databaseFixture({ claimError: error })
  const push = pushFixture()
  await assert.rejects(send(fixture, push), candidate => candidate === error)
  assert.equal(push.calls.length, 0)
  assert.equal(fixture.state.logs.size, 0)
})

test('Push jadwal: error finalisasi ditolak walaupun push sudah diterima provider', async () => {
  const error = new Error('Simulasi finalisasi gagal')
  const fixture = databaseFixture({ errors: { 'service_roster_notification_logs:update': error } })
  const push = pushFixture()
  await assert.rejects(send(fixture, push), candidate => candidate === error)
  assert.equal(push.calls.length, 1)
  assert.equal([...fixture.state.logs.values()][0].delivery_status, 'pending')
})

test('Push jadwal: finalisasi tanpa baris klaim yang cocok tidak dilaporkan sukses', async () => {
  const fixture = databaseFixture({ finalizationMismatch: true })
  const push = pushFixture()
  await assert.rejects(send(fixture, push), /Klaim pengiriman notifikasi tidak lagi aktif/)
  assert.equal(push.calls.length, 1)
})

test('Push jadwal: payload membuka roster spesifik dan klaim mengikat jenis serta versi', async () => {
  const fixture = databaseFixture()
  const push = pushFixture()
  const result = await send(fixture, push, { kind: 'Dibatalkan' })
  assert.equal(result.sent, 1)
  assert.equal(push.calls[0].payload.url, '/jadwal-pelayanan?rosterId=' + encodeURIComponent(roster.roster_id))
  assert.equal(push.calls[0].payload.title, 'Jadwal Pelayanan Dibatalkan')
  assert.deepEqual(fixture.state.claims[0], {
    p_roster_id: roster.roster_id, p_user_id: 'QA-USER',
    p_kind: 'Dibatalkan', p_roster_version: roster.version,
  })
  assert.deepEqual(push.calls[0].subscription.keys, { p256dh: 'qa-public-key', auth: 'qa-auth' })
})

test('Push jadwal: subscription kedaluwarsa dibersihkan dan tidak ditandai terkirim', async () => {
  const fixture = databaseFixture()
  const push = pushFixture(async () => { throw Object.assign(new Error('Subscription hilang'), { statusCode: 410 }) })
  const result = await send(fixture, push)
  assert.equal(result.sent, 0)
  assert.equal(result.removed, 1)
  assert.equal(result.failedRecipients, 1)
  assert.equal(fixture.state.push_subscriptions.length, 0)
  assert.equal([...fixture.state.logs.values()][0].delivery_status, 'failed')
})
