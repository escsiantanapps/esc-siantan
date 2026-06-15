import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, ClipboardCheck, Save, BarChart3, UserCircle, LogOut } from 'lucide-react'
import { startOfMonth } from 'date-fns'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { komselService } from '@/services/contentService'
import { evaluationService } from '@/services/evaluationService'
import { Card, Spinner, EmptyState, GradientHeader, Avatar, StatusBadge, Badge, Select, Input, Button } from '@/components/ui'
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
  const navigate = useNavigate()
  const [tab, setTab] = useState('anggota')
  const [komsel, setKomsel] = useState(null)
  const [members, setMembers] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [statuses, setStatuses] = useState({})
  const [notes, setNotes] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [evalRows, setEvalRows] = useState([])
  const [evalLoading, setEvalLoading] = useState(true)

  const komselId = profile?.komsel_id

  useEffect(() => {
    if (!komselId) { setLoading(false); return }
    Promise.all([
      komselService.getAll(),
      komselService.getMembers(komselId),
      komselService.getAttendanceHistory(komselId),
    ])
      .then(([allKomsel, mem, hist]) => {
        setKomsel(allKomsel.find(k => k.komsel_id === komselId) || null)
        setMembers(mem)
        setHistory(hist)
        const initStatus = {}
        mem.forEach(m => { initStatus[m.user_id] = 'Hadir' })
        setStatuses(initStatus)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [komselId])

  useEffect(() => {
    if (!komselId) { setEvalLoading(false); return }
    const startDate = startOfMonth(new Date()).toISOString()
    const endDate = new Date().toISOString()
    evaluationService.getEvaluation({ startDate, endDate, komselId })
      .then(setEvalRows)
      .catch(() => {})
      .finally(() => setEvalLoading(false))
  }, [komselId])

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
      title: 'Keluar dari akun?',
      message: 'Anda akan keluar dari aplikasi dan perlu masuk kembali.',
      confirmText: 'Keluar',
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
        komsel_id: komselId,
        user_id: m.user_id,
        attendance_date: today,
        status: statuses[m.user_id] || 'Hadir',
        notes: notes[m.user_id] || null,
        recorded_by: profile.user_id,
      }))
      await komselService.submitAttendance(records)
      const hist = await komselService.getAttendanceHistory(komselId)
      setHistory(hist)
      toast.success('Absensi berhasil disimpan.')
    } catch (err) {
      setError(err.message || 'Gagal menyimpan absensi.')
      toast.error(err.message || 'Gagal menyimpan absensi.')
    } finally {
      setSaving(false)
    }
  }

  if (!komselId) {
    return (
      <div className="pb-4">
        <GradientHeader title="Dashboard PKS" subtitle="Pemimpin Komsel" />
        <div className="px-4 pt-4">
          <EmptyState icon={Users} title="Komsel belum ditetapkan" description="Hubungi admin untuk menetapkan komsel kamu sebagai PKS." />
        </div>
      </div>
    )
  }

  return (
    <div className="pb-4">
      <GradientHeader title="Dashboard PKS" subtitle={komsel?.name || 'Komsel'} />

      <div className="px-4 -mt-2 pt-4">
        {loading && <div className="flex justify-center py-8"><Spinner /></div>}

        {!loading && (
          <>
            <div className="flex gap-1.5 mb-4">
              <button
                onClick={() => setTab('anggota')}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-colors ${tab === 'anggota' ? 'bg-orange-500 text-white' : 'bg-surface text-gray-500 border border-gray-100'}`}
              >
                <Users size={15} /> Anggota
              </button>
              <button
                onClick={() => setTab('absensi')}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-colors ${tab === 'absensi' ? 'bg-orange-500 text-white' : 'bg-surface text-gray-500 border border-gray-100'}`}
              >
                <ClipboardCheck size={15} /> Absensi
              </button>
              <button
                onClick={() => setTab('evaluasi')}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-colors ${tab === 'evaluasi' ? 'bg-orange-500 text-white' : 'bg-surface text-gray-500 border border-gray-100'}`}
              >
                <BarChart3 size={15} /> Evaluasi
              </button>
              <button
                onClick={() => setTab('profil')}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-colors ${tab === 'profil' ? 'bg-orange-500 text-white' : 'bg-surface text-gray-500 border border-gray-100'}`}
              >
                <UserCircle size={15} /> Profil
              </button>
            </div>

            {tab === 'anggota' && (
              <>
                {members.length === 0 ? (
                  <EmptyState icon={Users} title="Belum ada anggota" description="Anggota komsel akan muncul di sini." />
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
                    Absensi minggu ini sudah diisi. Absensi berikutnya dapat diisi minggu depan.
                  </div>
                ) : members.length === 0 ? (
                  <EmptyState icon={ClipboardCheck} title="Belum ada anggota" description="Tambahkan anggota komsel terlebih dahulu." />
                ) : (
                  <>
                    <p className="text-xs text-gray-400 mb-2">Absensi untuk {formatDate(new Date())}</p>
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
                                <option value="Hadir">Hadir</option>
                                <option value="Tidak Hadir">Tidak Hadir</option>
                                <option value="Izin">Izin</option>
                              </Select>
                            </div>
                          </div>
                          <Input
                            placeholder="Catatan doa (opsional)"
                            value={notes[m.user_id] || ''}
                            onChange={e => setNotes(p => ({ ...p, [m.user_id]: e.target.value }))}
                          />
                        </Card>
                      ))}
                    </div>
                    <Button className="w-full" loading={saving} onClick={handleSubmit}>
                      <Save size={15} /> Simpan Absensi
                    </Button>
                  </>
                )}

                {history.length > 0 && (
                  <div className="mt-6">
                    <h2 className="text-sm font-semibold text-gray-700 mb-2">Riwayat Absensi</h2>
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
                  <EmptyState icon={BarChart3} title="Belum ada anggota" description="Anggota komsel akan muncul di sini." />
                ) : (
                  <>
                    <p className="text-xs text-gray-400 mb-2">Evaluasi tugas bulan ini ({formatDate(startOfMonth(new Date()))} – {formatDate(new Date())})</p>
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
                              <p className="text-xs text-gray-400">{total > 0 ? `${done}/${total} form terpenuhi` : 'Tidak ada form aktif'}</p>
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
                <Badge color="orange" className="mt-1.5">Koordinator Komsel</Badge>
                <p className="text-sm text-gray-400 mt-1">{komsel?.name}</p>
                <Button variant="outline" className="w-full mt-6" onClick={handleLogout}>
                  <LogOut size={15} /> Keluar
                </Button>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
