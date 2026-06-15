import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { tasksService } from '@/services/tasksService'
import { usersService } from '@/services/usersService'
import { useToast } from '@/hooks/useToast'
import { Card, Input, Textarea, Select, Checkbox, Button, Spinner } from '@/components/ui'

const FIELD_TYPES = [
  { value: 'text', label: 'Teks Singkat' },
  { value: 'textarea', label: 'Teks Panjang' },
  { value: 'number', label: 'Angka' },
  { value: 'date', label: 'Tanggal' },
  { value: 'select', label: 'Pilihan (Dropdown)' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'file', label: 'Upload File' },
]

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

// Buat "key" otomatis dari label, dijamin unik antar-field (tidak ditampilkan ke admin)
function makeKey(label, fields, idx) {
  const base = slugify(label) || `field_${idx + 1}`
  const taken = fields.filter((_, j) => j !== idx).map(f => f.key).filter(Boolean)
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base}_${n}`)) n++
  return `${base}_${n}`
}

function emptyField() {
  // _isNew menandai field baru agar key-nya mengikuti label; field lama (saat edit)
  // mempertahankan key supaya jawaban yang sudah masuk tidak rusak.
  return { key: '', label: '', type: 'text', required: false, placeholder: '', options: [], _isNew: true }
}

export default function AdminTaskFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast, confirm } = useToast()
  const isEdit = !!id

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [ministries, setMinistries] = useState([])

  const [form, setForm] = useState({
    title: '', description: '', weekly_goal: 1, period: 'minggu',
    active_days: [], open_time: '00:00', close_time: '23:59',
    allowed_ministry: [], fields_json: [],
  })

  useEffect(() => {
    usersService.getAllMinistries().then(setMinistries).catch(() => {})
    if (isEdit) {
      tasksService.getTemplateById(id)
        .then(t => {
          setForm({
            title: t.title || '',
            description: t.description || '',
            weekly_goal: t.weekly_goal || 1,
            period: t.period || 'minggu',
            active_days: t.active_days || [],
            open_time: t.open_time || '00:00',
            close_time: t.close_time || '23:59',
            allowed_ministry: t.allowed_ministry || [],
            fields_json: t.fields_json || [],
          })
        })
        .catch(err => setError(err.message || 'Gagal memuat template.'))
        .finally(() => setLoading(false))
    }
  }, [id])

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

  function toggleDay(day) {
    setForm(p => ({
      ...p,
      active_days: p.active_days.includes(day) ? p.active_days.filter(d => d !== day) : [...p.active_days, day],
    }))
  }

  function toggleMinistry(mid) {
    setForm(p => ({
      ...p,
      allowed_ministry: p.allowed_ministry.includes(mid) ? p.allowed_ministry.filter(m => m !== mid) : [...p.allowed_ministry, mid],
    }))
  }

  function addField() {
    setForm(p => ({ ...p, fields_json: [...p.fields_json, emptyField()] }))
  }
  function updateField(i, patch) {
    setForm(p => ({ ...p, fields_json: p.fields_json.map((f, idx) => idx === i ? { ...f, ...patch } : f) }))
  }
  function setFieldLabel(i, label) {
    setForm(p => ({
      ...p,
      fields_json: p.fields_json.map((f, idx) => {
        if (idx !== i) return f
        // Field baru: key ikut label. Field lama: key dipertahankan.
        return { ...f, label, key: f._isNew ? makeKey(label, p.fields_json, idx) : f.key }
      }),
    }))
  }
  function removeField(i) {
    setForm(p => ({ ...p, fields_json: p.fields_json.filter((_, idx) => idx !== i) }))
  }

  async function handleSubmit() {
    setError('')
    if (!form.title.trim()) { setError('Judul tugas wajib diisi.'); return }
    for (const f of form.fields_json) {
      if (!f.label.trim() || !f.key.trim()) { setError('Setiap field harus memiliki label.'); return }
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        weekly_goal: Number(form.weekly_goal) || 1,
        fields_json: form.fields_json.map(({ _isNew, ...f }) => f),
      }
      if (isEdit) {
        await tasksService.updateTemplate(id, payload)
      } else {
        await tasksService.createTemplate(payload)
      }
      toast.success(isEdit ? 'Template berhasil diperbarui.' : 'Template berhasil dibuat.')
      navigate('/admin/tugas')
    } catch (err) {
      setError(err.message || 'Gagal menyimpan template.')
      toast.error(err.message || 'Gagal menyimpan template.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Hapus template tugas?',
      message: 'Template ini akan dihapus permanen beserta semua jawaban terkait.',
      confirmText: 'Hapus',
      danger: true,
    })
    if (!ok) return
    setDeleting(true)
    try {
      await tasksService.deleteTemplate(id)
      toast.success('Template berhasil dihapus.')
      navigate('/admin/tugas')
    } catch (err) {
      setError(err.message || 'Gagal menghapus template.')
      toast.error(err.message || 'Gagal menghapus template.')
      setDeleting(false)
    }
  }

  if (loading) return <div className="flex justify-center items-center h-60"><Spinner /></div>

  return (
    <div className="max-w-2xl">
      <button onClick={() => navigate('/admin/tugas')} className="flex items-center gap-1 text-sm text-gray-500 mb-4">
        <ArrowLeft size={16} /> Kembali ke Form & Tugas
      </button>

      {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>}

      <Card className="p-4 mb-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Informasi Tugas</h2>
        <Input label="Judul Tugas" required value={form.title} onChange={e => set('title', e.target.value)} />
        <Textarea label="Deskripsi" rows={3} value={form.description} onChange={e => set('description', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Target Pengisian" type="number" min="1" value={form.weekly_goal} onChange={e => set('weekly_goal', e.target.value)} />
          <Select label="Periode" value={form.period} onChange={e => set('period', e.target.value)}>
            <option value="minggu">Per Minggu</option>
            <option value="bulan">Per Bulan</option>
          </Select>
        </div>
      </Card>

      <Card className="p-4 mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Hari & Jam Aktif</h2>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {DAYS.map(day => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${form.active_days.includes(day) ? 'gradient-main text-white' : 'bg-gray-100 text-gray-500'}`}
            >
              {day.slice(0, 3)}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">Kosongkan jika berlaku setiap hari.</p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Jam Buka" type="time" value={form.open_time} onChange={e => set('open_time', e.target.value)} />
          <Input label="Jam Tutup" type="time" value={form.close_time} onChange={e => set('close_time', e.target.value)} />
        </div>
      </Card>

      <Card className="p-4 mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Ministry yang Dapat Mengisi</h2>
        {ministries.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada data ministry — tugas berlaku untuk semua jemaat.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {ministries.map(m => (
              <Checkbox key={m.ministry_id} label={m.name} checked={form.allowed_ministry.includes(m.ministry_id)} onChange={() => toggleMinistry(m.ministry_id)} />
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400">Kosongkan semua agar berlaku untuk seluruh jemaat/volunteer.</p>
      </Card>

      <Card className="p-4 mb-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Form Pertanyaan</h2>
          <Button size="sm" variant="outline" onClick={addField}><Plus size={14} /> Tambah Field</Button>
        </div>

        {form.fields_json.length === 0 && (
          <p className="text-sm text-gray-400">Belum ada field. Jemaat hanya akan menekan tombol "Kirim Jawaban" untuk menandai selesai.</p>
        )}

        {form.fields_json.map((field, i) => (
          <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400">Field #{i + 1}</p>
              <button onClick={() => removeField(i)} className="text-red-400 hover:text-red-500">
                <Trash2 size={15} />
              </button>
            </div>
            <Input
              label="Label Pertanyaan" required
              value={field.label}
              onChange={e => setFieldLabel(i, e.target.value)}
            />
            <Select label="Tipe" value={field.type} onChange={e => updateField(i, { type: e.target.value })}>
              {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
            {field.type !== 'checkbox' && field.type !== 'file' && (
              <Input label="Placeholder" value={field.placeholder || ''} onChange={e => updateField(i, { placeholder: e.target.value })} />
            )}
            {field.type === 'select' && (
              <Input
                label="Pilihan (pisahkan dengan koma)"
                placeholder="Sudah, Belum, Tidak Tahu"
                value={(field.options || []).join(', ')}
                onChange={e => updateField(i, { options: e.target.value.split(',').map(o => o.trim()).filter(Boolean) })}
              />
            )}
            <Checkbox label="Wajib diisi" checked={!!field.required} onChange={e => updateField(i, { required: e.target.checked })} />
          </div>
        ))}
      </Card>

      <div className="flex gap-2">
        {isEdit && (
          <Button variant="danger" loading={deleting} onClick={handleDelete}>Hapus</Button>
        )}
        <Button className="flex-1" loading={saving} onClick={handleSubmit}>
          {isEdit ? 'Simpan Perubahan' : 'Buat Template'}
        </Button>
      </div>
    </div>
  )
}
