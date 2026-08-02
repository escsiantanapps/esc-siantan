// Helper cetak arsip ke PDF (via window.print bawaan, tanpa dependensi).
// Foto/dokumen TIDAK digabung ke PDF — hanya dicantumkan sebagai tautan
// terpisah agar tetap jelas & bisa dilihat dalam kualitas asli.

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ))
}

/**
 * @param {object} o
 * @param {string} o.title     Judul dokumen
 * @param {string} [o.heading] Nama utama (mis. nama calon baptis)
 * @param {Array<[string,string]>} [o.meta]  Pasangan label/nilai ringkas
 * @param {Array<{title?:string, rows?:Array<[string,string]>, text?:string}>} [o.sections]
 * @param {Array<{label:string, url:string}>} [o.documents] Lampiran (tautan terpisah)
 * @param {string} [o.footer]
 */
export function printArchive({ title, heading, meta = [], sections = [], documents = [], footer }) {
  const metaHtml = meta.length
    ? `<table class="meta">${meta.map(([k, v]) => `<tr><td>${esc(k)}</td><td>: ${esc(v)}</td></tr>`).join('')}</table>`
    : ''

  const sectionsHtml = sections.map(s => `
    ${s.title ? `<h2>${esc(s.title)}</h2>` : ''}
    ${s.rows?.length ? `<table class="data">${s.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v || '-')}</td></tr>`).join('')}</table>` : ''}
    ${s.tableData?.length ? `<table class="grid-table">
      ${s.tableHeaders?.length ? `<thead><tr>${s.tableHeaders.map(th => `<th>${esc(th)}</th>`).join('')}</tr></thead>` : ''}
      <tbody>${s.tableData.map(tr => `<tr>${tr.map(td => `<td>${esc(td)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>` : ''}
    ${s.text ? `<p class="para">${esc(s.text)}</p>` : ''}
  `).join('')

  const docsHtml = documents.length ? `
    <h2>Dokumen Terlampir (file terpisah)</h2>
    <ul class="docs">
      ${documents.map(d => `<li>${esc(d.label)} — <a href="${esc(d.url)}">${esc(d.url)}</a></li>`).join('')}
    </ul>
    <p class="note">Catatan: foto/dokumen (mis. KTP, akta) disimpan sebagai file gambar terpisah pada tautan di atas, tidak digabung ke dokumen ini agar tetap jelas.</p>
  ` : ''

  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1d22; margin: 32px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .sub { color: #6b7280; font-size: 12px; margin-bottom: 4px; }
  .heading { font-size: 15px; font-weight: 600; margin: 12px 0 10px; }
  h2 { font-size: 13px; margin: 16px 0 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; }
  .meta { width: 100%; border-collapse: collapse; margin: 6px 0 4px; font-size: 12px; }
  .meta td { padding: 2px 8px; }
  .meta td:first-child { color: #6b7280; width: 150px; }
  table.data { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.data th, table.data td { border: 1px solid #e5e7eb; padding: 5px 8px; text-align: left; vertical-align: top; }
  table.data th { background: #f3f4f6; width: 38%; font-weight: 600; }
  table.grid-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  table.grid-table th, table.grid-table td { border: 1px solid #e5e7eb; padding: 5px 8px; text-align: left; vertical-align: top; }
  table.grid-table th { background: #f3f4f6; font-weight: 600; }
  .para { font-size: 12px; white-space: pre-line; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px; }
  .docs { font-size: 12px; padding-left: 18px; }
  .docs a { color: #C62F14; word-break: break-all; }
  .note { font-size: 11px; color: #6b7280; }
  .foot { margin-top: 20px; font-size: 11px; color: #9ca3af; }
  @media print { body { margin: 12mm; } a { color: #C62F14; text-decoration: none; } }
</style></head><body>
  <h1>${esc(title)}</h1>
  <div class="sub">ESC Siantan</div>
  ${heading ? `<div class="heading">${esc(heading)}</div>` : ''}
  ${metaHtml}
  ${sectionsHtml}
  ${docsHtml}
  <div class="foot">${esc(footer || '')}</div>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 350)
}
