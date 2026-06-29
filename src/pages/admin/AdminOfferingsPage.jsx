import { useEffect, useMemo, useState } from 'react'
import { HandCoins, Plus, Pencil, Trash2, X, Printer, FileSpreadsheet, Check, Building2, QrCode } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { offeringsService, OFFERING_CATEGORIES } from '@/services/offeringsService'
import { komselOfferingsService } from '@/services/contentService'
import { useBackClose } from '@/hooks/useBackClose'
import { Card, PageHeader, Button, Input, Select, Spinner, EmptyState, StatusBadge, Avatar, Badge } from '@/components/ui'
import Uploader from '@/components/Uploader'
import { formatDate, formatPhone, formatRupiah, validateUpload, compressImage } from '@/lib/utils'
import { printArchive } from '@/lib/printDoc'
import { downloadXlsx } from '@/lib/exportXlsx'

const emptyAcc = { kind: 'bank', label: '', account_no: '', account_name: '', image_url: '', sort: 0 }

export default function AdminOfferingsPage() {
  const { profile } = useAuth()
  const { toast, confirm } = useToast()
  const { t } = useLang()
  const [tab, setTab] = useState('rekap')

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')

  const [accounts, setAccounts] = useState([])
  const [accModal, setAccModal] = useState(null)
  const [accForm, setAccForm] = useState(emptyAcc)
  const [accSaving, setAccSaving] = useState(false)
  const [accUploading, setAccUploading] = useState(false)
  useBackClose(!!accModal, () => setAccModal(null))

  const [komselItems, setKomselItems] = useState([])
  const [komselLoading, setKomselLoading] = useState(true)

  useEffect(() => { loadRekap() }, [startDate, endDate, category, status])
  useEffect(() => { loadAccounts() }, [])
  useEffect(() => { loadKomselOfferings() }, [])

  function loadRekap() {
    setLoading(true)
    offeringsService.getAll({
      startDate: startDate || null,
      endDate: endDate ? `${endDate}T23:59:59` : null,
      category, status,
    }).then(setItems).catch(() => {}).finally(() => setLoading(false))
  }
  function loadAccounts() {
    offeringsService.getPaymentAccounts().then(setAccounts).catch(() => {})
  }
  function loadKomselOfferings() {
    setKomselLoading(true)
    komselOfferingsService.getAll().then(setKomselItems).catch(() => {}).finally(() => setKomselLoading(false))
  }

  const totals = useMemo(() => {
    const verified = items.filter(o => o.status === 'Terverifikasi')
    return {
      verifiedSum: verified.reduce((s, o) => s + Number(o.amount), 0),
      verifiedCount: verified.length,
      pending: items.filter(o => o.status === 'Menunggu').length,
    }
  }, [items])

  async function verify(o, st) {
    try {
      await offeringsService.setStatus(o.offering_id, st, profile.user_id)
      toast.success(st === 'Terverifikasi' ? t('aoff.verifiedToast') : t('aoff.rejectedToast'))
      loadRekap()
    } catch (err) {
      toast.error(err.message || t('aoff.statusFailed'))
    }
  }

  async function verifyKomsel(o, st) {
    try {
      await komselOfferingsService.setStatus(o.id, st, profile.user_id)
      toast.success(st === 'Terverifikasi' ? t('aoff.verifiedToast') : t('aoff.rejectedToast'))
      loadKomselOfferings()
    } catch (err) {
      toast.error(err.message || t('aoff.statusFailed'))
    }
  }

  async function removeOffering(o) {
    const ok = await confirm({ title: t('aoff.deleteRecTitle'), message: t('aoff.deleteRecMsg', { amount: formatRupiah(o.amount) }), confirmText: t('a.delete'), danger: true })
    if (!ok) return
    try {
      await offeringsService.delete(o.offering_id)
      toast.success(t('aoff.recDeleted'))
      loadRekap()
    } catch (err) {
      toast.error(err.message || t('aoff.deleteFailed'))
    }
  }

  // Export rekap per jemaat (nama, no HP, total) untuk diimpor ke app finance.
  // Selalu hanya yang Terverifikasi -- terlepas dari filter status di halaman --
  // supaya uang yang belum/tidak terverifikasi tidak ikut tercatat di finance.
  async function exportFinance() {
    const verified = items.filter(o => o.status === 'Terverifikasi')
    if (verified.length === 0) { toast.info(t('aoff.exportEmpty')); return }

    const byUser = new Map()
    for (const o of verified) {
      const uid = o.user_id || 'unknown'
      const prev = byUser.get(uid) || { name: o.users?.name || '-', phone: o.users?.phone || '', total: 0 }
      prev.total += Number(o.amount) || 0
      byUser.set(uid, prev)
    }

    const periodeLabel = (startDate || endDate)
      ? `Periode: ${startDate ? formatDate(startDate) : t('aoff.arcStart')} – ${endDate ? formatDate(endDate) : t('aoff.arcNow')}`
      : `Periode: ${t('aoff.arcAllTime')}`
    const rows = [...byUser.values()].map(({ name, phone, total }) => [name, formatPhone(phone), total])
    const periodeFile = (startDate || endDate) ? `_${startDate || 'awal'}_${endDate || 'now'}` : ''

    await downloadXlsx({
      filename: `persembahan${periodeFile}.xlsx`,
      sheetName: 'Rekap Persembahan',
      titleLines: ['ESC Siantan', 'Rekap Persembahan Terverifikasi', periodeLabel],
      headers: [t('aoff.exportColName'), t('aoff.exportColPhone'), t('aoff.exportColTotal')],
      rows,
    })
    toast.success(t('aoff.exportSuccess', { n: byUser.size }))
  }

  function archive() {
    const periode = (startDate || endDate)
      ? `${startDate ? formatDate(startDate) : t('aoff.arcStart')} – ${endDate ? formatDate(endDate) : t('aoff.arcNow')}`
      : t('aoff.arcAllTime')
    const documents = items.filter(o => o.proof_url).map(o => ({
      label: `${o.users?.name || '-'} · ${formatRupiah(o.amount)}`, url: o.proof_url,
    }))
    printArchive({
      title: t('aoff.arcTitle'),
      meta: [
        [t('aoff.arcPeriod'), periode],
        [t('aoff.category'), category || t('aoff.all')],
        [t('aoff.statusLabel'), status || t('aoff.all')],
        [t('aoff.arcTotalVerified'), `${formatRupiah(totals.verifiedSum)} (${t('aoff.recordsN', { n: totals.verifiedCount })})`],
      ],
      sections: [{
        title: t('aoff.arcList'),
        rows: items.map(o => [
          `${formatDate(o.created_at)} · ${o.users?.name || '-'}`,
          `${o.category} — ${formatRupiah(o.amount)} (${o.status})`,
        ]),
      }],
      documents,
      footer: t('aoff.arcPrinted', { date: formatDate(new Date(), 'd MMMM yyyy, HH:mm') }),
    })
  }

  // ── Kelola rekening ──
  function openAcc(a) { setAccForm(a ? { ...a } : emptyAcc); setAccModal(a || {}) }
  function setA(k, v) { setAccForm(p => ({ ...p, [k]: v })) }
  async function handleQris(file) {
    setAccUploading(true)
    try {
      file = await compressImage(file, { maxDim: 1024 })
      validateUpload(file, { maxMB: 5, image: true })
      const url = await offeringsService.uploadQris(file)
      setA('image_url', url)
      toast.success(t('aoff.qrisUploaded'))
    } catch (err) {
      toast.error(err.message || t('aoff.qrisFailed'))
    } finally {
      setAccUploading(false)
    }
  }
  async function saveAcc() {
    if (!accForm.label.trim()) { toast.error(t('aoff.labelRequired')); return }
    setAccSaving(true)
    try {
      await offeringsService.savePaymentAccount({
        ...accForm,
        sort: Number(accForm.sort) || 0,
        account_no: accForm.kind === 'bank' ? accForm.account_no : null,
        image_url: accForm.kind === 'qris' ? accForm.image_url : null,
      })
      setAccModal(null)
      toast.success(t('aoff.accSaved'))
      loadAccounts()
    } catch (err) {
      toast.error(err.message || t('aoff.accSaveFailed'))
    } finally {
      setAccSaving(false)
    }
  }
  async function deleteAcc(a) {
    const ok = await confirm({ title: t('aoff.deleteAccTitle'), message: t('aoff.deleteAccMsg', { label: a.label }), confirmText: t('a.delete'), danger: true })
    if (!ok) return
    try { await offeringsService.deletePaymentAccount(a.id); toast.success(t('aoff.accDeleted')); loadAccounts() }
    catch (err) { toast.error(err.message || t('aoff.deleteFailed')) }
  }

  return (
    <div>
      <PageHeader
        title={t('aoff.title')}
        subtitle={t('aoff.subtitle')}
        action={tab === 'rekap' && items.length > 0
          ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={exportFinance}><FileSpreadsheet size={15} /> {t('aoff.exportFinance')}</Button>
              <Button size="sm" variant="outline" onClick={archive}><Printer size={15} /> {t('aoff.archivePdf')}</Button>
            </div>
          )
          : tab === 'rekening'
            ? <Button size="sm" onClick={() => openAcc(null)}><Plus size={15} /> {t('a.add')}</Button>
            : null}
      />

      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-4">
        {[['rekap', t('aoff.tabRekap')], ['komsel', t('aoff.tabKomsel')], ['rekening', t('aoff.tabAccounts')]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === k ? 'bg-surface text-brand-600 shadow-sm' : 'text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'rekap' && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Card className="p-4">
              <p className="text-xs text-gray-400">{t('aoff.verified')}</p>
              <p className="text-lg font-bold text-green-600">{formatRupiah(totals.verifiedSum)}</p>
              <p className="text-[11px] text-gray-400">{t('aoff.recordsN', { n: totals.verifiedCount })}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-gray-400">{t('aoff.pendingVerify')}</p>
              <p className="text-lg font-bold text-amber-600">{totals.pending}</p>
              <p className="text-[11px] text-gray-400">{t('aoff.recordsWord')}</p>
            </Card>
          </div>

          <Card className="p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label={t('aoff.from')} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              <Input label={t('aoff.to')} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label={t('aoff.category')} value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">{t('aoff.all')}</option>
                {OFFERING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Select label={t('aoff.statusLabel')} value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">{t('aoff.all')}</option>
                {['Menunggu', 'Terverifikasi', 'Ditolak'].map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
              </Select>
            </div>
          </Card>

          {loading && <div className="flex justify-center py-10"><Spinner /></div>}
          {!loading && items.length === 0 && <EmptyState icon={HandCoins} title={t('aoff.emptyRekap')} />}
          {!loading && items.length > 0 && (
            <Card className="divide-y divide-gray-100">
              {items.map(o => (
                <div key={o.offering_id} className="p-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={o.users?.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{formatRupiah(o.amount)}</p>
                      <p className="text-xs text-gray-400 truncate">{o.users?.name || '-'} · {o.category} · {formatDate(o.created_at)}</p>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                  {o.note && <p className="text-xs text-gray-500 mt-1.5">{o.note}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    {o.proof_url && (
                      <a href={o.proof_url} target="_blank" rel="noreferrer" className="text-xs text-brand-500 underline">{t('aoff.viewProof')}</a>
                    )}
                    <div className="flex-1" />
                    {o.status !== 'Terverifikasi' && (
                      <button onClick={() => verify(o, 'Terverifikasi')} className="text-xs text-green-600 hover:underline flex items-center gap-1">
                        <Check size={13} /> {t('aoff.verify')}
                      </button>
                    )}
                    {o.status !== 'Ditolak' && (
                      <button onClick={() => verify(o, 'Ditolak')} className="text-xs text-red-500 hover:underline">{t('aoff.reject')}</button>
                    )}
                    <button onClick={() => removeOffering(o)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {tab === 'komsel' && (
        <>
          {komselLoading && <div className="flex justify-center py-10"><Spinner /></div>}
          {!komselLoading && komselItems.length === 0 && <EmptyState icon={HandCoins} title={t('aoff.emptyKomsel')} />}
          {!komselLoading && komselItems.length > 0 && (
            <Card className="divide-y divide-gray-100">
              {komselItems.map(o => (
                <div key={o.id} className="p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{formatRupiah(o.amount)}</p>
                      <p className="text-xs text-gray-400 truncate">{o.komsel?.name || '-'} · {o.category} · {formatDate(o.created_at)}</p>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                  {o.note && <p className="text-xs text-gray-500 mt-1.5">{o.note}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1" />
                    {o.status !== 'Terverifikasi' && (
                      <button onClick={() => verifyKomsel(o, 'Terverifikasi')} className="text-xs text-green-600 hover:underline flex items-center gap-1">
                        <Check size={13} /> {t('aoff.verify')}
                      </button>
                    )}
                    {o.status !== 'Ditolak' && (
                      <button onClick={() => verifyKomsel(o, 'Ditolak')} className="text-xs text-red-500 hover:underline">{t('aoff.reject')}</button>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {tab === 'rekening' && (
        <>
          {accounts.length === 0 ? (
            <EmptyState icon={Building2} title={t('aoff.noAccounts')} description={t('aoff.noAccountsDesc')} />
          ) : (
            <Card className="divide-y divide-gray-100">
              {accounts.map(a => (
                <div key={a.id} className="flex items-center gap-3 p-3.5">
                  <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
                    {a.kind === 'qris' ? <QrCode size={18} className="text-brand-500" /> : <Building2 size={18} className="text-brand-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{a.label} <Badge color="gray" className="ml-1 text-[10px]! py-0!">{a.kind.toUpperCase()}</Badge></p>
                    {a.account_no && <p className="text-xs text-gray-400">{a.account_no}</p>}
                    {a.account_name && <p className="text-xs text-gray-400">a.n. {a.account_name}</p>}{/* a.n. = atas nama */}
                  </div>
                  <button onClick={() => openAcc(a)} className="p-2 text-gray-400 hover:text-brand-500"><Pencil size={16} /></button>
                  <button onClick={() => deleteAcc(a)} className="p-2 text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {/* Modal rekening */}
      {accModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-4 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{accForm.id ? t('aoff.editAccount') : t('aoff.addAccount')}</h2>
              <button onClick={() => setAccModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <Select label={t('aoff.kind')} value={accForm.kind} onChange={e => setA('kind', e.target.value)}>
              <option value="bank">{t('aoff.bankAccount')}</option>
              <option value="qris">QRIS</option>
            </Select>
            <Input label={t('aoff.label')} placeholder={accForm.kind === 'qris' ? t('aoff.labelPhQris') : t('aoff.labelPhBank')} value={accForm.label} onChange={e => setA('label', e.target.value)} />
            {accForm.kind === 'bank' && (
              <Input label={t('aoff.accountNo')} value={accForm.account_no || ''} onChange={e => setA('account_no', e.target.value)} />
            )}
            <Input label={t('aoff.accountName')} value={accForm.account_name || ''} onChange={e => setA('account_name', e.target.value)} />
            {accForm.kind === 'qris' && (
              <Uploader kind="image" label={t('aoff.qrisImage')} hint={t('aoff.qrisHint')} value={accForm.image_url} uploading={accUploading} onFile={handleQris} onClear={() => setA('image_url', '')} />
            )}
            <Input label={t('aoff.sort')} type="number" value={accForm.sort} onChange={e => setA('sort', e.target.value)} />
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={() => setAccModal(null)}>{t('a.cancel')}</Button>
              <Button className="flex-1" loading={accSaving} onClick={saveAcc}>{t('a.save')}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
