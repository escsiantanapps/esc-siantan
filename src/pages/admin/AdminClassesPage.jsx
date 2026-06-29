import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { BookOpen, Plus, Pencil, Trash2, X, QrCode, ClipboardCheck, Download, Users, FileSpreadsheet } from 'lucide-react'
import { classesService } from '@/services/contentService'
import { classAttendanceService } from '@/services/attendanceService'
import { pushService } from '@/services/pushService'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { useBackClose } from '@/hooks/useBackClose'
import { Card, PageHeader, Button, Input, Textarea, Select, Spinner, EmptyState, StatusBadge, Badge } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { downloadXlsx } from '@/lib/exportXlsx'

const emptyForm = { name: '', description: '', schedule: '', location: '', teacher: '', status: 'Aktif', total_sessions: 1 }

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
  const [regLoading, setRegLoading] = useState(false)
  useBackClose(showModal || !!qrModal || !!attModal || !!regModal, () => {
    setShowModal(false); setQrModal(null); setAttModal(null); setRegModal(null)
  })
  const [attSession, setAttSession] = useState('')
  const [attDate, setAttDate] = useState('')
  const [attendance, setAttendance] = useState([])
  const [attLoading, setAttLoading] = useState(false)

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
  useEffect(() => {
    if (!regModal) return
    setRegLoading(true)
    Promise.all([
      classesService.getRegistrations(regModal.class_id),
      classAttendanceService.getByClass(regModal.class_id, {}),
    ])
      .then(([regs, att]) => {
        const attendedCount = {}
        for (const a of att || []) attendedCount[a.user_id] = (attendedCount[a.user_id] || 0) + 1
        setRegistrants((regs || []).map(r => ({
          user_id: r.user_id,
          name: r.users?.name || '-',
          role: r.users?.role || '',
          attended: attendedCount[r.user_id] || 0,
        })))
      })
      .catch(() => setRegistrants([]))
      .finally(() => setRegLoading(false))
  }, [regModal])

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
      total_sessions: cls.total_sessions || 1,
    })
    setError('')
    setShowModal(true)
  }

  async function handleSubmit() {
    setError('')
    if (!form.name.trim()) { setError(t('acls.nameRequired')); return }
    setSaving(true)
    try {
      const payload = { ...form, total_sessions: Number(form.total_sessions) || 1 }
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

            <Input label={t('acls.nameLabel')} required value={form.name} onChange={e => set('name', e.target.value)} />
            <Textarea label={t('acls.description')} rows={3} value={form.description} onChange={e => set('description', e.target.value)} />
            <Input label={t('acls.schedule')} placeholder={t('acls.schedulePh')} value={form.schedule} onChange={e => set('schedule', e.target.value)} />
            <Input label={t('acls.location')} value={form.location} onChange={e => set('location', e.target.value)} />
            <Input label={t('acls.teacher')} value={form.teacher} onChange={e => set('teacher', e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input label={t('acls.totalSessions')} type="number" min="1" value={form.total_sessions} onChange={e => set('total_sessions', e.target.value)} />
              <Select label={t('acls.statusLabel')} value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="Aktif">{t('status.Aktif')}</option>
                <option value="Nonaktif">{t('status.Nonaktif')}</option>
              </Select>
            </div>
            <p className="text-xs text-gray-400">{t('acls.sessionsHint')}</p>

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
                {Array.from({ length: qrModal.total_sessions || 1 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{t('a.sessionN', { n })}</option>
                ))}
              </Select>
            </div>

            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR" className="w-full rounded-xl border border-gray-100" />
            ) : (
              <div className="flex justify-center py-10"><Spinner /></div>
            )}
            <p className="text-xs text-gray-400">{t('acls.qrHint', { n: qrSession })}</p>
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
                {Array.from({ length: attModal.total_sessions || 1 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{t('a.sessionN', { n })}</option>
                ))}
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

            {!regLoading && registrants.length > 0 && (
              <div className="divide-y divide-gray-100">
                {registrants.map(r => (
                  <div key={r.user_id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                      <p className="text-xs text-gray-400">{r.role}</p>
                    </div>
                    <Badge color={r.attended > 0 ? 'green' : 'gray'}>
                      {t('acls.attendedOf', { attended: r.attended, total: regModal.total_sessions || 1 })}
                    </Badge>
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
