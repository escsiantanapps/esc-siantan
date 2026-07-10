import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import {
  CalendarClock, Download, FileSpreadsheet, Plus, Trash2, ArrowLeft, Users, MapPin, AlertTriangle,
} from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { ministryScheduleService } from '@/services/ministryScheduleService'
import { ministriesService, appSettingsService } from '@/services/contentService'
import { Card, PageHeader, Input, Button, Spinner, EmptyState, Badge, Avatar, Checkbox } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { downloadXlsx } from '@/lib/exportXlsx'

function todayISO() { return new Date().toISOString().slice(0, 10) }
function ymOf(date) { return date.slice(0, 7) }

// Absen Pelayanan Minggu (Admin) — kelola jadwal pelayanan Volunteer per tanggal
// & ministry, tugaskan volunteer, set jam mulai, tampilkan QR ESC-VOLUNTEER, dan
// pantau rekap kehadiran (tepat waktu / terlambat + badge "3x telat" per bulan).
export default function AdminMinistrySchedulePage() {
  const { toast, confirm } = useToast()
  const { profile } = useAuth()
  const { t } = useLang()

  const [date, setDate] = useState(todayISO())
  const [ministries, setMinistries] = useState([])
  const [schedules, setSchedules] = useState([]) // jadwal pada tanggal ini
  const [loading, setLoading] = useState(true)

  // Panel detail satu jadwal.
  const [selected, setSelected] = useState(null) // schedule object
  const [members, setMembers] = useState([])
  const [assigned, setAssigned] = useState([]) // user_id[]
  const [startTime, setStartTime] = useState('09:00')
  const [qr, setQr] = useState('')
  const [attendance, setAttendance] = useState([])
  const [lateCounts, setLateCounts] = useState({})
  const [savingAssign, setSavingAssign] = useState(false)
  const [panelLoading, setPanelLoading] = useState(false)

  function loadList() {
    setLoading(true)
    Promise.all([
      ministriesService.getAll().catch(() => []),
      ministryScheduleService.listByDate(date).catch(() => []),
    ])
      .then(([mins, schs]) => { setMinistries(mins || []); setSchedules(schs || []) })
      .finally(() => setLoading(false))
  }
  useEffect(loadList, [date])

  const scheduleByMinistry = Object.fromEntries(schedules.map(s => [s.ministry_id, s]))

  async function handleCreate(ministry) {
    try {
      const sched = await ministryScheduleService.create({
        ministryId: ministry.ministry_id,
        serviceDate: date,
        startTime: '09:00',
        createdBy: profile.user_id,
      })
      toast.success(t('apel.created'))
      loadList()
      openSchedule(sched)
    } catch (err) {
      toast.error(err.message || t('apel.createFailed'))
    }
  }

  async function openSchedule(sched) {
    setSelected(sched)
    setPanelLoading(true)
    setStartTime((sched.start_time || '09:00').slice(0, 5))
    try {
      const [mem, asg, att, late, qrUrl] = await Promise.all([
        ministryScheduleService.listMinistryMembers(sched.ministry_id).catch(() => []),
        ministryScheduleService.getAssignments(sched.schedule_id).catch(() => []),
        ministryScheduleService.getAttendance(sched.schedule_id).catch(() => []),
        ministryScheduleService.getMonthlyLateCounts(ymOf(sched.service_date)).catch(() => ({})),
        QRCode.toDataURL(`ESC-VOLUNTEER:${sched.schedule_id}`, { width: 320, margin: 1 }).catch(() => ''),
      ])
      setMembers(mem); setAssigned(asg); setAttendance(att); setLateCounts(late); setQr(qrUrl)
    } finally {
      setPanelLoading(false)
    }
  }

  function closePanel() {
    setSelected(null)
    setMembers([]); setAssigned([]); setAttendance([]); setQr(''); setLateCounts({})
    loadList()
  }

  function toggleAssign(userId) {
    setAssigned(p => p.includes(userId) ? p.filter(u => u !== userId) : [...p, userId])
  }

  async function handleSavePanel() {
    if (!selected) return
    setSavingAssign(true)
    try {
      await ministryScheduleService.updateStartTime(selected.schedule_id, startTime)
      await ministryScheduleService.setAssignments(selected.schedule_id, assigned)
      toast.success(t('apel.saved'))
      // Muat ulang rekap (status telat bisa berubah bila jam mulai diubah untuk
      // kehadiran berikutnya — kehadiran lama tetap seperti saat scan).
      const att = await ministryScheduleService.getAttendance(selected.schedule_id).catch(() => [])
      setAttendance(att)
    } catch (err) {
      toast.error(err.message || t('apel.saveFailed'))
    } finally {
      setSavingAssign(false)
    }
  }

  async function handleDelete(sched) {
    const ok = await confirm({
      title: t('apel.deleteTitle'),
      message: t('apel.deleteMsg'),
      confirmText: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await ministryScheduleService.remove(sched.schedule_id)
      toast.success(t('apel.deleted'))
      if (selected?.schedule_id === sched.schedule_id) closePanel()
      else loadList()
    } catch (err) {
      toast.error(err.message || t('apel.deleteFailed'))
    }
  }

  async function exportXlsx() {
    if (attendance.length === 0) { toast.info(t('apel.exportEmpty')); return }
    await downloadXlsx({
      filename: `pelayanan-${selected.ministries?.name || ''}-${selected.service_date}.xlsx`,
      sheetName: 'Absen Pelayanan',
      titleLines: ['ESC Siantan', 'Absen Pelayanan Minggu', `${selected.ministries?.name || ''} — ${formatDate(selected.service_date)}`],
      headers: ['Nama', 'No. HP', 'Waktu Scan', 'Status', 'Lokasi', 'Jarak (m)'],
      rows: attendance.map(r => [
        r.users?.name || '-',
        r.users?.phone || '',
        formatDate(r.scanned_at, 'HH:mm'),
        r.status,
        r.location_flag || '-',
        r.distance_m ?? '-',
      ]),
    })
  }

  // ── Panel detail satu jadwal ──
  if (selected) {
    const isToday = selected.service_date === todayISO()
    return (
      <div className="max-w-2xl">
        <button onClick={closePanel} className="flex items-center gap-1 text-sm text-gray-500 mb-4">
          <ArrowLeft size={16} /> {t('common.back')}
        </button>

        <Card className="p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-semibold text-gray-900">{selected.ministries?.name || '-'}</p>
              <p className="text-xs text-gray-400">{formatDate(selected.service_date)}</p>
            </div>
            <button onClick={() => handleDelete(selected)} className="p-2 text-gray-400 hover:text-red-500">
              <Trash2 size={16} />
            </button>
          </div>
          <div className="max-w-[180px] mt-3">
            <Input label={t('apel.startTime')} type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">{t('apel.graceNote')}</p>
        </Card>

        {panelLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <>
            {/* Penugasan volunteer */}
            <Card className="p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Users size={16} className="text-brand-500" />
                <p className="text-sm font-semibold text-gray-900">{t('apel.assignTitle')} ({assigned.length})</p>
              </div>
              {members.length === 0 ? (
                <p className="text-sm text-gray-400">{t('apel.noMembers')}</p>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {members.map(m => (
                    <div
                      key={m.user_id}
                      onClick={() => toggleAssign(m.user_id)}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <span className="pointer-events-none">
                        <Checkbox checked={assigned.includes(m.user_id)} readOnly />
                      </span>
                      <Avatar name={m.name} src={m.photo_url} size="sm" />
                      <span className="text-sm text-gray-800 truncate flex-1">{m.name}</span>
                    </div>
                  ))}
                </div>
              )}
              <Button className="w-full mt-3" loading={savingAssign} onClick={handleSavePanel}>{t('apel.saveBtn')}</Button>
            </Card>

            {/* QR */}
            <Card className="p-4 mb-4 text-center">
              {qr ? <img src={qr} alt="QR Pelayanan" className="w-56 mx-auto rounded-xl border border-gray-100" /> : <Spinner />}
              <p className="text-xs text-gray-400 mt-3 max-w-sm mx-auto">{t('apel.qrHint')}</p>
              {!isToday && (
                <p className="text-[11px] text-amber-600 mt-1.5">{t('apel.qrDateNote')}</p>
              )}
              {qr && (
                <a href={qr} download={`QR-Pelayanan-${selected.service_date}.png`} className="inline-flex items-center gap-1.5 text-sm text-brand-500 font-medium mt-2">
                  <Download size={15} /> {t('apel.downloadQr')}
                </a>
              )}
            </Card>

            {/* Rekap kehadiran */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-900">{t('apel.recapTitle')} ({attendance.length})</p>
              {attendance.length > 0 && (
                <button onClick={exportXlsx} className="text-xs text-brand-500 flex items-center gap-1">
                  <FileSpreadsheet size={13} /> {t('apel.export')}
                </button>
              )}
            </div>
            {attendance.length === 0 ? (
              <EmptyState icon={CalendarClock} title={t('apel.recapEmpty')} description={t('apel.recapEmptyDesc')} />
            ) : (
              <Card className="divide-y divide-gray-100">
                {attendance.map(r => {
                  const late3 = (lateCounts[r.user_id] || 0) >= 3
                  return (
                    <div key={r.attendance_id} className="flex items-center gap-3 p-3.5">
                      <Avatar name={r.users?.name} src={r.users?.photo_url} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-900 truncate">{r.users?.name || '-'}</p>
                          {late3 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-1 py-0.5 shrink-0">
                              <AlertTriangle size={10} /> {t('apel.late3')}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 flex items-center gap-1">
                          {formatDate(r.scanned_at, 'HH:mm')}
                          {r.location_flag && r.location_flag !== 'Tidak Tersedia' && (
                            <span className={`inline-flex items-center gap-0.5 ${r.location_flag === 'Di Luar Radius' ? 'text-amber-600' : 'text-gray-400'}`}>
                              · <MapPin size={10} /> {r.location_flag}{r.distance_m != null ? ` (${r.distance_m}m)` : ''}
                            </span>
                          )}
                        </p>
                      </div>
                      <Badge color={r.status === 'Terlambat' ? 'red' : 'green'}>{r.status}</Badge>
                    </div>
                  )
                })}
              </Card>
            )}
          </>
        )}
      </div>
    )
  }

  // ── Daftar: pilih tanggal → ministry (buat/buka jadwal) ──
  return (
    <div className="max-w-2xl">
      <PageHeader title={t('apel.title')} subtitle={t('apel.subtitle')} />

      {profile?.role === 'Super Admin' && <GeoConfigCard t={t} toast={toast} />}

      <Card className="p-4 mb-4">
        <div className="max-w-xs">
          <Input label={t('apel.date')} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : ministries.length === 0 ? (
        <EmptyState icon={Users} title={t('apel.noMinistry')} description={t('apel.noMinistryDesc')} />
      ) : (
        <Card className="divide-y divide-gray-100">
          {ministries.map(m => {
            const sched = scheduleByMinistry[m.ministry_id]
            return (
              <div key={m.ministry_id} className="flex items-center gap-3 p-3.5">
                <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                  <Users size={16} className="text-brand-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                  {sched && <p className="text-[11px] text-gray-400">{t('apel.startAt', { time: (sched.start_time || '').slice(0, 5) })}</p>}
                </div>
                {sched ? (
                  <Button size="sm" variant="outline" onClick={() => openSchedule(sched)}>{t('apel.open')}</Button>
                ) : (
                  <Button size="sm" onClick={() => handleCreate(m)}><Plus size={14} /> {t('apel.create')}</Button>
                )}
              </div>
            )
          })}
        </Card>
      )}
    </div>
  )
}

// Konfigurasi koordinat gereja (geolocation soft-log). Super Admin only —
// app_settings kunci sembarang hanya boleh ditulis Super Admin (RLS).
function GeoConfigCard({ t, toast }) {
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [radius, setRadius] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    appSettingsService.getMany(['church_lat', 'church_lng', 'church_radius_m'])
      .then(v => {
        setLat(v.church_lat != null ? String(v.church_lat) : '')
        setLng(v.church_lng != null ? String(v.church_lng) : '')
        setRadius(v.church_radius_m != null ? String(v.church_radius_m) : '')
      })
      .catch(() => {})
  }, [])

  async function save() {
    setSaving(true)
    try {
      await appSettingsService.set('church_lat', lat.trim())
      await appSettingsService.set('church_lng', lng.trim())
      await appSettingsService.set('church_radius_m', radius.trim() || '200')
      toast.success(t('apel.geoSaved'))
    } catch (err) {
      toast.error(err.message || t('apel.geoSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <MapPin size={16} className="text-brand-500" />
        <p className="text-sm font-semibold text-gray-900">{t('apel.geoTitle')}</p>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">{t('apel.geoHint')}</p>
      <div className="grid grid-cols-2 gap-3">
        <Input label={t('apel.geoLat')} value={lat} onChange={e => setLat(e.target.value)} placeholder="-0.026" />
        <Input label={t('apel.geoLng')} value={lng} onChange={e => setLng(e.target.value)} placeholder="109.34" />
        <Input label={t('apel.geoRadius')} type="number" value={radius} onChange={e => setRadius(e.target.value)} placeholder="200" />
      </div>
      <Button size="sm" variant="outline" className="w-full mt-3" loading={saving} onClick={save}>{t('apel.geoSave')}</Button>
    </Card>
  )
}
