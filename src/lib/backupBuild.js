// Builder file backup BERSAMA — dipakai halaman in-app (browser, download Blob)
// & skrip lokal (node, tulis ke disk). Keduanya cukup panggil dua fungsi ini
// lalu urus output masing-masing. exceljs jalan di browser DAN node.
import ExcelJS from 'exceljs'
import { BACKUP_TABLES } from './backupTables.js'

// Nama sheet Excel dibatasi 31 char & tak boleh karakter \ / ? * [ ] :
function safeSheetName(name) {
  return name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)
}

// Nilai sel ramah-baca: object/array -> JSON, null -> '', selain itu apa adanya.
// Timestamp/tanggal ISO dibiarkan string (ExcelJS auto-format Date kalau tipe Date;
// data dari Supabase berupa string ISO — dibiarkan agar tak salah zona waktu).
function cellValue(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}

function addSheet(wb, name, rows) {
  const ws = wb.addWorksheet(safeSheetName(name))
  if (!rows.length) {
    ws.addRow(['(Tidak ada data)'])
    return 0
  }
  const keys = Object.keys(rows[0])
  const hr = ws.addRow(keys)
  hr.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4511E' } }
    cell.alignment = { vertical: 'middle' }
  })
  for (const row of rows) {
    ws.addRow(keys.map(k => cellValue(row[k])))
  }
  // Rapi: freeze baris header + autofilter + lebar kolom pintar (sampel 50 baris).
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: keys.length } }
  keys.forEach((k, i) => {
    let max = k.length
    for (let r = 0; r < Math.min(rows.length, 50); r++) {
      const len = String(cellValue(rows[r][k])).length
      if (len > max) max = len
    }
    ws.getColumn(i + 1).width = Math.min(Math.max(max + 2, 10), 45)
  })
  return rows.length
}

// dataByTable: { [table]: rows[] }. Kembalikan ExcelJS Workbook siap ditulis.
// errorsByTable (opsional): { [table]: 'pesan' } untuk tabel yang gagal ditarik.
export function buildBackupWorkbook(dataByTable, errorsByTable = {}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ESC Siantan'
  wb.created = new Date()

  // Sheet Ringkasan di depan: tanggal + tiap tabel & jumlah baris/keterangan error.
  const sum = wb.addWorksheet('Ringkasan')
  sum.addRow(['Backup ESC Siantan'])
  sum.getRow(1).font = { bold: true, size: 14 }
  sum.addRow(['Dibuat', new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })])
  sum.addRow([])
  const head = sum.addRow(['Tabel', 'Sheet', 'Baris / Status'])
  head.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4511E' } } })

  for (const { table, sheet } of BACKUP_TABLES) {
    if (errorsByTable[table]) {
      sum.addRow([table, sheet, `ERROR: ${errorsByTable[table]}`])
      const ws = wb.addWorksheet(safeSheetName(sheet))
      ws.addRow([`ERROR: ${errorsByTable[table]}`])
    } else {
      const rows = dataByTable[table] || []
      const n = addSheet(wb, sheet, rows)
      sum.addRow([table, sheet, n])
    }
  }
  sum.getColumn(1).width = 30
  sum.getColumn(2).width = 24
  sum.getColumn(3).width = 24
  return wb
}

// Objek JSON fidelitas penuh (restorable). Tabel gagal ditandai di meta.errors.
export function buildBackupJson(dataByTable, errorsByTable = {}) {
  const tables = {}
  let totalRows = 0
  for (const { table } of BACKUP_TABLES) {
    if (errorsByTable[table]) continue
    const rows = dataByTable[table] || []
    tables[table] = rows
    totalRows += rows.length
  }
  return {
    meta: {
      app: 'ESC Siantan',
      generatedAt: new Date().toISOString(),
      tableCount: Object.keys(tables).length,
      totalRows,
      errors: errorsByTable,
    },
    tables,
  }
}
