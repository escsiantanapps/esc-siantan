import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CheckCircle2, Clock, XCircle, Printer } from 'lucide-react'
import { tasksService } from '@/services/tasksService'
import { usersService } from '@/services/usersService'
import { evaluationService } from '@/services/evaluationService'
import { useLang } from '@/hooks/useLang'
import { Card, PageHeader, Button, Spinner, EmptyState, Input, Select, StatusBadge, Avatar, Badge } from '@/components/ui'
import { formatDate } from '@/lib/utils'

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

function toISODate(d) {
  return d.toISOString().slice(0, 10)
}

function startOfMonthISO() {
  const d = new Date()
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1))
}

export default function AdminEvaluationPage() {
  const { t, lang } = useLang()
  const [templates, setTemplates] = useState([])
  const [ministries, setMinistries] = useState([])
  const [komselList, setKomselList] = useState([])
  const [startDate, setStartDate] = useState(startOfMonthISO())
  const [endDate, setEndDate] = useState(toISODate(new Date()))
  const [formId, setFormId] = useState('')
  const [ministryId, setMinistryId] = useState('')
  const [komselId, setKomselId] = useState('')
  const [role, setRole] = useState('')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMeta, setLoadingMeta] = useState(true)

  useEffect(() => {
    Promise.all([
      tasksService.getTemplates(),
      usersService.getAllMinistries(),
      usersService.getAllKomsel(),
    ]).then(([tmpls, mins, komsel]) => {
      setTemplates(tmpls)
      setMinistries(mins)
      setKomselList(komsel)
    }).catch(() => {}).finally(() => setLoadingMeta(false))
  }, [])

  useEffect(() => {
    if (loadingMeta) { setLoading(false); return }
    setLoading(true)
    evaluationService.getEvaluation({ startDate, endDate, formId, ministryId, komselId, role })
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [loadingMeta, formId, startDate, endDate, ministryId, komselId, role])

  const ministryMap = useMemo(() => Object.fromEntries(ministries.map(m => [m.ministry_id, m.name])), [ministries])
  const komselMap = useMemo(() => Object.fromEntries(komselList.map(k => [k.komsel_id, k.name])), [komselList])

  const filteredRows = useMemo(() => {
    if (!search) return rows
    const q = search.toLowerCase()
    return rows.filter(r => r.user.name.toLowerCase().includes(q))
  }, [rows, search])

  const summary = useMemo(() => ({
    TERPENUHI: filteredRows.filter(r => r.status === 'TERPENUHI').length,
    PROSES: filteredRows.filter(r => r.status === 'PROSES').length,
    KOSONG: filteredRows.filter(r => r.status === 'KOSONG').length,
  }), [filteredRows])

  function printReport() {
    const tmplTitle = formId ? (templates.find(tm => tm.form_id === formId)?.title || '-') : 'Semua Form'
    const periode = `${formatDate(startDate)} – ${formatDate(endDate)}`
    const statusLabel = { TERPENUHI: t('aev.fulfilled'), PROSES: t('aev.inProgress'), KOSONG: t('aev.empty') }
    const meta = [
      [t('aev.repTask'), tmplTitle],
      [t('aev.repPeriod'), periode],
      [t('aev.role'), role || t('aev.repAll')],
      [t('aev.ministry'), ministryId ? (ministryMap[ministryId] || '-') : t('aev.repAll')],
      [t('aev.komsel'), komselId ? (komselMap[komselId] || '-') : t('aev.repAll')],
    ]

    const rowsHtml = filteredRows.map((r, i) => {
      const tags = [
        ...(r.user.ministry_ids || []).map(id => ministryMap[id]).filter(Boolean),
        r.user.komsel_id ? komselMap[r.user.komsel_id] : null,
      ].filter(Boolean).join(', ')
      return `<tr>
        <td class="c">${i + 1}</td>
        <td>${esc(r.user.name)}</td>
        <td>${esc(tags || '-')}</td>
        <td class="c">${esc(r.filled)}/${esc(r.target)}</td>
        <td class="c">${esc(r.minLulus)}</td>
        <td class="c status-${esc(r.status)}">${esc(statusLabel[r.status] || r.status)}</td>
      </tr>`
    }).join('')

    const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<title>${esc(t('aev.repTitle'))} — ${esc(tmplTitle)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1d22; margin: 32px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .sub { color: #6b7280; font-size: 12px; margin-bottom: 16px; }
  .meta { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; }
  .meta td { padding: 3px 8px; }
  .meta td:first-child { color: #6b7280; width: 130px; }
  .summary { display: flex; gap: 10px; margin-bottom: 16px; }
  .summary div { flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; text-align: center; }
  .summary b { display: block; font-size: 22px; }
  table.data { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.data th, table.data td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
  table.data th { background: #f3f4f6; }
  td.c { text-align: center; }
  .status-TERPENUHI { color: #059669; font-weight: 600; }
  .status-PROSES { color: #d97706; font-weight: 600; }
  .status-KOSONG { color: #dc2626; font-weight: 600; }
  .foot { margin-top: 20px; font-size: 11px; color: #9ca3af; }
  @media print { body { margin: 12mm; } }
</style></head><body>
  <h1>${esc(t('aev.repTitle'))}</h1>
  <div class="sub">ESC Siantan</div>
  <table class="meta">${meta.map(([k, v]) => `<tr><td>${esc(k)}</td><td>: ${esc(v)}</td></tr>`).join('')}</table>
  <div class="summary">
    <div style="color:#059669"><b>${summary.TERPENUHI}</b>${esc(t('aev.fulfilled'))}</div>
    <div style="color:#d97706"><b>${summary.PROSES}</b>${esc(t('aev.inProgress'))}</div>
    <div style="color:#dc2626"><b>${summary.KOSONG}</b>${esc(t('aev.empty'))}</div>
  </div>
  <table class="data">
    <thead><tr><th>#</th><th>${esc(t('aev.repName'))}</th><th>${esc(t('aev.repMinKom'))}</th><th>${esc(t('aev.repFilledTarget'))}</th><th>${esc(t('aev.repMin'))}</th><th>${esc(t('aev.repStatus'))}</th></tr></thead>
    <tbody>${rowsHtml || `<tr><td colspan="6" class="c">${esc(t('aev.repNoData'))}</td></tr>`}</tbody>
  </table>
  <div class="foot">${esc(t('aev.repPrinted', { date: formatDate(new Date(), 'd MMMM yyyy, HH:mm'), n: filteredRows.length }))}</div>
</body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    // Beri waktu render sebelum dialog cetak muncul.
    setTimeout(() => w.print(), 350)
  }

  const canPrint = !loading && !loadingMeta && templates.length > 0

  return (
    <div>
      <PageHeader
        title={t('aev.title')}
        subtitle={t('aev.subtitle')}
        action={
          <Button size="sm" variant="outline" disabled={!canPrint} onClick={printReport}>
            <Printer size={15} /> {t('aev.print')}
          </Button>
        }
      />

      {/* Filter section */}
      <Card className="p-4 mb-4 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Input type="date" label={t('aev.startDate')} value={startDate} onChange={e => setStartDate(e.target.value)} />
          <Input type="date" label={t('aev.endDate')} value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Select label={t('aev.form')} value={formId} onChange={e => setFormId(e.target.value)}>
            <option value="">Semua Form</option>
            {templates.map(tm => <option key={tm.form_id} value={tm.form_id}>{tm.title}</option>)}
          </Select>
          <Select label={t('aev.role')} value={role} onChange={e => setRole(e.target.value)}>
            <option value="">{t('aev.allRoles')}</option>
            {['Volunteer', 'Jemaat', 'PKS'].map(r => <option key={r} value={r}>{r}</option>)}
          </Select>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Select label={t('aev.ministry')} value={ministryId} onChange={e => setMinistryId(e.target.value)}>
            <option value="">{t('aev.allMinistry')}</option>
            {ministries.map(m => <option key={m.ministry_id} value={m.ministry_id}>{m.name}</option>)}
          </Select>
          <Select label={t('aev.komsel')} value={komselId} onChange={e => setKomselId(e.target.value)}>
            <option value="">{t('aev.allKomsel')}</option>
            {komselList.map(k => <option key={k.komsel_id} value={k.komsel_id}>{k.name}</option>)}
          </Select>
          <Input label={t('aev.searchName')} placeholder={t('aev.searchPh')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </Card>

      {(loading || loadingMeta) && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && !loadingMeta && templates.length === 0 && (
        <EmptyState icon={BarChart3} title={t('aev.noFormTitle')} description={t('aev.noFormDesc')} />
      )}

      {!loading && !loadingMeta && templates.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Card className="p-4 text-center">
              <div className="w-9 h-9 mx-auto rounded-xl bg-green-50 flex items-center justify-center mb-2">
                <CheckCircle2 size={18} className="text-green-500" />
              </div>
              <p className="text-2xl font-bold text-green-600">{summary.TERPENUHI}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t('aev.fulfilled')}</p>
            </Card>
            <Card className="p-4 text-center">
              <div className="w-9 h-9 mx-auto rounded-xl bg-amber-50 flex items-center justify-center mb-2">
                <Clock size={18} className="text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-amber-600">{summary.PROSES}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t('aev.inProgress')}</p>
            </Card>
            <Card className="p-4 text-center">
              <div className="w-9 h-9 mx-auto rounded-xl bg-red-50 flex items-center justify-center mb-2">
                <XCircle size={18} className="text-red-500" />
              </div>
              <p className="text-2xl font-bold text-red-600">{summary.KOSONG}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t('aev.empty')}</p>
            </Card>
          </div>

          {/* Table */}
          {filteredRows.length === 0 ? (
            <EmptyState icon={BarChart3} title={t('aev.noData')} description={t('aev.noDataDesc')} />
          ) : (
            <Card className="divide-y divide-gray-100">
              {filteredRows.map(r => (
                <div key={`${r.user.user_id}-${r.form?.form_id}`} className="flex items-center gap-3 p-3.5">
                  <Avatar name={r.user.name} src={r.user.photo_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{r.user.name}</p>
                    {!formId && r.form && (
                      <p className="text-[10px] font-semibold text-brand-500 truncate">{r.form.title}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {(r.user.ministry_ids || []).slice(0, 2).map(id => (
                        ministryMap[id] && <Badge key={id} color="gray" className="text-[10px]! py-0!">{ministryMap[id]}</Badge>
                      ))}
                      {r.user.komsel_id && komselMap[r.user.komsel_id] && (
                        <Badge color="blue" className="text-[10px]! py-0!">{komselMap[r.user.komsel_id]}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{r.filled}/{r.target}</p>
                    <p className="text-[10px] text-gray-400">{t('aev.min')} {r.minLulus}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  )
}
