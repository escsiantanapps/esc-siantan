import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { startOfWeek, startOfMonth } from 'date-fns'
import { ClipboardList, CheckCircle2, Paperclip, Lock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { tasksService, canAccessTemplate } from '@/services/tasksService'
import { Card, Spinner, EmptyState, GradientHeader, Button, Input, Textarea, Select, Checkbox, Badge } from '@/components/ui'
import { formatDate, validateUpload } from '@/lib/utils'

export default function TaskDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { toast } = useToast()

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
      setError(err.message || 'Gagal memuat tugas.')
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

  async function handleFileChange(field, e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingKey(field.key)
    setError('')
    try {
      validateUpload(file, { maxMB: 10 })
      const url = await tasksService.uploadResponseFile(profile.user_id, file)
      set(field.key, url)
      toast.success('File berhasil diunggah.')
    } catch (err) {
      setError(err.message || 'Gagal mengunggah file.')
      toast.error(err.message || 'Gagal mengunggah file.')
    } finally {
      setUploadingKey(null)
    }
  }

  async function handleSubmit() {
    setError('')
    const fields = template?.fields_json || []
    for (const field of fields) {
      if (field.required && !form[field.key]) {
        setError(`${field.label} wajib diisi.`)
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
      toast.success('Jawaban berhasil dikirim.')
    } catch (err) {
      setError(err.message || 'Gagal mengirim jawaban.')
      toast.error(err.message || 'Gagal mengirim jawaban.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center items-center h-60"><Spinner /></div>

  if (denied) {
    return (
      <div className="pb-4">
        <GradientHeader title="Akses Ditolak" back={() => navigate('/tugas')} />
        <EmptyState
          icon={Lock}
          title="Tugas khusus ministry tertentu"
          description="Tugas ini hanya dapat diisi oleh anggota ministry yang ditentukan. Hubungi admin/PKS jika menurut Anda ini keliru."
        />
      </div>
    )
  }

  if (!template) {
    return (
      <div className="pb-4">
        <GradientHeader title="Isi Tugas" back={() => navigate('/tugas')} />
        <EmptyState icon={ClipboardList} title="Tugas tidak ditemukan" />
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
            <p className="text-xs text-gray-400">Progress {template.period === 'bulan' ? 'bulan ini' : 'minggu ini'}</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5">{doneThisPeriod} dari {target} target</p>
          </div>
          <Badge color={complete ? 'green' : doneThisPeriod > 0 ? 'orange' : 'gray'}>
            {complete ? 'Selesai' : 'Berjalan'}
          </Badge>
        </Card>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
        )}

        {/* Form */}
        <Card className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Isi Jawaban</h2>

          {(template.fields_json || []).length === 0 && (
            <p className="text-sm text-gray-400">Tugas ini tidak memiliki form, klik tombol di bawah untuk menandai selesai.</p>
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
                  <option value="">Pilih...</option>
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
              {field.type === 'file' && (
                <div className="space-y-1">
                  <label className="text-sm text-gray-600 font-medium">
                    {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <label className="flex items-center gap-2 px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl cursor-pointer text-gray-500">
                    {uploadingKey === field.key
                      ? <Spinner size="sm" />
                      : <Paperclip size={15} />
                    }
                    {form[field.key] ? 'File terunggah' : 'Pilih file'}
                    <input type="file" className="hidden" onChange={e => handleFileChange(field, e)} />
                  </label>
                </div>
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
            Kirim Jawaban
          </Button>
        </Card>

        {/* Riwayat */}
        {responses.length > 0 && (
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Riwayat Pengisian</h2>
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
