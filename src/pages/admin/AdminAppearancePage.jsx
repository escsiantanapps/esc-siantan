import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { settingsService } from '@/services/settingsService'
import { LOGIN_BG_PRESETS, resolveLoginBg, DEFAULT_LOGIN_BG } from '@/config/loginBackgrounds'
import { Card, PageHeader, Button, Spinner } from '@/components/ui'
import Uploader from '@/components/Uploader'
import { validateUpload, compressImage } from '@/lib/utils'

export default function AdminAppearancePage() {
  const { toast } = useToast()
  const { t } = useLang()
  const [bg, setBg] = useState(DEFAULT_LOGIN_BG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    settingsService.getLoginBackground()
      .then(v => { if (v) setBg(v) }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function handleUpload(file) {
    setUploading(true)
    try {
      file = await compressImage(file, { maxDim: 1600 })
      validateUpload(file, { maxMB: 5, image: true })
      const url = await settingsService.uploadLoginBackground(file)
      setBg({ type: 'image', value: url })
      toast.success(t('aap.uploaded'))
    } catch (err) {
      toast.error(err.message || t('aap.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      await settingsService.setLoginBackground(bg)
      toast.success(t('aap.saved'))
    } catch (err) {
      toast.error(err.message || t('aap.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  return (
    <div>
      <PageHeader title={t('aap.title')} subtitle={t('aap.subtitle')} />

      {/* Pratinjau */}
      <Card className="p-0 overflow-hidden mb-4">
        <div className="h-44 flex items-center justify-center" style={resolveLoginBg(bg)}>
          <div className="rounded-2xl border border-white/40 bg-white/15 backdrop-blur-md px-6 py-4 text-white text-center">
            <p className="font-display font-bold text-lg">{t('auth.loginTitle')}</p>
            <p className="text-xs text-white/85 mt-0.5">{t('aap.previewHint')}</p>
          </div>
        </div>
      </Card>

      {/* Preset */}
      <Card className="p-4 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('aap.presets')}</h3>
        <div className="grid grid-cols-3 gap-3">
          {LOGIN_BG_PRESETS.map(p => {
            const active = bg.type === 'preset' && bg.value === p.id
            return (
              <button key={p.id} onClick={() => setBg({ type: 'preset', value: p.id })}
                className={`relative h-16 rounded-xl border-2 transition ${active ? 'border-brand-500' : 'border-gray-100'}`}
                style={{ background: p.css }}>
                {active && (
                  <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 flex items-center justify-center">
                    <Check size={13} className="text-brand-600" strokeWidth={3} />
                  </span>
                )}
                <span className="absolute bottom-1 left-1.5 text-[10px] font-medium text-white drop-shadow">{p.label}</span>
              </button>
            )
          })}
        </div>
      </Card>

      {/* Upload gambar sendiri */}
      <Card className="p-4 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('aap.customImage')}</h3>
        <Uploader
          kind="image" label={t('aap.uploadLabel')} hint={t('aap.uploadHint')}
          value={bg.type === 'image' ? bg.value : ''} uploading={uploading}
          onFile={handleUpload} onClear={() => setBg(DEFAULT_LOGIN_BG)}
        />
      </Card>

      <Button className="w-full" loading={saving} onClick={save}>{t('aap.save')}</Button>
    </div>
  )
}
