import { useEffect, useMemo, useState } from 'react'
import { HandCoins, Plus, Pencil, Trash2, X, Printer, Check, Building2, QrCode } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { offeringsService, OFFERING_CATEGORIES } from '@/services/offeringsService'
import { Card, PageHeader, Button, Input, Select, Spinner, EmptyState, StatusBadge, Avatar, Badge } from '@/components/ui'
import Uploader from '@/components/Uploader'
import { formatDate, formatRupiah, validateUpload, compressImage } from '@/lib/utils'
import { printArchive } from '@/lib/printDoc'

const emptyAcc = { kind: 'bank', label: '', account_no: '', account_name: '', image_url: '', sort: 0 }

export default function AdminOfferingsPage() {
  const { profile } = useAuth()
  const { toast, confirm } = useToast()
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

  useEffect(() => { loadRekap() }, [startDate, endDate, category, status])
  useEffect(() => { loadAccounts() }, [])

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
      toast.success(st === 'Terverifikasi' ? 'Persembahan diverifikasi.' : 'Persembahan ditolak.')
      loadRekap()
    } catch (err) {
      toast.error(err.message || 'Gagal memperbarui status.')
    }
  }

  async function removeOffering(o) {
    const ok = await confirm({ title: 'Hapus catatan?', message: `Catatan ${formatRupiah(o.amount)} akan dihapus.`, confirmText: 'Hapus', danger: true })
    if (!ok) return
    try {
      await offeringsService.delete(o.offering_id)
      toast.success('Catatan dihapus.')
      loadRekap()
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus.')
    }
  }

  function archive() {
    const periode = (startDate || endDate)
      ? `${startDate ? formatDate(startDate) : 'awal'} – ${endDate ? formatDate(endDate) : 'kini'}`
      : 'Semua waktu'
    const documents = items.filter(o => o.proof_url).map(o => ({
      label: `${o.users?.name || '-'} · ${formatRupiah(o.amount)}`, url: o.proof_url,
    }))
    printArchive({
      title: 'Arsip Persembahan',
      meta: [
        ['Periode', periode],
        ['Kategori', category || 'Semua'],
        ['Status', status || 'Semua'],
        ['Total terverifikasi', `${formatRupiah(totals.verifiedSum)} (${totals.verifiedCount} catatan)`],
      ],
      sections: [{
        title: 'Daftar Persembahan',
        rows: items.map(o => [
          `${formatDate(o.created_at)} · ${o.users?.name || '-'}`,
          `${o.category} — ${formatRupiah(o.amount)} (${o.status})`,
        ]),
      }],
      documents,
      footer: `Dicetak ${formatDate(new Date(), 'd MMMM yyyy, HH:mm')}`,
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
      toast.success('QRIS diunggah.')
    } catch (err) {
      toast.error(err.message || 'Gagal mengunggah QRIS.')
    } finally {
      setAccUploading(false)
    }
  }
  async function saveAcc() {
    if (!accForm.label.trim()) { toast.error('Label wajib diisi.'); return }
    setAccSaving(true)
    try {
      await offeringsService.savePaymentAccount({
        ...accForm,
        sort: Number(accForm.sort) || 0,
        account_no: accForm.kind === 'bank' ? accForm.account_no : null,
        image_url: accForm.kind === 'qris' ? accForm.image_url : null,
      })
      setAccModal(null)
      toast.success('Rekening/QRIS disimpan.')
      loadAccounts()
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan.')
    } finally {
      setAccSaving(false)
    }
  }
  async function deleteAcc(a) {
    const ok = await confirm({ title: 'Hapus?', message: `"${a.label}" akan dihapus.`, confirmText: 'Hapus', danger: true })
    if (!ok) return
    try { await offeringsService.deletePaymentAccount(a.id); toast.success('Dihapus.'); loadAccounts() }
    catch (err) { toast.error(err.message || 'Gagal menghapus.') }
  }

  return (
    <div>
      <PageHeader
        title="Persembahan"
        subtitle="Rekap & verifikasi persembahan jemaat"
        action={tab === 'rekap' && items.length > 0
          ? <Button size="sm" variant="outline" onClick={archive}><Printer size={15} /> Arsip PDF</Button>
          : tab === 'rekening'
            ? <Button size="sm" onClick={() => openAcc(null)}><Plus size={15} /> Tambah</Button>
            : null}
      />

      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-4">
        {[['rekap', 'Rekap'], ['rekening', 'Kelola Rekening']].map(([k, label]) => (
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
              <p className="text-xs text-gray-400">Terverifikasi</p>
              <p className="text-lg font-bold text-green-600">{formatRupiah(totals.verifiedSum)}</p>
              <p className="text-[11px] text-gray-400">{totals.verifiedCount} catatan</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-gray-400">Menunggu verifikasi</p>
              <p className="text-lg font-bold text-amber-600">{totals.pending}</p>
              <p className="text-[11px] text-gray-400">catatan</p>
            </Card>
          </div>

          <Card className="p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Dari" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              <Input label="Sampai" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Kategori" value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">Semua</option>
                {OFFERING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Select label="Status" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">Semua</option>
                {['Menunggu', 'Terverifikasi', 'Ditolak'].map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
          </Card>

          {loading && <div className="flex justify-center py-10"><Spinner /></div>}
          {!loading && items.length === 0 && <EmptyState icon={HandCoins} title="Belum ada persembahan" />}
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
                      <a href={o.proof_url} target="_blank" rel="noreferrer" className="text-xs text-brand-500 underline">Lihat bukti</a>
                    )}
                    <div className="flex-1" />
                    {o.status !== 'Terverifikasi' && (
                      <button onClick={() => verify(o, 'Terverifikasi')} className="text-xs text-green-600 hover:underline flex items-center gap-1">
                        <Check size={13} /> Verifikasi
                      </button>
                    )}
                    {o.status !== 'Ditolak' && (
                      <button onClick={() => verify(o, 'Ditolak')} className="text-xs text-red-500 hover:underline">Tolak</button>
                    )}
                    <button onClick={() => removeOffering(o)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
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
            <EmptyState icon={Building2} title="Belum ada rekening/QRIS" description="Tambahkan rekening bank atau QRIS gereja agar muncul di halaman Persembahan jemaat." />
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
                    {a.account_name && <p className="text-xs text-gray-400">a.n. {a.account_name}</p>}
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
              <h2 className="text-sm font-semibold text-gray-900">{accForm.id ? 'Edit' : 'Tambah'} Rekening/QRIS</h2>
              <button onClick={() => setAccModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <Select label="Jenis" value={accForm.kind} onChange={e => setA('kind', e.target.value)}>
              <option value="bank">Rekening Bank</option>
              <option value="qris">QRIS</option>
            </Select>
            <Input label="Label" placeholder={accForm.kind === 'qris' ? 'cth: QRIS Gereja' : 'cth: BCA'} value={accForm.label} onChange={e => setA('label', e.target.value)} />
            {accForm.kind === 'bank' && (
              <Input label="Nomor Rekening" value={accForm.account_no || ''} onChange={e => setA('account_no', e.target.value)} />
            )}
            <Input label="Atas Nama" value={accForm.account_name || ''} onChange={e => setA('account_name', e.target.value)} />
            {accForm.kind === 'qris' && (
              <Uploader kind="image" label="Gambar QRIS" hint="Foto/screenshot QRIS" value={accForm.image_url} uploading={accUploading} onFile={handleQris} onClear={() => setA('image_url', '')} />
            )}
            <Input label="Urutan" type="number" value={accForm.sort} onChange={e => setA('sort', e.target.value)} />
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={() => setAccModal(null)}>Batal</Button>
              <Button className="flex-1" loading={accSaving} onClick={saveAcc}>Simpan</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
