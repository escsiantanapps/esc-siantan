import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { BookOpen, Plus, Pencil, Trash2, X, QrCode, ClipboardCheck, Download, Users, FileSpreadsheet } from 'lucide-react'
import { classesService, mediaService } from '@/services/contentService'
import { classAttendanceService } from '@/services/attendanceService'
import { pushService } from '@/services/pushService'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { useBackClose } from '@/hooks/useBackClose'
import { Card, PageHeader, Button, Input, Textarea, Select, Checkbox, Spinner, EmptyState, StatusBadge, Badge } from '@/components/ui'
import MediaListUploader from '@/components/MediaListUploader'
import Uploader from '@/components/Uploader'
import { formatDate, validateUpload, compressImage } from '@/lib/utils'
import { downloadXlsx } from '@/lib/exportXlsx'
import { prerequisiteService } from '@/services/contentService'

const PREREQ_FIELD_TYPES = [
  { value: 'text', label: 'Teks Singkat' },
  { value: 'textarea', label: 'Teks Panjang' },
  { value: 'file', label: 'Upload File' },
]
function slugifyKey(str) { return String(str || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') }
function makeUniqueKey(label, fields, idx) {
  const base = slugifyKey(label) || `field_${idx + 1}`
  const taken = fields.filter((_, j) => j !== idx).map(f => f.key).filter(Boolean)
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base}_${n}`)) n++
  return `${base}_${n}`
}

const emptyForm = {
  name: '', description: '', schedule: '', location: '', teacher: '', status: 'Mulai',
  total_sessions: 1, session_names: [''],
  contact_wa: '', contact_wa_female: '', whatsapp_group_url: '',
  thumbnail_url: '',
  photo_urls: [], video_urls: [],
  require_approval: false,
  prerequisite_enabled: false, prerequisite_fields: [],
}

export default function AdminClassesPage() {
  const { toast, confirm } = useToast()
  const { t } = useLang()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [qrModal, setQrModal] = useState(null)
  const [qrSession, setQrSession] = useState(1)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [attModal, setAttModal] = useState(null)
  const [regModal, setRegModal] = useState(null)
  const [registrants, setRegistrants] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [regLoading, setRegLoading] = useState(false)
  const [rejectingId, setRejectingId] = useState(null) // id yang sedang input alasan tolak
  const [rejectNote, setRejectNote] = useState('')
  const [prereqBusy, setPrereqBusy] = useState(null) // id action-in-flight
  useBackClose(showModal || !!qrModal || !!attModal || !!regModal, () => {
    setShowModal(false); setQrModal(null); setAttModal(null); setRegModal(null)
  })
  const [attSession, setAttSession] = useState('')
  const [attDate, setAttDate] = useState('')
  const [attendance, setAttendance] = useState([])
  const [attLoading, setAttLoading] = useState(false)
  const [mediaBusy, setMediaBusy] = useState(false)
  const [thumbUploading, setThumbUploading] = useState(false)

  useEffect(() => { load() }, [])

  // Render QR sesuai kelas + sesi terpilih.
  useEffect(() => {
    if (!qrModal) { setQrDataUrl(''); return }
    QRCode.toDataURL(`ESC-ABSEN:${qrModal.class_id}:${qrSession}`, { width: 320, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [qrModal, qrSession])

  // Muat daftar hadir kelas terpilih, filter sesi & tanggal.
  useEffect(() => {
    if (!attModal) return
    setAttLoading(true)
    classAttendanceService.getByClass(attModal.class_id, { session: attSession, date: attDate })
      .then(setAttendance)
      .catch(() => setAttendance([]))
      .finally(() => setAttLoading(false))
  }, [attModal, attSession, attDate])

  // Rekap pendaftar: gabungkan daftar + jumlah sesi yang sudah dihadiri.
  // Kalau kelas pakai prasyarat, load juga submissions di tab kedua.
  useEffect(() => {
    if (!regModal) return
    loadRegistrants()
    // Selalu load submissions bila kelas pakai prasyarat.
    if (Array.isArray(regModal.prerequisite_fields) && regModal.prerequisite_fields.length > 0) {
      prerequisiteService.getForTarget('class', regModal.class_id)
        .then(setSubmissions).catch(() => setSubmissions([]))
    } else {
      setSubmissions([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regModal])

  function loadRegistrants() {
    setRegLoading(true)
    Promise.all([
      classesService.getRegistrations(regModal.class_id),
      classAttendanceService.getByClass(regModal.class_id, {}),
    ])
      .then(([regs, att]) => {
        const attendedCount = {}
        for (const a of att || []) attendedCount[a.user_id] = (attendedCount[a.user_id] || 0) + 1
        setRegistrants((regs || []).map(r => ({
          registration_id: r.registration_id,
          user_id: r.user_id,
          name: r.users?.name || '-',
          role: r.users?.role || '',
          attended: attendedCount[r.user_id] || 0,
        })))
      })
      .catch(() => setRegistrants([]))
      .finally(() => setRegLoading(false))
  }

  async function reloadSubmissions() {
    const list = await prerequisiteService.getForTarget('class', regModal.class_id).catch(() => [])
    setSubmissions(list)
  }

  async function handleRemoveRegistrant(r) {
    const ok = await confirm({
      title: 'Hapus peserta?',
      message: `Peserta "${r.name}" akan dihapus dari kelas ini.`,
      confirmText: 'Hapus', danger: true,
    })
    if (!ok) return
    try {
      await classesService.removeRegistration(r.registration_id)
      toast.success('Peserta dihapus.')
      loadRegistrants()
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus peserta.')
    }
  }

  async function handleApproveSubmission(s) {
    setPrereqBusy(s.id)
    try {
      await prerequisiteService.approve(s.id, {
        kind: 'class', targetId: regModal.class_id, userId: s.user_id,
      })
      pushService.broadcast({
        title: 'Pendaftaran Kelas Disetujui',
        body: `Pendaftaran Anda untuk kelas "${regModal.name}" telah disetujui.`,
        url: `/kelas/${regModal.class_id}`,
        userIds: [s.user_id],
      }).catch(() => {})
      toast.success('Peserta disetujui.')
      await reloadSubmissions()
      loadRegistrants()
    } catch (err) {
      toast.error(err.message || 'Gagal menyetujui.')
    } finally {
      setPrereqBusy(null)
    }
  }

  async function handleRejectSubmission(s) {
    if (!rejectNote.trim()) { toast.error('Alasan penolakan wajib diisi.'); return }
    setPrereqBusy(s.id)
    try {
      await prerequisiteService.reject(s.id, rejectNote.trim())
      pushService.broadcast({
        title: 'Pendaftaran Kelas Ditolak',
        body: rejectNote.trim(),
        url: `/kelas/${regModal.class_id}`,
        userIds: [s.user_id],
      }).catch(() => {})
      toast.success('Peserta ditolak.')
      setRejectingId(null); setRejectNote('')
      await reloadSubmissions()
    } catch (err) {
      toast.error(err.message || 'Gagal menolak.')
    } finally {
      setPrereqBusy(null)
    }
  }

  async function handleRemoveSubmission(s) {
    const ok = await confirm({
      title: 'Hapus pengajuan?',
      message: 'Kalau sudah disetujui, pendaftaran peserta ini juga ikut terhapus.',
      confirmText: 'Hapus', danger: true,
    })
    if (!ok) return
    setPrereqBusy(s.id)
    try {
      await prerequisiteService.remove(s.id)
      toast.success('Pengajuan dihapus.')
      await reloadSubmissions()
      loadRegistrants()
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus.')
    } finally {
      setPrereqBusy(null)
    }
  }

  function load() {
    setLoading(true)
    classesService.getAll().then(setClasses).catch(() => {}).finally(() => setLoading(false))
  }

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

  async function handleThumbUpload(file) {
    if (!file) return
    setThumbUploading(true)
    try {
      file = await compressImage(file)
      validateUpload(file, { maxMB: 5, image: true })
      const url = await classesService.uploadThumbnail(file)
      set('thumbnail_url', url)
      toast.success('Gambar sampul berhasil diunggah.')
    } catch (err) {
      toast.error(err.message || 'Gagal mengunggah gambar.')
    } finally {
      setThumbUploading(false)
    }
  }

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
        const url = await mediaService.uploadVideo('classes', file)
        set('video_urls', [...form.video_urls, url])
      } else {
        file = await compressImage(file, { maxDim: 1600 })
        validateUpload(file, { maxMB: 5, image: true })
        const url = await mediaService.uploadPhoto('classes', file)
        set('photo_urls', [...form.photo_urls, url])
      }
    } catch (err) {
      toast.error(err.message || t('acls.saveFailed'))
    } finally {
      setMediaBusy(false)
    }
  }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  function openEdit(cls) {
    setEditing(cls)
    const n = cls.total_sessions || 1
    setForm({
      name: cls.name || '',
      description: cls.description || '',
      schedule: cls.schedule || '',
      location: cls.location || '',
      teacher: cls.teacher || '',
      status: cls.status || 'Mulai',
      ...cls,
      session_names: Array.isArray(cls.session_names) && cls.session_names.length > 0 ? cls.session_names : [''],
      require_approval: !!cls.require_approval,
      prerequisite_enabled: Array.isArray(cls.prerequisite_fields) && cls.prerequisite_fields.length > 0,
      prerequisite_fields: cls.prerequisite_fields || [],
    })
    setError('')
    setShowModal(true)
  }

  // Editor field prasyarat.
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

  async function handleSubmit() {
    setError('')
    if (!form.name.trim()) { setError(t('acls.nameRequired')); return }
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
      const { prerequisite_enabled, prerequisite_fields, require_approval, ...rest } = form
      const payload = {
        ...rest,
        require_approval,
        total_sessions: rest.session_names.length,
        prerequisite_fields: prerequisite_enabled
          ? prerequisite_fields.map(f => ({ ...f, key: f.key || makeUniqueKey(f.label, prerequisite_fields, prerequisite_fields.indexOf(f)) }))
          : null,
      }
      let classId = editing?.class_id
      if (editing) {
        await classesService.update(editing.class_id, payload)
      } else {
        const created = await classesService.create(payload)
        classId = created?.class_id
      }
      // Notifikasi push ke semua jemaat (tidak menggagalkan simpan bila gagal)
      pushService.broadcast({
        title: editing ? t('acls.pushUpdated') : t('acls.pushNew'),
        body: form.name,
        url: classId ? `/kelas/${classId}` : '/kelas',
      }).catch(() => {})
      setShowModal(false)
      toast.success(editing ? t('acls.updated') : t('acls.created'))
      load()
    } catch (err) {
      setError(err.message || t('acls.saveFailed'))
      toast.error(err.message || t('acls.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(cls) {
    const ok = await confirm({
      title: t('acls.deleteTitle'),
      message: t('acls.deleteMsg', { name: cls.name }),
      confirmText: t('a.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await classesService.delete(cls.class_id)
      toast.success(t('acls.deleted'))
      load()
    } catch (err) {
      toast.error(err.message || t('acls.deleteFailed'))
    }
  }

  function openQr(cls) {
    setQrSession(1)
    setQrModal(cls)
  }

  function openAttendance(cls) {
    setAttSession('')
    setAttDate('')
    setAttModal(cls)
  }

  async function exportAttendance() {
    await downloadXlsx({
      filename: `kehadiran-${attModal.name}.xlsx`,
      sheetName: 'Kehadiran',
      titleLines: ['ESC Siantan', `Daftar Hadir Kelas: ${attModal.name}`],
      headers: [t('aoff.exportColName'), t('aoff.exportColPhone'), 'Tanggal', 'Sesi'],
      rows: attendance.map(a => [a.users?.name || '-', a.users?.phone || '', formatDate(a.attendance_date), a.session_no || '']),
    })
  }

  async function exportRegistrants() {
    await downloadXlsx({
      filename: `pendaftar-${regModal.name}.xlsx`,
      sheetName: 'Pendaftar',
      titleLines: ['ESC Siantan', `Pendaftar Kelas: ${regModal.name}`],
      headers: [t('aoff.exportColName'), 'Role', t('acls.sessionsAttended')],
      rows: registrants.map(r => [r.name, r.role, `${r.attended}/${regModal.total_sessions || 1}`]),
    })
  }

  return (
    <div>
      <PageHeader
        title={t('acls.title')}
        subtitle={t('acls.subtitle', { count: classes.length })}
        action={<Button size="sm" onClick={openCreate}><Plus size={15} /> {t('acls.add')}</Button>}
      />

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && classes.length === 0 && (
        <EmptyState icon={BookOpen} title={t('acls.empty')} description={t('acls.emptyDesc')} />
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
                {cls.teacher && <p className="text-xs text-gray-400 mt-0.5 truncate">{t('acls.teacherLabel', { name: cls.teacher })}</p>}
              </div>
              <StatusBadge status={cls.status} />
              <button onClick={() => setRegModal(cls)} title={t('acls.registrants')} className="p-2 text-gray-400 hover:text-purple-500 shrink-0">
                <Users size={16} />
              </button>
              <button onClick={() => openQr(cls)} title={t('a.qrAttendance')} className="p-2 text-gray-400 hover:text-blue-500 shrink-0">
                <QrCode size={16} />
              </button>
              <button onClick={() => openAttendance(cls)} title={t('a.attendanceList')} className="p-2 text-gray-400 hover:text-green-500 shrink-0">
                <ClipboardCheck size={16} />
              </button>
              <button onClick={() => openEdit(cls)} className="p-2 text-gray-400 hover:text-brand-500 shrink-0">
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
              <h2 className="text-sm font-semibold text-gray-900">{editing ? t('acls.editTitle') : t('acls.addTitle')}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

            <Uploader
              kind="image" crop aspect={16 / 9} label="Gambar Sampul"
              hint="Atur bingkai (16:9) agar tidak terpotong · maks 5 MB"
              value={form.thumbnail_url} uploading={thumbUploading}
              onFile={handleThumbUpload} onClear={() => set('thumbnail_url', '')}
            />

            <Input label={t('acls.nameLabel')} required value={form.name} onChange={e => set('name', e.target.value)} />
            <Textarea label={t('acls.description')} rows={3} value={form.description} onChange={e => set('description', e.target.value)} />
            <Input label={t('acls.schedule')} placeholder={t('acls.schedulePh')} value={form.schedule} onChange={e => set('schedule', e.target.value)} />
            <Input label={t('acls.location')} value={form.location} onChange={e => set('location', e.target.value)} />
            <Input label={t('acls.teacher')} value={form.teacher} onChange={e => set('teacher', e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={t('acls.totalSessions')} type="number" min="1" value={form.total_sessions}
                onChange={e => {
                  const n = Math.max(1, Number(e.target.value) || 1)
                  setForm(p => ({
                    ...p,
                    total_sessions: n,
                    session_names: Array.from({ length: n }, (_, i) => (p.session_names || [])[i] || ''),
                  }))
                }}
              />
              <Select label={t('acls.statusLabel')} value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="Mulai">{t('status.Mulai')}</option>
                <option value="Sedang Berlangsung">{t('status.Sedang Berlangsung')}</option>
                <option value="Selesai">{t('status.Selesai')}</option>
              </Select>
            </div>
            <p className="text-xs text-gray-400">{t('acls.sessionsHint')}</p>

            {/* Sesi pertemuan — otomatis bernomor 1..N. Bisa tambah/hapus per
                sesi (mis. jadwal 20x pertemuan). Nama sesi opsional. */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600">Sesi Pertemuan ({Number(form.total_sessions) || 1}) — nama opsional</p>
              {Array.from({ length: Number(form.total_sessions) || 1 }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-400 w-11 shrink-0">Sesi {i + 1}</span>
                  <Input
                    className="flex-1"
                    placeholder="cth: Doktrin Keselamatan"
                    value={(form.session_names || [])[i] || ''}
                    onChange={e => {
                      const names = [...(form.session_names || Array(Number(form.total_sessions) || 1).fill(''))]
                      names[i] = e.target.value
                      set('session_names', names)
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Hapus Sesi ${i + 1}`}
                    disabled={(Number(form.total_sessions) || 1) <= 1}
                    onClick={() => setForm(p => {
                      const names = [...(p.session_names || Array(Number(p.total_sessions) || 1).fill(''))]
                      names.splice(i, 1)
                      const next = names.length ? names : ['']
                      return { ...p, session_names: next, total_sessions: next.length }
                    })}
                    className="p-2 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-400 shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setForm(p => {
                  const names = [...(p.session_names || Array(Number(p.total_sessions) || 1).fill('')), '']
                  return { ...p, session_names: names, total_sessions: names.length }
                })}
                className="flex items-center gap-1.5 text-sm text-brand-500 font-medium pt-1"
              >
                <Plus size={15} /> Tambah Sesi
              </button>
            </div>

            {/* Kontak WA & Grup */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <Input label="Kontak WA (L)" placeholder="08xxxxxxxxxx" value={form.contact_wa} onChange={e => set('contact_wa', e.target.value)} />
              <Input label="Kontak WA (P)" placeholder="08xxxxxxxxxx" value={form.contact_wa_female} onChange={e => set('contact_wa_female', e.target.value)} />
            </div>
            <Input
              label="Link Grup WhatsApp (opsional)"
              placeholder="https://chat.whatsapp.com/..."
              value={form.whatsapp_group_url}
              onChange={e => set('whatsapp_group_url', e.target.value)}
            />
            <p className="text-xs text-gray-400 -mt-2">Ditampilkan HANYA bagi jemaat yang sudah resmi terdaftar di kelas ini.</p>

            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Wajibkan Verifikasi Admin</p>
                  <p className="text-xs text-gray-400 mt-0.5">Jemaat yang mendaftar harus disetujui admin terlebih dahulu.</p>
                </div>
                <button
                  type="button" role="switch" aria-checked={form.require_approval}
                  onClick={() => set('require_approval', !form.require_approval)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${form.require_approval ? 'bg-brand-500' : 'bg-control-hover'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.require_approval ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            {/* Formulir Prasyarat (opsional) */}
            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Formulir Persyaratan Tambahan (Opsional)</p>
                  <p className="text-xs text-gray-400 mt-0.5">Minta jemaat mengisi form sebelum mendaftar.</p>
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
                <div className="space-y-3 pt-3">
                  {form.prerequisite_fields.map((f, i) => (
                    <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-2">
                          <Input label="Label" value={f.label} onChange={e => setPrereqLabel(i, e.target.value)} />
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
            </div>

            {/* Galeri media */}
            <div className="space-y-3 pt-1">
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
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={() => setShowModal(false)}>{t('a.cancel')}</Button>
              <Button className="flex-1" loading={saving} onClick={handleSubmit}>
                {editing ? t('a.save') : t('a.add')}
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
              <h2 className="text-sm font-semibold text-gray-900">{t('a.qrAttendance')}</h2>
              <button onClick={() => setQrModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-600">{qrModal.name}</p>

            <div className="text-left">
              <Select label={t('a.sessionN', { n: '' }).trim()} value={qrSession} onChange={e => setQrSession(Number(e.target.value))}>
                {Array.from({ length: qrModal.total_sessions || 1 }, (_, i) => i + 1).map(n => {
                  const sName = (qrModal.session_names || [])[n - 1]
                  return <option key={n} value={n}>{sName ? `Sesi ${n}: ${sName}` : t('a.sessionN', { n })}</option>
                })}
              </Select>
            </div>

            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR" className="w-full rounded-xl border border-gray-100" />
            ) : (
              <div className="flex justify-center py-10"><Spinner /></div>
            )}
            <p className="text-xs text-gray-400">
              {(qrModal.session_names || [])[qrSession - 1]
                ? `QR Sesi ${qrSession}: ${qrModal.session_names[qrSession - 1]}`
                : t('acls.qrHint', { n: qrSession })}
            </p>
            {qrDataUrl && (
              <a href={qrDataUrl} download={`QR-${qrModal.name}-Sesi${qrSession}.png`}>
                <Button variant="outline" className="w-full"><Download size={15} /> {t('a.downloadQr')}</Button>
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
              <h2 className="text-sm font-semibold text-gray-900">{t('a.attendanceList')}</h2>
              <button onClick={() => setAttModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-400">{attModal.name}</p>
              {attendance.length > 0 && (
                <button onClick={exportAttendance} className="text-xs text-brand-500 flex items-center gap-1 shrink-0">
                  <FileSpreadsheet size={13} /> {t('a.exportExcel')}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Select value={attSession} onChange={e => setAttSession(e.target.value)}>
                <option value="">{t('a.allSessions')}</option>
                {Array.from({ length: attModal.total_sessions || 1 }, (_, i) => i + 1).map(n => {
                  const sName = (attModal.session_names || [])[n - 1]
                  return <option key={n} value={n}>{sName ? `Sesi ${n}: ${sName}` : t('a.sessionN', { n })}</option>
                })}
              </Select>
              <Input type="date" value={attDate} onChange={e => setAttDate(e.target.value)} />
            </div>

            {attLoading && <div className="flex justify-center py-8"><Spinner /></div>}

            {!attLoading && attendance.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">{t('acls.noAttendance')}</p>
            )}

            {!attLoading && attendance.length > 0 && (
              <div className="divide-y divide-gray-100">
                {attendance.map(a => (
                  <div key={a.attendance_id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{a.users?.name || '-'}</p>
                      <p className="text-xs text-gray-400">
                        {formatDate(a.attendance_date)}{a.session_no ? ` · ${t('a.sessionN', { n: a.session_no })}` : ''}
                      </p>
                    </div>
                    <Badge color="green">{t('status.Hadir')}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Modal Rekap Pendaftar */}
      {regModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-4 space-y-3 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{t('acls.registrants')}</h2>
              <button onClick={() => setRegModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-400">{regModal.name}</p>
              {registrants.length > 0 && (
                <button onClick={exportRegistrants} className="text-xs text-brand-500 flex items-center gap-1 shrink-0">
                  <FileSpreadsheet size={13} /> {t('a.exportExcel')}
                </button>
              )}
            </div>

            {regLoading && <div className="flex justify-center py-8"><Spinner /></div>}

            {!regLoading && registrants.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">{t('acls.noRegistrants')}</p>
            )}

            {/* MODE B: submissions prasyarat (kalau kelas pakai formulir prasyarat) */}
            {Array.isArray(regModal.prerequisite_fields) && regModal.prerequisite_fields.length > 0 && (
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Formulir Prasyarat</p>
                {submissions.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-3">Belum ada pengajuan.</p>
                ) : (
                  <div className="space-y-2">
                    {submissions.map(s => (
                      <div key={s.id} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{s.users?.name || '-'}</p>
                            <p className="text-[10px] text-gray-400">{formatDate(s.created_at, 'd MMM yyyy, HH:mm')}</p>
                          </div>
                          <StatusBadge status={s.status} />
                        </div>
                        <div className="space-y-1.5">
                          {(regModal.prerequisite_fields || []).map(f => {
                            const val = s.data_json?.[f.key]
                            const isFile = f.type === 'file' && typeof val === 'string' && /^https?:\/\//.test(val)
                            return (
                              <div key={f.key} className="text-xs">
                                <p className="text-gray-400">{f.label}</p>
                                {isFile ? (
                                  <a href={val} target="_blank" rel="noopener noreferrer" className="text-brand-500 underline break-all">Buka file</a>
                                ) : (
                                  <p className="text-gray-700 whitespace-pre-line break-words">{val || '-'}</p>
                                )}
                              </div>
                            )
                          })}
                          {s.admin_note && <p className="text-[10px] text-gray-500 italic pt-1">Catatan admin: {s.admin_note}</p>}
                        </div>
                        {rejectingId === s.id ? (
                          <div className="space-y-2">
                            <Textarea rows={2} placeholder="Alasan penolakan (dikirim ke jemaat)" value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
                            <div className="flex gap-2">
                              <Button size="sm" variant="ghost" className="flex-1" onClick={() => { setRejectingId(null); setRejectNote('') }}>Batal</Button>
                              <Button size="sm" variant="danger" className="flex-1" loading={prereqBusy === s.id} onClick={() => handleRejectSubmission(s)}>Kirim Tolak</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            {s.status === 'Menunggu' && (
                              <>
                                <Button size="sm" className="flex-1" loading={prereqBusy === s.id} onClick={() => handleApproveSubmission(s)}>Setujui</Button>
                                <Button size="sm" variant="outline" className="flex-1" onClick={() => { setRejectingId(s.id); setRejectNote('') }}>Tolak</Button>
                              </>
                            )}
                            <button
                              type="button" onClick={() => handleRemoveSubmission(s)}
                              disabled={prereqBusy === s.id}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50"
                              aria-label="Hapus pengajuan"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!regLoading && registrants.length > 0 && (
              <div className="divide-y divide-gray-100 border-t border-gray-100 pt-2">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide pb-2">Peserta Terdaftar</p>
                {registrants.map(r => (
                  <div key={r.registration_id || r.user_id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                      <p className="text-xs text-gray-400">{r.role}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge color={r.attended > 0 ? 'green' : 'gray'}>
                        {t('acls.attendedOf', { attended: r.attended, total: regModal.total_sessions || 1 })}
                      </Badge>
                      <button
                        type="button" onClick={() => handleRemoveRegistrant(r)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                        aria-label="Hapus peserta"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
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
