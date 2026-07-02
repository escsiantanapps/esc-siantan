import { useEffect, useState } from 'react'
import { Map, RotateCcw, Save } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { appSettingsService, mediaService } from '@/services/contentService'
import { DEFAULT_ROADMAP } from '@/pages/OnboardingPage'
import { Card, PageHeader, Button, Input, Textarea, Spinner } from '@/components/ui'
import Uploader from '@/components/Uploader'
import { compressImage, validateUpload } from '@/lib/utils'

// Editor Roadmap Pemuridan: 4 tahap (judul, fokus, karakteristik, sikap,
// gambar) yang tampil sebagai onboarding jemaat, + pengaturan berapa kali
// roadmap ditayangkan per perangkat (roadmap_show_count).
export default function AdminRoadmapPage() {
  const { toast, confirm } = useToast()
  const [stages, setStages] = useState(DEFAULT_ROADMAP)
  const [showCount, setShowCount] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingIdx, setUploadingIdx] = useState(-1)

  useEffect(() => {
    appSettingsService.getMany(['discipleship_roadmap', 'roadmap_show_count'])
      .then(map => {
        const v = map.discipleship_roadmap
        if (Array.isArray(v) && v.length > 0 && v.every(s => s && s.title)) setStages(v)
        const n = Number(map.roadmap_show_count)
        if (Number.isFinite(n) && n >= 0) setShowCount(n)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function setStage(i, key, val) {
    setStages(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: val } : s))
  }

  async function handleImage(i, file) {
    setUploadingIdx(i)
    try {
      file = await compressImage(file, { maxDim: 1024 })
      validateUpload(file, { maxMB: 5, image: true })
      const url = await mediaService.uploadPhoto('roadmap', file)
      setStage(i, 'image', url)
      toast.success('Gambar terunggah.')
    } catch (err) {
      toast.error(err.message || 'Gagal mengunggah gambar.')
    } finally {
      setUploadingIdx(-1)
    }
  }

  async function handleSave() {
    if (stages.some(s => !String(s.title || '').trim())) {
      toast.error('Judul tiap tahap wajib diisi.')
      return
    }
    setSaving(true)
    try {
      await appSettingsService.set('discipleship_roadmap', stages)
      await appSettingsService.set('roadmap_show_count', Math.max(0, Number(showCount) || 0))
      toast.success('Roadmap tersimpan.')
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan (hanya Super Admin yang dapat menulis pengaturan).')
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    const ok = await confirm({
      title: 'Kembalikan ke bawaan?',
      message: 'Seluruh isi tahap akan dikembalikan ke template bawaan (belum tersimpan sampai Anda menekan Simpan).',
      confirmText: 'Kembalikan',
    })
    if (ok) setStages(DEFAULT_ROADMAP)
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  return (
    <div>
      <PageHeader
        title="Roadmap Pemuridan"
        subtitle="Konten onboarding 4 tahap perkembangan rohani jemaat"
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleReset}><RotateCcw size={15} /> Bawaan</Button>
            <Button size="sm" loading={saving} onClick={handleSave}><Save size={15} /> Simpan</Button>
          </div>
        }
      />

      <Card className="p-4 mb-4">
        <div className="max-w-xs">
          <Input
            label="Frekuensi tayang per perangkat"
            type="number" min="0" value={showCount}
            onChange={e => setShowCount(e.target.value)}
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Roadmap muncul saat aplikasi dibuka sampai sudah tayang sebanyak angka ini
          di perangkat jemaat (0 = tidak pernah tampil). Menaikkan angka membuat
          roadmap tampil lagi untuk semua orang.
        </p>
      </Card>

      <div className="space-y-4">
        {stages.map((s, i) => (
          <Card key={i} className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
                <Map size={15} className="text-brand-600" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Tahap {i + 1}</h2>
            </div>
            <Input label="Judul" required value={s.title || ''} onChange={e => setStage(i, 'title', e.target.value)} />
            <Input label="Fokus" value={s.focus || ''} onChange={e => setStage(i, 'focus', e.target.value)} />
            <Textarea label="Karakteristik" rows={2} value={s.characteristics || ''} onChange={e => setStage(i, 'characteristics', e.target.value)} />
            <Textarea label="Sikap" rows={2} value={s.attitude || ''} onChange={e => setStage(i, 'attitude', e.target.value)} />
            <Uploader
              kind="image" label="Gambar Ilustrasi" hint="PNG/JPG/SVG, maks 5 MB — tampil di atas judul"
              value={s.image || ''} uploading={uploadingIdx === i}
              onFile={file => handleImage(i, file)}
              onClear={() => setStage(i, 'image', '')}
            />
          </Card>
        ))}
      </div>
    </div>
  )
}
