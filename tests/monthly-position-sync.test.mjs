import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServiceScheduleDemo } from '../src/dev/serviceScheduleDemo.js'
import { buildDraftPositionSync } from '../src/lib/monthlyPositionSync.js'

test('Edit Jadwal lokal menjaga penugasan pada posisi yang tetap cocok', async () => {
  const api = createServiceScheduleDemo({ seed: false })
  const id = await api.createMonthDirect({ month: '2026-10', entries: [{
    section_id: 'pagi', service_date: '2026-10-04', title: 'Ibadah Pagi',
    source_type: 'Ibadah', start_time: '09:00', end_time: '10:00',
    ministry_ids: ['DEMO-M1'],
  }] })
  let month = await api.getMonth(id)
  const roster = month.rosters[0]
  await api.setPosition({ rosterId: roster.roster_id, positionId: 'DEMO-POS-DRUM',
    userIds: ['DEMO-BIMA'], expectedUserIds: [] })
  const existing = (await api.listPositions()).find(item => item.position_id === 'DEMO-POS-DRUM')
  await api.savePosition({ ...existing, default_slots: 2 })
  await api.savePosition({ ministry_id: 'DEMO-M1', name: 'Keyboard', default_slots: 1, sort_order: 8 })
  month = await api.getMonth(id)
  const preview = buildDraftPositionSync(month, await api.listPositions())
  assert.equal(preview.changes.length, 1)
  assert.equal(preview.blockedCount, 0)
  await api.syncDraftPositions(id, month.month.version, preview.catalog)
  const edited = await api.getMonth(id)
  assert.equal(edited.month.version, 1)
  assert.equal(edited.rosters[0].service_roster_slots.filter(slot => slot.user_id === 'DEMO-BIMA').length, 1)
  assert.equal(edited.rosters[0].service_roster_slots.filter(slot => slot.position_id === 'DEMO-POS-DRUM').length, 2)
  assert.equal(edited.sections[0].parts[0].positions.some(item => item.name === 'Keyboard'), true)
  await assert.rejects(api.syncDraftPositions(id, 0, preview.catalog), /schedule_stale/)
  await api.removePosition('DEMO-POS-DRUM')
  const blocked = buildDraftPositionSync(await api.getMonth(id), await api.listPositions())
  assert.equal(blocked.blockedCount, 1)
  await assert.rejects(api.syncDraftPositions(id, 1, blocked.catalog), /schedule_position_assigned/)
  assert.equal((await api.getMonth(id)).month.version, 1)
})

test('Edit Jadwal lokal memindahkan pelayan posisi lama secara atomik', async () => {
  const api = createServiceScheduleDemo({ seed: false })
  const id = await api.createMonthDirect({ month: '2026-10', entries: [{
    section_id: 'pagi', service_date: '2026-10-04', title: 'Ibadah Pagi',
    source_type: 'Ibadah', start_time: '09:00', end_time: '10:00',
    ministry_ids: ['DEMO-M1'],
  }] })
  const roster = (await api.getMonth(id)).rosters[0]
  await api.setPosition({ rosterId: roster.roster_id, positionId: 'DEMO-POS-DRUM',
    userIds: ['DEMO-BIMA'], expectedUserIds: [] })
  await api.setPosition({ rosterId: roster.roster_id, positionId: 'DEMO-POS-BASS',
    userIds: ['DEMO-RAKA'], expectedUserIds: [] })
  await api.removePosition('DEMO-POS-DRUM')
  const keyboard = await api.savePosition({ ministry_id: 'DEMO-M1', name: 'Keyboard',
    default_slots: 1, sort_order: 8 })
  const before = await api.getMonth(id)
  const preview = buildDraftPositionSync(before, await api.listPositions())
  assert.equal(preview.changes[0].affected.length, 1)
  const person = preview.changes[0].affected[0]
  assert.equal(person.userName, 'Bima')
  await assert.rejects(api.reassignAndSyncDraftPositions(id, 0, preview.catalog, [{
    slot_id: person.slotId, user_id: person.userId, position_id: 'DEMO-POS-BASS',
  }]), /kapasitas|berulang/)
  assert.deepEqual(await api.getMonth(id), before)
  await api.reassignAndSyncDraftPositions(id, 0, preview.catalog, [{
    slot_id: person.slotId, user_id: person.userId, position_id: keyboard.position_id,
  }])
  const after = await api.getMonth(id)
  assert.equal(after.month.version, 1)
  assert.equal(after.rosters[0].service_roster_slots.some(slot => slot.position_id === keyboard.position_id
    && slot.user_id === 'DEMO-BIMA'), true)
  assert.equal(after.rosters[0].service_roster_slots.some(slot => slot.position_id === 'DEMO-POS-BASS'
    && slot.user_id === 'DEMO-RAKA'), true)
  assert.equal(after.rosters[0].service_roster_slots.some(slot => slot.position_id === 'DEMO-POS-DRUM'), false)
})
