import ExcelJS from 'exceljs'

// Bangun & unduh file .xlsx dengan blok judul (opsional) di atas tabel data.
// titleLines: baris-baris judul/periode sebelum tabel (baris pertama dibuat lebih besar).
// headers: array nama kolom. rows: array-of-array data (urutan harus sesuai headers).
export async function downloadXlsx({ filename, titleLines = [], headers, rows, sheetName = 'Sheet1' }) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName)

  titleLines.forEach((line, i) => {
    const row = ws.addRow([line])
    row.font = { bold: true, size: i === 0 ? 14 : 11 }
  })
  if (titleLines.length) ws.addRow([])

  const headerRow = ws.addRow(headers)
  headerRow.eachCell(cell => {
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F8FF' } }
  })

  rows.forEach(r => ws.addRow(r))

  // Lebar kolom kasar berdasarkan isi terpanjang (header atau data) per kolom.
  headers.forEach((h, i) => {
    let max = String(h ?? '').length
    for (const r of rows) {
      const len = String(r[i] ?? '').length
      if (len > max) max = len
    }
    ws.getColumn(i + 1).width = Math.min(max + 2, 40)
  })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
