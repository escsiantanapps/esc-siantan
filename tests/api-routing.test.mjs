import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { createECDH } from 'node:crypto'
import apiRouter from '../api/[endpoint].js'

const notificationEndpoints = ['notify-admin', 'notify-pks', 'notify-service-roster', 'send-push']
const cronEndpoints = ['cron-reminders', 'cron-service-roster-reminders', 'cron-birthdays', 'cron-backup']
const envKeys = [
  'SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET',
  'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT',
  'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY',
]
const vapid = createECDH('prime256v1')
vapid.generateKeys()
let requestNumber = 0

async function routingFixture(run, reply = null) {
  const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))
  const savedFetch = globalThis.fetch
  const savedError = console.error
  const savedWarn = console.warn
  const calls = []
  const unexpected = []
  Object.assign(process.env, {
    SUPABASE_URL: 'https://qa-api-routing.example.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'qa-service-role-key',
    CRON_SECRET: 'qa-cron-secret',
    VAPID_PUBLIC_KEY: vapid.getPublicKey().toString('base64url'),
    VAPID_PRIVATE_KEY: vapid.getPrivateKey().toString('base64url'),
    VAPID_SUBJECT: 'mailto:qa@example.invalid',
  })
  for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key]
  console.error = () => {}
  console.warn = () => {}
  globalThis.fetch = async input => {
    const url = new URL(typeof input === 'string' ? input : input.url)
    calls.push(url)
    const body = url.hostname === 'qa-api-routing.example.invalid' ? reply?.(url) : undefined
    if (body === undefined) {
      unexpected.push(url.toString())
      throw new Error('Tes router tidak boleh menghubungi backend atau mengirim push nyata')
    }
    if (body instanceof Response) return body
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
  }
  async function request(endpoint, options = {}) {
    const response = {
      statusCode: null, body: null, headers: {},
      status(value) { this.statusCode = value; return this },
      json(value) { this.body = value; return this },
      end() { return this },
      setHeader(key, value) { this.headers[key] = value },
    }
    const req = {
      url: '/api/' + endpoint, method: 'POST', query: {}, body: {},
      ...options,
      headers: { 'x-real-ip': 'qa-api-routing-' + ++requestNumber, ...options.headers },
    }
    await apiRouter(req, response)
    return response
  }
  try {
    await run({ request, calls })
    assert.deepEqual(unexpected, [], 'Tidak boleh ada akses jaringan di luar fixture')
  } finally {
    globalThis.fetch = savedFetch
    console.error = savedError
    console.warn = savedWarn
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) delete process.env[key]
      else process.env[key] = savedEnv[key]
    }
  }
}

test('Router API: inventaris fungsi Vercel tetap delapan dan di bawah batas Hobby', async () => {
  async function entrypoints(directory, prefix = '') {
    const result = []
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      // Detector Vercel mengabaikan segmen path privat, bukan hanya nama file.
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue
      const name = prefix + entry.name
      if (entry.isDirectory()) result.push(...await entrypoints(new URL(entry.name + '/', directory), name + '/'))
      else if (/\.(?:js|mjs|ts|tsx|py|go|rb|rs)$/.test(entry.name)
        && !entry.name.endsWith('.d.ts') && !entry.name.endsWith('_test.go')) result.push(name)
    }
    return result.sort()
  }
  const files = await entrypoints(new URL('../api/', import.meta.url))
  assert.deepEqual(files, [
    '[endpoint].js', 'audit-alert.js', 'check-phone.js', 'delete-user.js',
    'login-phone.js', 'request-reactivation.js', 'wa-reset-request.js', 'wa-reset-verify.js',
  ])
  assert.equal(files.length, 8)
  assert.ok(files.length <= 12)
})

test('Router API: metode seluruh delapan handler tetap dijaga tanpa akses backend', async () => {
  await routingFixture(async ({ request, calls }) => {
    for (const endpoint of [...notificationEndpoints, ...cronEndpoints]) {
      const response = await request(endpoint, { method: 'DELETE', headers: { authorization: 'Bearer qa-cron-secret' } })
      assert.equal(response.statusCode, 405, endpoint)
      assert.deepEqual(response.body, { error: 'Method not allowed' })
    }
    const preflight = await request('notify-service-roster', { method: 'OPTIONS' })
    assert.equal(preflight.statusCode, 204)
    assert.equal(calls.length, 0)
  })
})

test('Router API: alias ekstensi .js dan satu slash akhir tetap memakai guard yang sama', async () => {
  await routingFixture(async ({ request, calls }) => {
    for (const endpoint of [...notificationEndpoints, ...cronEndpoints]) {
      for (const suffix of ['.js', '/', '.js/']) {
        const response = await request(endpoint + suffix, { method: 'DELETE', headers: { authorization: 'Bearer qa-cron-secret' } })
        assert.equal(response.statusCode, 405, endpoint + suffix)
      }
    }
    assert.equal(calls.length, 0)
  })
})

test('Router API: seluruh delapan URL menolak pemanggil tanpa autentikasi', async () => {
  await routingFixture(async ({ request, calls }) => {
    for (const endpoint of [...notificationEndpoints, ...cronEndpoints]) {
      const response = await request(endpoint)
      assert.equal(response.statusCode, 401, endpoint)
      assert.deepEqual(response.body, { error: 'Unauthorized' })
    }
    assert.equal(calls.length, 0)
  })
})

test('Router API: cron tetap fail-closed saat CRON_SECRET kosong atau token salah', async () => {
  await routingFixture(async ({ request, calls }) => {
    for (const endpoint of cronEndpoints) {
      const rejected = await request(endpoint, { headers: { authorization: 'Bearer token-salah' } })
      assert.equal(rejected.statusCode, 401, endpoint)
      process.env.CRON_SECRET = ''
      const unconfigured = await request(endpoint)
      assert.equal(unconfigured.statusCode, 500, endpoint)
      assert.deepEqual(unconfigured.body, { error: 'CRON_SECRET belum diatur di server.' })
      process.env.CRON_SECRET = 'qa-cron-secret'
    }
    assert.equal(calls.length, 0)
  })
})

test('Router API: URL asing, duplikat segmen, dan folder privat tidak mengekspos handler', async () => {
  await routingFixture(async ({ request, calls }) => {
    for (const url of [
      '/api/tidak-ada', '/api/notify-admin/notify-admin', '/api//notify-admin',
      '/api/_handlers/cron-backup', '/api/_handlers/cron-backup.js',
      '/api/_lib/update-user-email', '/api/notify-admin//', '/api/notify-admin.js.js', '/api/%6eotify-admin',
    ]) {
      const response = await request('', {
        url, headers: { authorization: 'Bearer qa-cron-secret' },
        query: { endpoint: 'cron-backup' }, body: { endpoint: 'cron-backup' },
      })
      assert.equal(response.statusCode, 404, url)
      assert.deepEqual(response.body, { error: 'Endpoint tidak ditemukan.' })
    }
    assert.equal(calls.length, 0)
  })
})

test('Router API: query dan body tidak dapat memilih handler cron dari URL notifikasi', async () => {
  await routingFixture(async ({ request, calls }) => {
    const response = await request('notify-service-roster', {
      url: '/api/notify-service-roster?endpoint=cron-reminders&endpoint=cron-backup',
      headers: { authorization: 'Bearer qa-cron-secret' },
      query: { endpoint: ['cron-reminders', 'cron-backup'], slot: 'pagi' },
      body: { endpoint: 'cron-reminders', action: 'cold-response' },
    })
    assert.equal(response.statusCode, 401)
    assert.deepEqual(calls.map(url => url.pathname), ['/auth/v1/user'])
  }, url => url.pathname === '/auth/v1/user' ? new Response(JSON.stringify({ message: 'JWT tidak valid.' }), {
    status: 401, headers: { 'Content-Type': 'application/json' },
  }) : undefined)
})

test('Router API: slot pagi, siang, sore tetap diteruskan utuh ke cron SOP', async () => {
  await routingFixture(async ({ request, calls }) => {
    for (const slot of ['pagi', 'siang', 'sore']) {
      const response = await request('cron-reminders', {
        url: '/api/cron-reminders?slot=' + slot + '&endpoint=notify-service-roster',
        method: 'GET', headers: { authorization: 'Bearer qa-cron-secret' },
        query: { slot, endpoint: 'notify-service-roster' },
        body: { endpoint: 'cron-backup', slot: 'salah' },
      })
      assert.equal(response.statusCode, 200)
      assert.equal(response.body.slot, slot)
      assert.equal(response.body.due, 0)
      assert.equal(response.body.autoDeactivated, slot === 'pagi' ? 3 : 0)
    }
    assert.equal(calls.filter(url => url.pathname === '/rest/v1/rpc/deactivate_stale_users').length, 1)
    assert.equal(calls.filter(url => url.pathname === '/rest/v1/form_templates').length, 3)
  }, url => {
    if (url.pathname === '/rest/v1/rpc/deactivate_stale_users') return 3
    if (url.pathname === '/rest/v1/form_templates') return []
  })
})

test('Router API: cold-response pada backup tetap meminta JWT, bukan CRON_SECRET', async () => {
  await routingFixture(async ({ request, calls }) => {
    const options = {
      url: '/api/cron-backup?action=cold-response',
      query: { action: 'cold-response' }, body: { action: 'purge', archiveId: 'COLD-qa-archive-id' },
    }
    const noToken = await request('cron-backup', options)
    assert.equal(noToken.statusCode, 401)
    const cronToken = await request('cron-backup', {
      ...options, headers: { authorization: 'Bearer qa-cron-secret' },
    })
    assert.equal(cronToken.statusCode, 401)
    assert.deepEqual(calls.map(url => url.pathname), ['/auth/v1/user'])
  }, url => url.pathname === '/auth/v1/user' ? new Response(JSON.stringify({ message: 'JWT tidak valid.' }), {
    status: 401, headers: { 'Content-Type': 'application/json' },
  }) : undefined)
})

test('Router API: cold-response menolak JWT Volunteer sebelum mengakses arsip', async () => {
  await routingFixture(async ({ request, calls }) => {
    const response = await request('cron-backup', {
      url: '/api/cron-backup?action=cold-response', query: { action: 'cold-response' },
      headers: { authorization: 'Bearer qa-access-token' },
      body: { action: 'purge', archiveId: 'COLD-qa-archive-id' },
    })
    assert.equal(response.statusCode, 403)
    assert.deepEqual(calls.map(url => url.pathname), ['/auth/v1/user', '/rest/v1/users'])
  }, url => {
    if (url.pathname === '/auth/v1/user') return { id: 'QA-AUTH', aud: 'authenticated' }
    if (url.pathname === '/rest/v1/users') return [{ user_id: 'QA-VOLUNTEER', role: 'Volunteer' }]
  })
})

test('Router API: batas delapan notifikasi jadwal tidak berbagi kuota dengan notify-admin', async () => {
  await routingFixture(async ({ request, calls }) => {
    const ip = 'qa-api-routing-kuota-jadwal'
    for (let count = 1; count <= 8; count++) {
      const response = await request('notify-service-roster', { headers: { 'x-real-ip': ip } })
      assert.equal(response.statusCode, 401, 'Permintaan ' + count)
    }
    const limited = await request('notify-service-roster', { headers: { 'x-real-ip': ip } })
    assert.equal(limited.statusCode, 429)
    assert.ok(limited.headers['Retry-After'] > 0)
    for (let count = 0; count < 3; count++) {
      const independent = await request('notify-admin', {
        headers: { 'x-real-ip': ip, authorization: 'Bearer qa-access-token' },
        body: { type: 'tipe-qa-tidak-valid' },
      })
      assert.equal(independent.statusCode, 400)
      assert.deepEqual(independent.body, { error: 'Tipe tidak valid.' })
    }
    const otherIp = await request('notify-service-roster')
    assert.equal(otherIp.statusCode, 401)
    assert.equal(calls.length, 6)
  }, url => {
    if (url.pathname === '/auth/v1/user') return { id: 'QA-AUTH', aud: 'authenticated' }
    if (url.pathname === '/rest/v1/users') return [{ user_id: 'QA-CALLER', name: 'QA', status: 'Aktif' }]
  })
})
