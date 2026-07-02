import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { newsService, mediaService } from '@/services/contentService'
import { pushService } from '@/services/pushService'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { Card, Input, Textarea, Button, Spinner } from '@/components/ui'
import Uploader from '@/components/Uploader'
import MediaListUploader from '@/components/MediaListUploader'
import { validateUpload, compressImage } from '@/lib/utils'

export default function AdminNewsFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast, confirm } = useToast()
  const { t } = useLang()
  const isEdit = !!id

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    title: '', content: '', contact_wa: '', thumbnail_url: '',
    photo_urls: [], video_urls: [],
  })
  const [mediaBusy, setMediaBusy] = useState(false)

  useEffect(() => {
    if (!isEdit) return
    newsService.getById(id)
      .then(item => setForm({
        title: item.title || '',
        content: item.content || '',
        contact_wa: item.contact_wa || '',
        thumbnail_url: item.thumbnail_url || '',
        photo_urls: item.photo_urls || [],
        video_urls: item.video_urls || [],
      }))
      .catch(err => setError(err.message || t('anf.loadFailed')))
      .finally(() => setLoading(false))
  }, [id])

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

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
        const url = await mediaService.uploadVideo('news', file)
        set('video_urls', [...form.video_urls, url])
      } else {
        file = await compressImage(file, { maxDim: 1600 })
        validateUpload(file, { maxMB: 5, image: true })
        const url = await mediaService.uploadPhoto('news', file)
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
      const url = await newsService.uploadThumbnail(file)
      set('thumbnail_url', url)
      toast.success(t('anf.imgUploaded'))
    } catch (err) {
      setError(err.message || t('anf.imgFailed'))
      toast.error(err.message || t('anf.imgFailed'))
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit() {
    setError('')
    if (!form.title.trim()) { setError(t('anf.titleRequired')); return }
    setSaving(true)
    try {
      if (isEdit) {
        await newsService.update(id, form)
        pushService.broadcast({
          title: t('anf.pushUpdated'),
          body: form.title,
          url: `/informasi/${id}`,
        }).catch(() => {})
      } else {
        const created = await newsService.create(form)
        // Kirim notifikasi push ke semua jemaat (tidak menggagalkan simpan bila gagal)
        pushService.broadcast({
          title: t('anf.pushNew'),
          body: form.title,
          url: created?.news_id ? `/informasi/${created.news_id}` : '/informasi',
        }).then(r => {
          if (r?.sent != null) toast.success(t('anf.notifSent', { n: r.sent }))
        }).catch(() => {})
      }
      toast.success(isEdit ? t('anf.updated') : t('anf.created'))
      navigate('/admin/berita')
    } catch (err) {
      setError(err.message || t('anf.saveFailed'))
      toast.error(err.message || t('anf.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: t('anf.deleteTitle'),
      message: t('anf.deleteMsg'),
      confirmText: t('a.delete'),
      danger: true,
    })
    if (!ok) return
    setDeleting(true)
    try {
      await newsService.delete(id)
      toast.success(t('anf.deleted'))
      navigate('/admin/berita')
    } catch (err) {
      setError(err.message || t('anf.deleteFailed'))
      toast.error(err.message || t('anf.deleteFailed'))
      setDeleting(false)
    }
  }

  if (loading) return <div className="flex justify-center items-center h-60"><Spinner /></div>

  return (
    <div className="max-w-2xl">
      <button onClick={() => navigate('/admin/berita')} className="flex items-center gap-1 text-sm text-gray-500 mb-4">
        <ArrowLeft size={16} /> {t('anf.back')}
      </button>

      {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>}

      <Card className="p-4 mb-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">{t('anf.section')}</h2>

        <Uploader
          kind="image" crop aspect={16 / 9} label={t('anf.cover')} hint={t('anf.coverHint')}
          value={form.thumbnail_url} uploading={uploading}
          onFile={handleUpload} onClear={() => set('thumbnail_url', '')}
        />

        <Input label={t('anf.titleLabel')} required value={form.title} onChange={e => set('title', e.target.value)} />
        <Textarea label={t('anf.content')} rows={6} value={form.content} onChange={e => set('content', e.target.value)} />
        <Input label={t('anf.contactWa')} placeholder="08xxxxxxxxxx" value={form.contact_wa} onChange={e => set('contact_wa', e.target.value)} />
      </Card>

      {/* Galeri media */}
      <Card className="p-4 mb-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Galeri Media</h2>
        <MediaListUploader
          kind="image" label="Foto" max={5} hint="Maks 5 foto — carousel auto-slide di halaman detail"
          urls={form.photo_urls} uploading={mediaBusy}
          onChange={a => handleMedia('image', a)}
        />
        <MediaListUploader
          kind="video" label="Video" max={2} hint="Maks 2 video — autoplay (mute), maks 50 MB/video"
          urls={form.video_urls} uploading={mediaBusy}
          onChange={a => handleMedia('video', a)}
        />
      </Card>

      <div className="flex gap-2">
        {isEdit && (
          <Button variant="danger" loading={deleting} onClick={handleDelete}>{t('a.delete')}</Button>
        )}
        <Button className="flex-1" loading={saving} onClick={handleSubmit}>
          {isEdit ? t('anf.saveChanges') : t('anf.addNews')}
        </Button>
      </div>
    </div>
  )
}
