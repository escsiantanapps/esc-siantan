import { test } from 'node:test'
import assert from 'node:assert/strict'
import notifyRoster from '../api/notify-service-roster.js'

const envKeys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']
let requestNumber = 0

async function endpointFixture(options, action) {
  const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))
  const originalFetch = globalThis.fetch
  const originalError = console.error
  const calls = []
  const errors = []
  const unexpected = []
  const caller = {
    user_id: 'QA-CALLER', role: 'Volunteer', role_secondary: null,
    ...options.caller,
  }
  const roster = {
    roster_id: 'QA-ROSTER', ministry_id: 'QA-MINISTRY',
    status: 'Terbit', version: 1,
    ...options.roster,
  }
  Object.assign(process.env, {
    SUPABASE_URL: 'https://qa-roster.example.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'qa-service-key',
    VAPID_PUBLIC_KEY: 'qa-vapid-public',
    VAPID_PRIVATE_KEY: 'qa-vapid-private',
    VAPID_SUBJECT: 'mailto:qa@example.invalid',
  })
  console.error = (...args) => { errors.push(args) }
  globalThis.fetch = async input => {
    const url = new URL(typeof input === 'string' ? input : input.url)
    calls.push(url)
    const json = (body, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json' },
    })
    if (url.hostname !== 'qa-roster.example.invalid') {
      unexpected.push(url.toString())
      throw new Error('Tidak boleh menghubungi backend nyata')
    }
    if (url.pathname === '/auth/v1/user') return json({ id: 'QA-AUTH-ID', aud: 'authenticated' })
    if (url.pathname === '/rest/v1/users') return json([caller])
    if (url.pathname === '/rest/v1/service_rosters') return json([roster])
    if (url.pathname === '/rest/v1/admin_user_permissions') {
      if (options.permissionError) return json({
        code: 'QA_PERMISSION_FAILURE', message: 'Detail internal izin QA',
      }, 500)
      return json(options.permission === null ? [] : [{
        allowed_pages: options.allowedPages ?? [],
      }])
    }
    if (url.pathname === '/rest/v1/ministry_schedule_managers') {
      return json(options.grant ? [{ user_id: caller.user_id }] : [])
    }
    unexpected.push(url.toString())
    throw new Error('Pengiriman push tidak boleh dimulai dalam tes guard')
  }
  const request = {
    method: options.method || 'POST',
    headers: {
      authorization: 'Bearer qa-access-token',
      'x-real-ip': 'qa-roster-request-' + ++requestNumber,
    },
    body: { rosterId: roster.roster_id, kind: options.kind || 'Manual' },
  }
  const response = {
    statusCode: null, body: null,
    status(value) { this.statusCode = value; return this },
    json(value) { this.body = value; return this },
    end() { return this },
    setHeader() {},
  }
  try {
    await notifyRoster(request, response)
    await action({ response, calls, errors })
    assert.deepEqual(unexpected, [], 'Tidak boleh mengirim push atau menghubungi backend nyata')
  } finally {
    globalThis.fetch = originalFetch
    console.error = originalError
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) delete process.env[key]
      else process.env[key] = savedEnv[key]
    }
  }
}

const queried = (calls, table) => calls.some(url => url.pathname === '/rest/v1/' + table)

test('API jadwal: Admin tanpa hak halaman tidak dapat memakai grant Ministry Head', async () => {
  await endpointFixture({ caller: { role: 'Admin' }, allowedPages: [], grant: true }, ({ response, calls }) => {
    assert.equal(response.statusCode, 403)
    assert.equal(queried(calls, 'admin_user_permissions'), true)
    assert.equal(queried(calls, 'ministry_schedule_managers'), false)
  })
})

test('API jadwal: kegagalan membaca hak Admin menutup akses dan tidak membocorkan error internal', async () => {
  await endpointFixture({ caller: { role: 'Admin' }, permissionError: true, grant: true }, ({ response, calls, errors }) => {
    assert.equal(response.statusCode, 500)
    assert.deepEqual(response.body, { error: 'Terjadi kesalahan internal.' })
    assert.equal(queried(calls, 'ministry_schedule_managers'), false)
    assert.equal(errors.length, 1)
  })
})

test('API jadwal: Gembala tidak dapat memakai grant pengelola', async () => {
  await endpointFixture({ caller: { role: 'Gembala' }, grant: true }, ({ response, calls }) => {
    assert.equal(response.statusCode, 403)
    assert.equal(queried(calls, 'ministry_schedule_managers'), false)
  })
})

test('API jadwal: Volunteer dengan peran kedua Admin tidak dapat memakai grant pengelola', async () => {
  await endpointFixture({ caller: { role_secondary: 'Admin' }, grant: true }, ({ response, calls }) => {
    assert.equal(response.statusCode, 403)
    assert.equal(queried(calls, 'ministry_schedule_managers'), false)
  })
})

test('API jadwal: pengingat Manual pada Draft ditolak meskipun pemanggil Super Admin', async () => {
  await endpointFixture({ caller: { role: 'Super Admin' }, roster: { status: 'Draft' } }, ({ response }) => {
    assert.equal(response.statusCode, 409)
    assert.deepEqual(response.body, { error: 'Jadwal belum diterbitkan.' })
  })
})

test('API jadwal: pengelola bergrant tetap melewati validasi status Draft', async () => {
  await endpointFixture({ grant: true, roster: { status: 'Draft' } }, ({ response, calls }) => {
    assert.equal(response.statusCode, 409)
    const grantQuery = calls.find(url => url.pathname === '/rest/v1/ministry_schedule_managers')
    assert.equal(grantQuery.searchParams.get('ministry_id'), 'eq.QA-MINISTRY')
    assert.equal(grantQuery.searchParams.get('user_id'), 'eq.QA-CALLER')
    assert.equal(grantQuery.searchParams.get('is_active'), 'eq.true')
  })
})

test('API jadwal: metode selain POST ditolak sebelum menyentuh Supabase', async () => {
  await endpointFixture({ method: 'GET' }, ({ response, calls }) => {
    assert.equal(response.statusCode, 405)
    assert.equal(calls.length, 0)
  })
})
