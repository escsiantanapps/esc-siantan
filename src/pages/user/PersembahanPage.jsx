import { useEffect, useState } from 'react'
import { QrCode, Copy, Check, HandCoins, Building2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { offeringsService, OFFERING_CATEGORIES } from '@/services/offeringsService'
import { Card, Spinner, GradientHeader, Button, Input, Select, Textarea, StatusBadge, EmptyState } from '@/components/ui'
import Uploader from '@/components/Uploader'
import { formatDate, formatRupiah, validateUpload, compressImage } from '@/lib/utils'

export default function PersembahanPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [accounts, setAccounts] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState('')

  const [form, setForm] = useState({ category: 'Perpuluhan', amount: '', note: '', proof_url: '' })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  async function load() {
    setLoading(true)
    try {
      const [acc, hist] = await Promise.all([
        offeringsService.getPaymentAccounts(),
        offeringsService.getMine(profile.user_id),
      ])
      setAccounts(acc)
      setHistory(hist)
    } catch {
      /* abaikan */
    } finally {
      setLoading(false)
    }
  }

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

  function copy(text, id) {
    navigator.clipboard?.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(''), 1500)
  }

  async function handleProof(file) {
    setUploading(true)
    setError('')
    try {
      file = await compressImage(file, { maxDim: 1600 })
      validateUpload(file, { maxMB: 8 })
      const url = await offeringsService.uploadProof(profile.user_id, file)
      set('proof_url', url)
      toast.success('Bukti berhasil diunggah.')
    } catch (err) {
      setError(err.message || 'Gagal mengunggah bukti.')
      toast.error(err.message || 'Gagal mengunggah bukti.')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit() {
    setError('')
    const amount = Number(String(form.amount).replace(/\D/g, ''))
    if (!amount || amount <= 0) { setError('Nominal persembahan wajib diisi.'); return }
    setSaving(true)
    try {
      await offeringsService.create({
        userId: profile.user_id,
        category: form.category,
        amount,
        note: form.note,
        proof_url: form.proof_url,
      })
      setForm({ category: 'Perpuluhan', amount: '', note: '', proof_url: '' })
      toast.success('Terima kasih! Persembahan Anda telah dicatat.')
      load()
    } catch (err) {
      setError(err.message || 'Gagal mencatat persembahan.')
      toast.error(err.message || 'Gagal mencatat persembahan.')
    } finally {
      setSaving(false)
    }
  }

  const qris = accounts.filter(a => a.kind === 'qris')
  const banks = accounts.filter(a => a.kind === 'bank')

  return (
    <div className="pb-4">
      <GradientHeader title="Persembahan" subtitle="Beri persembahan & catat untuk bendahara" />

      <div className="px-4 -mt-2 pt-4 space-y-5">
        {loading && <div className="flex justify-center py-8"><Spinner /></div>}

        {!loading && (
          <>
            {/* Cara memberi */}
            {accounts.length === 0 ? (
              <Card className="p-4">
                <p className="text-sm text-gray-400">Informasi rekening/QRIS belum tersedia. Hubungi admin gereja.</p>
              </Card>
            ) : (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">Cara Memberi</h3>

                {qris.map(a => (
                  <Card key={a.id} className="p-4 text-center">
                    <p className="text-sm font-medium text-gray-900 flex items-center justify-center gap-1.5 mb-2">
                      <QrCode size={15} className="text-brand-500" /> {a.label}
                    </p>
                    {a.image_url
                      ? <img src={a.image_url} alt="QRIS" className="w-full max-w-xs mx-auto rounded-xl border border-gray-100" />
                      : <p className="text-xs text-gray-400">Gambar QRIS belum diunggah.</p>}
                    {a.account_name && <p className="text-xs text-gray-400 mt-2">a.n. {a.account_name}</p>}
                  </Card>
                ))}

                {banks.map(a => (
                  <Card key={a.id} className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
                      <Building2 size={18} className="text-brand-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{a.label}</p>
                      <p className="text-sm text-gray-700 tracking-wide">{a.account_no}</p>
                      {a.account_name && <p className="text-xs text-gray-400">a.n. {a.account_name}</p>}
                    </div>
                    {a.account_no && (
                      <button onClick={() => copy(a.account_no, a.id)} className="p-2 text-gray-400 hover:text-brand-500 shrink-0" title="Salin">
                        {copied === a.id ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                      </button>
                    )}
                  </Card>
                ))}
              </section>
            )}

            {/* Catat persembahan */}
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Catat Persembahan</h3>
              <Card className="p-4 space-y-4">
                {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}
                <Select label="Kategori" value={form.category} onChange={e => set('category', e.target.value)}>
                  {OFFERING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
                <Input
                  label="Nominal (Rp)" inputMode="numeric" placeholder="cth: 50.000"
                  value={form.amount ? Number(String(form.amount).replace(/\D/g, '')).toLocaleString('id-ID') : ''}
                  onChange={e => set('amount', e.target.value.replace(/\D/g, ''))}
                />
                <Textarea label="Catatan (opsional)" rows={2} value={form.note} onChange={e => set('note', e.target.value)} />
                <Uploader
                  kind="image" label="Bukti Transfer (opsional)" hint="Foto bukti, maks 8 MB"
                  value={form.proof_url} uploading={uploading}
                  onFile={handleProof} onClear={() => set('proof_url', '')}
                />
                <Button className="w-full" loading={saving} onClick={handleSubmit}>
                  <HandCoins size={16} /> Catat Persembahan
                </Button>
                <p className="text-xs text-gray-400 text-center">
                  Pencatatan ini membantu bendahara. Pastikan Anda sudah transfer/scan QRIS terlebih dahulu.
                </p>
              </Card>
            </section>

            {/* Riwayat */}
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Riwayat Saya</h3>
              {history.length === 0 ? (
                <EmptyState icon={HandCoins} title="Belum ada catatan" description="Persembahan yang Anda catat akan muncul di sini." />
              ) : (
                <Card className="divide-y divide-gray-100">
                  {history.map(o => (
                    <div key={o.offering_id} className="flex items-center gap-3 p-3.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{formatRupiah(o.amount)}</p>
                        <p className="text-xs text-gray-400">{o.category} · {formatDate(o.created_at)}</p>
                      </div>
                      <StatusBadge status={o.status} />
                    </div>
                  ))}
                </Card>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
