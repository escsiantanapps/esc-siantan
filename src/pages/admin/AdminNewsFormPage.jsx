import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { newsService } from '@/services/contentService'
import { pushService } from '@/services/pushService'
import { useToast } from '@/hooks/useToast'
import { Card, Input, Textarea, Button, Spinner } from '@/components/ui'
import Uploader from '@/components/Uploader'
import { validateUpload, compressImage } from '@/lib/utils'

export default function AdminNewsFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast, confirm } = useToast()
  const isEdit = !!id

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    title: '', content: '', contact_wa: '', thumbnail_url: '',
  })

  useEffect(() => {
    if (!isEdit) return
    newsService.getById(id)
      .then(item => setForm({
        title: item.title || '',
        content: item.content || '',
        contact_wa: item.contact_wa || '',
        thumbnail_url: item.thumbnail_url || '',
      }))
      .catch(err => setError(err.message || 'Gagal memuat berita.'))
      .finally(() => setLoading(false))
  }, [id])

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

  async function handleUpload(file) {
    if (!file) return
    setUploading(true)
    try {
      file = await compressImage(file)
      validateUpload(file, { maxMB: 5, image: true })
      const url = await newsService.uploadThumbnail(file)
      set('thumbnail_url', url)
      toast.success('Gambar berhasil diunggah.')
    } catch (err) {
      setError(err.message || 'Gagal mengunggah gambar.')
      toast.error(err.message || 'Gagal mengunggah gambar.')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit() {
    setError('')
    if (!form.title.trim()) { setError('Judul berita wajib diisi.'); return }
    setSaving(true)
    try {
      if (isEdit) {
        await newsService.update(id, form)
        pushService.broadcast({
          title: 'Pengumuman Diperbarui',
          body: form.title,
          url: `/informasi/${id}`,
        }).catch(() => {})
      } else {
        const created = await newsService.create(form)
        // Kirim notifikasi push ke semua jemaat (tidak menggagalkan simpan bila gagal)
        pushService.broadcast({
          title: 'Pengumuman Baru',
          body: form.title,
          url: created?.news_id ? `/informasi/${created.news_id}` : '/informasi',
        }).then(r => {
          if (r?.sent != null) toast.success(`Notifikasi terkirim ke ${r.sent} perangkat.`)
        }).catch(() => {})
      }
      toast.success(isEdit ? 'Berita berhasil diperbarui.' : 'Berita berhasil ditambahkan.')
      navigate('/admin/berita')
    } catch (err) {
      setError(err.message || 'Gagal menyimpan berita.')
      toast.error(err.message || 'Gagal menyimpan berita.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Hapus berita?',
      message: 'Berita ini akan dihapus permanen.',
      confirmText: 'Hapus',
      danger: true,
    })
    if (!ok) return
    setDeleting(true)
    try {
      await newsService.delete(id)
      toast.success('Berita berhasil dihapus.')
      navigate('/admin/berita')
    } catch (err) {
      setError(err.message || 'Gagal menghapus berita.')
      toast.error(err.message || 'Gagal menghapus berita.')
      setDeleting(false)
    }
  }

  if (loading) return <div className="flex justify-center items-center h-60"><Spinner /></div>

  return (
    <div className="max-w-2xl">
      <button onClick={() => navigate('/admin/berita')} className="flex items-center gap-1 text-sm text-gray-500 mb-4">
        <ArrowLeft size={16} /> Kembali ke Kelola Berita
      </button>

      {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>}

      <Card className="p-4 mb-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Informasi Berita</h2>

        <Uploader
          kind="image" label="Gambar Sampul" hint="JPG/PNG, maks 5 MB"
          value={form.thumbnail_url} uploading={uploading}
          onFile={handleUpload} onClear={() => set('thumbnail_url', '')}
        />

        <Input label="Judul" required value={form.title} onChange={e => set('title', e.target.value)} />
        <Textarea label="Isi Berita" rows={6} value={form.content} onChange={e => set('content', e.target.value)} />
        <Input label="Kontak WhatsApp" placeholder="08xxxxxxxxxx" value={form.contact_wa} onChange={e => set('contact_wa', e.target.value)} />
      </Card>

      <div className="flex gap-2">
        {isEdit && (
          <Button variant="danger" loading={deleting} onClick={handleDelete}>Hapus</Button>
        )}
        <Button className="flex-1" loading={saving} onClick={handleSubmit}>
          {isEdit ? 'Simpan Perubahan' : 'Tambah Berita'}
        </Button>
      </div>
    </div>
  )
}
