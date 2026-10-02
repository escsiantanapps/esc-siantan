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

test('Super Admin: menu jadwal mobile tidak tampil, rute lihat terpisah dari panel admin', async () => {
  await scenario({ secondary: 'Volunteer', ministries: [{ ministry_id: 'QA-MIN', name: 'Worship' }] }, async f => {
    await f.goto('/')
    await f.page.getByRole('heading', { name: /Shalom/ }).waitFor()
    assert.equal(await f.page.locator('a[href="/jadwal-pelayanan"]').count(), 0)
    await f.goto('/jadwal-pelayanan')
    await f.page.getByRole('heading', { name: 'Jadwal Pelayanan' }).waitFor()
    assert.equal(await f.page.getByRole('button', { name: 'Kelola', exact: true }).count(), 0)
    await f.goto('/admin/jadwal-pelayanan')
    await f.page.getByRole('button', { name: 'Kelola', exact: true }).waitFor()
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
    managerGrants: [{ manager_role: 'Wakil', ministries: { ministry_id: 'QA-MIN', name: 'Worship' } }],
  }, async f => {
    await f.goto('/profil')
    await f.page.getByRole('link', { name: /Kelola Jadwal Pelayanan/ }).waitFor()
    await f.goto('/admin/jadwal-pelayanan')
    await f.page.getByRole('heading', { name: 'Jadwal Pelayanan' }).waitFor()
    await f.page.getByRole('button', { name: 'Kelola', exact: true }).waitFor()
    assert.equal(await f.page.locator('aside').count(), 0)
    await f.goto('/admin/jemaat')
    await f.page.waitForURL(url => url.pathname === '/')
  })
})

test('Admin terbatas: panel jadwal terbuka hanya bila halaman itu diizinkan', async () => {
  await scenario({
    role: 'Admin',
    allowedPages: ['/admin/jadwal-pelayanan'],
    ministries: [{ ministry_id: 'QA-MIN', name: 'Worship' }],
  }, async f => {
    await f.goto('/admin/jadwal-pelayanan')
    await f.page.getByRole('button', { name: 'Kelola', exact: true }).waitFor()
    assert.equal(await f.page.getByRole('link', { name: 'Jadwal Pelayanan', exact: true }).count(), 1)
    await f.goto('/admin/jemaat')
    await f.page.waitForURL(url => url.pathname === '/admin/jadwal-pelayanan')
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
