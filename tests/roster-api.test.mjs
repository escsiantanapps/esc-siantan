import { test } from 'node:test'
import assert from 'node:assert/strict'
import notifyRoster from '../api/[endpoint].js'
import webpush from 'web-push'

const envKeys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']
let requestNumber = 0
const vapid = webpush.generateVAPIDKeys()

async function endpointFixture(options, action) {
  const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))
  const originalFetch = globalThis.fetch
  const originalError = console.error
  const calls = []
  const errors = []
  const unexpected = []
  const caller = {
    user_id: 'QA-CALLER', role: 'Volunteer', role_secondary: null, status: 'Aktif',
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
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
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
    if (url.pathname === '/rest/v1/users') {
      if (url.searchParams.has('auth_id')) {
        return json(url.searchParams.get('status') === 'eq.Aktif' && caller.status !== 'Aktif' ? [] : [caller])
      }
      return json(options.recipients || [])
    }
    if (url.pathname === '/rest/v1/service_rosters') return json([roster])
    if (url.pathname === '/rest/v1/service_schedule_months') return json(options.month === null ? [] : [{ month_id: 'QA-MONTH', status: 'Terbit', ...options.month }])
    if (url.pathname === '/rest/v1/service_schedule_parts') return json(options.parts || [])
    if (url.pathname === '/rest/v1/service_roster_slots') return json((options.slotUserIds || []).map(user_id => ({ user_id })))
    if (url.pathname === '/rest/v1/user_ministries') {
      if (options.membershipError) return json({ code: 'QA_MEMBERSHIP_FAILURE', message: 'Detail internal QA' }, 500)
      return json(options.member === false ? [] : [{ user_id: caller.user_id }])
    }
    if (url.pathname === '/rest/v1/push_subscriptions') return json([])
    if (url.pathname === '/rest/v1/admin_user_permissions') {
      if (options.permissionError) return json({
        code: 'QA_PERMISSION_FAILURE', message: 'Detail internal izin QA',
      }, 500)
      return json(options.permission === null ? [] : [{
        allowed_pages: options.allowedPages ?? [],
      }])
    }
    if (url.pathname === '/rest/v1/ministry_schedule_managers') {
      if (options.grantError === true || (options.grantError === 'missingHead'
        && url.searchParams.get('select')?.includes('head_user_id'))) {
        return json({ code: '42703', message: 'Detail internal schema QA' }, 500)
      }
      const grant = options.grant ? {
        user_id: caller.user_id, manager_role: 'Ministry Head', is_active: true,
        ministries: { head_user_id: caller.user_id },
        ...(typeof options.grant === 'object' ? options.grant : {}),
      } : null
      if (grant && !url.searchParams.get('select')?.includes('ministries')) delete grant.ministries
      return json(grant && (url.searchParams.get('is_active') !== 'eq.true' || grant.is_active) ? [grant] : [])
    }
    unexpected.push(url.toString())
    throw new Error('Pengiriman push tidak boleh dimulai dalam tes guard')
  }
  const request = {
    url: '/api/notify-service-roster',
    method: options.method || 'POST',
    headers: {
      authorization: 'Bearer qa-access-token',
      'x-real-ip': 'qa-roster-request-' + ++requestNumber,
    },
    body: options.body || { rosterId: roster.roster_id, kind: options.kind || 'Manual' },
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
    assert.equal(grantQuery.searchParams.get('select'), 'user_id,manager_role,ministries!ministry_id(head_user_id)')
  })
})

test('API jadwal: grant MH cocok dengan sumber Ministry menerima pengingat roster terbit', async () => {
  await endpointFixture({ grant: true }, ({ response, calls }) => {
    assert.equal(response.statusCode, 200)
    assert.equal(response.body.ok, true)
    assert.equal(queried(calls, 'service_roster_slots'), true)
  })
})

test('API jadwal: MH tanpa keanggotaan Ministry tidak dapat mengirim pengingat', async () => {
  await endpointFixture({ grant: true, member: false }, ({ response, calls }) => {
    assert.equal(response.statusCode, 403)
    assert.equal(queried(calls, 'user_ministries'), true)
    assert.equal(queried(calls, 'service_roster_slots'), false)
  })
})

test('API jadwal: kegagalan membaca keanggotaan menutup akses MH', async () => {
  await endpointFixture({ grant: true, membershipError: true }, ({ response, calls }) => {
    assert.equal(response.statusCode, 500)
    assert.deepEqual(response.body, { error: 'Terjadi kesalahan internal.' })
    assert.equal(queried(calls, 'service_roster_slots'), false)
  })
})

test('API jadwal: sebelum migrasi sumber MH, Wakil tetap berakses dan MH tertutup', async () => {
  await endpointFixture({ grant: { manager_role: 'Wakil' }, grantError: 'missingHead' }, ({ response, calls }) => {
    assert.equal(response.statusCode, 200)
    assert.equal(calls.filter(url => url.pathname === '/rest/v1/ministry_schedule_managers').length, 2)
  })
  await endpointFixture({ grant: true, grantError: 'missingHead' }, ({ response, calls }) => {
    assert.equal(response.statusCode, 403)
    assert.equal(queried(calls, 'user_ministries'), false)
  })
})

test('API jadwal: grant MH lama tidak dapat dipakai ketika kepala sudah berbeda atau belum ditetapkan', async () => {
  for (const ministries of [{ head_user_id: 'QA-NEW-HEAD' }, { head_user_id: null }, null, {}]) {
    await endpointFixture({ grant: { ministries } }, ({ response, calls }) => {
      assert.equal(response.statusCode, 403)
      assert.equal(queried(calls, 'service_roster_slots'), false)
    })
  }
})

test('API jadwal: Wakil bergrant aktif tetap mendapat akses tanpa menjadi MH organisasi', async () => {
  for (const role of ['Jemaat','Volunteer','PKS']) for (const head of ['QA-OTHER-HEAD', null]) {
    await endpointFixture({ caller: { role }, grant: { manager_role: 'Wakil', ministries: { head_user_id: head } } }, ({ response, calls }) => {
      assert.equal(response.statusCode, 200)
      assert.equal(queried(calls, 'service_roster_slots'), true)
    })
  }
})

test('API jadwal: jabatan MH hanya berlaku bagi role utama Volunteer, bukan Jemaat/PKS', async () => {
  for (const role of ['Jemaat','PKS']) {
    await endpointFixture({ caller: { role }, grant: true }, ({ response, calls }) => {
      assert.equal(response.statusCode, 403)
      assert.equal(queried(calls, 'service_roster_slots'), false)
    })
  }
})

test('API jadwal: kepala organisasi tanpa approval atau grant tidak aktif tetap ditolak', async () => {
  for (const grant of [false, { is_active: false }, { manager_role: 'Tidak Sah' }]) {
    await endpointFixture({ grant }, ({ response, calls }) => {
      assert.equal(response.statusCode, 403)
      assert.equal(queried(calls, 'service_roster_slots'), false)
    })
  }
})

test('API jadwal: pengguna nonaktif ditolak sebelum membaca grant atau hak Admin', async () => {
  for (const role of ['Volunteer', 'Admin', 'Super Admin']) {
    await endpointFixture({ caller: { role, status: 'Nonaktif' }, grant: true }, ({ response, calls }) => {
      assert.equal(response.statusCode, 403)
      const userQuery = calls.find(url => url.pathname === '/rest/v1/users')
      assert.equal(userQuery.searchParams.get('status'), 'eq.Aktif')
      assert.equal(queried(calls, 'ministry_schedule_managers'), false)
      assert.equal(queried(calls, 'admin_user_permissions'), false)
    })
  }
})

test('API jadwal: kegagalan membaca sumber MH menutup akses tanpa membocorkan schema', async () => {
  await endpointFixture({ grant: true, grantError: true }, ({ response, calls, errors }) => {
    assert.equal(response.statusCode, 500)
    assert.deepEqual(response.body, { error: 'Terjadi kesalahan internal.' })
    assert.equal(queried(calls, 'service_roster_slots'), false)
    assert.equal(errors.length, 1)
  })
})

test('API jadwal: metode selain POST ditolak sebelum menyentuh Supabase', async () => {
  await endpointFixture({ method: 'GET' }, ({ response, calls }) => {
    assert.equal(response.statusCode, 405)
    assert.equal(calls.length, 0)
  })
})

test('API jadwal bulanan: MH bergrant tidak memperoleh akses notifikasi satu bulan', async () => {
  await endpointFixture({ grant: true, body: { monthId: 'QA-MONTH', kind: 'Terbit' } }, ({ response, calls }) => {
    assert.equal(response.statusCode, 403)
    assert.equal(queried(calls, 'ministry_schedule_managers'), false)
    assert.equal(queried(calls, 'service_schedule_months'), false)
  })
})

test('API jadwal bulanan: Admin dibatasi tetap ditolak meskipun mempunyai grant', async () => {
  await endpointFixture({ caller: { role: 'Admin' }, allowedPages: [], grant: true,
    body: { monthId: 'QA-MONTH', kind: 'Manual' } }, ({ response, calls }) => {
    assert.equal(response.statusCode, 403)
    assert.equal(queried(calls, 'service_schedule_months'), false)
  })
})

test('API jadwal bulanan: Draft tidak dapat dikirim sebagai publikasi atau pengingat', async () => {
  for (const kind of ['Terbit', 'Manual']) await endpointFixture({ caller: { role: 'Super Admin' },
    month: { status: 'Draft' }, body: { monthId: 'QA-MONTH', kind } }, ({ response, calls }) => {
    assert.equal(response.statusCode, 409)
    assert.equal(queried(calls, 'service_schedule_parts'), false)
  })
})

test('API jadwal bulanan: offset palsu dan dua identitas sekaligus ditolak', async () => {
  for (const body of [{ monthId: 'QA-MONTH', kind: 'Terbit', offset: -1 },
    { monthId: 'QA-MONTH', kind: 'Terbit', offset: '24' },
    { monthId: 'QA-MONTH', kind: 'Terbit', offset: 10_001 },
    { monthId: 'QA-MONTH', rosterId: 'QA-ROSTER', kind: 'Terbit' }]) {
    await endpointFixture({ caller: { role: 'Super Admin' }, body }, ({ response, calls }) => {
      assert.equal(response.statusCode, 400)
      assert.equal(queried(calls, 'service_schedule_parts'), false)
    })
  }
})

const monthlyParts = (length, status = 'Terbit') => Array.from({ length }, (_, index) => ({
  roster_id: `QA-MONTH-ROSTER-${index}`, service_rosters: { roster_id: `QA-MONTH-ROSTER-${index}`,
    status, version: 1, title: 'Ibadah QA', service_date: '2026-10-04', start_time: '08:00' },
  service_schedule_occurrences: { month_id: 'QA-MONTH' },
}))

test('API jadwal bulanan: satu permintaan memproses 24 roster, bukan 24 kuota endpoint', async () => {
  await endpointFixture({ caller: { role: 'Admin' }, allowedPages: ['/admin/jadwal-pelayanan'],
    parts: monthlyParts(25), slotUserIds: ['QA-USER'], recipients: [{ user_id: 'QA-USER' }],
    body: { monthId: 'QA-MONTH', kind: 'Terbit', offset: 0 } }, ({ response, calls }) => {
    assert.equal(response.statusCode, 200)
    assert.equal(response.body.rosterCount, 24)
    assert.equal(response.body.nextOffset, 24)
    assert.equal(response.body.noSubscriptionCount, 24)
    const partsQuery = calls.find(url => url.pathname === '/rest/v1/service_schedule_parts')
    assert.equal(partsQuery.searchParams.get('service_schedule_occurrences.month_id'), 'eq.QA-MONTH')
    assert.equal(partsQuery.searchParams.get('limit'), '25')
    const slotsQueries = calls.filter(url => url.pathname === '/rest/v1/service_roster_slots')
    assert.equal(slotsQueries.length, 24)
    assert.equal(slotsQueries.some(url => url.searchParams.get('roster_id') === 'eq.QA-MONTH-ROSTER-24'), false)
  })
})

test('API jadwal bulanan: halaman akhir mengakhiri antrean dan pembatalan memakai status final', async () => {
  await endpointFixture({ caller: { role: 'Super Admin' }, month: { status: 'Dibatalkan' },
    parts: monthlyParts(3, 'Dibatalkan'), body: { monthId: 'QA-MONTH', kind: 'Dibatalkan', offset: 24 } }, ({ response, calls }) => {
    assert.equal(response.statusCode, 200)
    assert.equal(response.body.rosterCount, 3)
    assert.equal(response.body.nextOffset, null)
    const query = calls.find(url => url.pathname === '/rest/v1/service_schedule_parts')
    assert.equal(query.searchParams.get('offset'), '24')
  })
})

test('API jadwal bulanan: roster belum final menahan seluruh halaman sebelum pengiriman', async () => {
  const parts = monthlyParts(2)
  parts[1].service_rosters.status = 'Draft'
  await endpointFixture({ caller: { role: 'Super Admin' }, parts,
    body: { monthId: 'QA-MONTH', kind: 'Terbit' } }, ({ response, calls }) => {
    assert.equal(response.statusCode, 409)
    assert.equal(queried(calls, 'service_roster_slots'), false)
  })
})
