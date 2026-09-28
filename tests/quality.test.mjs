import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { startHarness, fixture } from './harness.mjs'
import { countLeaveCredits, getEvaluationResult } from '../src/lib/evaluationLeave.js'

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
