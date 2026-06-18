import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, ClipboardCheck, Save, BarChart3, UserCircle, LogOut } from 'lucide-react'
import { startOfMonth } from 'date-fns'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { komselService } from '@/services/contentService'
import { evaluationService } from '@/services/evaluationService'
import { Card, Spinner, EmptyState, GradientHeader, Avatar, StatusBadge, Badge, Select, Input, Button } from '@/components/ui'
import { useLang } from '@/hooks/useLang'
import { formatDate } from '@/lib/utils'

function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10)
}

export default function PKSDashboardPage() {
  const { profile, logout } = useAuth()
  const { toast, confirm } = useToast()
  const { t } = useLang()
  const navigate = useNavigate()
  const [tab, setTab] = useState('anggota')
  const [ledKomsels, setLedKomsels] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [members, setMembers] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [statuses, setStatuses] = useState({})
  const [notes, setNotes] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [evalRows, setEvalRows] = useState([])
  const [evalLoading, setEvalLoading] = useState(true)

  const userId = profile?.user_id

  // Komsel-komsel yang dipimpin user ini (bisa lebih dari satu).
  useEffect(() => {
    if (!userId) { setLoading(false); return }
    komselService.getLedKomsels(userId)
      .then(list => {
        setLedKomsels(list)
        setSelectedId(prev => prev || list[0]?.komsel_id || '')
        if (list.length === 0) setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [userId])

  // Muat anggota & riwayat absensi untuk komsel terpilih.
  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    Promise.all([
      komselService.getMembers(selectedId),
      komselService.getAttendanceHistory(selectedId),
    ])
      .then(([mem, hist]) => {
        setMembers(mem)
        setHistory(hist)
        const initStatus = {}
        mem.forEach(m => { initStatus[m.user_id] = 'Hadir' })
        setStatuses(initStatus)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [selectedId])

  // Evaluasi untuk komsel terpilih.
  useEffect(() => {
    if (!selectedId) { setEvalLoading(false); return }
    const startDate = startOfMonth(new Date()).toISOString()
    const endDate = new Date().toISOString()
    setEvalLoading(true)
    evaluationService.getEvaluation({ startDate, endDate, komselId: selectedId })
      .then(setEvalRows)
      .catch(() => {})
      .finally(() => setEvalLoading(false))
  }, [selectedId])

  const komsel = useMemo(() => ledKomsels.find(k => k.komsel_id === selectedId) || null, [ledKomsels, selectedId])

  const evalByUser = useMemo(() => {
    const map = {}
    evalRows.forEach(r => {
      if (!map[r.user.user_id]) map[r.user.user_id] = []
      map[r.user.user_id].push(r)
    })
    return map
  }, [evalRows])

  async function handleLogout() {
    const ok = await confirm({
      title: t('settings.logoutTitle'),
      message: t('settings.logoutMessage'),
      confirmText: t('common.logout'),
      danger: true,
    })
    if (!ok) return
    await logout()
    navigate('/login')
  }

  const thisMonday = useMemo(() => toDateStr(getMonday(new Date())), [])

  const alreadySubmitted = useMemo(
    () => history.some(h => toDateStr(getMonday(h.attendance_date)) === thisMonday),
    [history, thisMonday]
  )

  async function handleSubmit() {
    setError('')
    setSaving(true)
    try {
      const today = toDateStr(new Date())
      const records = members.map(m => ({
        komsel_id: selectedId,
        user_id: m.user_id,
        attendance_date: today,
        status: statuses[m.user_id] || 'Hadir',
        notes: notes[m.user_id] || null,
        recorded_by: profile.user_id,
      }))
      await komselService.submitAttendance(records)
      const hist = await komselService.getAttendanceHistory(selectedId)
      setHistory(hist)
      toast.success(t('pks.saveSuccess'))
    } catch (err) {
      setError(err.message || t('pks.saveFailed'))
      toast.error(err.message || t('pks.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (!loading && ledKomsels.length === 0) {
    return (
      <div className="pb-4">
        <GradientHeader title={t('pks.title')} subtitle={t('pks.subtitleLeader')} />
        <div className="px-4 pt-4">
          <EmptyState icon={Users} title={t('pks.noKomsel')} description={t('pks.noKomselDesc')} />
        </div>
      </div>
    )
  }

  return (
    <div className="pb-4">
      <GradientHeader title={t('pks.title')} subtitle={komsel?.name || t('profile.komsel')} />

      <div className="px-4 -mt-2 pt-4">
        {loading && <div className="flex justify-center py-8"><Spinner /></div>}

        {!loading && (
          <>
            {ledKomsels.length > 1 && (
              <div className="mb-3">
                <Select value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                  {ledKomsels.map(k => <option key={k.komsel_id} value={k.komsel_id}>{k.name}</option>)}
                </Select>
              </div>
            )}

            <div className="flex gap-1.5 mb-4">
              <button
                onClick={() => setTab('anggota')}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-colors ${tab === 'anggota' ? 'bg-brand-500 text-white' : 'bg-surface text-gray-500 border border-gray-100'}`}
              >
                <Users size={15} /> {t('pks.tabMembers')}
              </button>
              <button
                onClick={() => setTab('absensi')}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-colors ${tab === 'absensi' ? 'bg-brand-500 text-white' : 'bg-surface text-gray-500 border border-gray-100'}`}
              >
                <ClipboardCheck size={15} /> {t('pks.tabAttendance')}
              </button>
              <button
                onClick={() => setTab('evaluasi')}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-colors ${tab === 'evaluasi' ? 'bg-brand-500 text-white' : 'bg-surface text-gray-500 border border-gray-100'}`}
              >
                <BarChart3 size={15} /> {t('pks.tabEval')}
              </button>
              <button
                onClick={() => setTab('profil')}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-colors ${tab === 'profil' ? 'bg-brand-500 text-white' : 'bg-surface text-gray-500 border border-gray-100'}`}
              >
                <UserCircle size={15} /> {t('pks.tabProfile')}
              </button>
            </div>

            {tab === 'anggota' && (
              <>
                {members.length === 0 ? (
                  <EmptyState icon={Users} title={t('pks.noMembers')} description={t('pks.noMembersDesc')} />
                ) : (
                  <Card className="divide-y divide-gray-100">
                    {members.map(m => (
                      <div key={m.user_id} className="flex items-center gap-3 p-3.5">
                        <Avatar name={m.name} src={m.photo_url} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                          <p className="text-xs text-gray-400">{m.role}</p>
                        </div>
                      </div>
                    ))}
                  </Card>
                )}
              </>
            )}

            {tab === 'absensi' && (
              <>
                {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-3">{error}</div>}

                {alreadySubmitted ? (
                  <div className="bg-green-50 border border-green-100 text-green-700 text-sm rounded-xl px-4 py-3 mb-4">
                    {t('pks.alreadySubmitted')}
                  </div>
                ) : members.length === 0 ? (
                  <EmptyState icon={ClipboardCheck} title={t('pks.noMembers')} description={t('pks.addMembersFirst')} />
                ) : (
                  <>
                    <p className="text-xs text-gray-400 mb-2">{t('pks.attendanceFor', { date: formatDate(new Date()) })}</p>
                    <div className="space-y-2.5 mb-4">
                      {members.map(m => (
                        <Card key={m.user_id} className="p-3 space-y-2">
                          <div className="flex items-center gap-3">
                            <Avatar name={m.name} src={m.photo_url} size="sm" />
                            <p className="text-sm font-medium text-gray-900 flex-1 truncate">{m.name}</p>
                            <div className="w-36 shrink-0">
                              <Select
                                value={statuses[m.user_id] || 'Hadir'}
                                onChange={e => setStatuses(p => ({ ...p, [m.user_id]: e.target.value }))}
                              >
                                <option value="Hadir">{t('status.Hadir')}</option>
                                <option value="Tidak Hadir">{t('status.Tidak Hadir')}</option>
                                <option value="Izin">{t('status.Izin')}</option>
                              </Select>
                            </div>
                          </div>
                          <Input
                            placeholder={t('pks.prayerNote')}
                            value={notes[m.user_id] || ''}
                            onChange={e => setNotes(p => ({ ...p, [m.user_id]: e.target.value }))}
                          />
                        </Card>
                      ))}
                    </div>
                    <Button className="w-full" loading={saving} onClick={handleSubmit}>
                      <Save size={15} /> {t('pks.saveAttendance')}
                    </Button>
                  </>
                )}

                {history.length > 0 && (
                  <div className="mt-6">
                    <h2 className="text-sm font-semibold text-gray-700 mb-2">{t('pks.attendanceHistory')}</h2>
                    <Card className="divide-y divide-gray-100">
                      {history.map(h => (
                        <div key={h.attendance_id} className="flex items-center gap-3 p-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{h.users?.name}</p>
                            <p className="text-xs text-gray-400">{formatDate(h.attendance_date)}</p>
                            {h.notes && <p className="text-xs text-gray-500 mt-0.5">{h.notes}</p>}
                          </div>
                          <StatusBadge status={h.status} />
                        </div>
                      ))}
                    </Card>
                  </div>
                )}
              </>
            )}

            {tab === 'evaluasi' && (
              <>
                {evalLoading ? (
                  <div className="flex justify-center py-8"><Spinner /></div>
                ) : members.length === 0 ? (
                  <EmptyState icon={BarChart3} title={t('pks.noMembers')} description={t('pks.noMembersDesc')} />
                ) : (
                  <>
                    <p className="text-xs text-gray-400 mb-2">{t('pks.evalThisMonth', { start: formatDate(startOfMonth(new Date())), end: formatDate(new Date()) })}</p>
                    <Card className="divide-y divide-gray-100">
                      {members.map(m => {
                        const rows = evalByUser[m.user_id] || []
                        const done = rows.filter(r => r.status === 'TERPENUHI').length
                        const total = rows.length
                        const overall = total === 0
                          ? 'KOSONG'
                          : done === total
                            ? 'TERPENUHI'
                            : rows.every(r => r.status === 'KOSONG') ? 'KOSONG' : 'PROSES'
                        return (
                          <div key={m.user_id} className="flex items-center gap-3 p-3.5">
                            <Avatar name={m.name} src={m.photo_url} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                              <p className="text-xs text-gray-400">{total > 0 ? t('pks.formsFulfilled', { done, total }) : t('pks.noActiveForm')}</p>
                            </div>
                            <StatusBadge status={overall} />
                          </div>
                        )
                      })}
                    </Card>
                  </>
                )}
              </>
            )}

            {tab === 'profil' && (
              <Card className="p-6 flex flex-col items-center text-center">
                <Avatar name={profile?.name} src={profile?.photo_url} size="xl" />
                <p className="text-base font-semibold text-gray-900 mt-3">{profile?.name}</p>
                <Badge color="orange" className="mt-1.5">{t('pks.coordinator')}</Badge>
                <p className="text-sm text-gray-400 mt-1">{komsel?.name}</p>
                <Button variant="outline" className="w-full mt-6" onClick={handleLogout}>
                  <LogOut size={15} /> {t('common.logout')}
                </Button>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
