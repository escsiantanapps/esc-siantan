import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Gift, Plus, Pencil, Trash2, X, Ticket, Download, QrCode } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { useBackClose } from '@/hooks/useBackClose'
import { pointsService } from '@/services/pointsService'
import { Card, PageHeader, Button, Input, Textarea, Spinner, EmptyState, StatusBadge, Badge } from '@/components/ui'
import Uploader from '@/components/Uploader'
import { formatDate, validateUpload, compressImage } from '@/lib/utils'

const emptyProduct = { name: '', points_cost: '', description: '', image_url: '', stock: 0 }

export default function AdminRedeemPage() {
  const { toast, confirm } = useToast()
  const [tab, setTab] = useState('produk')

  const [products, setProducts] = useState([])
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)

  const [modal, setModal] = useState(null)          // produk yang diedit / {}
  const [form, setForm] = useState(emptyProduct)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  useBackClose(!!modal, () => setModal(null))

  const [qrModal, setQrModal] = useState(null)      // { ticket, dataUrl }

  useEffect(() => { load() }, [])

  function load() {
    setLoading(true)
    Promise.all([
      pointsService.getProducts().then(setProducts).catch(() => {}),
      pointsService.getTickets().then(setTickets).catch(() => {}),
    ]).finally(() => setLoading(false))
  }

  function openProduct(p) { setForm(p ? { ...p } : emptyProduct); setModal(p || {}) }
  function setF(k, v) { setForm(prev => ({ ...prev, [k]: v })) }

  async function handleImage(file) {
    setUploading(true)
    try {
      file = await compressImage(file, { maxDim: 1024 })
      validateUpload(file, { maxMB: 5, image: true })
      const url = await pointsService.uploadProductImage(file)
      setF('image_url', url)
      toast.success('Gambar terunggah.')
    } catch (err) {
      toast.error(err.message || 'Gagal mengunggah gambar.')
    } finally {
      setUploading(false)
    }
  }

  async function saveProduct() {
    if (!form.name.trim()) { toast.error('Nama produk wajib diisi.'); return }
    if (!Number(form.points_cost) || Number(form.points_cost) <= 0) { toast.error('Harga poin harus lebih dari 0.'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        points_cost: Number(form.points_cost),
        description: form.description || null,
        image_url: form.image_url || null,
        stock: Number(form.stock) || 0,
      }
      if (form.product_id) await pointsService.updateProduct(form.product_id, payload)
      else await pointsService.createProduct(payload)
      setModal(null)
      toast.success('Produk tersimpan.')
      load()
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan produk.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteProduct(p) {
    const ok = await confirm({ title: 'Hapus produk?', message: `"${p.name}" akan dihapus.`, confirmText: 'Hapus', danger: true })
    if (!ok) return
    try { await pointsService.deleteProduct(p.product_id); toast.success('Produk dihapus.'); load() }
    catch (err) { toast.error(err.message || 'Gagal menghapus.') }
  }

  async function makeTicket(p) {
    try {
      const t = await pointsService.createTicket(p.product_id, p.points_cost)
      toast.success('Tiket dibuat — tampilkan QR untuk ditukar jemaat.')
      const dataUrl = await QRCode.toDataURL(`ESC-REDEEM:${t.ticket_id}`, { width: 320, margin: 1 })
      setQrModal({ ticket: { ...t, productName: p.name }, dataUrl })
      load()
    } catch (err) {
      toast.error(err.message || 'Gagal membuat tiket.')
    }
  }

  async function showTicketQr(t) {
    const dataUrl = await QRCode.toDataURL(`ESC-REDEEM:${t.ticket_id}`, { width: 320, margin: 1 }).catch(() => '')
    setQrModal({ ticket: { ...t, productName: t.redeemable_products?.name }, dataUrl })
  }

  async function deleteTicket(t) {
    const ok = await confirm({ title: 'Hapus tiket?', message: 'Tiket penukaran ini akan dihapus.', confirmText: 'Hapus', danger: true })
    if (!ok) return
    try { await pointsService.deleteTicket(t.ticket_id); toast.success('Tiket dihapus.'); load() }
    catch (err) { toast.error(err.message || 'Gagal menghapus.') }
  }

  return (
    <div>
      <PageHeader
        title="Tukar Poin"
        subtitle="Kelola katalog hadiah & tiket penukaran"
        action={tab === 'produk' ? <Button size="sm" onClick={() => openProduct(null)}><Plus size={15} /> Produk</Button> : null}
      />

      <div className="flex gap-1 p-1 bg-control rounded-xl mb-4">
        {[['produk', 'Katalog Produk'], ['tiket', 'Tiket Penukaran']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === k ? 'bg-surface text-brand-600 shadow-sm' : 'text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading && <div className="flex justify-center py-10"><Spinner /></div>}

      {/* Katalog produk */}
      {!loading && tab === 'produk' && (
        products.length === 0 ? (
          <EmptyState icon={Gift} title="Belum ada produk" description="Tambahkan hadiah yang bisa ditukar dengan poin." />
        ) : (
          <Card className="divide-y divide-gray-100">
            {products.map(p => (
              <div key={p.product_id} className="flex items-center gap-3 p-3.5">
                <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                  {p.image_url
                    ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Gift size={18} className="text-gray-300" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                  <p className="text-xs text-brand-600 font-semibold">{p.points_cost} poin {p.stock ? `· stok ${p.stock}` : ''}</p>
                </div>
                <button onClick={() => makeTicket(p)} title="Buat tiket QR" className="p-2 text-gray-400 hover:text-brand-500"><Ticket size={16} /></button>
                <button onClick={() => openProduct(p)} className="p-2 text-gray-400 hover:text-brand-500"><Pencil size={16} /></button>
                <button onClick={() => deleteProduct(p)} className="p-2 text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
              </div>
            ))}
          </Card>
        )
      )}

      {/* Tiket penukaran */}
      {!loading && tab === 'tiket' && (
        tickets.length === 0 ? (
          <EmptyState icon={Ticket} title="Belum ada tiket" description="Buat tiket dari katalog produk untuk ditukar jemaat." />
        ) : (
          <Card className="divide-y divide-gray-100">
            {tickets.map(t => (
              <div key={t.ticket_id} className="flex items-center gap-3 p-3.5">
                <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
                  <Ticket size={16} className="text-brand-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{t.redeemable_products?.name || 'Produk'}</p>
                  <p className="text-xs text-gray-400">
                    {t.points_cost} poin · {formatDate(t.created_at)}
                    {t.status === 'Digunakan' && t.users?.name ? ` · oleh ${t.users.name}` : ''}
                  </p>
                </div>
                <StatusBadge status={t.status} />
                {t.status === 'Aktif' && (
                  <button onClick={() => showTicketQr(t)} title="Tampilkan QR" className="p-2 text-gray-400 hover:text-brand-500"><QrCode size={16} /></button>
                )}
                <button onClick={() => deleteTicket(t)} className="p-2 text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
              </div>
            ))}
          </Card>
        )
      )}

      {/* Modal produk */}
      {modal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-4 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{form.product_id ? 'Edit Produk' : 'Tambah Produk'}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <Uploader kind="image" label="Gambar Produk" hint="Opsional, maks 5 MB"
              value={form.image_url} uploading={uploading} onFile={handleImage} onClear={() => setF('image_url', '')} />
            <Input label="Nama Produk" required value={form.name} onChange={e => setF('name', e.target.value)} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Harga (poin)" type="number" min="1" required value={form.points_cost} onChange={e => setF('points_cost', e.target.value)} />
              <Input label="Stok" type="number" min="0" value={form.stock} onChange={e => setF('stock', e.target.value)} />
            </div>
            <Textarea label="Deskripsi" rows={2} value={form.description} onChange={e => setF('description', e.target.value)} />
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={() => setModal(null)}>Batal</Button>
              <Button className="flex-1" loading={saving} onClick={saveProduct}>Simpan</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Modal QR tiket */}
      {qrModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm p-5 space-y-4 text-center">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Tiket Penukaran</h2>
              <button onClick={() => setQrModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-600">{qrModal.ticket.productName} · {qrModal.ticket.points_cost} poin</p>
            {qrModal.dataUrl
              ? <img src={qrModal.dataUrl} alt="QR Tiket" className="w-full rounded-xl border border-gray-100" />
              : <div className="flex justify-center py-10"><Spinner /></div>}
            <p className="text-xs text-gray-400">Minta jemaat memindai QR ini lewat menu Scan untuk menukar poin. Tiket hanya bisa dipakai sekali.</p>
            {qrModal.dataUrl && (
              <a href={qrModal.dataUrl} download={`Tiket-${qrModal.ticket.ticket_id}.png`}>
                <Button variant="outline" className="w-full"><Download size={15} /> Unduh QR</Button>
              </a>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
