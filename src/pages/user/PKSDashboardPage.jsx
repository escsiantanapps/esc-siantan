import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { Users, ClipboardCheck, Save, BarChart3, UserCircle, LogOut, ChevronDown, HandCoins, X, Cake, Send, QrCode, Plus, Download, UserMinus } from 'lucide-react'
import { startOfMonth } from 'date-fns'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { komselService, komselOfferingsService } from '@/services/contentService'
import { offeringsService, OFFERING_CATEGORIES } from '@/services/offeringsService'
import { birthdayService } from '@/services/birthdayService'
import { evaluationService } from '@/services/evaluationService'
import { Card, Spinner, EmptyState, GradientHeader, Avatar, StatusBadge, Badge, Select, Input, Button } from '@/components/ui'
import Uploader from '@/components/Uploader'
import { useLang } from '@/hooks/useLang'
import { useBackClose } from '@/hooks/useBackClose'
import { formatDate, formatRupiah, formatPhone, hitungUmur, validateUpload, compressImage } from '@/lib/utils'

// Urutan tampil rincian SOP: yang terpenuhi dulu, lalu proses, lalu kosong.
const STATUS_RANK = { TERPENUHI: 0, PROSES: 1, KOSONG: 2, IZIN: 3 }

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


  const [offeringForm, setOfferingForm] = useState({ category: OFFERING_CATEGORIES[0], amount: '', note: '', proof_url: '' })
  const [offeringSaving, setOfferingSaving] = useState(false)
  const [offeringUploading, setOfferingUploading] = useState(false)
  const [offeringError, setOfferingError] = useState('')
  const [komselOfferings, setKomselOfferings] = useState([])

  const [memberDetail, setMemberDetail] = useState(null)
  const [removingMember, setRemovingMember] = useState(false)
  useBackClose(!!memberDetail, () => setMemberDetail(null))

  // Keluarkan anggota dari komsel terpilih. Otorisasi + aturan ditegakkan di
  // server (RPC pks_remove_member, Migrasi v45); di sini hanya konfirmasi + UI.
  async function handleRemoveMember(member) {
    const ok = await confirm({
      title: t('pks.removeMemberTitle'),
      message: t('pks.removeMemberMsg', { name: member.name }),
      confirmText: t('pks.removeMember'),
      danger: true,
    })
    if (!ok) return
    setRemovingMember(true)
    try {
      await komselService.removeMember(selectedId, member.user_id)
      setMembers(prev => prev.filter(m => m.user_id !== member.user_id))
      setMemberDetail(null)
      toast.success(t('pks.memberRemoved', { name: member.name }))
    } catch (err) {
      toast.error(err.message || t('pks.removeMemberFailed'))
    } finally {
      setRemovingMember(false)
    }
  }

  const [birthdayDrafts, setBirthdayDrafts] = useState({}) // user_id -> teks pesan
  const [birthdaySent, setBirthdaySent] = useState({}) // user_id -> true setelah terkirim
  const [birthdaySending, setBirthdaySending] = useState('')

  // Sesi absensi komsel (QR dipindai anggota).
  const [creatingSession, setCreatingSession] = useState(false)
  const [activeSession, setActiveSession] = useState(null) // { ...session, qr }
  const [sessionAttendance, setSessionAttendance] = useState([])
  const [sessions, setSessions] = useState([]) // daftar sesi QR komsel (dibagi antar PKS)
  useBackClose(!!activeSession, () => closeSession())

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

  const loadOfferingHistory = async (id) => {
    try {
      const data = await komselOfferingsService.getByKomsel(id)
      setKomselOfferings(data)
    } catch (err) {
      console.error('Failed to load offering history:', err)
    }
  }

  // Riwayat persembahan komsel untuk komsel terpilih.
  useEffect(() => {
    if (!selectedId) return
    loadOfferingHistory(selectedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  async function handleSubmitOffering() {
    setOfferingError('')
    const amount = Number(String(offeringForm.amount).replace(/\D/g, ''))
    if (!amount || amount <= 0) {
      setOfferingError(t('offering.amountRequired'))
      return
    }
    if (!offeringForm.proof_url) {
      setOfferingError('Bukti transfer/pembayaran wajib dilampirkan.')
      return
    }

    setOfferingSaving(true)
    try {
      await komselOfferingsService.create({
        komsel_id: selectedId,
        category: offeringForm.category,
        amount,
        note: offeringForm.note,
        proof_url: offeringForm.proof_url,
        recorded_by: userId,
      })
      toast.success(t('pks.offeringSaved'))
      setOfferingForm({ category: OFFERING_CATEGORIES[0], amount: '', note: '', proof_url: '' })
      loadOfferingHistory(selectedId)
    } catch (err) {
      setOfferingError(err.message || t('pks.offeringSaveFailed'))
      toast.error(err.message || t('pks.offeringSaveFailed'))
    } finally {
      setOfferingSaving(false)
    }
  }

  // Anggota komsel terpilih yang berulang tahun hari ini (cocokkan bulan+tanggal, abaikan tahun).
  async function handleProof(file) {
    setOfferingUploading(true)
    setOfferingError('')
    try {
      file = await compressImage(file, { maxDim: 1600 })
      validateUpload(file, { maxMB: 8 })
      const url = await offeringsService.uploadProof(profile.user_id, file)
      setOfferingForm(p => ({ ...p, proof_url: url }))
      toast.success('Bukti persembahan berhasil diunggah')
    } catch (err) {
      setOfferingError(err.message || 'Gagal mengunggah bukti')
      toast.error(err.message || 'Gagal mengunggah bukti')
    } finally {
      setOfferingUploading(false)
    }
  }

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

  // Muat daftar sesi QR komsel + hitung jumlah kehadiran tiap sesi. Dipakai
  // agar SEMUA PKS komsel ini melihat sesi & record yang sama (bukan hanya
  // pembuatnya) — sinkron antar PKS. RLS mengizinkan: baca sesi = semua login,
  // baca kehadiran = PKS komsel tsb.
  async function loadSessions(kid = selectedId) {
    if (!kid) { setSessions([]); return }
    try {
      const list = await komselService.getSessions(kid)
      const rows = await komselService.getAttendanceForSessions(list.map(s => s.session_id)).catch(() => [])
      const counts = {}
      for (const r of rows) counts[r.session_id] = (counts[r.session_id] || 0) + 1
      setSessions(list.map(s => ({ ...s, attendeeCount: counts[s.session_id] || 0 })))
    } catch { setSessions([]) }
  }
  useEffect(() => { loadSessions(selectedId) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedId])

  // Buka sesi yang sudah ada (mis. dibuat PKS lain) → tampilkan QR & pantau
  // kehadiran yang masuk secara live.
  async function openSession(session) {
    const qr = await QRCode.toDataURL(`ESC-KOMSEL:${session.session_id}`, { width: 320, margin: 1 }).catch(() => '')
    setActiveSession({ ...session, qr })
    setSessionAttendance([])
  }

  // Tutup modal sesi + segarkan jumlah kehadiran di daftar sesi.
  function closeSession() {
    setActiveSession(null)
    loadSessions(selectedId)
  }

  // Buat sesi absensi baru → tampilkan QR untuk dipindai anggota.
  async function handleCreateSession() {
    setCreatingSession(true)
    try {
      const title = `Komsel ${formatDate(new Date())}`
      
      // 1. Service akan membuat sesi baru ATAU mengembalikan sesi yang sudah ada hari ini
      // Ini mencegah duplikasi jika 2 PKS menekan tombol di waktu berdekatan dengan state yang usang.
      const session = await komselService.createSession(selectedId, title, profile.user_id)
      
      const qr = await QRCode.toDataURL(`ESC-KOMSEL:${session.session_id}`, { width: 320, margin: 1 }).catch(() => '')
      setActiveSession({ ...session, qr })
      loadSessions(selectedId)
      refreshSessionAttendance() // Tarik attendance kalau-kalau ini sesi reuse yang sudah ada yang absen
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
  const [manualLoading, setManualLoading] = useState({})
  
  async function handleManualAtt(userId, status) {
    setManualLoading(p => ({ ...p, [userId]: true }))
    try {
      await komselService.upsertSessionAttendance({
        session_id: activeSession.session_id,
        komsel_id: selectedId,
        user_id: userId,
        status
      })
      await refreshSessionAttendance()
      toast.success(t('pks.attendanceSaved', { status }))
    } catch (err) {
      toast.error(err.message || t('pks.attendanceSaveFailed'))
    } finally {
      setManualLoading(p => ({ ...p, [userId]: false }))
    }
  }

  async function handleDeleteAtt(userId) {
    const att = sessionAttendance.find(a => a.user_id === userId)
    if (!att) return
    const ok = await confirm({
      title: 'Batalkan Kehadiran',
      message: 'Apakah Anda yakin ingin menghapus data kehadiran ini? Jika sebelumnya Hadir, poin akan ditarik.',
      confirmText: 'Batalkan',
      danger: true
    })
    if (!ok) return

    setManualLoading(p => ({ ...p, [userId]: true }))
    try {
      await komselService.deleteSessionAttendance(activeSession.session_id, userId)
      await refreshSessionAttendance()
      toast.success('Kehadiran dibatalkan')
    } catch (err) {
      toast.error(err.message || 'Gagal membatalkan')
    } finally {
      setManualLoading(p => ({ ...p, [userId]: false }))
    }
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
      if (r.user?.user_id) {
        if (!map[r.user.user_id]) map[r.user.user_id] = []
        map[r.user.user_id].push(r)
      }
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
      
      // Bungkus dalam sesi hari ini agar rapi dan masuk rekap admin
      const title = `Komsel ${formatDate(new Date())}`
      const session = await komselService.createSession(selectedId, title, profile.user_id)
      
      // Cek siapa saja yang sudah absen (misal lewat QR)
      const existing = await komselService.getSessionAttendance(session.session_id)
      const existingIds = new Set(existing.map(e => e.user_id))

      const records = members
        .filter(m => !existingIds.has(m.user_id))
        .map(m => ({
          komsel_id: selectedId,
          user_id: m.user_id,
          session_id: session.session_id,
          attendance_date: today,
          status: statuses[m.user_id] || 'Hadir',
          notes: notes[m.user_id] || null,
          recorded_by: profile.user_id,
        }))
        
      if (records.length > 0) {
        await komselService.submitAttendance(records)
      }
      
      const hist = await komselService.getAttendanceHistory(selectedId)
      setHistory(hist)
      if (activeSession) refreshSessionAttendance()
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
                  {!activeSession ? (
                    <Button onClick={handleCreateSession} loading={creatingSession} className="w-full">
                      <Plus size={15} /> Buat Sesi &amp; Tampilkan QR
                    </Button>
                  ) : null}
                </Card>

                {/* Daftar sesi QR komsel — dibagi antar semua PKS komsel ini
                    (bukan hanya pembuatnya). Tap untuk tampilkan QR &amp; pantau
                    kehadiran yang masuk. */}
                {sessions.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Sesi Absensi QR</p>
                    <Card className="divide-y divide-gray-100">
                      {sessions.map(s => (
                        <button
                          key={s.session_id}
                          onClick={() => openSession(s)}
                          className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
                        >
                          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                            <QrCode size={16} className="text-brand-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{s.title}</p>
                            <p className="text-xs text-gray-400">{formatDate(s.session_date)}</p>
                          </div>
                          <Badge color="green">{s.attendeeCount} hadir</Badge>
                        </button>
                      ))}
                    </Card>
                  </div>
                )}

                {/* Manual attendance section removed, merged into activeSession modal below. */}


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
                  
                  <div className="pt-2">
                    <p className="text-sm font-medium text-gray-700 mb-2">Bukti Transfer (Wajib) <span className="text-red-500">*</span></p>
                    <Uploader
                      onFile={handleProof}
                      uploading={offeringUploading}
                      value={offeringForm.proof_url}
                      onClear={() => setOfferingForm(p => ({ ...p, proof_url: '' }))}
                      label="Upload Bukti (Maks 8MB)"
                    />
                  </div>

                  <Button className="w-full mt-2" loading={offeringSaving || offeringUploading} onClick={handleSubmitOffering}>
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
                          (a, b) => (STATUS_RANK[a.status] - STATUS_RANK[b.status]) || (a.form?.title || '').localeCompare(b.form?.title || '')
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
              <button onClick={closeSession} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
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
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-700">Kehadiran Anggota ({sessionAttendance.length}/{members.length})</p>
              </div>
              {members.length === 0 ? (
                <p className="text-xs text-gray-400">Belum ada anggota di komsel ini.</p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {members.map(m => {
                    const att = sessionAttendance.find(a => a.user_id === m.user_id)
                    const status = att?.status
                    return (
                      <div key={m.user_id} className="flex flex-col p-2 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Avatar name={m.name} src={m.photo_url} size="sm" />
                            <p className="text-sm font-medium text-gray-700 truncate">{m.name}</p>
                          </div>
                          {status ? (
                            <StatusBadge status={status} />
                          ) : (
                            <span className="text-xs text-gray-400 shrink-0">Belum hadir</span>
                          )}
                        </div>
                        <div className="flex gap-1.5 justify-end mt-2">
                          <Button size="sm" variant="outline" className={`text-xs py-1 h-7 px-3 ${status === 'Hadir' ? 'bg-brand-50 text-brand-700 border-brand-200' : ''}`} disabled={manualLoading[m.user_id] || status === 'Hadir'} onClick={() => handleManualAtt(m.user_id, 'Hadir')}>Hadir</Button>
                          <Button size="sm" variant="outline" className={`text-xs py-1 h-7 px-3 ${status === 'Sakit' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}`} disabled={manualLoading[m.user_id] || status === 'Sakit'} onClick={() => handleManualAtt(m.user_id, 'Sakit')}>Sakit</Button>
                          <Button size="sm" variant="outline" className={`text-xs py-1 h-7 px-3 ${status === 'Izin' ? 'bg-blue-50 text-blue-700 border-blue-200' : ''}`} disabled={manualLoading[m.user_id] || status === 'Izin'} onClick={() => handleManualAtt(m.user_id, 'Izin')}>Izin</Button>
                          {status && <Button size="sm" variant="danger" className="text-xs py-1 h-7 px-3" disabled={manualLoading[m.user_id]} onClick={() => handleDeleteAtt(m.user_id)}>Batal</Button>}
                        </div>
                      </div>
                    )
                  })}
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

            <div className="pt-1 border-t border-gray-100">
              <Button
                variant="danger" className="w-full mt-3"
                loading={removingMember}
                onClick={() => handleRemoveMember(memberDetail)}
              >
                <UserMinus size={15} /> {t('pks.removeMember')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
