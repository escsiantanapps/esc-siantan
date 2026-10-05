import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildScheduleMatrix, buildMonthlySchedulePrintDocument, formatScheduleDate,
  formatScheduleMonth, formatScheduleTime, getMonthDates, getScheduleDates,
  prepareMonthlySchedulePrint, scheduleMonthDate, shiftScheduleMonth,
} from '../src/lib/serviceScheduleMatrix.js'

const musicPosition = { position_id: 'P-DRUM', name: 'Drum', ministry_id: 'M-MUSIC', ministry_name: 'Musik', slots: 2, sort_order: 1 }
const mediaPosition = { position_id: 'P-SOUND', name: 'Sound', ministry_id: 'M-MEDIA', ministry_name: 'Multimedia', slots: 1, sort_order: 2 }
function fixture() {
  return {
    month: { month_id: 'MONTH', month_date: '2026-10-01', status: 'Draft' },
    sections: [{ key: 'KIDS', title: 'Ibadah Kids', source_type: 'Ibadah', positions: [mediaPosition, musicPosition] }],
    occurrences: [
      { occurrence_id: 'O-4', section_id: 'KIDS', service_date: '2026-10-04', start_time: '07:00:00', end_time: '08:30:00', pic: 'Kak Elin', location: 'Lt 1', dress_code: 'Batik', notes: 'Bawa alat' },
      { occurrence_id: 'O-11', section_id: 'KIDS', service_date: '2026-10-11', start_time: '07:00:00', end_time: '08:30:00' },
    ],
    parts: [{ occurrence_id: 'O-4', ministry_id: 'M-MUSIC', roster_id: 'R-4', team_name: 'Tim 1', material: 'Buah Roh', notes: 'Latihan' }],
    rosters: [{ roster_id: 'R-4', ministry_id: 'M-MUSIC', service_roster_slots: [
      { slot_id: 'S-2', slot_no: 2, position_id: 'P-DRUM', user_id: 'U-2', users: { name: 'Nico' } },
      { slot_id: 'S-1', slot_no: 1, position_id: 'P-DRUM', user_id: 'U-1', users: { name: 'Bima' } },
      { slot_id: 'S-OTHER', slot_no: 1, position_id: 'P-OTHER', user_id: 'U-3', users: { name: 'Tidak relevan' } },
    ] }],
  }
}

test('Tanggal Minggu dan bulan menggunakan DATE UTC, termasuk empat/lima Minggu', () => {
  assert.deepEqual(getMonthDates('2026-10-01'), ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'])
  assert.deepEqual(getMonthDates('2026-11'), ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'])
  assert.equal(scheduleMonthDate({ month_date: '2026-10-01' }), '2026-10-01')
  assert.equal(shiftScheduleMonth('2026-12-01', 1), '2027-01-01')
  assert.equal(shiftScheduleMonth('2026-01-01', -1), '2025-12-01')
  assert.deepEqual(getMonthDates('2026-13'), [])
  assert.equal(shiftScheduleMonth('not-a-month', 1), null)
})

test('Kolom mengikuti tanggal kegiatan nyata, termasuk kelas hari lain dan tanpa duplikat', () => {
  const schedule = fixture()
  schedule.occurrences.push({ occurrence_id: 'O-WED', section_id: 'CLASS', service_date: '2026-10-07' })
  schedule.occurrences.push({ occurrence_id: 'O-DUP', section_id: 'PAGI', service_date: '2026-10-04' })
  schedule.occurrences.push({ occurrence_id: 'O-INVALID', section_id: 'KIDS', service_date: '2026-10-32' })
  schedule.occurrences.push({ occurrence_id: 'O-OUTSIDE', section_id: 'KIDS', service_date: '2026-11-01' })
  assert.deepEqual(getScheduleDates(schedule), ['2026-10-04', '2026-10-07', '2026-10-11'])
  assert.equal(getScheduleDates({ month: { month_date: '2026-11-01' }, occurrences: [] }).length, 5)
})

test('Matrix menggabungkan beberapa pelayan sesuai posisi, tidak mencampur slot posisi lain', () => {
  const schedule = fixture()
  const matrix = buildScheduleMatrix(schedule)
  const cell = matrix.getCell(schedule.occurrences[0], musicPosition)
  assert.deepEqual(cell.assigned.map(slot => slot.users.name), ['Bima', 'Nico'])
  assert.equal(cell.capacity, 2)
  assert.equal(cell.filled, 2)
  assert.equal(cell.hidden, false)
  assert.equal(cell.roster.roster_id, 'R-4')
  assert.equal(matrix.sections[0].ministries[0].ministry_id, 'M-MUSIC')
  assert.equal(matrix.sections[0].occurrencesByDate.get('2026-10-04').occurrence_id, 'O-4')
})

test('Draft yang disensor tidak dihitung kosong; kegiatan yang tidak ada berbeda dari bagian terkunci', () => {
  const schedule = fixture()
  const matrix = buildScheduleMatrix(schedule)
  assert.equal(matrix.getCell(schedule.occurrences[0], mediaPosition).hidden, true)
  assert.equal(matrix.getCell(null, mediaPosition).hidden, false)
  assert.equal(matrix.getCell(null, mediaPosition).occurrence, null)
  assert.deepEqual(matrix.stats, { assigned: 2, capacity: 2, empty: 0, hidden: 4 })
  schedule.month.status = 'Terbit'
  assert.equal(buildScheduleMatrix(schedule).getCell(schedule.occurrences[0], mediaPosition).hidden, false)
})

test('Partisipasi Ministry per kegiatan dan tanggal membedakan tidak dijadwalkan dari Draft tersensor', () => {
  const schedule = fixture()
  schedule.sections[0].participation = {
    '2026-10-04': ['M-MUSIC'],
    '2026-10-11': ['M-MEDIA'],
  }
  const matrix = buildScheduleMatrix(schedule)
  assert.equal(matrix.isParticipating(schedule.occurrences[0], 'M-MUSIC'), true)
  assert.equal(matrix.isParticipating(schedule.occurrences[0], 'M-MEDIA'), false)
  assert.equal(matrix.getCell(schedule.occurrences[0], mediaPosition).occurrence, null)
  assert.equal(matrix.getCell(schedule.occurrences[0], mediaPosition).hidden, false)
  assert.equal(matrix.getCell(schedule.occurrences[1], musicPosition).occurrence, null)
  assert.equal(matrix.getCell(schedule.occurrences[1], mediaPosition).hidden, true)
  assert.deepEqual(matrix.stats, { assigned: 2, capacity: 2, empty: 0, hidden: 1 })

  schedule.sections.push({ key: 'PAGI', title: 'Ibadah Pagi', positions: [musicPosition], participation: { '2026-10-04': [] } })
  schedule.occurrences.push({ occurrence_id: 'O-PAGI', section_id: 'PAGI', service_date: '2026-10-04' })
  assert.equal(buildScheduleMatrix(schedule).getCell(schedule.occurrences[2], musicPosition).occurrence, null)
})

test('Bagian aktual tetap muncul ketika tanggal kegiatan dipindah setelah Draft dibuat', () => {
  const schedule = fixture()
  schedule.sections[0].participation = { '2026-10-04': ['M-MUSIC'] }
  schedule.occurrences[0].service_date = '2026-10-18'
  const matrix = buildScheduleMatrix(schedule)
  assert.equal(matrix.isParticipating(schedule.occurrences[0], 'M-MUSIC'), true)
  assert.equal(matrix.getCell(schedule.occurrences[0], musicPosition).roster.roster_id, 'R-4')
  assert.equal(matrix.sections[0].occurrencesByDate.get('2026-10-18').occurrence_id, 'O-4')
})

test('Filter bagian dan kegiatan tidak memperlebar data yang ditampilkan', () => {
  const schedule = fixture()
  const own = buildScheduleMatrix(schedule, { ministryFilter: 'M-MUSIC', activityFilter: 'KIDS' })
  assert.equal(own.sections[0].ministries.length, 1)
  assert.equal(own.sections[0].ministries[0].ministry_id, 'M-MUSIC')
  assert.equal(buildScheduleMatrix(schedule, { activityFilter: 'UNKNOWN' }).sections.length, 0)
  assert.equal(buildScheduleMatrix(schedule, { ministryFilter: 'UNKNOWN' }).sections.length, 0)
})

test('Format tanggal/jam tidak berpindah hari pada zona waktu perangkat', () => {
  assert.equal(formatScheduleDate('2026-10-04', 'en'), '4 Oct')
  assert.equal(formatScheduleDate('2026-02-30', 'en'), '-')
  assert.equal(formatScheduleMonth('2026-10-01', 'en'), 'October 2026')
  assert.equal(formatScheduleTime('07:00:00', '08:30:00'), '07:00 - 08:30')
  assert.equal(formatScheduleTime('07:00:00', null), '-')
})

test('PDF bulanan merender bagian, metadata, jam, dan beberapa nama serta menandai Draft', () => {
  const html = buildMonthlySchedulePrintDocument(fixture(), { t: (key, params) => key === 'schedMonth.emptyCount' ? `${params.count} kosong` : key, locale: 'en' })
  assert.match(html, /A3 landscape/)
  assert.match(html, /October 2026/)
  assert.match(html, /schedMonth.draft/)
  assert.match(html, /07:00 - 08:30/)
  assert.match(html, /Bima<br>Nico/)
  assert.doesNotMatch(html, /Tim 1|Buah Roh|Latihan|schedMonth\.team|schedMonth\.material/)
  assert.match(html, /Batik/)
  assert.match(html, /schedMonth.restricted/)
  assert.match(html, /<table class="activity-group">/)
  assert.match(html, /<thead>[\s\S]*<tr class="activity">[\s\S]*<\/thead>/)
  assert.doesNotMatch(html, /Tidak relevan/)
})

test('PDF meng-escape teks yang berasal dari database dan mematuhi filter bagian', () => {
  const schedule = fixture()
  schedule.sections[0].title = '<img src=x onerror=alert(1)>'
  schedule.parts[0].material = 'legacy-material-secret'
  schedule.occurrences[0].notes = '<script>alert(2)</script>'
  schedule.rosters[0].service_roster_slots[1].users.name = 'A & B <C>'
  const html = buildMonthlySchedulePrintDocument(schedule, { t: key => key, ministryFilter: 'M-MUSIC' })
  assert.doesNotMatch(html, /legacy-material-secret/)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.match(html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/)
  assert.match(html, /A &amp; B &lt;C&gt;/)
  assert.doesNotMatch(html, /<script>/)
  assert.doesNotMatch(html, /Multimedia/)
})

test('PDF tidak mencetak slot kosong atau pembatasan pada Ministry yang tidak ikut tanggal tersebut', () => {
  const schedule = fixture()
  schedule.sections[0].participation = {
    '2026-10-04': ['M-MUSIC'],
    '2026-10-11': ['M-MEDIA'],
  }
  const html = buildMonthlySchedulePrintDocument(schedule, {
    t: (key, params) => key === 'schedMonth.emptyCount' ? `${params.count} kosong` : key,
  })
  const mediaRow = html.match(/<tr><th scope="row">Sound<\/th>([\s\S]*?)<\/tr>/)?.[1]
  const musicRow = html.match(/<tr><th scope="row">Drum<\/th>([\s\S]*?)<\/tr>/)?.[1]
  assert.match(mediaRow, /^<td>-<\/td><td>schedMonth\.restricted<\/td>$/)
  assert.match(musicRow, /^<td>Bima<br>Nico<\/td><td>-<\/td>$/)
})

test('Setiap kegiatan PDF memiliki tanggal, konteks kegiatan dan lebar kolom yang sama', () => {
  const schedule = fixture()
  schedule.sections.push({ ...schedule.sections[0], key: 'PAGI', title: 'Ibadah Pagi' })
  const html = buildMonthlySchedulePrintDocument(schedule)
  const tables = html.match(/<table class="activity-group">[\s\S]*?<\/table>/g)
  assert.equal(tables.length, 2)
  const columns = tables.map(table => table.match(/<colgroup>[\s\S]*?<\/colgroup>/)[0])
  assert.equal(columns[0], columns[1])
  for (const [index, table] of tables.entries()) {
    const header = table.match(/<thead>[\s\S]*?<\/thead>/)[0]
    assert.ok(header.includes(schedule.sections[index].title))
    assert.match(header, /4 Okt/)
    assert.match(header, /11 Okt/)
  }
})

test('Kegiatan lebih tinggi dari halaman boleh terpotong tanpa memaksa halaman judul kosong', () => {
  const changes = []
  const makeTable = height => ({
    getBoundingClientRect: () => ({ height }),
    classList: { toggle: (name, enabled) => changes.push({ name, enabled }) },
  })
  let removed = false
  const body = { style: { width: '' }, appendChild: () => {} }
  const document = {
    body,
    createElement: () => ({ style: {}, getBoundingClientRect: () => ({ height: 1047 }), remove: () => { removed = true } }),
    querySelectorAll: () => [makeTable(550), makeTable(2400)],
  }
  prepareMonthlySchedulePrint(document)
  assert.deepEqual(changes, [
    { name: 'activity-group-long', enabled: false },
    { name: 'activity-group-long', enabled: true },
  ])
  assert.equal(body.style.width, '')
  assert.equal(removed, true)
})
