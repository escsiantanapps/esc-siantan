import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { startHarness, fixture } from './harness.mjs'
import { countLeaveCredits, getEvaluationResult } from '../src/lib/evaluationLeave.js'
import { displayEmail, isSyntheticLoginEmail } from '../src/lib/utils.js'
import { isAutoDeactivated, isReactivationPending } from '../src/lib/accountActivity.js'

let harness
before(async () => { harness = await startHarness() })
after(async () => { await harness?.close() })

async function scenario(options, action) {
  const f = await fixture(harness, options)
  try {
    await action(f)
    assert.deepEqual(f.errors, [], 'Tidak boleh ada error JavaScript')
    assert.deepEqual(f.unexpected, [], 'Tidak boleh menghubungi backend selain fixture')
  } finally { await f.close() }
}

test('Evaluasi: setiap izin disetujui dihitung satu dan hanya untuk form terkait', () => {
  const common = {
    startDate: '2026-09-01', endDate: '2026-09-21',
    formId: 'FORM-A',
  }

  assert.equal(countLeaveCredits({
    ...common,
    leaves: [{ form_id: 'FORM-A', start_date: '2026-09-05', end_date: '2026-09-07' }],
  }), 1)

  assert.equal(countLeaveCredits({
    ...common,
    leaves: [
      { form_id: 'FORM-A', start_date: '2026-09-01', end_date: '2026-09-02' },
      { form_id: 'FORM-A', start_date: '2026-09-10', end_date: '2026-09-12' },
    ],
  }), 2)

  assert.equal(countLeaveCredits({
    ...common,
    leaves: [{ form_id: 'FORM-B', start_date: '2026-09-01', end_date: '2026-09-21' }],
  }), 0)

  assert.equal(countLeaveCredits({
    ...common,
    leaves: [{ form_id: null, start_date: '2026-09-01', end_date: '2026-09-21' }],
  }), 1)

  assert.equal(countLeaveCredits({
    ...common,
    leaves: [{ form_id: 'FORM-A', start_date: '2026-08-20', end_date: '2026-08-21' }],
  }), 0)

  assert.deepEqual(getEvaluationResult({ filled: 2, leaveCount: 1, target: 15 }), {
    counted: 3, minLulus: 12, status: 'PROSES',
  })
  assert.deepEqual(getEvaluationResult({ filled: 0, leaveCount: 1, target: 1 }), {
    counted: 1, minLulus: 1, status: 'TERPENUHI',
  })
})

test('Aktivasi ulang hanya berlaku untuk Nonaktif otomatis dan tetap menunggu Admin', () => {
  assert.equal(isAutoDeactivated({
    status: 'Nonaktif',
    inactivity_deactivated_at: '2026-09-30T01:00:00Z',
  }), true)
  assert.equal(isAutoDeactivated({
    status: 'Nonaktif',
    inactivity_deactivated_at: null,
  }), false)
  assert.equal(isReactivationPending({
    status: 'Menunggu Persetujuan',
    reactivation_requested_at: '2026-09-30T02:00:00Z',
  }), true)
  assert.equal(isReactivationPending({
    status: 'Aktif',
    reactivation_requested_at: '2026-09-30T02:00:00Z',
  }), false)
})

test('Email login internal tidak ditampilkan sebagai alamat kontak', () => {
  assert.equal(isSyntheticLoginEmail('85123507610@wa.esc-siantan.app'), true)
  assert.equal(isSyntheticLoginEmail('jemaat@example.com'), false)
  assert.equal(displayEmail('85123507610@wa.esc-siantan.app'), '-')
  assert.equal(displayEmail('jemaat@example.com'), 'jemaat@example.com')
})

test('Ministry baru disimpan sebelum MH dapat dipilih dari anggotanya', async () => {
  await scenario({}, async f => {
    await f.goto('/admin/ministry')
    await f.page.getByRole('button', { name: 'Tambah Ministry', exact: true }).click()
    const head = f.page.getByLabel('Ministry Head (MH)', { exact: true })
    assert.equal(await head.isDisabled(), true)
    await f.page.getByText('Simpan Ministry, tambahkan anggota, lalu pilih MH dari Volunteer atau Admin aktif di Ministry ini.', { exact: true }).waitFor()
    await f.page.getByLabel('Nama Ministry').fill('Ministry QA Baru')
    const saving = f.page.waitForResponse(response => response.url().includes('/rest/v1/ministries') && response.request().method() === 'POST')
    await f.page.getByRole('button', { name: 'Tambah', exact: true }).click()
    await saving
    const creation = f.requests.find(request => request.path.endsWith('/ministries') && request.method === 'POST')
    assert.equal(creation.body.name, 'Ministry QA Baru')
    assert.equal(Object.hasOwn(creation.body, 'head_user_id'), false)
    assert.equal(creation.body.department_id, null)
    assert.equal(f.requests.filter(request => request.path.endsWith('/user_ministries') && request.method === 'GET').length, 0)
    const ministryRead = f.requests.find(request => request.path.endsWith('/ministries') && request.method === 'GET')
    assert.equal(new URLSearchParams(ministryRead.search).get('select'), '*,head:users!head_user_id(user_id,name,photo_url,role,role_secondary,status)')
    assert.equal(f.requests.filter(request => request.path.endsWith('/ministry_schedule_managers') && request.method !== 'GET').length, 0)
  })
})

test('Volunteer yang baru ditambahkan ke Ministry dapat ditetapkan sebagai MH', async () => {
  const person = { user_id: 'QA-HEAD-NEW', name: 'Volunteer Baru', role: 'Volunteer', status: 'Aktif', photo_url: null }
  await scenario({
    ministries: [{ ministry_id: 'QA-MIN', name: 'Ministry QA', description: '', department_id: null, organization_order: 1, head_user_id: null, head: null }],
    members: [person],
    ministryMembers: [],
  }, async f => {
    await f.goto('/admin/ministry')
    await f.page.getByRole('button', { name: 'Edit ministry Ministry QA', exact: true }).click()
    await f.page.getByText('Tambahkan anggota Volunteer atau Admin aktif sebelum menetapkan MH.', { exact: true }).waitFor()
    await f.page.getByRole('button', { name: 'Batal', exact: true }).last().click()
    await f.page.getByRole('button', { name: 'Lihat anggota ministry Ministry QA', exact: true }).click()
    await f.page.getByRole('button', { name: 'Tambah anggota', exact: true }).click()
    const added = f.page.waitForResponse(response => response.url().includes('/rest/v1/user_ministries')
      && response.request().method() === 'POST')
    await f.page.getByRole('button', { name: 'Tambahkan Volunteer Baru ke ministry', exact: true }).click()
    await added
    await f.page.getByRole('button', { name: 'Tutup daftar anggota', exact: true }).click()
    await f.page.getByRole('button', { name: 'Edit ministry Ministry QA', exact: true }).click()
    const select = f.page.getByLabel('Ministry Head (MH)', { exact: true })
    await select.locator('option[value="QA-HEAD-NEW"]').waitFor({ state: 'attached' })
    await select.selectOption('QA-HEAD-NEW')
    const saved = f.page.waitForResponse(response => response.url().includes('/rest/v1/ministries')
      && response.request().method() === 'PATCH')
    await f.page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await saved
    assert.equal(f.requests.find(request => request.path.endsWith('/ministries')
      && request.method === 'PATCH').body.head_user_id, person.user_id)
  })
})

test('Admin aktif yang melayani di Ministry dapat menjadi MH tanpa menerima akses baru', async () => {
  const previous = { user_id: 'QA-OLD-HEAD', name: 'MH Volunteer Lama', role: 'Volunteer', status: 'Aktif' }
  const admin = { user_id: 'QA-ADMIN-HEAD', name: 'Admin Pelayan', role: 'Admin', role_secondary: 'Volunteer', status: 'Aktif' }
  await scenario({
    ministries: [{ ministry_id: 'QA-MIN', name: 'Ministry QA', description: '', department_id: null, organization_order: 1, head_user_id: previous.user_id, head: previous }],
    members: [previous, admin,
      { user_id: 'QA-OUTSIDE-ADMIN', name: 'Admin Ministry Lain', role: 'Admin', status: 'Aktif' },
      { user_id: 'QA-INACTIVE-ADMIN', name: 'Admin Nonaktif', role: 'Admin', status: 'Nonaktif' },
      { user_id: 'QA-SUPER-ADMIN', name: 'Super Admin Anggota', role: 'Super Admin', status: 'Aktif' }],
    ministryMembers: [
      { ministry_id: 'QA-MIN', user_id: previous.user_id },
      { ministry_id: 'QA-MIN', user_id: admin.user_id },
      { ministry_id: 'QA-MIN', user_id: 'QA-INACTIVE-ADMIN' },
      { ministry_id: 'QA-MIN', user_id: 'QA-SUPER-ADMIN' },
    ],
  }, async f => {
    await f.goto('/admin/ministry')
    await f.page.getByRole('button', { name: 'Edit ministry Ministry QA', exact: true }).click()
    const select = f.page.getByLabel('Ministry Head (MH)', { exact: true })
    await select.locator('option[value="QA-ADMIN-HEAD"]').waitFor({ state: 'attached' })
    assert.equal(await select.locator('option[value="QA-ADMIN-HEAD"]').textContent(), 'Admin Pelayan (Admin)')
    assert.equal(await select.locator('option[value="QA-OUTSIDE-ADMIN"],option[value="QA-INACTIVE-ADMIN"],option[value="QA-SUPER-ADMIN"]').count(), 0)
    await select.selectOption(admin.user_id)
    await f.page.getByText('Jabatan MH tidak menambah hak akses. Akses jadwal akun ini mengikuti Hak Akses Admin.', { exact: true }).waitFor()
    await f.page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await f.page.getByText('Jabatan MH MH Volunteer Lama akan diganti. Persetujuan akses jadwal MH lama dinonaktifkan bila ada; Hak Akses Admin tidak berubah.', { exact: true }).waitFor()
    const saved = f.page.waitForResponse(response => response.url().includes('/rest/v1/ministries') && response.request().method() === 'PATCH')
    await f.page.getByRole('button', { name: 'Ganti MH', exact: true }).click()
    await saved
    assert.equal(f.requests.find(request => request.path.endsWith('/ministries') && request.method === 'PATCH').body.head_user_id, admin.user_id)
    assert.equal(f.requests.filter(request => request.path.endsWith('/ministry_schedule_managers') && request.method !== 'GET').length, 0)
    assert.equal(f.requests.filter(request => request.path.endsWith('/admin_user_permissions') && request.method !== 'GET').length, 0)
    assert.equal(f.requests.filter(request => request.path.endsWith('/users') && ['POST', 'PATCH'].includes(request.method)
      && (request.body?.role !== undefined || request.body?.role_secondary !== undefined)).length, 0)
  })
})

test('Ministry: mengganti atau mengosongkan MH meminta konfirmasi tanpa otomatis memberi akses jadwal', async () => {
  const head = { user_id: 'QA-HEAD-A', name: 'MH Sebelumnya', role: 'Volunteer', status: 'Aktif', photo_url: null }
  const replacement = { user_id: 'QA-HEAD-B', name: 'MH Pengganti', role: 'Volunteer', status: 'Aktif', photo_url: null }
  const outsider = { user_id: 'QA-OUTSIDE', name: 'Volunteer Ministry Lain', role: 'Volunteer', status: 'Aktif', photo_url: null }
  const member = user => ({ ministry_id: 'QA-MIN', user_id: user.user_id })
  await scenario({
    ministries: [{ ministry_id: 'QA-MIN', name: 'Ministry QA', description: '', department_id: null, organization_order: 1, head_user_id: head.user_id, head }],
    members: [head, replacement, outsider,
      { user_id: 'QA-JEMAAT', name: 'Jemaat Anggota', role: 'Jemaat', status: 'Aktif' },
      { user_id: 'QA-INACTIVE', name: 'Volunteer Nonaktif', role: 'Volunteer', status: 'Nonaktif' },
      { user_id: 'QA-SUPER', name: 'Super Admin Anggota', role: 'Super Admin', status: 'Aktif' },
      { user_id: 'QA-ADMIN-SECONDARY', name: 'Volunteer Admin Sekunder', role: 'Volunteer', role_secondary: 'Admin', status: 'Aktif' }],
    ministryMembers: [member(head), member(replacement), member({ user_id: 'QA-JEMAAT' }),
      member({ user_id: 'QA-INACTIVE' }), member({ user_id: 'QA-SUPER' }), member({ user_id: 'QA-ADMIN-SECONDARY' })],
  }, async f => {
    await f.goto('/admin/ministry')
    await f.page.getByText('Ministry Head (MH): MH Sebelumnya', { exact: true }).waitFor()
    await f.page.getByRole('button', { name: 'Edit ministry Ministry QA', exact: true }).click()
    const headSelect = f.page.getByLabel('Ministry Head (MH)', { exact: true })
    await headSelect.locator('option[value="QA-HEAD-B"]').waitFor({ state: 'attached' })
    assert.equal(await headSelect.locator('option[value="QA-OUTSIDE"],option[value="QA-JEMAAT"],option[value="QA-INACTIVE"],option[value="QA-SUPER"],option[value="QA-ADMIN-SECONDARY"]').count(), 0)
    const links = f.requests.find(request => request.path.endsWith('/user_ministries') && request.method === 'GET')
    assert.equal(new URLSearchParams(links.search).get('ministry_id'), 'eq.QA-MIN')
    const candidates = f.requests.find(request => request.path.endsWith('/users') && new URLSearchParams(request.search).get('role') === 'in.(Volunteer,Admin)')
    assert.ok(candidates, 'Calon MH harus difilter menjadi Volunteer atau Admin aktif dalam daftar anggota Ministry')
    assert.equal(new URLSearchParams(candidates.search).get('status'), 'eq.Aktif')
    assert.ok(new URLSearchParams(candidates.search).get('user_id')?.startsWith('in.('))
    await headSelect.selectOption('QA-HEAD-B')
    await f.page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await f.page.getByRole('heading', { name: 'Ganti Ministry Head?', exact: true }).waitFor()
    await f.page.getByText('Akses jadwal MH MH Sebelumnya akan dinonaktifkan. MH baru tetap memerlukan persetujuan akses jadwal.', { exact: true }).waitFor()
    assert.equal(f.requests.filter(request => request.path.endsWith('/ministries') && request.method === 'PATCH').length, 0)
    await f.page.getByRole('button', { name: 'Batal', exact: true }).last().click()
    assert.equal(f.requests.filter(request => request.path.endsWith('/ministries') && request.method === 'PATCH').length, 0)
    await f.page.getByRole('button', { name: 'Simpan', exact: true }).click()
    const replacing = f.page.waitForResponse(response => response.url().includes('/rest/v1/ministries') && response.request().method() === 'PATCH')
    await f.page.getByRole('button', { name: 'Ganti MH', exact: true }).click()
    await replacing
    assert.equal(f.requests.find(request => request.path.endsWith('/ministries') && request.method === 'PATCH').body.head_user_id, 'QA-HEAD-B')
    await f.page.getByRole('heading', { name: 'Edit Ministry', exact: true }).waitFor({ state: 'hidden' })
    await f.page.getByRole('button', { name: 'Edit ministry Ministry QA', exact: true }).click()
    await f.page.getByLabel('Ministry Head (MH)', { exact: true }).selectOption('')
    await f.page.getByRole('button', { name: 'Simpan', exact: true }).click()
    const clearing = f.page.waitForResponse(response => response.url().includes('/rest/v1/ministries') && response.request().method() === 'PATCH')
    await f.page.getByRole('button', { name: 'Ganti MH', exact: true }).click()
    await clearing
    const changes = f.requests.filter(request => request.path.endsWith('/ministries') && request.method === 'PATCH')
    assert.equal(changes.length, 2)
    assert.equal(changes[1].body.head_user_id, null)
    assert.equal(f.requests.filter(request => request.path.endsWith('/ministry_schedule_managers') && request.method !== 'GET').length, 0)
    assert.equal(f.requests.filter(request => request.path.endsWith('/users') && ['POST', 'PATCH'].includes(request.method)
      && (request.body?.role !== undefined || request.body?.role_secondary !== undefined)).length, 0)
  })
})

test('Ministry tetap dapat dibuka sebelum migrasi MH, editor MH dinonaktifkan', async () => {
  await scenario({
    ministryHeadSourceMissing: true,
    ministries: [{ ministry_id: 'QA-MIN', name: 'Ministry Lama', description: '', department_id: null, organization_order: 1 }],
  }, async f => {
    await f.goto('/admin/ministry')
    await f.page.getByRole('button', { name: 'Edit ministry Ministry Lama', exact: true }).click()
    assert.equal(await f.page.getByLabel('Ministry Head (MH)', { exact: true }).isDisabled(), true)
    await f.page.getByText('Migrasi v99 diperlukan sebelum MH dapat ditetapkan.', { exact: true }).waitFor()
    const ministryReads = f.requests.filter(request => request.path.endsWith('/ministries') && request.method === 'GET')
    assert.ok(ministryReads.length >= 2)
    assert.ok(ministryReads.some(request => new URLSearchParams(request.search).get('select') === '*'))
  })
})

test('MH: pencarian anggota ministry memfilter status dan nama di server sebelum batas 50 hasil', async () => {
  const membership = (id, name, status = 'Aktif', ministryId = 'QA-MIN') => ({
    ministry_id: ministryId, user_id: id,
    users: { user_id: id, name, status, photo_url: null },
  })
  await scenario({
    role: 'Volunteer',
    ministryMembers: [
      ...Array.from({ length: 50 }, (_, index) => membership(`QA-MEMBER-${index + 1}`, `Anggota ${index + 1}`)),
      membership('QA-MEMBER-51', 'Anggota Kelimapuluhsatu'),
      membership('QA-INACTIVE', 'Anggota Kelimapuluhsatu Nonaktif', 'Nonaktif'),
      membership('QA-OTHER', 'Anggota Kelimapuluhsatu Ministry Lain', 'Aktif', 'QA-OTHER-MIN'),
    ],
  }, async f => {
    await f.goto('/jadwal-pelayanan')
    await f.page.getByRole('heading', { name: 'Jadwal Pelayanan' }).waitFor()
    const found = await f.page.evaluate(async () => {
      const { serviceRosterService } = await import('/src/services/serviceRosterService.js')
      return serviceRosterService.listMinistryMembers('QA-MIN', '  kelimapuluhsatu  ')
    })
    assert.deepEqual(found.map(user => user.user_id), ['QA-MEMBER-51'])
    const request = f.requests.find(row => row.path.endsWith('/user_ministries'))
    assert.ok(request, 'Pencarian harus memanggil query keanggotaan di server')
    const params = new URLSearchParams(request.search)
    assert.equal(params.get('select'), 'user_id,users!user_id!inner(user_id,name,photo_url,status)')
    assert.equal(params.get('ministry_id'), 'eq.QA-MIN')
    assert.equal(params.get('users.status'), 'eq.Aktif')
    assert.equal(params.get('users.name'), 'ilike.%kelimapuluhsatu%')
    assert.equal(params.get('limit'), '50')
  })
})

test('Volunteer: menu jadwal tetap terlihat saat belum ada tugas dan halaman hanya-baca', async () => {
  await scenario({ role: 'Volunteer' }, async f => {
    await f.goto('/')
    await f.page.getByRole('link', { name: 'Jadwal Saya', exact: true }).waitFor()
    await f.page.getByRole('heading', { name: 'Jadwal Pelayanan Saya' }).waitFor()
    await f.page.getByText('Tidak ada jadwal pelayanan mendatang.').waitFor()
    await f.goto('/jadwal-pelayanan')
    await f.page.getByRole('heading', { name: 'Jadwal Pelayanan' }).waitFor()
    await f.page.getByText('Belum ada tugas pelayanan untuk Anda pada bulan ini.').waitFor()
    const previousMonth = await f.page.getByLabel('Bulan').inputValue()
    await f.page.getByRole('button', { name: 'Lihat bulan berikutnya' }).click()
    const [year, month] = previousMonth.split('-').map(Number)
    const followingMonth = String(year + (month === 12 ? 1 : 0)) + '-' + String(month === 12 ? 1 : month + 1).padStart(2, '0')
    assert.equal(await f.page.getByLabel('Bulan').inputValue(), followingMonth)
    assert.equal(await f.page.getByRole('button', { name: 'Kelola', exact: true }).count(), 0)
    assert.equal(await f.page.getByRole('button', { name: 'Akses & Posisi', exact: true }).count(), 0)
  })
})

test('Volunteer: gagal memuat jadwal tidak ditampilkan sebagai keadaan kosong', async () => {
  await scenario({ role: 'Volunteer', rosterFailure: true, legacyScheduleFailure: true }, async f => {
    await f.goto('/')
    await f.page.getByRole('heading', { name: 'Jadwal Pelayanan Saya' }).waitFor()
    await f.page.getByRole('alert').filter({ hasText: 'Jadwal pelayanan gagal dimuat.' }).waitFor()
    assert.equal(await f.page.getByText('Tidak ada jadwal pelayanan mendatang.').count(), 0)
  })
})

test('Bell jadwal memilih pelayanan mendatang terdekat, bukan riwayat tertua', async () => {
  const day = offset => {
    const date = new Date()
    date.setDate(date.getDate() + offset)
    const pad = value => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }
  const rosterSlot = (id, title, offset, start = '08:00:00') => ({
    roster_id: id,
    service_rosters: {
      roster_id: id,
      title,
      service_date: day(offset),
      start_time: start,
      end_time: '10:00:00',
      status: 'Terbit',
      version: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: new Date(Date.now() + offset * 1000).toISOString(),
      ministries: { name: 'Worship' },
      service_roster_slots: [],
    },
  })

  await scenario({
    role: 'Volunteer',
    rosterSlots: [
      rosterSlot('OLD-1', 'Riwayat Lama 1', -20),
      rosterSlot('OLD-2', 'Riwayat Lama 2', -19),
      rosterSlot('OLD-3', 'Riwayat Lama 3', -18),
      rosterSlot('OLD-4', 'Riwayat Lama 4', -17),
      rosterSlot('OLD-5', 'Riwayat Lama 5', -16),
      rosterSlot('NEXT-2', 'Pelayanan Lusa', 2),
      rosterSlot('NEXT-1', 'Pelayanan Besok', 1),
    ],
  }, async f => {
    await f.goto('/')
    await f.page.getByRole('button', { name: 'Notifikasi' }).click()
    await f.page.getByText('Jadwal: Pelayanan Besok').waitFor()
    await f.page.getByText('Jadwal: Pelayanan Lusa').waitFor()
    assert.equal(await f.page.getByText('Jadwal: Riwayat Lama 1').count(), 0)
  })
})

function nextMonthRoster(status = 'Terbit') {
  const today = new Date()
  const serviceDate = new Date(Date.UTC(today.getFullYear(), today.getMonth() + 1, 7)).toISOString().slice(0, 10)
  return {
    roster_id: 'QA-ROSTER/TAUTAN?1', ministry_id: 'QA-MIN',
    title: 'Ibadah Bulan Berikutnya', service_date: serviceDate,
    source_type: 'Ibadah', start_time: '08:00:00', end_time: '10:00:00',
    location: 'Aula QA', status, version: 1,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ministries: { name: 'Worship' },
    service_roster_slots: [{
      slot_id: 'QA-SLOT', user_id: 'QA-USER', position_id: 'QA-POS', slot_no: 1,
      ministry_service_positions: { name: 'Worship Leader', sort_order: 0 },
      users: { name: 'Pengguna QA', photo_url: null },
    }],
  }
}

test('Tautan bell membuka detail jadwal Terbit lintas bulan dan kembali mempertahankan bulan', async () => {
  const roster = nextMonthRoster()
  await scenario({ role: 'Volunteer', rosters: [roster], rosterSlots: [{ roster_id: roster.roster_id, service_rosters: roster }] }, async f => {
    await f.goto('/')
    await f.page.getByRole('button', { name: 'Notifikasi' }).click()
    const notification = f.page.getByRole('link').filter({ hasText: 'Jadwal: Ibadah Bulan Berikutnya' })
    await notification.waitFor()
    assert.equal(await notification.getAttribute('href'), '/jadwal-pelayanan?rosterId=' + encodeURIComponent(roster.roster_id))
    await notification.click()
    await f.page.getByRole('heading', { name: roster.title, exact: true }).waitFor()
    assert.equal(await f.page.getByText('Worship Leader', { exact: true }).count(), 1)
    assert.equal(await f.page.getByRole('button', { name: 'Kelola', exact: true }).count(), 0)
    assert.equal(await f.page.getByRole('button', { name: 'PDF', exact: true }).count(), 0)
    await f.page.getByRole('button', { name: 'Kembali', exact: true }).click()
    await f.page.waitForURL(url => !url.searchParams.has('rosterId'))
    await f.page.getByRole('heading', { name: 'Jadwal Pelayanan', exact: true }).waitFor()
    assert.equal(await f.page.getByLabel('Bulan').inputValue(), roster.service_date.slice(0, 7))
    await f.page.getByText(roster.title, { exact: true }).waitFor()
  })
})

test('Tautan jadwal Dibatalkan terbuka lintas bulan dan kembali hanya menghapus rosterId', async () => {
  const roster = nextMonthRoster('Dibatalkan')
  await scenario({ role: 'Volunteer', rosters: [roster], rosterSlots: [{ roster_id: roster.roster_id, service_rosters: roster }] }, async f => {
    await f.goto('/jadwal-pelayanan?keep=1&rosterId=' + encodeURIComponent(roster.roster_id))
    await f.page.getByRole('heading', { name: roster.title, exact: true }).waitFor()
    assert.equal(await f.page.getByText('Dibatalkan', { exact: true }).count(), 1)
    await f.page.getByRole('button', { name: 'Kembali', exact: true }).click()
    await f.page.waitForURL(url => !url.searchParams.has('rosterId') && url.searchParams.get('keep') === '1')
    assert.equal(await f.page.getByLabel('Bulan').inputValue(), roster.service_date.slice(0, 7))
    await f.page.getByText(roster.title, { exact: true }).waitFor()
    assert.equal(await f.page.getByText('Dibatalkan', { exact: true }).count(), 1)
  })
})

test('Tautan Draft ditolak pada tampilan anggota walaupun backend mengembalikan datanya', async () => {
  const roster = nextMonthRoster('Draft')
  await scenario({ role: 'Volunteer', rosters: [roster], rosterSlots: [{ roster_id: roster.roster_id, service_rosters: roster }] }, async f => {
    await f.goto('/jadwal-pelayanan?rosterId=' + encodeURIComponent(roster.roster_id))
    await f.page.waitForURL(url => !url.searchParams.has('rosterId'))
    await f.page.getByRole('heading', { name: 'Jadwal Pelayanan', exact: true }).waitFor()
    await f.page.getByText('Jadwal pelayanan gagal dimuat.', { exact: true }).waitFor()
    assert.equal(await f.page.getByText(roster.title, { exact: true }).count(), 0)
    assert.equal(await f.page.getByRole('button', { name: 'Terbitkan', exact: true }).count(), 0)
  })
})

function monthlyManagementFixture(managerOnly = false, monthOffset = 0) {
  const today = new Date()
  const month = new Date(Date.UTC(today.getFullYear(), today.getMonth() + monthOffset, 1)).toISOString().slice(0, 7)
  const ministries = [{ ministry_id: 'QA-MIN', name: 'Worship' }, { ministry_id: 'QA-MEDIA', name: 'Multimedia' }]
  const servicePositions = [
    { position_id: 'QA-POS', ministry_id: 'QA-MIN', name: 'Worship Leader', is_active: true, default_slots: 1, sort_order: 0, ministries: { name: 'Worship' } },
    { position_id: 'QA-MEDIA-POS', ministry_id: 'QA-MEDIA', name: 'Operator Media', is_active: true, default_slots: 1, sort_order: 0, ministries: { name: 'Multimedia' } },
  ]
  const definition = { sections: [{
    section_id: 'QA-SECTION', title: 'Ibadah Gabungan', source_type: 'Ibadah',
    start_time: '08:00', end_time: '10:00', class_session_no: null,
    parts: servicePositions.map(position => ({ ministry_id: position.ministry_id, positions: [{ position_id: position.position_id, capacity: 1 }] })),
  }] }
  const occurrence = {
    occurrence_id: 'QA-OCCURRENCE', month_id: 'QA-MONTH', section_id: 'QA-SECTION',
    title: 'Ibadah Gabungan', source_type: 'Ibadah', service_date: `${month}-07`,
    start_time: '08:00:00', end_time: '10:00:00', location: 'Aula QA', dress_code: 'Batik',
  }
  const parts = servicePositions.map(position => ({
    part_id: `QA-PART-${position.ministry_id}`, occurrence_id: occurrence.occurrence_id,
    ministry_id: position.ministry_id, roster_id: `QA-ROSTER-${position.ministry_id}`,
    team_name: position.ministry_id === 'QA-MIN' ? 'Tim Worship QA' : 'Tim Media Rahasia',
  }))
  const rosters = servicePositions.map((position, index) => ({
    roster_id: parts[index].roster_id, ministry_id: position.ministry_id, status: 'Draft',
    title: occurrence.title, service_date: occurrence.service_date,
    start_time: occurrence.start_time, end_time: occurrence.end_time,
    service_roster_slots: [{
      slot_id: `QA-SLOT-${position.position_id}`, position_id: position.position_id,
      ministry_id: position.ministry_id, user_id: index === 0 ? 'QA-USER' : 'QA-MEDIA-USER', slot_no: 1,
      users: { name: index === 0 ? 'Pelayan Worship QA' : 'Pelayan Media Rahasia', photo_url: null },
    }],
  }))
  return {
    ministries, servicePositions,
    monthlyTemplates: [{ template_id: 'QA-TEMPLATE', name: 'Template Gabungan', is_active: true, definition }],
    // RPC production mengirim kerangka semua bagian, tetapi data Draft hanya ministry berizin.
    monthlySchedules: [{
      month: { month_id: 'QA-MONTH', template_id: 'QA-TEMPLATE', month_date: `${month}-01`, name: 'Jadwal QA', status: 'Draft', definition },
      sections: definition.sections, occurrences: [occurrence],
      parts: managerOnly ? parts.filter(part => part.ministry_id === 'QA-MIN') : parts,
      rosters: managerOnly ? rosters.filter(roster => roster.ministry_id === 'QA-MIN') : rosters,
    }],
  }
}

async function assertMonthlyManagementLoaded(f) {
  await f.page.getByRole('heading', { name: 'Jadwal Pelayanan Bulanan', exact: true }).waitFor()
  const monthlyTab = f.page.getByRole('button', { name: 'Bulanan', exact: true })
  assert.equal(await monthlyTab.getAttribute('aria-pressed'), 'true')
  await f.page.getByRole('table', { name: /^Jadwal pelayanan / }).waitFor()
  const request = f.requests.find(row => row.path.endsWith('/get_service_schedule_month'))
  assert.equal(request?.method, 'POST', 'Panel harus memuat snapshot bulanan melalui RPC')
  assert.deepEqual(request?.body, { p_month_id: 'QA-MONTH' })
  const expectedMonth = `eq.${await f.page.getByLabel('Bulan', { exact: true }).inputValue()}-01`
  assert.ok(f.requests.some(row => row.path.endsWith('/service_schedule_months') && new URLSearchParams(row.search).get('month_date') === expectedMonth), 'Snapshot harus dimuat untuk bulan yang sedang ditampilkan')
}

test('Super Admin: menu jadwal mobile tidak tampil, rute lihat terpisah dari panel admin', async () => {
  await scenario({ secondary: 'Volunteer', ...monthlyManagementFixture() }, async f => {
    await f.goto('/')
    await f.page.getByRole('heading', { name: /Shalom/ }).waitFor()
    assert.equal(await f.page.locator('a[href="/jadwal-pelayanan"]').count(), 0)
    await f.goto('/jadwal-pelayanan')
    await f.page.getByRole('heading', { name: 'Jadwal Pelayanan' }).waitFor()
    assert.equal(await f.page.getByRole('button', { name: 'Kelola', exact: true }).count(), 0)
    await f.goto('/admin/jadwal-pelayanan')
    await assertMonthlyManagementLoaded(f)
    assert.equal(await f.page.getByRole('button', { name: 'Template', exact: true }).count(), 1)
    assert.equal(await f.page.getByRole('button', { name: 'Terbitkan Bulan', exact: true }).isEnabled(), true)
    assert.equal(await f.page.getByRole('button', { name: /^Atur Worship Leader untuk Ibadah Gabungan,/ }).count(), 1)
    assert.equal(await f.page.getByRole('button', { name: /^Atur Operator Media untuk Ibadah Gabungan,/ }).count(), 1)
    assert.equal(await f.page.getByText('Pelayan Media Rahasia', { exact: true }).count(), 1)
  })
})

test('Admin dengan peran kedua Volunteer tetap tidak mendapat menu jadwal mobile', async () => {
  await scenario({ role: 'Admin', secondary: 'Volunteer' }, async f => {
    await f.goto('/')
    await f.page.getByRole('heading', { name: /Shalom/ }).waitFor()
    assert.equal(await f.page.locator('a[href="/jadwal-pelayanan"]').count(), 0)
  })
})

test('Admin tanpa izin kelola tetap bisa melihat tautan jadwal penugasannya', async () => {
  await scenario({ role: 'Admin', allowedPages: [] }, async f => {
    await f.goto('/jadwal-pelayanan')
    await f.page.getByRole('heading', { name: 'Jadwal Pelayanan' }).waitFor()
    assert.equal(await f.page.getByRole('button', { name: 'Kelola', exact: true }).count(), 0)
    await f.goto('/admin/jadwal-pelayanan')
    await f.page.getByRole('alert').waitFor()
    assert.equal(await f.page.getByRole('button', { name: 'Kelola', exact: true }).count(), 0)
  })
})

test('Wakil ber-grant hanya membuka panel pengelola jadwal, bukan halaman Admin lain', async () => {
  await scenario({
    role: 'Volunteer',
    ...monthlyManagementFixture(true),
    managerGrants: [{ manager_role: 'Wakil', ministries: { ministry_id: 'QA-MIN', name: 'Worship' } }],
  }, async f => {
    await f.goto('/profil')
    await f.page.getByRole('link', { name: /Kelola Jadwal Pelayanan/ }).waitFor()
    await f.goto('/admin/jadwal-pelayanan')
    await assertMonthlyManagementLoaded(f)
    assert.equal(await f.page.getByRole('button', { name: /^Atur Worship Leader untuk Ibadah Gabungan,/ }).count(), 1)
    assert.equal(await f.page.getByRole('button', { name: /^Ubah tim dan materi Worship,/ }).count(), 1)
    assert.equal(await f.page.getByText('Pelayan Worship QA', { exact: true }).count(), 1)
    assert.equal(await f.page.getByText('Multimedia', { exact: true }).count(), 2)
    assert.equal(await f.page.getByText('Bagian terbatas', { exact: true }).count(), 2)
    assert.equal(await f.page.getByRole('button', { name: /^Atur Operator Media/ }).count(), 0)
    assert.equal(await f.page.getByRole('button', { name: /^Ubah tim dan materi Multimedia/ }).count(), 0)
    assert.equal(await f.page.getByText('Pelayan Media Rahasia', { exact: true }).count(), 0)
    assert.equal(await f.page.getByText('Tim Media Rahasia', { exact: true }).count(), 0)
    for (const name of ['Template', 'Akses & Posisi', 'Terbitkan Bulan', 'Batalkan Bulan', 'Buat Jadwal Bulan Ini']) {
      assert.equal(await f.page.getByRole('button', { name, exact: true }).count(), 0)
    }
    assert.equal(await f.page.locator('button.sched-matrix-occurrence-cell').count(), 0)
    assert.equal(await f.page.locator('aside').count(), 0)
    await f.goto('/admin/jemaat')
    await f.page.waitForURL(url => url.pathname === '/')
  })
})

test('Admin terbatas: panel jadwal terbuka hanya bila halaman itu diizinkan', async () => {
  await scenario({
    role: 'Admin',
    allowedPages: ['/admin/jadwal-pelayanan'],
    ...monthlyManagementFixture(),
  }, async f => {
    await f.goto('/admin/jadwal-pelayanan')
    await assertMonthlyManagementLoaded(f)
    assert.equal(await f.page.getByRole('button', { name: 'Template', exact: true }).count(), 1)
    assert.equal(await f.page.getByRole('button', { name: 'Akses & Posisi', exact: true }).count(), 1)
    assert.equal(await f.page.getByRole('button', { name: 'Terbitkan Bulan', exact: true }).isEnabled(), true)
    assert.equal(await f.page.locator('button.sched-matrix-occurrence-cell').count(), 1)
    assert.equal(await f.page.getByRole('button', { name: /^Atur Operator Media untuk Ibadah Gabungan,/ }).count(), 1)
    assert.equal(await f.page.getByRole('link', { name: 'Jadwal Pelayanan', exact: true }).count(), 1)
    await f.goto('/admin/jemaat')
    await f.page.waitForURL(url => url.pathname === '/admin/jadwal-pelayanan')
  })
})

test('MH berakun Admin ditampilkan tanpa opsi persetujuan MH di panel jadwal', async () => {
  const monthly = monthlyManagementFixture()
  monthly.ministries[0] = {
    ...monthly.ministries[0],
    head_user_id: 'QA-ADMIN-HEAD',
    head: { user_id: 'QA-ADMIN-HEAD', name: 'Admin Pelayan', role: 'Admin', status: 'Aktif' },
  }
  await scenario({
    role: 'Admin',
    allowedPages: ['/admin/jadwal-pelayanan'],
    ...monthly,
  }, async f => {
    await f.goto('/admin/jadwal-pelayanan')
    await assertMonthlyManagementLoaded(f)
    await f.page.getByRole('button', { name: 'Akses & Posisi', exact: true }).click()
    await f.page.getByText('Admin Pelayan', { exact: true }).waitFor()
    await f.page.getByText('Hak Akses Admin', { exact: true }).waitFor()
    await f.page.getByText('Jabatan MH tidak menambah akses jadwal. Akun ini memakai izin halaman Jadwal Pelayanan pada Hak Akses Admin.', { exact: true }).waitFor()
    assert.equal(await f.page.getByRole('button', { name: 'Setujui akses', exact: true }).count(), 0)
    assert.equal(f.requests.filter(request => request.path.endsWith('/ministry_schedule_managers') && request.method !== 'GET').length, 0)
  })
})

test('Tautan pengelola roster bulanan membuka matriks bulan asal tanpa editor individual dan mempertahankan parameter lain', async () => {
  const monthly = monthlyManagementFixture(true, 1)
  const rosterId = monthly.monthlySchedules[0].parts[0].roster_id
  await scenario({
    role: 'Volunteer', ...monthly, rosterMonthLinkDelayMs: 300,
    managerGrants: [{ manager_role: 'Wakil', ministries: { ministry_id: 'QA-MIN', name: 'Worship' } }],
  }, async f => {
    await f.page.addInitScript(() => {
      window.__qaLegacyControls = []
      new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue
          const buttons = node.matches('button') ? [node] : [...node.querySelectorAll('button')]
          for (const button of buttons) {
            const text = button.textContent.trim()
            if (['Kelola', 'Tinjau & Terbitkan', 'Batalkan Jadwal'].includes(text)) window.__qaLegacyControls.push(text)
          }
        }
      }).observe(document, { childList: true, subtree: true })
    })
    await f.goto('/admin/jadwal-pelayanan?keep=test&rosterId=' + encodeURIComponent(rosterId))
    await f.page.waitForURL(url => !url.searchParams.has('rosterId') && url.searchParams.get('keep') === 'test')
    await assertMonthlyManagementLoaded(f)
    assert.equal(await f.page.getByLabel('Bulan', { exact: true }).inputValue(), monthly.monthlySchedules[0].month.month_date.slice(0, 7))
    assert.deepEqual(await f.page.evaluate(() => window.__qaLegacyControls), [], 'Editor roster individual tidak boleh sempat dirender untuk tautan bulanan')
    assert.equal(f.requests.some(row => row.path.endsWith('/service_rosters') && new URLSearchParams(row.search).has('roster_id')), false)
    assert.equal(await f.page.getByRole('button', { name: 'Tinjau & Terbitkan', exact: true }).count(), 0)
    assert.equal(await f.page.getByRole('button', { name: 'Terbitkan Bulan', exact: true }).count(), 0)
    const mapping = f.requests.find(row => row.path.endsWith('/service_schedule_parts'))
    assert.equal(new URLSearchParams(mapping?.search).get('roster_id'), `eq.${rosterId}`)
    assert.equal(new URLSearchParams(mapping?.search).get('select'), 'service_schedule_occurrences!occurrence_id(month_id,service_schedule_months!month_id(month_date))')
  })
})

test('Tautan pengelola roster lama tetap membuka detail dan aksi individual ketika tidak terhubung ke bulan', async () => {
  const roster = nextMonthRoster('Draft')
  await scenario({
    role: 'Volunteer', ...monthlyManagementFixture(true), rosters: [roster],
    managerGrants: [{ manager_role: 'Wakil', ministries: { ministry_id: 'QA-MIN', name: 'Worship' } }],
  }, async f => {
    await f.goto('/admin/jadwal-pelayanan?keep=test&rosterId=' + encodeURIComponent(roster.roster_id))
    await f.page.getByRole('heading', { name: roster.title, exact: true }).waitFor()
    assert.equal(await f.page.getByRole('button', { name: 'Roster Sebelumnya', exact: true }).getAttribute('aria-pressed'), 'true')
    assert.equal(await f.page.getByRole('button', { name: 'Tinjau & Terbitkan', exact: true }).isEnabled(), true)
    assert.equal(new URL(f.page.url()).searchParams.get('rosterId'), roster.roster_id)
    assert.equal(new URL(f.page.url()).searchParams.get('keep'), 'test')
    assert.equal(await f.page.getByRole('table', { name: /^Jadwal pelayanan / }).count(), 0)
    const mapping = f.requests.find(row => row.path.endsWith('/service_schedule_parts'))
    assert.equal(new URLSearchParams(mapping?.search).get('roster_id'), `eq.${roster.roster_id}`)
    assert.ok(f.requests.some(row => row.path.endsWith('/service_rosters') && new URLSearchParams(row.search).get('roster_id') === `eq.${roster.roster_id}`))
    await f.page.getByRole('button', { name: 'Kembali', exact: true }).click()
    await f.page.waitForURL(url => !url.searchParams.has('rosterId') && url.searchParams.get('keep') === 'test')
    assert.equal(await f.page.getByRole('button', { name: 'Kelola', exact: true }).count(), 1)
  })
})

test('Volunteer tanpa grant ditolak dari panel pengelola jadwal', async () => {
  await scenario({ role: 'Volunteer' }, async f => {
    await f.goto('/admin/jadwal-pelayanan')
    await f.page.waitForURL(url => url.pathname === '/')
  })
})

test('Super Admin: formulir SOP baru dapat dibuka tanpa crash', { timeout: 30000 }, async () => {
  await scenario({}, async f => {
    await f.goto('/admin/tugas/baru')
    await f.page.getByRole('heading', { name: 'Informasi Tugas', exact: true }).waitFor()
    assert.equal(await f.page.getByRole('button', { name: 'Buat Template', exact: true }).isEnabled(), true)
  })
})

for (const role of ['Jemaat', 'Volunteer', 'PKS']) {
  test(`${role}: penolakan SOP tampil tanpa crash`, async () => {
    await scenario({ role, template: { form_id: 'QA-TASK', title: 'SOP terbatas', allowed_roles: ['Admin'], template_ministries: [] } }, async f => {
      await f.goto('/tugas/QA-TASK')
      await f.page.getByRole('heading', { name: 'Akses Ditolak', exact: true }).waitFor()
      assert.equal(await f.page.getByText('Tugas khusus ministry tertentu', { exact: true }).count(), 1)
      assert.equal(f.requests.some(r => r.path.endsWith('/form_responses')), false)
    })
  })
}

test('SOP gagal dimuat menampilkan retry dan pulih tanpa reload', async () => {
  await scenario({ role: 'Volunteer', templateFailure: true }, async f => {
    await f.goto('/tugas/QA-TASK')
    await f.page.getByRole('alert').waitFor()
    assert.equal(await f.page.getByText('Gagal memuat tugas.', { exact: true }).count(), 1)
    f.state.templateFailure = false
    await f.page.getByRole('button', { name: 'Coba lagi', exact: true }).click()
    await f.page.getByRole('heading', { name: 'SOP simulasi', exact: true }).waitFor()
    assert.equal(await f.page.getByRole('alert').count(), 0)
  })
})

test('Hak akses: kegagalan query izin tidak menjadi akses penuh atau daftar kosong', async () => {
  await scenario({ permissionFailure: true }, async f => {
    await f.goto('/admin/hak-akses')
    await f.page.getByRole('alert').waitFor()
    assert.equal(await f.page.getByText('Belum ada admin', { exact: true }).count(), 0)
    assert.equal(await f.page.getByRole('button', { name: /Admin Uji/ }).count(), 0)
    f.state.permissionFailure = false
    await f.page.getByRole('button', { name: 'Coba lagi', exact: true }).click()
    await f.page.getByRole('button', { name: /Admin Uji/ }).waitFor()
    await f.page.getByRole('button', { name: /Admin Uji/ }).click()
    assert.equal(await f.page.getByRole('checkbox', { name: 'Events', exact: true }).isChecked(), true)
    assert.equal(await f.page.getByRole('checkbox', { name: 'Dashboard', exact: true }).isChecked(), false)
  })
})

test('Admin: gangguan izin menahan isi panel; retry memulihkan halaman yang diizinkan', async () => {
  await scenario({ role: 'Admin', permissionFailure: true }, async f => {
    await f.goto('/admin/events')
    await f.page.getByRole('heading', { name: 'Hak akses belum dapat dimuat', exact: true }).waitFor()
    assert.equal(f.requests.some(r => r.path.endsWith('/events')), false)
    f.state.permissionFailure = false
    await f.page.getByRole('button', { name: 'Coba lagi', exact: true }).click()
    await f.page.getByRole('heading', { name: 'Kelola Events', exact: true }).waitFor()
    assert.equal(await f.page.getByRole('alert').count(), 0)
  })
})

test('Admin: izin kosong menampilkan pesan stabil tanpa putaran redirect', async () => {
  await scenario({ role: 'Admin', allowedPages: [] }, async f => {
    await f.goto('/admin')
    await f.page.getByRole('heading', { name: 'Belum ada halaman yang diizinkan', exact: true }).waitFor()
    assert.equal(new URL(f.page.url()).pathname, '/admin')
    f.state.allowedPages = ['/admin/events']
    await f.page.getByRole('button', { name: 'Coba lagi', exact: true }).click()
    await f.page.waitForURL('**/admin/events')
    await f.page.getByRole('heading', { name: 'Kelola Events', exact: true }).waitFor()
  })
})

test('Admin: izin belum diatur mempertahankan akses default yang sah', async () => {
  await scenario({ role: 'Admin', allowedPages: null }, async f => {
    await f.goto('/admin/events')
    await f.page.getByRole('heading', { name: 'Kelola Events', exact: true }).waitFor()
    assert.equal(await f.page.getByRole('alert').count(), 0)
  })
})

test('Admin: KTJ menunggu tampil sebagai notifikasi dan membuka antrean terfilter', async () => {
  await scenario({
    pendingCounts: { ktj_registrations: 1 },
    ktjRegistrations: [{
      ktj_id: 'KTJ-QA-1',
      user_id: 'QA-USER',
      full_name: 'Pengajuan KTJ Uji',
      status: 'Menunggu',
      created_at: '2026-09-30T08:00:00Z',
      users: { name: 'Pengguna QA', phone: '081234567890' },
    }],
  }, async f => {
    await f.goto('/admin')
    await f.page.getByRole('heading', { name: 'Perlu Ditangani', exact: true }).waitFor()
    const notification = f.page.getByRole('button', { name: '1 pekerjaan admin menunggu', exact: true })
    await notification.click()
    const pendingMenu = f.page.getByRole('region', { name: 'Perlu Ditangani', exact: true })
    await pendingMenu.getByRole('link', { name: 'Buka Pengajuan KTJ, 1 menunggu', exact: true }).click()
    await f.page.waitForURL(url => url.pathname === '/admin/ktj' && url.searchParams.get('status') === 'Menunggu')
    await f.page.getByRole('heading', { name: 'Pengajuan KTJ', exact: true }).waitFor()
    assert.match(await f.page.getByRole('status').innerText(), /Pengajuan KTJ: 1 menunggu/)
    assert.equal(await f.page.getByText('Pengajuan KTJ Uji', { exact: true }).count(), 1)
    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  })
})

test('Admin dapat membedakan Nonaktif otomatis dan permintaan aktivasi ulang', async () => {
  await scenario({
    members: [
      {
        user_id: 'QA-INACTIVE', name: 'Akun Tidak Aktif', role: 'Jemaat',
        status: 'Nonaktif', inactivity_deactivated_at: '2026-09-30T01:00:00Z',
        last_seen_at: '2026-09-15T01:00:00Z', user_ministries: [],
      },
      {
        user_id: 'QA-REACTIVATE', name: 'Akun Minta Aktif', role: 'Volunteer',
        status: 'Menunggu Persetujuan', reactivation_requested_at: '2026-09-30T02:00:00Z',
        inactivity_deactivated_at: '2026-09-29T01:00:00Z', user_ministries: [],
      },
    ],
  }, async f => {
    await f.goto('/admin/jemaat')
    await f.page.getByText('Akun Tidak Aktif', { exact: true }).waitFor()
    assert.equal(await f.page.getByText('Nonaktif otomatis', { exact: true }).count(), 1)
    assert.equal(await f.page.getByText('Menunggu aktivasi ulang', { exact: true }).count(), 1)
  })
})

test('Admin terbatas hanya melihat antrean dari halaman yang diizinkan', async () => {
  await scenario({
    role: 'Admin',
    allowedPages: ['/admin', '/admin/events'],
    pendingCounts: { ktj_registrations: 3, pendingEvents: 2 },
  }, async f => {
    await f.goto('/admin')
    const notification = f.page.getByRole('button', { name: '2 pekerjaan admin menunggu', exact: true })
    await notification.waitFor()
    await notification.click()
    const pendingMenu = f.page.getByRole('region', { name: 'Perlu Ditangani', exact: true })
    assert.equal(await pendingMenu.getByRole('link', { name: 'Buka Pendaftaran event, 2 menunggu', exact: true }).count(), 1)
    assert.equal(await pendingMenu.getByText('Pengajuan KTJ', { exact: true }).count(), 0)
  })
})
test('Admin terbatas tidak membuka halaman sistem Super Admin', async () => {
  await scenario({ role: 'Admin' }, async f => {
    await f.goto('/admin/hak-akses')
    await f.page.waitForURL('**/admin/events')
    assert.equal(await f.page.getByRole('heading', { name: 'Hak Akses Admin', exact: true }).count(), 0)
  })
})

test('Login: label, keyboard, validasi wajib, dan pesan gagal tetap berfungsi', async () => {
  await scenario({ authenticated: false }, async f => {
    await f.goto('/login')
    await f.page.getByRole('button', { name: 'Masuk', exact: true }).click()
    assert.equal(await f.page.locator('input[name=username]').evaluate(el => el === document.activeElement), true)
    assert.equal(f.requests.some(r => r.path.endsWith('/token')), false)
    await f.page.getByRole('textbox', { name: 'Kata Sandi*', exact: true }).fill('SandiSimulasi')
    await f.page.keyboard.press('Tab')
    await f.page.keyboard.press('Enter')
    assert.equal(await f.page.locator('input[name=password]').getAttribute('type'), 'text')
    await f.page.getByLabel('Email atau No. HP', { exact: false }).fill('qa@example.invalid')
    await f.page.getByRole('button', { name: 'Masuk', exact: true }).click()
    await f.page.getByRole('alert').waitFor()
    assert.equal(await f.page.getByRole('button', { name: 'Masuk', exact: true }).isEnabled(), true)
  })
})

test('Login: pembatasan server tidak ditampilkan sebagai sandi salah', async () => {
  await scenario({ authenticated: false, authRestricted: true }, async f => {
    await f.goto('/login')
    await f.page.getByLabel('Email atau No. HP').fill('qa@example.invalid')
    await f.page.locator('input[name="password"]').fill('contoh-sandi')
    await f.page.getByRole('button', { name: 'Masuk', exact: true }).click()
    await f.page.getByRole('alert').waitFor()
    assert.match(await f.page.getByRole('alert').innerText(), /Layanan sedang dibatasi/)
    assert.equal(await f.page.getByText('Email atau kata sandi salah. Silakan coba lagi.', { exact: true }).count(), 0)
  })
})

test('Login: tema dapat diubah dan pilihan tersimpan', async () => {
  await scenario({ authenticated: false, theme: 'light' }, async f => {
    await f.goto('/login')
    const toggle = f.page.getByRole('button', { name: 'Mode Gelap', exact: true })
    assert.equal(await toggle.evaluate(el => el.getBoundingClientRect().height >= 44), true)
    assert.equal(await f.page.locator('html').evaluate(el => el.classList.contains('dark')), false)
    await toggle.click()
    assert.equal(await f.page.locator('html').evaluate(el => el.classList.contains('dark')), true)
    assert.equal(await f.page.evaluate(() => localStorage.getItem('esc-theme')), 'dark')
    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  })
})

test('Onboarding: klik ganda tahap ketiga tidak melewati tahap terakhir', async () => {
  await scenario({ authenticated: false }, async f => {
    await f.goto('/onboarding')
    const next = f.page.getByRole('button', { name: 'Lanjut →', exact: true })
    for (const stage of [2, 3]) {
      await next.click()
      await f.page.getByText(`Tahap ${stage} dari 4`, { exact: true }).waitFor()
    }
    await next.dblclick({ delay: 40 })
    await f.page.getByText('Tahap 4 dari 4', { exact: true }).waitFor()
    await f.page.getByRole('button', { name: 'Mulai', exact: true }).click()
    await f.page.waitForURL('**/login')
    assert.equal(await f.page.evaluate(() => localStorage.getItem('esc-roadmap-seen-count')), '1')
  })
})

test('Registrasi: data invalid ditahan dengan fokus dan error dekat field', async () => {
  await scenario({ authenticated: false }, async f => {
    await f.goto('/register')
    await f.page.getByRole('button', { name: 'Lanjut →', exact: true }).click()
    assert.equal(await f.page.locator('input[aria-invalid=true]').count(), 5)
    assert.equal(await f.page.locator('input[name=name]').evaluate(el => el === document.activeElement), true)
    assert.equal(f.requests.some(r => r.path.includes('/signup')), false)
  })
})

test('Registrasi: profil lama tanpa login tetap ditolak sebagai nomor terdaftar', async () => {
  await scenario({ authenticated: false, checkPhone: { phoneTaken: true } }, async f => {
    await f.goto('/register')
    await f.page.locator('input[name=name]').fill('Jemaat Lama')
    await f.page.locator('input[name=email]').fill('jemaat.lama@example.com')
    await f.page.locator('input[name=phone]').fill('081234567890')
    await f.page.locator('input[name=password]').fill('Generasi2026')
    await f.page.locator('input[name=confirmPassword]').fill('Generasi2026')
    await f.page.getByRole('button', { name: 'Lanjut →', exact: true }).click()
    await f.page.getByRole('alert').waitFor()
    assert.equal(new URL(f.page.url()).pathname, '/register')
    assert.match(await f.page.getByRole('alert').innerText(), /Nomor HP sudah terdaftar/)
    assert.equal(await f.page.locator('select[name=gender]').count(), 0)
  })
})

test('Aktivasi: rute dan tautan telah dihapus', async () => {
  await scenario({ authenticated: false }, async f => {
    await f.goto('/aktivasi')
    await f.page.waitForURL('**/login')
    assert.equal(await f.page.locator('a[href="/aktivasi"]').count(), 0)
  })
})

test('Admin dengan peran Volunteer tetap dapat kembali ke aplikasi ketika izin panel kosong', async () => {
  await scenario({ role: 'Admin', secondary: 'Volunteer', allowedPages: [] }, async f => {
    await f.goto('/admin')
    await f.page.getByRole('heading', { name: 'Belum ada halaman yang diizinkan', exact: true }).waitFor()
    await f.page.getByRole('button', { name: 'Aplikasi', exact: true }).click()
    await f.page.waitForURL(harness.baseUrl + '/')
    await f.page.getByRole('heading', { name: /Shalom/ }).waitFor()
  })
})

for (const [lang, theme] of [['id', 'light'], ['en', 'dark']]) {
  test(`Pesan gagal izin ${lang}/${theme} terbaca pada HP dan dapat dicoba ulang`, async () => {
    await scenario({ permissionFailure: true, lang, theme, viewport: { width: 375, height: 812 } }, async f => {
      await f.goto('/admin/hak-akses')
      await f.page.getByRole('alert').waitFor()
      const text = await f.page.getByRole('alert').innerText()
      assert.ok(text.includes(lang === 'id' ? 'Hak akses belum dapat dimuat' : 'Access rights could not be loaded'))
      assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      const retry = f.page.getByRole('button', { name: lang === 'id' ? 'Coba lagi' : 'Try again', exact: true })
      assert.equal(await retry.evaluate(el => el.getBoundingClientRect().height >= 44), true)
      await retry.focus()
      assert.equal(await retry.evaluate(el => el === document.activeElement), true)
    })
  })
}

for (const [lang, theme, width] of [['id', 'light', 390], ['en', 'dark', 375], ['id', 'dark', 844], ['en', 'light', 1440]]) {
  test(`Login ${lang}/${theme}/${width}: layout dan pembesaran teks tidak meluber`, async () => {
    await scenario({ authenticated: false, lang, theme, viewport: { width, height: width === 844 ? 390 : 900 } }, async f => {
      await f.goto('/login')
      await f.page.getByRole('heading', { name: lang === 'id' ? 'Selamat Datang' : 'Welcome', exact: true }).waitFor()
      await f.page.getByText('Build A Strong Generations', { exact: true }).waitFor()
      assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await f.page.evaluate(() => { document.documentElement.style.fontSize = '32px' })
      assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      assert.equal(await f.page.getByRole('button', { name: lang === 'id' ? 'Masuk' : 'Sign in', exact: true }).isEnabled(), true)
    })
  })
}


test('Peringkat: poin seri memakai nomor berbeda dari server; posisi sendiri tetap global', async () => {
  const leaderboard = Array.from({ length: 10 }, (_, index) => ({
    user_id: `QA-RANK-${index + 1}`, name: `Peserta QA ${index + 1}`,
    photo_url: null, points: index === 4 ? 97 : 100 - index, rank_number: index + 1,
  }))
  leaderboard.push({ user_id: 'QA-USER', name: 'Pengguna QA', photo_url: null, points: 10, rank_number: '35' })
  await scenario({ role: 'Jemaat', leaderboard }, async f => {
    await f.goto('/poin')
    await f.page.getByRole('button', { name: 'Peringkat', exact: true }).click()
    for (const rank of [4, 5]) {
      const row = f.page.getByText(`Peserta QA ${rank}`, { exact: true }).locator('..')
      await row.waitFor()
      assert.equal(await row.getByText('97', { exact: true }).count(), 1)
      assert.equal(await row.getByText(new RegExp(`^#?${rank}$`)).count(), 1)
    }
    const ownRow = f.page.locator('[aria-current="true"][aria-label="Peringkat Anda: 35"]')
    await ownRow.waitFor()
    assert.equal(await ownRow.getByText('#35', { exact: true }).count(), 1)
    assert.equal(await f.page.getByText(/^Peserta QA \d+$/, { exact: true }).count(), 10)
  })
})

test('Galeri media: video tidak mengunduh otomatis dan hanya satu foto dirender', async () => {
  const photoOne = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="2" height="2"%3E%3Crect width="2" height="2" fill="red"/%3E%3C/svg%3E'
  const photoTwo = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="2" height="2"%3E%3Crect width="2" height="2" fill="blue"/%3E%3C/svg%3E'
  await scenario({
    role: 'Jemaat',
    event: {
      event_id: 'EVT-QA', name: 'Event hemat data', status: 'Selesai',
      event_date: '2026-09-28', photo_urls: [photoOne, photoTwo],
      video_urls: ['data:video/mp4;base64,', 'data:video/mp4;base64,'],
      prerequisite_fields: [],
    },
  }, async f => {
    await f.goto('/events/EVT-QA')
    await f.page.getByRole('heading', { name: 'Event hemat data', exact: true }).waitFor()
    assert.equal(await f.page.locator('video').count(), 2)
    for (const video of await f.page.locator('video').all()) {
      assert.deepEqual(await video.evaluate(el => ({ preload: el.preload, autoplay: el.autoplay, paused: el.paused })), {
        preload: 'none', autoplay: false, paused: true,
      })
    }
    assert.equal(await f.page.locator('img').count(), 1)
    assert.equal(await f.page.locator('img').getAttribute('src'), photoOne)
    await f.page.getByRole('button', { name: 'Berikutnya', exact: true }).click()
    assert.equal(await f.page.locator('img').count(), 1)
    assert.equal(await f.page.locator('img').getAttribute('src'), photoTwo)
  })
})
