import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { startOfWeek, startOfMonth, isSameDay } from 'date-fns'
import { ClipboardList, CheckCircle2, ArrowLeft, Clock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { tasksService, canAccessTemplate, getTemplateSchedule } from '@/services/tasksService'
import { pushService } from '@/services/pushService'
import { Card, Spinner, EmptyState, GradientHeader, Button, Input, Textarea, Select, Checkbox, Badge } from '@/components/ui'
import Uploader from '@/components/Uploader'
import { useLang } from '@/hooks/useLang'
import { formatDate, validateUpload, compressImage } from '@/lib/utils'
import { resolveFormBg } from '@/config/formBackgrounds'

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
    if (template?.once_per_day && submittedToday) {
      setError(t('taskDetail.alreadyToday'))
      return
    }
    // Tegakkan jendela buka (hari & jam). Dihitung ulang saat submit agar tidak
    // bisa diakali dengan membiarkan halaman terbuka melewati jam tutup.
    const sched = getTemplateSchedule(template)
    if (!sched.open) {
      setError(sched.label ? t('taskDetail.closedDesc', { schedule: sched.label }) : t('taskDetail.closedTitle'))
      return
    }
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
      // Beri tahu PKS komsel bahwa SOP ini sudah diisi (non-blocking).
      pushService.notifyLeaders(id).catch(() => {})
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
  const formBg = resolveFormBg(template.bg_type, template.bg_value)
  const submittedToday = responses.some(r => isSameDay(new Date(r.submitted_at), new Date()))
  const locked = !!template.once_per_day && submittedToday
  const schedule = getTemplateSchedule(template)
  const closed = !schedule.open

  return (
    <div className="pb-4">
      {formBg ? (
        // Header dengan background kustom form (gambar/preset) + scrim agar teks terbaca.
        <div className="relative h-32 flex items-end overflow-hidden" style={formBg}>
          <div className="absolute inset-0 bg-black/35" />
          <button onClick={() => navigate('/tugas')}
            className="absolute top-4 left-4 w-9 h-9 rounded-full bg-black/25 backdrop-blur flex items-center justify-center text-white">
            <ArrowLeft size={18} />
          </button>
          <div className="relative px-4 pb-4 text-white [text-shadow:_0_1px_4px_rgb(0_0_0_/_40%)]">
            <h1 className="text-xl font-bold">{template.title}</h1>
            {template.description && <p className="text-sm text-white/90 mt-0.5 line-clamp-2">{template.description}</p>}
          </div>
        </div>
      ) : (
        <GradientHeader title={template.title} subtitle={template.description} back={() => navigate('/tugas')} />
      )}

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

          {locked && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
              <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" />
              <p className="text-sm text-green-700">{t('taskDetail.alreadyToday')}</p>
            </div>
          )}

          {!locked && closed && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <Clock size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">{t('taskDetail.closedTitle')}</p>
                {schedule.label && (
                  <p className="text-sm text-amber-700 mt-0.5">{t('taskDetail.closedDesc', { schedule: schedule.label })}</p>
                )}
              </div>
            </div>
          )}

          {!locked && !closed && (template.fields_json || []).length === 0 && (
            <p className="text-sm text-gray-400">{t('taskDetail.noForm')}</p>
          )}

          {!locked && !closed && (template.fields_json || []).map(field => (
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

          {!locked && !closed && (
            <Button className="w-full" loading={saving} onClick={handleSubmit}>
              {t('taskDetail.submit')}
            </Button>
          )}
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
