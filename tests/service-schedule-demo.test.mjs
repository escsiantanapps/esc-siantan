import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServiceScheduleDemo, demoProfiles } from '../src/dev/serviceScheduleDemo.js'

async function fixture(options) {
  const api = createServiceScheduleDemo(options)
  const [month] = await api.listMonths('2026-10')
  return { api, month, schedule: month ? await api.getMonth(month.month_id) : null }
}
const current = (roster, positionId) => roster.service_roster_slots.filter(slot => slot.position_id === positionId && slot.user_id).map(slot => slot.user_id)

test('adapter lokal tidak mengimpor klien production atau mengirim request jaringan', async () => {
  const source = await readFile(new URL('../src/dev/serviceScheduleDemo.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /^import\s/m)
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/)
  const { api, schedule } = await fixture()
  assert.equal(schedule.occurrences.length, 16)
  assert.equal(schedule.sections.length, 4)
  assert.equal(schedule.rosters.length, 56)
  assert.equal((await api.listMembers('DEMO-M1')).some(member => member.name === 'Bima'), true)
})

test('fixture tidak memiliki bentrok; publikasi seluruh bulan bersifat atomik dan terkunci', async () => {
  const { api, month, schedule } = await fixture()
  await assert.rejects(api.publishMonth(month.month_id, false), /posisi pelayanan yang kosong/)
  assert.equal((await api.getMonth(month.month_id)).month.status, 'Draft')
  assert.equal((await api.getMonth(month.month_id)).rosters.every(roster => roster.status === 'Draft'), true)
  const ids = await api.publishMonth(month.month_id, true)
  assert.equal(ids.length, schedule.rosters.length)
  const published = await api.getMonth(month.month_id)
  assert.equal(published.month.status, 'Terbit')
  assert.equal(published.rosters.every(roster => roster.status === 'Terbit'), true)
  await assert.rejects(api.updatePart(ids[0], { notes: 'Tidak boleh' }), /tidak dapat diedit/)
  await api.cancelMonth(month.month_id)
  assert.equal((await api.getMonth(month.month_id)).rosters.every(roster => roster.status === 'Dibatalkan'), true)
})

test('Draft MH hanya membuka bagiannya; grant tidak mengubah role menjadi Admin', async () => {
  const { api, month, schedule } = await fixture()
  api.setProfile(demoProfiles.mh)
  const limited = await api.getMonth(month.month_id)
  assert.equal(limited.rosters.length, 12)
  assert.equal(limited.rosters.every(roster => roster.ministry_id === 'DEMO-M1'), true)
  assert.equal(limited.parts.every(part => part.ministry_id === 'DEMO-M1'), true)
  assert.equal(limited.sections.length, 4)
  assert.equal((await api.listManagedMinistries())[0].manager_role, 'Ministry Head')
  const outside = schedule.rosters.find(roster => roster.ministry_id === 'DEMO-M3')
  await assert.rejects(api.setPosition({ rosterId: outside.roster_id, positionId: 'DEMO-POS-SOUND', userIds: [], expectedUserIds: current(outside, 'DEMO-POS-SOUND') }), error => error.code === '42501')
  await assert.rejects(api.updateOccurrence(limited.occurrences[0].occurrence_id, { location: 'Lain' }), error => error.code === '42501')
  await assert.rejects(api.publishMonth(month.month_id, true), error => error.code === '42501')
  const own = limited.rosters[0]
  await assert.rejects(api.setPosition({ rosterId: own.roster_id, positionId: 'DEMO-POS-DRUM', userIds: ['DEMO-ALYA'], expectedUserIds: current(own, 'DEMO-POS-DRUM') }), error => error.code === '42501')
  await api.updatePart(own.roster_id, { team_name: 'Tim Lokal' })
  assert.equal((await api.getMonth(month.month_id)).parts.find(part => part.roster_id === own.roster_id).team_name, 'Tim Lokal')
})

test('Volunteer tidak membaca Draft, tidak mengisi nama, tetapi membaca jadwal Terbit', async () => {
  const { api, month, schedule } = await fixture()
  api.setProfile(demoProfiles.volunteer)
  assert.deepEqual(await api.listMonths('2026-10'), [])
  await assert.rejects(api.getMonth(month.month_id), error => error.code === '42501')
  await assert.rejects(api.updatePart(schedule.rosters[0].roster_id, { notes: 'Tidak boleh' }), error => error.code === '42501')
  api.setProfile(demoProfiles.admin)
  await api.publishMonth(month.month_id, true)
  api.setProfile(demoProfiles.volunteer)
  assert.equal((await api.getMonth(month.month_id)).rosters.length, 56)
  assert.deepEqual(await api.listManagedMinistries(), [])
})

test('beberapa nama atomik; data tidak tertimpa jika snapshot sudah berubah atau kandidat bentrok', async () => {
  const { api, month, schedule } = await fixture()
  const roster = schedule.rosters.find(item => item.ministry_id === 'DEMO-M0')
  const before = current(roster, 'DEMO-POS-SINGER')
  await assert.rejects(api.setPosition({ rosterId: roster.roster_id, positionId: 'DEMO-POS-SINGER', userIds: ['DEMO-REINA', 'DEMO-ALYA'], expectedUserIds: before }), error => error.code === '23P01')
  assert.deepEqual(current((await api.getMonth(month.month_id)).rosters.find(item => item.roster_id === roster.roster_id), 'DEMO-POS-SINGER'), before)
  await api.setPosition({ rosterId: roster.roster_id, positionId: 'DEMO-POS-SINGER', userIds: ['DEMO-NADIA'], expectedUserIds: before })
  await assert.rejects(api.setPosition({ rosterId: roster.roster_id, positionId: 'DEMO-POS-SINGER', userIds: ['DEMO-REINA'], expectedUserIds: before }), error => error.code === '40001')
  assert.deepEqual(current((await api.getMonth(month.month_id)).rosters.find(item => item.roster_id === roster.roster_id), 'DEMO-POS-SINGER'), ['DEMO-NADIA'])
})

test('jam berurutan bukan bentrok; jam bertumpuk dan rangkap satu kegiatan ditolak', async () => {
  const api = createServiceScheduleDemo({ seed: false })
  const monthId = await api.createMonth({ templateId: 'DEMO-TEMPLATE', month: '2026-10', dates: ['2026-10-04'] })
  let schedule = await api.getMonth(monthId)
  const kids = schedule.rosters.find(item => item.title === 'Ibadah Kids' && item.ministry_id === 'DEMO-M1')
  const pagi = schedule.rosters.find(item => item.title === 'Ibadah Pagi' && item.ministry_id === 'DEMO-M1')
  await api.setPosition({ rosterId: kids.roster_id, positionId: 'DEMO-POS-DRUM', userIds: ['DEMO-BIMA'], expectedUserIds: [] })
  await assert.rejects(api.setPosition({ rosterId: kids.roster_id, positionId: 'DEMO-POS-BASS', userIds: ['DEMO-BIMA'], expectedUserIds: [] }), error => error.code === '23P01')
  await api.setPosition({ rosterId: pagi.roster_id, positionId: 'DEMO-POS-DRUM', userIds: ['DEMO-BIMA'], expectedUserIds: [] })
  await api.setPosition({ rosterId: pagi.roster_id, positionId: 'DEMO-POS-DRUM', userIds: [], expectedUserIds: ['DEMO-BIMA'] })
  await api.updateOccurrence(pagi.occurrence_id, { start_time: '08:30' })
  await assert.rejects(api.setPosition({ rosterId: pagi.roster_id, positionId: 'DEMO-POS-DRUM', userIds: ['DEMO-BIMA'], expectedUserIds: [] }), error => error.code === '23P01' && /Ibadah Kids.*08:00-09:00/.test(error.message))
  const visibleConflicts = await api.findConflicts('DEMO-BIMA', pagi.roster_id)
  assert.equal(visibleConflicts[0].title, 'Ibadah Kids')
  await assert.rejects(api.updateOccurrence(kids.occurrence_id, { start_time: '07:30' }), /Kosongkan seluruh pelayan/)
  schedule = await api.getMonth(monthId)
  assert.equal(schedule.rosters.find(item => item.roster_id === pagi.roster_id).service_roster_slots.every(slot => slot.user_id === null), true)
})

test('lima Minggu, snapshot template, tanggal di luar bulan, dan bulan pengganti setelah dibatalkan', async () => {
  const { api, month } = await fixture()
  const novemberId = await api.createMonth({ templateId: 'DEMO-TEMPLATE', month: '2026-11', dates: ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'] })
  assert.equal((await api.getMonth(novemberId)).occurrences.length, 20)
  const template = (await api.listTemplates())[0]
  template.definition.sections[0].title = 'Nama Baru'
  await api.saveTemplate(template)
  assert.equal((await api.getMonth(month.month_id)).sections[0].title, 'Ibadah Kids')
  await assert.rejects(api.createMonth({ templateId: template.template_id, month: '2026-12', dates: ['2027-01-03'] }), /Tanggal harus berada/)
  await assert.rejects(api.createMonth({ templateId: template.template_id, month: '2026-12', dates: ['2026-12-06', '2026-12-06'] }), /berulang/)
  await api.publishMonth(month.month_id, true)
  await api.cancelMonth(month.month_id)
  const replacement = await api.createMonth({ templateId: template.template_id, month: '2026-10', dates: ['2026-10-04'] })
  assert.notEqual(replacement, month.month_id)
  assert.equal((await api.listMonths('2026-10')).length, 2)
})

test('sumber MH ada di Ministry; jabatan saja tidak otomatis memberi akses jadwal', async () => {
  const { api, month } = await fixture()
  const ministry = (await api.listMinistries()).find(item => item.ministry_id === 'DEMO-M1')
  assert.equal(ministry.head_user_id, demoProfiles.mh.user_id)
  assert.equal(ministry.head.name, demoProfiles.mh.name)
  assert.equal((await api.listManagers(ministry.ministry_id))[0].users.user_id, demoProfiles.mh.user_id)
  await assert.rejects(api.grantManager({ ministryId: ministry.ministry_id, userId: demoProfiles.volunteer.user_id, managerRole: 'Ministry Head' }), error => error.code === '42501')
  await api.revokeManager(ministry.ministry_id, demoProfiles.mh.user_id)
  api.setProfile(demoProfiles.mh)
  assert.deepEqual(await api.listManagedMinistries(), [])
  await assert.rejects(api.getMonth(month.month_id), error => error.code === '42501')
  api.setProfile(demoProfiles.admin)
  assert.equal((await api.listMinistries()).find(item => item.ministry_id === ministry.ministry_id).head_user_id, demoProfiles.mh.user_id)
  await api.grantManager({ ministryId: ministry.ministry_id, userId: demoProfiles.mh.user_id, managerRole: 'Ministry Head' })
  api.setProfile(demoProfiles.mh)
  assert.equal((await api.listManagedMinistries())[0].ministry_id, ministry.ministry_id)
  assert.equal(demoProfiles.mh.role, 'Volunteer')
})

test('penggantian MH mencabut grant lama dan tetap memerlukan persetujuan Admin untuk MH baru', async () => {
  const { api } = await fixture()
  await api.setMinistryHead('DEMO-M1', demoProfiles.volunteer.user_id)
  assert.deepEqual(await api.listManagedMinistries(demoProfiles.mh), [])
  assert.deepEqual(await api.listManagedMinistries(demoProfiles.volunteer), [])
  assert.deepEqual(await api.listManagers('DEMO-M1'), [])
  await assert.rejects(api.grantManager({ ministryId: 'DEMO-M1', userId: demoProfiles.mh.user_id, managerRole: 'Ministry Head' }), error => error.code === '42501')
  await api.grantManager({ ministryId: 'DEMO-M1', userId: demoProfiles.volunteer.user_id, managerRole: 'Ministry Head' })
  assert.equal((await api.listManagedMinistries(demoProfiles.volunteer))[0].manager_role, 'Ministry Head')
  await api.setMinistryHead('DEMO-M1', null)
  assert.deepEqual(await api.listManagedMinistries(demoProfiles.volunteer), [])
  assert.equal((await api.listMinistries()).find(item => item.ministry_id === 'DEMO-M1').head, null)
  api.reset()
  assert.equal((await api.listManagedMinistries(demoProfiles.mh))[0].manager_role, 'Ministry Head')
  assert.deepEqual(await api.listManagedMinistries(demoProfiles.volunteer), [])
})

test('Wakil berakses tetap terpisah dari sumber MH dan tidak naik role Admin', async () => {
  const { api, month } = await fixture()
  await api.grantManager({ ministryId: 'DEMO-M1', userId: 'DEMO-RAKA', managerRole: 'Wakil' })
  const wakil = (await api.searchActiveUsers('Raka'))[0]
  await api.setMinistryHead('DEMO-M1', demoProfiles.volunteer.user_id)
  api.setProfile(wakil)
  assert.equal((await api.listManagedMinistries())[0].manager_role, 'Wakil')
  assert.equal((await api.getMonth(month.month_id)).rosters.every(roster => roster.ministry_id === 'DEMO-M1'), true)
  for (const operation of [
    () => api.grantManager({ ministryId: 'DEMO-M1', userId: demoProfiles.mh.user_id, managerRole: 'Wakil' }),
    () => api.revokeManager('DEMO-M1', demoProfiles.mh.user_id),
    () => api.setMinistryHead('DEMO-M1', demoProfiles.mh.user_id),
    () => api.listManagers('DEMO-M1'),
    () => api.searchActiveUsers('Bima'),
    () => api.savePosition({ ministry_id: 'DEMO-M1', name: 'Piano' }),
    () => api.removePosition('DEMO-POS-DRUM'),
  ]) await assert.rejects(operation(), error => error.code === '42501')
  assert.deepEqual(await api.listManagedMinistries({ ...wakil, status: 'Nonaktif' }), [])
  assert.deepEqual(await api.listManagedMinistries({ ...wakil, role_secondary: 'Admin' }), [])
  api.setProfile(demoProfiles.admin)
  await api.revokeManager('DEMO-M1', wakil.user_id)
  assert.deepEqual(await api.listManagedMinistries(wakil), [])
  assert.equal(wakil.role, 'Volunteer')
})

test('katalog posisi dapat disimpan, diubah dan dinonaktifkan; fixture antar adapter terisolasi', async () => {
  const { api, month } = await fixture()
  const piano = await api.savePosition({ ministry_id: 'DEMO-M1', name: ' Piano ', default_slots: 2, sort_order: 16 })
  assert.equal(piano.name, 'Piano')
  assert.equal(piano.default_slots, 2)
  assert.equal(piano.ministries.name, 'Musik')
  await assert.rejects(api.savePosition({ ministry_id: 'DEMO-M1', name: 'Piano' }), error => error.code === '23505')
  await assert.rejects(api.savePosition({ ministry_id: 'DEMO-M1', name: 'Keyboard', default_slots: 21 }), /Kapasitas/)
  await assert.rejects(api.savePosition({ ...piano, ministry_id: 'DEMO-M0' }), /tidak dapat dipindahkan/)
  const updated = await api.savePosition({ ...piano, name: 'Keyboard', default_slots: 1 })
  assert.equal(updated.position_id, piano.position_id)
  const template = (await api.listTemplates())[0]
  template.definition.sections[0].parts.find(part => part.ministry_id === 'DEMO-M1').positions.push({ position_id: piano.position_id, capacity: 1 })
  await api.saveTemplate(template)
  const november = await api.createMonth({ templateId: template.template_id, month: '2026-11', dates: ['2026-11-01'] })
  assert.equal((await api.getMonth(november)).sections[0].positions.some(position => position.position_id === piano.position_id), true)
  assert.equal((await api.getMonth(month.month_id)).sections[0].positions.some(position => position.position_id === piano.position_id), false)
  await api.removePosition(piano.position_id)
  assert.equal((await api.listPositions()).find(position => position.position_id === piano.position_id).is_active, false)
  await assert.rejects(api.createMonth({ templateId: template.template_id, month: '2026-12', dates: ['2026-12-06'] }), /Posisi tidak sesuai/)
  assert.equal((await createServiceScheduleDemo().listPositions()).some(position => position.position_id === piano.position_id), false)
  api.reset()
  assert.equal((await api.listPositions()).some(position => position.position_id === piano.position_id), false)
})

test('nama posisi yang sudah dipakai bulan Terbit tidak dapat diubah', async () => {
  const { api, month } = await fixture()
  await api.publishMonth(month.month_id, true)
  const drum = (await api.listPositions()).find(position => position.position_id === 'DEMO-POS-DRUM')
  await assert.rejects(api.savePosition({ ...drum, name: 'Drum Baru' }), /roster Terbit/)
  assert.equal((await api.listPositions()).find(position => position.position_id === drum.position_id).name, 'Drum')
})

test('MH wajib role utama Volunteer; perubahan role menutup akses walaupun grant masih aktif', async () => {
  const { api, month } = await fixture()
  assert.equal((await api.listMinistries()).find(ministry => ministry.ministry_id === 'DEMO-M1').head.role, 'Volunteer')
  assert.equal((await api.listMinistries()).find(ministry => ministry.ministry_id === 'DEMO-M1').head.role_secondary, null)
  await assert.rejects(api.setMinistryHead('DEMO-M1', demoProfiles.admin.user_id), /role utama Volunteer/)
  await assert.rejects(api.grantManager({ ministryId: 'DEMO-M1', userId: demoProfiles.admin.user_id, managerRole: 'Ministry Head' }), error => error.code === '42501')
  for (const role of ['Jemaat', 'PKS']) {
    const formerHead = { ...demoProfiles.mh, role }
    assert.deepEqual(await api.listManagedMinistries(formerHead), [])
    api.setProfile(formerHead)
    await assert.rejects(api.getMonth(month.month_id), error => error.code === '42501')
  }
  api.setProfile(demoProfiles.admin)
  assert.equal((await api.listManagers('DEMO-M1'))[0].is_active, true)
  assert.equal((await api.listManagedMinistries(demoProfiles.mh))[0].manager_role, 'Ministry Head')
})

test('MH hanya dapat ditetapkan dari anggota Ministry; keanggotaan yang dilepas menutup jabatan dan akses', async () => {
  const { api, month } = await fixture()
  assert.equal((await api.listMembers('DEMO-M1')).some(member => member.user_id === demoProfiles.mh.user_id), true)
  await assert.rejects(api.setMinistryHead('DEMO-M0', demoProfiles.mh.user_id), /anggota aktif di Ministry ini/)

  await api.setUserMinistries(demoProfiles.mh.user_id, [])
  assert.equal((await api.listMinistries()).find(ministry => ministry.ministry_id === 'DEMO-M1').head_user_id, null)
  assert.deepEqual(await api.listManagers('DEMO-M1'), [])
  assert.deepEqual(await api.listManagedMinistries(demoProfiles.mh), [])
  await assert.rejects(api.setMinistryHead('DEMO-M1', demoProfiles.mh.user_id), /anggota aktif di Ministry ini/)

  await api.setUserMinistries(demoProfiles.mh.user_id, ['DEMO-M1'])
  assert.equal((await api.listMembers('DEMO-M1')).some(member => member.user_id === demoProfiles.mh.user_id), true)
  assert.equal((await api.listMinistries()).find(ministry => ministry.ministry_id === 'DEMO-M1').head_user_id, null)
  await api.setMinistryHead('DEMO-M1', demoProfiles.mh.user_id)
  assert.deepEqual(await api.listManagedMinistries(demoProfiles.mh), [])
  await api.grantManager({ ministryId: 'DEMO-M1', userId: demoProfiles.mh.user_id, managerRole: 'Ministry Head' })
  api.setProfile(demoProfiles.mh)
  assert.equal((await api.listManagedMinistries())[0].manager_role, 'Ministry Head')
  assert.equal((await api.getMonth(month.month_id)).rosters.every(roster => roster.ministry_id === 'DEMO-M1'), true)
})
