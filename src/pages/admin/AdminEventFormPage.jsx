import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { eventsService, mediaService } from '@/services/contentService'
import { pushService } from '@/services/pushService'
import { useToast } from '@/hooks/useToast'
import { Card, Input, Textarea, Select, Checkbox, Button, Spinner } from '@/components/ui'
import Uploader from '@/components/Uploader'
import MediaListUploader from '@/components/MediaListUploader'
import { validateUpload, compressImage } from '@/lib/utils'

// Tipe field prasyarat — sengaja disempit vs field tugas (hanya 3 pilihan).
const PREREQ_FIELD_TYPES = [
  { value: 'text', label: 'Teks Singkat' },
  { value: 'textarea', label: 'Teks Panjang' },
  { value: 'file', label: 'Upload File' },
]

function slugifyKey(str) {
  return String(str || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}
function makeUniqueKey(label, fields, idx) {
  const base = slugifyKey(label) || `field_${idx + 1}`
  const taken = fields.filter((_, j) => j !== idx).map(f => f.key).filter(Boolean)
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base}_${n}`)) n++
  return `${base}_${n}`
}

export default function AdminEventFormPage() {
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
    name: '', description: '', event_date: '', event_time: '', location: '',
    capacity: '', status: 'Mulai', thumbnail_url: '', contact_wa: '', contact_wa_female: '',
    whatsapp_group_url: '',
    photo_urls: [], video_urls: [],
    // Formulir prasyarat opsional. Diperlakukan sebagai array editing di UI,
    // tapi dikirim ke DB sebagai NULL kalau toggle mati agar semantik "tidak
    // aktif" konsisten dengan kolom NULL di DB.
    prerequisite_enabled: false,
    prerequisite_fields: [],
  })
  const [mediaBusy, setMediaBusy] = useState(false)

  useEffect(() => {
    if (!isEdit) return
    eventsService.getById(id)
      .then(ev => setForm({
        name: ev.name || '',
        description: ev.description || '',
        event_date: ev.event_date || '',
        event_time: ev.event_time || '',
        location: ev.location || '',
        capacity: ev.capacity ?? '',
        status: ev.status || 'Mulai',
        thumbnail_url: ev.thumbnail_url || '',
        contact_wa: ev.contact_wa || '',
        contact_wa_female: ev.contact_wa_female || '',
        whatsapp_group_url: ev.whatsapp_group_url || '',
        photo_urls: ev.photo_urls || [],
        video_urls: ev.video_urls || [],
        prerequisite_enabled: Array.isArray(ev.prerequisite_fields) && ev.prerequisite_fields.length > 0,
        prerequisite_fields: ev.prerequisite_fields || [],
      }))
      .catch(err => setError(err.message || 'Gagal memuat event.'))
      .finally(() => setLoading(false))
  }, [id])

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

  // Editor field prasyarat — pola mirip AdminTaskFormPage tapi disederhanakan.
  function addPrereqField() {
    setForm(p => ({
      ...p,
      prerequisite_fields: [...p.prerequisite_fields, { key: '', label: '', type: 'text', required: false, _isNew: true }],
    }))
  }
  function updatePrereqField(i, patch) {
    setForm(p => ({
      ...p,
      prerequisite_fields: p.prerequisite_fields.map((f, idx) => idx === i ? { ...f, ...patch } : f),
    }))
  }
  function setPrereqLabel(i, label) {
    setForm(p => ({
      ...p,
      prerequisite_fields: p.prerequisite_fields.map((f, idx) => {
        if (idx !== i) return f
        return { ...f, label, key: f._isNew ? makeUniqueKey(label, p.prerequisite_fields, idx) : f.key }
      }),
    }))
  }
  function removePrereqField(i) {
    setForm(p => ({ ...p, prerequisite_fields: p.prerequisite_fields.filter((_, idx) => idx !== i) }))
  }

  // Kelola galeri foto/video (tambah = unggah lalu simpan URL; hapus = buang URL).
  async function handleMedia(kind, action) {
    if (action.type === 'remove') {
      const key = kind === 'video' ? 'video_urls' : 'photo_urls'
      set(key, form[key].filter((_, i) => i !== action.index))
      return
    }
    setMediaBusy(true)
    try {
      let file = action.file
      if (kind === 'video') {
        validateUpload(file, { maxMB: 50 })
        const url = await mediaService.uploadVideo('events', file)
        set('video_urls', [...form.video_urls, url])
      } else {
        file = await compressImage(file, { maxDim: 1600 })
        validateUpload(file, { maxMB: 5, image: true })
        const url = await mediaService.uploadPhoto('events', file)
        set('photo_urls', [...form.photo_urls, url])
      }
    } catch (err) {
      toast.error(err.message || 'Gagal mengunggah media.')
    } finally {
      setMediaBusy(false)
    }
  }

  async function handleUpload(file) {
    if (!file) return
    setUploading(true)
    try {
      file = await compressImage(file)
      validateUpload(file, { maxMB: 5, image: true })
      const url = await eventsService.uploadThumbnail(file)
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
    if (!form.name.trim()) { setError('Nama event wajib diisi.'); return }
    if (!form.event_date) { setError('Tanggal event wajib diisi.'); return }
    if (form.prerequisite_enabled) {
      if (form.prerequisite_fields.length === 0) {
        setError('Tambahkan minimal 1 field pada formulir prasyarat, atau matikan togglenya.'); return
      }
      for (const f of form.prerequisite_fields) {
        if (!f.label.trim() || !f.key.trim()) { setError('Setiap field prasyarat harus punya label.'); return }
      }
    }
    setSaving(true)
    try {
      const { prerequisite_enabled, prerequisite_fields, ...rest } = form
      const payload = {
        ...rest,
        capacity: form.capacity === '' ? null : Number(form.capacity),
        event_time: form.event_time || null,
        whatsapp_group_url: form.whatsapp_group_url.trim() || null,
        // Kirim NULL kalau toggle mati — semantik "tidak aktif" di DB.
        prerequisite_fields: prerequisite_enabled
          ? prerequisite_fields.map(({ _isNew, ...f }) => f)
          : null,
      }
      let eventId = id
      if (isEdit) {
        await eventsService.update(id, payload)
      } else {
        const created = await eventsService.create(payload)
        eventId = created?.event_id
      }
      // Notifikasi push ke semua jemaat (tidak menggagalkan simpan bila gagal)
      pushService.broadcast({
        title: isEdit ? 'Event Diperbarui' : 'Event Baru',
        body: form.name,
        url: eventId ? `/events/${eventId}` : '/events',
      }).catch(() => {})
      toast.success(isEdit ? 'Event berhasil diperbarui.' : 'Event berhasil ditambahkan.')
      navigate('/admin/events')
    } catch (err) {
      setError(err.message || 'Gagal menyimpan event.')
      toast.error(err.message || 'Gagal menyimpan event.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Hapus event?',
      message: 'Event ini akan dihapus permanen beserta pendaftaran terkait.',
      confirmText: 'Hapus',
      danger: true,
    })
    if (!ok) return
    setDeleting(true)
    try {
      await eventsService.delete(id)
      toast.success('Event berhasil dihapus.')
      navigate('/admin/events')
    } catch (err) {
      setError(err.message || 'Gagal menghapus event.')
      toast.error(err.message || 'Gagal menghapus event.')
      setDeleting(false)
    }
  }

  if (loading) return <div className="flex justify-center items-center h-60"><Spinner /></div>

  return (
    <div className="max-w-2xl">
      <button onClick={() => navigate('/admin/events')} className="flex items-center gap-1 text-sm text-gray-500 mb-4">
        <ArrowLeft size={16} /> Kembali ke Kelola Events
      </button>

      {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>}

      <Card className="p-4 mb-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Informasi Event</h2>

        <Uploader
          kind="image" crop aspect={16 / 9} label="Gambar Sampul" hint="Atur bingkai (16:9) agar tidak terpotong · maks 5 MB"
          value={form.thumbnail_url} uploading={uploading}
          onFile={handleUpload} onClear={() => set('thumbnail_url', '')}
        />

        <Input label="Nama Event" required value={form.name} onChange={e => set('name', e.target.value)} />
        <Textarea label="Deskripsi" rows={3} value={form.description} onChange={e => set('description', e.target.value)} />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Tanggal" type="date" required value={form.event_date} onChange={e => set('event_date', e.target.value)} />
          <Input label="Jam" type="time" value={form.event_time} onChange={e => set('event_time', e.target.value)} />
        </div>

        <Input label="Lokasi" value={form.location} onChange={e => set('location', e.target.value)} />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Kapasitas" type="number" min="0" value={form.capacity} onChange={e => set('capacity', e.target.value)} />
          <Select label="Status" value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="Mulai">Belum Mulai</option>
            <option value="Sedang Berlangsung">Sedang Berlangsung</option>
            <option value="Selesai">Selesai</option>
            <option value="Dibatalkan">Dibatalkan</option>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Kontak WA (Laki-laki)" placeholder="08xxxxxxxxxx" value={form.contact_wa} onChange={e => set('contact_wa', e.target.value)} />
          <Input label="Kontak WA (Perempuan)" placeholder="08xxxxxxxxxx" value={form.contact_wa_female} onChange={e => set('contact_wa_female', e.target.value)} />
        </div>
        <p className="text-xs text-gray-400 -mt-1">Jemaat laki-laki diarahkan ke kontak laki-laki, perempuan ke kontak perempuan. Kosongkan salah satu untuk memakai satu kontak untuk semua.</p>

        <Input
          label="Link Grup WhatsApp (opsional)"
          placeholder="https://chat.whatsapp.com/..."
          value={form.whatsapp_group_url}
          onChange={e => set('whatsapp_group_url', e.target.value)}
        />
        <p className="text-xs text-gray-400 -mt-1">Ditampilkan HANYA bagi jemaat yang sudah resmi terdaftar di event ini.</p>
      </Card>

      {/* Formulir Prasyarat (opsional) — user WAJIB isi & disetujui admin dulu */}
      <Card className="p-4 mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Formulir Persyaratan (Opsional)</h2>
            <p className="text-xs text-gray-400 mt-0.5">Jemaat wajib mengisi formulir + disetujui admin dulu sebelum boleh mendaftar.</p>
          </div>
          <button
            type="button" role="switch" aria-checked={form.prerequisite_enabled}
            onClick={() => set('prerequisite_enabled', !form.prerequisite_enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${form.prerequisite_enabled ? 'bg-brand-500' : 'bg-control-hover'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.prerequisite_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {form.prerequisite_enabled && (
          <div className="space-y-3 pt-2 border-t border-gray-100">
            {form.prerequisite_fields.map((f, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <Input label="Label Field" value={f.label} onChange={e => setPrereqLabel(i, e.target.value)} />
                    <Select label="Tipe" value={f.type} onChange={e => updatePrereqField(i, { type: e.target.value })}>
                      {PREREQ_FIELD_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                    </Select>
                    <Checkbox label="Wajib diisi" checked={f.required} onChange={e => updatePrereqField(i, { required: e.target.checked })} />
                  </div>
                  <button
                    type="button" onClick={() => removePrereqField(i)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                    aria-label="Hapus field"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            <Button variant="outline" className="w-full" onClick={addPrereqField}>
              <Plus size={16} /> Tambah Field
            </Button>
          </div>
        )}
      </Card>

      {/* Galeri media (tampil di halaman detail event) */}
      <Card className="p-4 mb-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Galeri Media</h2>
        <MediaListUploader
          kind="image" label="Foto" max={5} hint="Maks 5 foto — carousel auto-slide di halaman detail"
          urls={form.photo_urls} uploading={mediaBusy}
          onChange={a => handleMedia('image', a)}
        />
        <MediaListUploader
          kind="video" label="Video" max={2} hint="Maks 2 video — autoplay (mute) di halaman detail, maks 50 MB/video"
          urls={form.video_urls} uploading={mediaBusy}
          onChange={a => handleMedia('video', a)}
        />
      </Card>

      <div className="flex gap-2">
        {isEdit && (
          <Button variant="danger" loading={deleting} onClick={handleDelete}>Hapus</Button>
        )}
        <Button className="flex-1" loading={saving} onClick={handleSubmit}>
          {isEdit ? 'Simpan Perubahan' : 'Tambah Event'}
        </Button>
      </div>
    </div>
  )
}
