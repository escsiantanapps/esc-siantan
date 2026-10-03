import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notifyScheduleMonth } from '../src/lib/serviceScheduleNotifications.js'

const json = value => new Response(JSON.stringify(value), { status: 200 })

test('Notifikasi bulanan: 56 roster memakai tiga halaman dengan token sesi terbaru', async () => {
  const calls = []
  let sessions = 0
  const result = await notifyScheduleMonth({ monthId: 'QA-MONTH', kind: 'Terbit',
    getAccessToken: async () => `qa-token-${++sessions}`, request: async (url, options) => {
      const body = JSON.parse(options.body)
      calls.push({ url, body, authorization: options.headers.Authorization })
      return json({ rosterCount: body.offset === 48 ? 8 : 24, sent: 2,
        nextOffset: body.offset === 48 ? null : body.offset + 24 })
    } })
  assert.deepEqual(calls.map(call => call.body.offset), [0, 24, 48])
  assert.deepEqual(calls.map(call => call.authorization), ['Bearer qa-token-1', 'Bearer qa-token-2', 'Bearer qa-token-3'])
  assert.equal(calls.every(call => call.url === '/api/notify-service-roster' && call.body.monthId === 'QA-MONTH' && !call.body.rosterId), true)
  assert.equal(result.rosterCount, 56)
  assert.equal(result.sent, 6)
})

test('Notifikasi bulanan: 429 menunggu Retry-After dan mengulang halaman yang sama', async () => {
  let attempts = 0
  const waits = []
  const offsets = []
  await notifyScheduleMonth({ monthId: 'QA-MONTH', kind: 'Manual', getAccessToken: async () => 'qa-token',
    wait: async milliseconds => { waits.push(milliseconds) }, request: async (url, options) => {
      assert.equal(url, '/api/notify-service-roster')
      offsets.push(JSON.parse(options.body).offset)
      return ++attempts === 1 ? new Response('{}', { status: 429, headers: { 'Retry-After': '7' } })
        : json({ nextOffset: null })
    } })
  assert.deepEqual(waits, [7000])
  assert.deepEqual(offsets, [0, 0])
})

test('Notifikasi bulanan: pembatasan berulang berhenti setelah tiga jeda', async () => {
  let attempts = 0
  let waits = 0
  await assert.rejects(() => notifyScheduleMonth({ monthId: 'QA-MONTH', kind: 'Terbit', getAccessToken: async () => 'qa-token',
    wait: async () => { waits++ }, request: async () => { attempts++; return new Response('{}', { status: 429 }) } }), /Notifikasi gagal/)
  assert.equal(attempts, 4)
  assert.equal(waits, 3)
})

test('Notifikasi bulanan: offset tidak maju dan sesi kosong tidak membuka request berikutnya', async () => {
  await assert.rejects(() => notifyScheduleMonth({ monthId: 'QA-MONTH', kind: 'Terbit', getAccessToken: async () => 'qa-token',
    request: async () => json({ nextOffset: 0 }) }), /Urutan pengiriman/)
  await assert.rejects(() => notifyScheduleMonth({ monthId: 'QA-MONTH', kind: 'Terbit', getAccessToken: async () => null,
    request: async () => { assert.fail('Sesi kosong tidak boleh mengirim request') } }), /Sesi login/)
})

test('Notifikasi bulanan: duplikat klaim tetap dibedakan dari perangkat yang tidak berlangganan', async () => {
  const result = await notifyScheduleMonth({ monthId: 'QA-MONTH', kind: 'Manual', getAccessToken: async () => 'qa-token',
    request: async () => json({ targetCount: 4, duplicateCount: 3, noSubscriptionCount: 1, nextOffset: null }) })
  assert.equal(result.duplicate, true)
})
