import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { BookOpen, Plus, Pencil, Trash2, X, QrCode, ClipboardCheck, Download } from 'lucide-react'
import { classesService } from '@/services/contentService'
import { classAttendanceService } from '@/services/attendanceService'
import { useToast } from '@/hooks/useToast'
import { Card, PageHeader, Button, Input, Textarea, Select, Spinner, EmptyState, StatusBadge, Badge } from '@/components/ui'
import { formatDate } from '@/lib/utils'

const emptyForm = { name: '', description: '', schedule: '', location: '', teacher: '', status: 'Aktif' }

export default function AdminClassesPage() {
  const { toast, confirm } = useToast()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [qrModal, setQrModal] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [attModal, setAttModal] = useState(null)
  const [attendance, setAttendance] = useState([])
  const [attLoading, setAttLoading] = useState(false)

  useEffect(() => { load() }, [])

  function load() {
    setLoading(true)
    classesService.getAll().then(setClasses).catch(() => {}).finally(() => setLoading(false))
  }

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  function openEdit(cls) {
    setEditing(cls)
    setForm({
      name: cls.name || '',
      description: cls.description || '',
      schedule: cls.schedule || '',
      location: cls.location || '',
      teacher: cls.teacher || '',
      status: cls.status || 'Aktif',
    })
    setError('')
    setShowModal(true)
  }

  async function handleSubmit() {
    setError('')
    if (!form.name.trim()) { setError('Nama kelas wajib diisi.'); return }
    setSaving(true)
    try {
      if (editing) {
        await classesService.update(editing.class_id, form)
      } else {
        await classesService.create(form)
      }
      setShowModal(false)
      toast.success(editing ? 'Kelas berhasil diperbarui.' : 'Kelas berhasil ditambahkan.')
      load()
    } catch (err) {
      setError(err.message || 'Gagal menyimpan kelas.')
      toast.error(err.message || 'Gagal menyimpan kelas.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(cls) {
    const ok = await confirm({
      title: 'Hapus kelas?',
      message: `Kelas "${cls.name}" akan dihapus permanen.`,
      confirmText: 'Hapus',
      danger: true,
    })
    if (!ok) return
    try {
      await classesService.delete(cls.class_id)
      toast.success('Kelas berhasil dihapus.')
      load()
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus kelas.')
    }
  }

  async function openQr(cls) {
    setQrModal(cls)
    setQrDataUrl('')
    const url = await QRCode.toDataURL(`ESC-ABSEN:${cls.class_id}`, { width: 320, margin: 1 })
    setQrDataUrl(url)
  }

  async function openAttendance(cls) {
    setAttModal(cls)
    setAttLoading(true)
    try {
      setAttendance(await classAttendanceService.getByClass(cls.class_id))
    } catch {
      setAttendance([])
    } finally {
      setAttLoading(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Kelola Kelas & Pembinaan"
        subtitle={`${classes.length} kelas`}
        action={<Button size="sm" onClick={openCreate}><Plus size={15} /> Tambah Kelas</Button>}
      />

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && classes.length === 0 && (
        <EmptyState icon={BookOpen} title="Belum ada kelas" description="Tambahkan kelas pembinaan pertama." />
      )}

      {!loading && classes.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {classes.map(cls => (
            <div key={cls.class_id} className="flex items-center gap-3 p-3.5">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <BookOpen size={20} className="text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{cls.name}</p>
                {cls.schedule && <p className="text-xs text-gray-400 mt-0.5 truncate">{cls.schedule}</p>}
                {cls.teacher && <p className="text-xs text-gray-400 mt-0.5 truncate">Pengajar: {cls.teacher}</p>}
              </div>
              <StatusBadge status={cls.status} />
              <button onClick={() => openQr(cls)} title="QR Absensi" className="p-2 text-gray-400 hover:text-blue-500 shrink-0">
                <QrCode size={16} />
              </button>
              <button onClick={() => openAttendance(cls)} title="Daftar Hadir" className="p-2 text-gray-400 hover:text-green-500 shrink-0">
                <ClipboardCheck size={16} />
              </button>
              <button onClick={() => openEdit(cls)} className="p-2 text-gray-400 hover:text-orange-500 shrink-0">
                <Pencil size={16} />
              </button>
              <button onClick={() => handleDelete(cls)} className="p-2 text-gray-400 hover:text-red-500 shrink-0">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </Card>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-4 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{editing ? 'Edit Kelas' : 'Tambah Kelas'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

            <Input label="Nama Kelas" required value={form.name} onChange={e => set('name', e.target.value)} />
            <Textarea label="Deskripsi" rows={3} value={form.description} onChange={e => set('description', e.target.value)} />
            <Input label="Jadwal" placeholder="cth: Setiap Sabtu, 16:00" value={form.schedule} onChange={e => set('schedule', e.target.value)} />
            <Input label="Lokasi" value={form.location} onChange={e => set('location', e.target.value)} />
            <Input label="Pengajar" value={form.teacher} onChange={e => set('teacher', e.target.value)} />
            <Select label="Status" value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="Aktif">Aktif</option>
              <option value="Nonaktif">Nonaktif</option>
            </Select>

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={() => setShowModal(false)}>Batal</Button>
              <Button className="flex-1" loading={saving} onClick={handleSubmit}>
                {editing ? 'Simpan' : 'Tambah'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Modal QR Absensi */}
      {qrModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm p-5 space-y-4 text-center">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">QR Absensi</h2>
              <button onClick={() => setQrModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-600">{qrModal.name}</p>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Absensi" className="w-full rounded-xl border border-gray-100" />
            ) : (
              <div className="flex justify-center py-10"><Spinner /></div>
            )}
            <p className="text-xs text-gray-400">Tunjukkan atau cetak kode ini agar jemaat dapat memindai untuk mencatat kehadiran di kelas ini.</p>
            {qrDataUrl && (
              <a href={qrDataUrl} download={`QR-Absensi-${qrModal.class_id}.png`}>
                <Button variant="outline" className="w-full"><Download size={15} /> Unduh QR</Button>
              </a>
            )}
          </Card>
        </div>
      )}

      {/* Modal Daftar Hadir */}
      {attModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-4 space-y-3 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Daftar Hadir</h2>
              <button onClick={() => setAttModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-400">{attModal.name}</p>

            {attLoading && <div className="flex justify-center py-8"><Spinner /></div>}

            {!attLoading && attendance.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">Belum ada data kehadiran.</p>
            )}

            {!attLoading && attendance.length > 0 && (
              <div className="divide-y divide-gray-100">
                {attendance.map(a => (
                  <div key={a.attendance_id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{a.users?.name || '-'}</p>
                      <p className="text-xs text-gray-400">{formatDate(a.attendance_date)}</p>
                    </div>
                    <Badge color="green">Hadir</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
