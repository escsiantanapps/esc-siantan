import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { startOfWeek, startOfMonth } from 'date-fns'
import { ClipboardList, CheckCircle2, Lock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { tasksService, canAccessTemplate } from '@/services/tasksService'
import { Card, Spinner, EmptyState, GradientHeader, Button, Input, Textarea, Select, Checkbox, Badge } from '@/components/ui'
import Uploader from '@/components/Uploader'
import { useLang } from '@/hooks/useLang'
import { formatDate, validateUpload, compressImage } from '@/lib/utils'

export default function TaskDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { toast } = useToast()
  const { t } = useLang()

  const [template, setTemplate] = useState(null)
  const [responses, setResponses] = useState([])
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(true)
  const [uploadingKey, setUploadingKey] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (!profile) return
    load()
  }, [id, profile])

  async function load() {
    setLoading(true)
    try {
      const tmpl = await tasksService.getTemplateById(id)
      // Cegah akses ke tugas yang dibatasi untuk ministry tertentu
      if (!canAccessTemplate(tmpl, profile)) {
        setDenied(true)
        return
      }
      setTemplate(tmpl)
      const all = await tasksService.getMyResponses(profile.user_id, id)
      setResponses(all.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at)))
      setForm(initialForm(tmpl))
    } catch (err) {
      setError(err.message || t('taskDetail.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  function initialForm(tmpl) {
    const f = {}
    for (const field of tmpl?.fields_json || []) {
      f[field.key] = field.type === 'checkbox' ? false : ''
    }
    return f
  }

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

  async function handleFileChange(field, file) {
    if (!file) return
    setUploadingKey(field.key)
    setError('')
    try {
      file = await compressImage(file)
      validateUpload(file, { maxMB: 10, image: field.type === 'image' })
      const url = await tasksService.uploadResponseFile(profile.user_id, file)
      set(field.key, url)
      toast.success(field.type === 'image' ? t('taskDetail.photoUploaded') : t('taskDetail.fileUploaded'))
    } catch (err) {
      setError(err.message || t('taskDetail.uploadFailed'))
      toast.error(err.message || t('taskDetail.uploadFailed'))
    } finally {
      setUploadingKey(null)
    }
  }

  async function handleSubmit() {
    setError('')
    const fields = template?.fields_json || []
    for (const field of fields) {
      if (field.required && !form[field.key]) {
        setError(t('taskDetail.required', { label: field.label }))
        return
      }
    }

    setSaving(true)
    try {
      await tasksService.submitResponse({
        form_id: id,
        volunteer_id: profile.user_id,
        data_json: form,
      })
      const all = await tasksService.getMyResponses(profile.user_id, id)
      setResponses(all.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at)))
      setForm(initialForm(template))
      toast.success(t('taskDetail.submitted'))
    } catch (err) {
      setError(err.message || t('taskDetail.submitFailed'))
      toast.error(err.message || t('taskDetail.submitFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center items-center h-60"><Spinner /></div>

  if (denied) {
    return (
      <div className="pb-4">
        <GradientHeader title={t('taskDetail.deniedTitle')} back={() => navigate('/tugas')} />
        <EmptyState
          icon={Lock}
          title={t('taskDetail.deniedHead')}
          description={t('taskDetail.deniedDesc')}
        />
      </div>
    )
  }

  if (!template) {
    return (
      <div className="pb-4">
        <GradientHeader title={t('taskDetail.fillTitle')} back={() => navigate('/tugas')} />
        <EmptyState icon={ClipboardList} title={t('taskDetail.notFound')} />
      </div>
    )
  }

  const target = template.weekly_goal || 1
  const periodStart = template.period === 'bulan'
    ? startOfMonth(new Date())
    : startOfWeek(new Date(), { weekStartsOn: 1 })
  const doneThisPeriod = responses.filter(r => new Date(r.submitted_at) >= periodStart).length
  const complete = doneThisPeriod >= target

  return (
    <div className="pb-4">
      <GradientHeader title={template.title} subtitle={template.description} back={() => navigate('/tugas')} />

      <div className="px-4 py-4 space-y-4">
        {/* Progress */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">{template.period === 'bulan' ? t('taskDetail.progressMonth') : t('taskDetail.progressWeek')}</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5">{t('taskDetail.ofTarget', { done: doneThisPeriod, target })}</p>
          </div>
          <Badge color={complete ? 'green' : doneThisPeriod > 0 ? 'orange' : 'gray'}>
            {complete ? t('taskDetail.statusDone') : t('taskDetail.statusRunning')}
          </Badge>
        </Card>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
        )}

        {/* Form */}
        <Card className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">{t('taskDetail.fillAnswer')}</h2>

          {(template.fields_json || []).length === 0 && (
            <p className="text-sm text-gray-400">{t('taskDetail.noForm')}</p>
          )}

          {(template.fields_json || []).map(field => (
            <div key={field.key}>
              {field.type === 'textarea' && (
                <Textarea
                  label={field.label} required={field.required}
                  placeholder={field.placeholder}
                  value={form[field.key] || ''}
                  onChange={e => set(field.key, e.target.value)}
                />
              )}
              {field.type === 'number' && (
                <Input
                  label={field.label} required={field.required} type="number"
                  placeholder={field.placeholder}
                  value={form[field.key] || ''}
                  onChange={e => set(field.key, e.target.value)}
                />
              )}
              {field.type === 'date' && (
                <Input
                  label={field.label} required={field.required} type="date"
                  value={form[field.key] || ''}
                  onChange={e => set(field.key, e.target.value)}
                />
              )}
              {field.type === 'select' && (
                <Select
                  label={field.label} required={field.required}
                  value={form[field.key] || ''}
                  onChange={e => set(field.key, e.target.value)}
                >
                  <option value="">{t('taskDetail.choose')}</option>
                  {(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </Select>
              )}
              {field.type === 'checkbox' && (
                <Checkbox
                  label={field.label}
                  checked={!!form[field.key]}
                  onChange={e => set(field.key, e.target.checked)}
                />
              )}
              {field.type === 'image' && (
                <Uploader
                  kind="image" label={field.label} required={field.required}
                  value={form[field.key]} uploading={uploadingKey === field.key}
                  onFile={file => handleFileChange(field, file)} onClear={() => set(field.key, '')}
                />
              )}
              {field.type === 'file' && (
                <Uploader
                  kind="file" label={field.label} required={field.required}
                  value={form[field.key]} uploading={uploadingKey === field.key}
                  onFile={file => handleFileChange(field, file)} onClear={() => set(field.key, '')}
                />
              )}
              {(!field.type || field.type === 'text') && (
                <Input
                  label={field.label} required={field.required}
                  placeholder={field.placeholder}
                  value={form[field.key] || ''}
                  onChange={e => set(field.key, e.target.value)}
                />
              )}
            </div>
          ))}

          <Button className="w-full" loading={saving} onClick={handleSubmit}>
            {t('taskDetail.submit')}
          </Button>
        </Card>

        {/* Riwayat */}
        {responses.length > 0 && (
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">{t('taskDetail.history')}</h2>
            <div className="space-y-2">
              {responses.slice(0, 10).map(r => (
                <div key={r.response_id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 size={15} className="text-green-500" />
                  </div>
                  <p className="text-sm text-gray-700">{formatDate(r.submitted_at, 'd MMMM yyyy, HH:mm')}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
