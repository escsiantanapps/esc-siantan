import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { Users, ClipboardCheck, Save, BarChart3, UserCircle, LogOut, ChevronDown, HandCoins, X, Cake, Send, QrCode, Plus, Download } from 'lucide-react'
import { startOfMonth } from 'date-fns'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { komselService, komselOfferingsService } from '@/services/contentService'
import { OFFERING_CATEGORIES } from '@/services/offeringsService'
import { birthdayService } from '@/services/birthdayService'
import { evaluationService } from '@/services/evaluationService'
import { Card, Spinner, EmptyState, GradientHeader, Avatar, StatusBadge, Badge, Select, Input, Button } from '@/components/ui'
import { useLang } from '@/hooks/useLang'
import { useBackClose } from '@/hooks/useBackClose'
import { formatDate, formatRupiah, formatPhone, hitungUmur } from '@/lib/utils'

// Urutan tampil rincian SOP: yang terpenuhi dulu, lalu proses, lalu kosong.
const STATUS_RANK = { TERPENUHI: 0, PROSES: 1, KOSONG: 2 }

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
  const [openEval, setOpenEval] = useState({}) // user_id -> bool (rincian SOP terbuka)

  const [komselOfferings, setKomselOfferings] = useState([])
  const [offeringForm, setOfferingForm] = useState({ category: OFFERING_CATEGORIES[0], amount: '', note: '' })
  const [offeringSaving, setOfferingSaving] = useState(false)
  const [offeringError, setOfferingError] = useState('')

  const [memberDetail, setMemberDetail] = useState(null)
  useBackClose(!!memberDetail, () => setMemberDetail(null))

  const [birthdayDrafts, setBirthdayDrafts] = useState({}) // user_id -> teks pesan
  const [birthdaySent, setBirthdaySent] = useState({}) // user_id -> true setelah terkirim
  const [birthdaySending, setBirthdaySending] = useState('')

  // Sesi absensi komsel (QR dipindai anggota).
  const [sessionTitle, setSessionTitle] = useState('')
  const [creatingSession, setCreatingSession] = useState(false)
  const [activeSession, setActiveSession] = useState(null) // { ...session, qr }
  const [sessionAttendance, setSessionAttendance] = useState([])
  useBackClose(!!activeSession, () => setActiveSession(null))

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

  // Riwayat persembahan komsel untuk komsel terpilih.
  useEffect(() => {
    if (!selectedId) return
    komselOfferingsService.getByKomsel(selectedId).then(setKomselOfferings).catch(() => {})
  }, [selectedId])

  async function handleSubmitOffering() {
    setOfferingError('')
    const amount = Number(String(offeringForm.amount).replace(/\D/g, ''))
    if (!amount || amount <= 0) { setOfferingError(t('offering.amountRequired')); return }
    setOfferingSaving(true)
    try {
      await komselOfferingsService.create({
        komselId: selectedId,
        category: offeringForm.category,
        amount,
        note: offeringForm.note,
        recordedBy: profile.user_id,
      })
      setOfferingForm({ category: OFFERING_CATEGORIES[0], amount: '', note: '' })
      setKomselOfferings(await komselOfferingsService.getByKomsel(selectedId))
      toast.success(t('pks.offeringSaved'))
    } catch (err) {
      setOfferingError(err.message || t('pks.offeringSaveFailed'))
      toast.error(err.message || t('pks.offeringSaveFailed'))
    } finally {
      setOfferingSaving(false)
    }
  }

  // Anggota komsel terpilih yang berulang tahun hari ini (cocokkan bulan+tanggal, abaikan tahun).
  const todaysBirthdays = useMemo(() => {
    const today = new Date()
    return members.filter(m => {
      if (!m.birth_date) return false
      const d = new Date(m.birth_date)
      return d.getUTCMonth() === today.getMonth() && d.getUTCDate() === today.getDate()
    })
  }, [members])

  // Ulang tahun bulan ini (di luar hari ini) untuk perencanaan PKS — diurutkan
  // per tanggal, hari yang sudah lewat ikut ditampilkan sebagai riwayat singkat.
  const thisMonthsBirthdays = useMemo(() => {
    const today = new Date()
    return members
      .filter(m => {
        if (!m.birth_date) return false
        const d = new Date(m.birth_date)
        if (d.getUTCMonth() !== today.getMonth()) return false
        // Exclude yang hari ini (sudah di section atas).
        return d.getUTCDate() !== today.getDate()
      })
      .map(m => ({ ...m, _day: new Date(m.birth_date).getUTCDate() }))
      .sort((a, b) => a._day - b._day)
  }, [members])

  async function handleSendBirthday(member) {
    const message = (birthdayDrafts[member.user_id] || '').trim()
    if (!message) { toast.error(t('pks.birthdayMsgRequired')); return }
    setBirthdaySending(member.user_id)
    try {
      await birthdayService.sendMessage({
        recipientId: member.user_id, komselId: selectedId, senderId: profile.user_id, message,
      })
      setBirthdaySent(p => ({ ...p, [member.user_id]: true }))
      toast.success(t('pks.birthdaySent', { name: member.name }))
    } catch (err) {
      toast.error(err.message || t('pks.birthdaySendFailed'))
    } finally {
      setBirthdaySending('')
    }
  }

  // Buat sesi absensi baru → tampilkan QR untuk dipindai anggota.
  async function handleCreateSession() {
    const title = sessionTitle.trim() || `Komsel ${formatDate(new Date())}`
    setCreatingSession(true)
    try {
      const session = await komselService.createSession(selectedId, title, profile.user_id)
      const qr = await QRCode.toDataURL(`ESC-KOMSEL:${session.session_id}`, { width: 320, margin: 1 }).catch(() => '')
      setActiveSession({ ...session, qr })
      setSessionAttendance([])
      setSessionTitle('')
    } catch (err) {
      toast.error(err.message || t('pks.attendanceSaveFailed'))
    } finally {
      setCreatingSession(false)
    }
  }

  // Muat siapa saja yang sudah scan sesi aktif (refresh manual).
  async function refreshSessionAttendance() {
    if (!activeSession) return
    try { setSessionAttendance(await komselService.getSessionAttendance(activeSession.session_id)) }
    catch { /* abaikan */ }
  }
  useEffect(() => {
    if (!activeSession) return
    refreshSessionAttendance()
    const timer = setInterval(refreshSessionAttendance, 8000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.session_id])

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
        <GradientHeader title={t('pks.title')} subtitle={t('pks.subtitleLeader')} back={() => navigate('/profil')} />
        <div className="px-4 pt-4">
          <EmptyState icon={Users} title={t('pks.noKomsel')} description={t('pks.noKomselDesc')} />
        </div>
      </div>
    )
  }

  return (
    <div className="pb-4">
      <GradientHeader title={t('pks.title')} subtitle={komsel?.name || t('profile.komsel')} back={() => navigate('/profil')} />

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

            <div className="grid grid-cols-3 gap-1.5 mb-4">
              <button
                onClick={() => setTab('anggota')}
                className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-colors ${tab === 'anggota' ? 'bg-brand-500 text-white' : 'bg-surface text-gray-500 border border-gray-100'}`}
              >
                <Users size={15} /> {t('pks.tabMembers')}
              </button>
              <button
                onClick={() => setTab('absensi')}
                className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-colors ${tab === 'absensi' ? 'bg-brand-500 text-white' : 'bg-surface text-gray-500 border border-gray-100'}`}
              >
                <ClipboardCheck size={15} /> {t('pks.tabAttendance')}
              </button>
              <button
                onClick={() => setTab('ulangtahun')}
                className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-colors relative ${tab === 'ulangtahun' ? 'bg-brand-500 text-white' : 'bg-surface text-gray-500 border border-gray-100'}`}
              >
                <Cake size={15} />
                {t('pks.tabBirthday')}
                {todaysBirthdays.length > 0 && (
                  <span className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-red-500" />
                )}
              </button>
              <button
                onClick={() => setTab('persembahan')}
                className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-colors ${tab === 'persembahan' ? 'bg-brand-500 text-white' : 'bg-surface text-gray-500 border border-gray-100'}`}
              >
                <HandCoins size={15} /> {t('pks.tabOffering')}
              </button>
              <button
                onClick={() => setTab('evaluasi')}
                className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-colors ${tab === 'evaluasi' ? 'bg-brand-500 text-white' : 'bg-surface text-gray-500 border border-gray-100'}`}
              >
                <BarChart3 size={15} /> {t('pks.tabEval')}
              </button>
              <button
                onClick={() => setTab('profil')}
                className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-colors ${tab === 'profil' ? 'bg-brand-500 text-white' : 'bg-surface text-gray-500 border border-gray-100'}`}
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
                      <button
                        key={m.user_id}
                        onClick={() => setMemberDetail(m)}
                        className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-gray-50 transition-colors"
                      >
                        <Avatar name={m.name} src={m.photo_url} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                          <p className="text-xs text-gray-400">{m.role}</p>
                        </div>
                      </button>
                    ))}
                  </Card>
                )}
              </>
            )}

            {tab === 'absensi' && (
              <>
                {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-3">{error}</div>}

                {/* Absensi via QR: PKS buat sesi → anggota memindai untuk mencatat
                    kehadiran sendiri (+1 poin). Menggantikan checklist manual. */}
                <Card className="p-4 mb-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center">
                      <QrCode size={16} className="text-brand-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Sesi Absensi QR</p>
                      <p className="text-xs text-gray-400">Anggota memindai QR untuk hadir &amp; dapat 1 poin</p>
                    </div>
                  </div>
                  <Input
                    placeholder="Judul sesi (mis. Komsel Rabu, PA Yohanes 3)"
                    value={sessionTitle}
                    onChange={e => setSessionTitle(e.target.value)}
                  />
                  <Button className="w-full" loading={creatingSession} onClick={handleCreateSession}>
                    <Plus size={15} /> Buat Sesi &amp; Tampilkan QR
                  </Button>
                </Card>

                {/* Checklist manual (opsional, tanpa poin) */}
                <details className="mb-4 group">
                  <summary className="cursor-pointer text-sm font-medium text-gray-600 flex items-center gap-1.5 py-1">
                    <ChevronDown size={15} className="transition-transform group-open:rotate-180" />
                    Absensi Manual (tanpa poin)
                  </summary>
                  <div className="pt-3">
                    {alreadySubmitted ? (
                      <div className="bg-green-50 border border-green-100 text-green-700 text-sm rounded-xl px-4 py-3">
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
                  </div>
                </details>

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

            {tab === 'ulangtahun' && (
              <>
                {todaysBirthdays.length === 0 && thisMonthsBirthdays.length === 0 ? (
                  <EmptyState icon={Cake} title={t('pks.noBirthdayMonth')} description={t('pks.noBirthdayMonthDesc')} />
                ) : (
                  <div className="space-y-4">
                    {todaysBirthdays.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1">{t('pks.birthdayTodayHeader')}</p>
                        {todaysBirthdays.map(m => (
                          <Card key={m.user_id} className="p-3.5 space-y-2.5">
                            <div className="flex items-center gap-3">
                              <Avatar name={m.name} src={m.photo_url} size="sm" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                                <p className="text-xs text-gray-400">🎂 {t('pks.birthdayToday')}</p>
                              </div>
                            </div>
                            {birthdaySent[m.user_id] ? (
                              <p className="text-xs text-green-600 flex items-center gap-1"><Send size={12} /> {t('pks.birthdaySent', { name: m.name })}</p>
                            ) : (
                              <>
                                <Input
                                  placeholder={t('pks.birthdayMsgPh')}
                                  value={birthdayDrafts[m.user_id] || ''}
                                  onChange={e => setBirthdayDrafts(p => ({ ...p, [m.user_id]: e.target.value }))}
                                />
                                <Button
                                  size="sm" className="w-full"
                                  loading={birthdaySending === m.user_id}
                                  onClick={() => handleSendBirthday(m)}
                                >
                                  <Send size={14} /> {t('pks.sendBirthday')}
                                </Button>
                              </>
                            )}
                          </Card>
                        ))}
                      </div>
                    )}

                    {thisMonthsBirthdays.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1">
                          {t('pks.birthdayMonthHeader', { count: thisMonthsBirthdays.length })}
                        </p>
                        <Card className="p-2">
                          {thisMonthsBirthdays.map(m => {
                            const today = new Date()
                            const isPast = m._day < today.getDate()
                            return (
                              <div key={m.user_id} className={`flex items-center gap-3 px-2.5 py-2 rounded-lg ${isPast ? 'opacity-50' : ''}`}>
                                <div className="w-10 text-center flex-shrink-0">
                                  <p className="text-[10px] text-gray-400 uppercase leading-none">{formatDate(new Date(), 'MMM')}</p>
                                  <p className="text-lg font-semibold text-gray-900 leading-tight">{m._day}</p>
                                </div>
                                <Avatar name={m.name} src={m.photo_url} size="sm" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                                  <p className="text-xs text-gray-400">
                                    {isPast ? t('pks.birthdayPast') : t('pks.birthdayUpcoming')}
                                  </p>
                                </div>
                              </div>
                            )
                          })}
                        </Card>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {tab === 'persembahan' && (
              <>
                {offeringError && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-3">{offeringError}</div>}
                <Card className="p-4 mb-4 space-y-3">
                  <h2 className="text-sm font-semibold text-gray-900">{t('pks.recordOffering')}</h2>
                  <Select label={t('offering.category')} value={offeringForm.category} onChange={e => setOfferingForm(p => ({ ...p, category: e.target.value }))}>
                    {OFFERING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                  <Input label={t('offering.amount')} type="number" min="0" placeholder="0" value={offeringForm.amount} onChange={e => setOfferingForm(p => ({ ...p, amount: e.target.value }))} />
                  <Input label={t('offering.noteOptional')} value={offeringForm.note} onChange={e => setOfferingForm(p => ({ ...p, note: e.target.value }))} />
                  <Button className="w-full" loading={offeringSaving} onClick={handleSubmitOffering}>
                    <Save size={15} /> {t('pks.saveOffering')}
                  </Button>
                </Card>

                <h2 className="text-sm font-semibold text-gray-700 mb-2">{t('pks.offeringHistory')}</h2>
                {komselOfferings.length === 0 ? (
                  <EmptyState icon={HandCoins} title={t('pks.noOfferings')} />
                ) : (
                  <Card className="divide-y divide-gray-100">
                    {komselOfferings.map(o => (
                      <div key={o.id} className="flex items-center gap-3 p-3.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{formatRupiah(o.amount)}</p>
                          <p className="text-xs text-gray-400 truncate">{o.category} · {formatDate(o.created_at)}</p>
                          {o.note && <p className="text-xs text-gray-500 mt-0.5">{o.note}</p>}
                        </div>
                        <StatusBadge status={o.status} />
                      </div>
                    ))}
                  </Card>
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
                    <p className="text-xs text-gray-400 mb-1">{t('pks.evalThisMonth', { start: formatDate(startOfMonth(new Date())), end: formatDate(new Date()) })}</p>
                    <p className="text-[11px] text-gray-400 mb-2">{t('pks.evalTapHint')}</p>
                    <Card className="divide-y divide-gray-100">
                      {members.map(m => {
                        const rows = [...(evalByUser[m.user_id] || [])].sort(
                          (a, b) => (STATUS_RANK[a.status] - STATUS_RANK[b.status]) || a.form.title.localeCompare(b.form.title)
                        )
                        const done = rows.filter(r => r.status === 'TERPENUHI').length
                        const total = rows.length
                        const overall = total === 0
                          ? 'KOSONG'
                          : done === total
                            ? 'TERPENUHI'
                            : rows.every(r => r.status === 'KOSONG') ? 'KOSONG' : 'PROSES'
                        const isOpen = !!openEval[m.user_id]
                        return (
                          <div key={m.user_id}>
                            <button
                              type="button"
                              disabled={total === 0}
                              onClick={() => setOpenEval(p => ({ ...p, [m.user_id]: !p[m.user_id] }))}
                              className="w-full flex items-center gap-3 p-3.5 text-left disabled:cursor-default"
                            >
                              <Avatar name={m.name} src={m.photo_url} size="sm" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                                <p className="text-xs text-gray-400">{total > 0 ? t('pks.formsFulfilled', { done, total }) : t('pks.noActiveForm')}</p>
                              </div>
                              <StatusBadge status={overall} />
                              {total > 0 && (
                                <ChevronDown size={16} className={`text-gray-300 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                              )}
                            </button>

                            {isOpen && total > 0 && (
                              <div className="px-3.5 pb-3 space-y-1.5">
                                {rows.map(r => (
                                  <div key={r.form.form_id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-gray-700 truncate">{r.form.title}</p>
                                      <p className="text-[10px] text-gray-400">{t('pks.formProgress', { filled: r.filled, target: r.target })}</p>
                                    </div>
                                    <StatusBadge status={r.status} />
                                  </div>
                                ))}
                              </div>
                            )}
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

      {/* Modal Sesi Absensi QR aktif */}
      {activeSession && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm p-5 space-y-4 max-h-[90vh] overflow-y-auto text-center">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Sesi Absensi Aktif</h2>
              <button onClick={() => setActiveSession(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-600">{activeSession.title}</p>
            {activeSession.qr
              ? <img src={activeSession.qr} alt="QR Sesi" className="w-full rounded-xl border border-gray-100" />
              : <div className="flex justify-center py-10"><Spinner /></div>}
            <p className="text-xs text-gray-400">Minta anggota memindai QR ini lewat menu Scan. Kehadiran &amp; poin tercatat otomatis.</p>
            {activeSession.qr && (
              <a href={activeSession.qr} download={`QR-${activeSession.title}.png`}>
                <Button variant="outline" className="w-full"><Download size={15} /> Unduh QR</Button>
              </a>
            )}

            <div className="text-left pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-700 mb-2">Sudah hadir ({sessionAttendance.length})</p>
              {sessionAttendance.length === 0 ? (
                <p className="text-xs text-gray-400">Belum ada yang memindai. Daftar diperbarui otomatis.</p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {sessionAttendance.map(a => (
                    <div key={a.attendance_id} className="flex items-center gap-2">
                      <Avatar name={a.users?.name} src={a.users?.photo_url} size="sm" />
                      <p className="text-sm text-gray-700 truncate">{a.users?.name || '-'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Detail anggota -- TANPA NIK, sengaja (lihat catatan privasi). */}
      {memberDetail && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-4 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{t('pks.memberDetail')}</h2>
              <button onClick={() => setMemberDetail(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <Avatar name={memberDetail.name} src={memberDetail.photo_url} size="lg" />
              <div className="min-w-0">
                <p className="text-base font-semibold text-gray-900 truncate">{memberDetail.name}</p>
                <p className="text-sm text-gray-400">{memberDetail.role}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-400">{t('pks.detailPhone')}</p>
                <p className="text-gray-700">{formatPhone(memberDetail.phone)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">{t('pks.detailEmail')}</p>
                <p className="text-gray-700 truncate">{memberDetail.email || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">{t('pks.detailGender')}</p>
                <p className="text-gray-700">{memberDetail.gender || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">{t('pks.detailBloodType')}</p>
                <p className="text-gray-700">{memberDetail.blood_type || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">{t('pks.detailBirthDate')}</p>
                <p className="text-gray-700">{memberDetail.birth_date ? `${formatDate(memberDetail.birth_date)} (${hitungUmur(memberDetail.birth_date)})` : '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">{t('pks.detailBirthPlace')}</p>
                <p className="text-gray-700">{memberDetail.birth_place || '-'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-gray-400">{t('pks.detailAddress')}</p>
                <p className="text-gray-700">{memberDetail.address || '-'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-gray-400">{t('pks.detailSocialMedia')}</p>
                <p className="text-gray-700">{memberDetail.social_media || '-'}</p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
