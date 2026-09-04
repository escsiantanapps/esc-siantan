import { useEffect, useMemo, useState } from 'react'
import { Coins, TrendingUp, TrendingDown, Search, History, Wallet, Network, BookOpen, ShieldAlert, Trash2, Gift, Check } from 'lucide-react'
import { pointsService } from '@/services/pointsService'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { Card, PageHeader, Input, Textarea, Button, Spinner, EmptyState, Avatar, Badge } from '@/components/ui'
import { formatDate } from '@/lib/utils'

// Distribusi Poin (Admin) — audit ke mana saja poin bergerak. Tersusun dalam
// tab agar ringkas: Ringkasan (angka + per sumber), Kegiatan (per komsel &
// kelas), Riwayat (transaksi per jemaat + hapus poin). Data dari
// point_transactions + tabel absensi (RLS: Admin/Super Admin baca semua).

// Pengurangan koreksi/penyesuaian/pembatalan sistem tidak dipamerkan detailnya —
// cukup "Dikurangi oleh sistem". Penukaran hadiah ("Tukar poin") tampil apa adanya.
function displayDesc(tx) {
  if (tx.amount < 0 && !(tx.description || '').startsWith('Tukar poin')) return 'Dikurangi oleh sistem'
  return tx.description
}

function countByName(rows, embedKey) {
  const map = {}
  for (const r of rows) {
    const name = r[embedKey]?.name || '(tanpa nama)'
    map[name] = (map[name] || 0) + 1
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1])
}

function BarRow({ label, value, max, positive = true }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-gray-700 truncate pr-2">{label}</span>
        <span className={`font-semibold shrink-0 ${positive ? 'text-green-600' : 'text-red-500'}`}>{positive ? '+' : ''}{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${positive ? 'bg-green-400' : 'bg-red-400'}`} style={{ width: `${Math.max(4, (Math.abs(value) / max) * 100)}%` }} />
      </div>
    </div>
  )
}

const TABS = [
  { key: 'ringkasan', label: 'Ringkasan', icon: Coins },
  { key: 'kegiatan', label: 'Per Kegiatan', icon: Network },
  { key: 'riwayat', label: 'Riwayat', icon: History },
]

export default function AdminPointsLogPage() {
  const { toast, confirm } = useToast()
  const { profile } = useAuth()
  const { t } = useLang()
  const isGembala = profile?.role === 'Gembala'
  const isSuperAdmin = profile?.role === 'Super Admin'
  const [tab, setTab] = useState('ringkasan')
  const [tx, setTx] = useState([])
  const [users, setUsers] = useState([])
  const [komselRows, setKomselRows] = useState([])
  const [classRows, setClassRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [grantUserIds, setGrantUserIds] = useState([])
  const [grantUserQuery, setGrantUserQuery] = useState('')
  const [grantAmount, setGrantAmount] = useState('')
  const [grantReason, setGrantReason] = useState('')
  const [granting, setGranting] = useState(false)

  const selectedGrantUsers = useMemo(
    () => users.filter(user => grantUserIds.includes(user.user_id)),
    [users, grantUserIds],
  )
  const filteredGrantUsers = useMemo(() => {
    const search = grantUserQuery.trim().toLowerCase()
    if (!search) return users
    return users.filter(user => (user.name || '').toLowerCase().includes(search))
  }, [users, grantUserQuery])

  function loadAll() {
    return Promise.all([
      pointsService.getAllTransactions().catch(() => []),
      pointsService.getAllUserPoints().catch(() => []),
      pointsService.getKomselPointBreakdown().catch(() => []),
      pointsService.getClassPointBreakdown().catch(() => []),
    ]).then(([t, u, k, c]) => { setTx(t); setUsers(u); setKomselRows(k); setClassRows(c) })
  }
  useEffect(() => { loadAll().finally(() => setLoading(false)) }, [])

  const totalBeredar = useMemo(() => users.reduce((s, u) => s + (u.points || 0), 0), [users])
  const totalMasuk = useMemo(() => tx.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0), [tx])
  const totalKeluar = useMemo(() => tx.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0), [tx])

  const bySource = useMemo(() => {
    const map = {}
    for (const t of tx) {
      const d = displayDesc(t)
      const m = (map[d] ||= { amount: 0, count: 0 })
      m.amount += t.amount; m.count += 1
    }
    return Object.entries(map).sort((a, b) => Math.abs(b[1].amount) - Math.abs(a[1].amount))
  }, [tx])
  const maxAbs = bySource.length ? Math.max(...bySource.map(([, v]) => Math.abs(v.amount))) : 1

  const komselDist = useMemo(() => countByName(komselRows, 'komsel'), [komselRows])
  const classDist = useMemo(() => countByName(classRows, 'classes'), [classRows])
  const komselMax = komselDist.length ? komselDist[0][1] : 1
  const classMax = classDist.length ? classDist[0][1] : 1

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return tx
    return tx.filter(t => (t.users?.name || '').toLowerCase().includes(s))
  }, [tx, q])

  function toggleGrantUser(userId) {
    setGrantUserIds(current => (
      current.includes(userId)
        ? current.filter(id => id !== userId)
        : [...current, userId]
    ))
  }

  async function handleRevoke(t) {
    const ok = await confirm({
      title: 'Hapus poin ini?',
      message: `Poin "${t.description}" (+${t.amount}) milik ${t.users?.name || 'jemaat'} akan dikurangi dari saldonya. Tercatat sebagai penyesuaian sistem. Lanjutkan?`,
      confirmText: 'Hapus Poin',
      danger: true,
    })
    if (!ok) return
    setBusyId(t.transaction_id)
    try {
      await pointsService.revokePointTransaction(t.transaction_id)
      toast.success('Poin dihapus (dikurangi oleh sistem).')
      await loadAll()
    } catch (err) {
      const m = /not_authorized/.test(err.message || '') ? 'Anda tidak punya Hak Akses untuk halaman ini.' : (err.message || 'Gagal menghapus poin.')
      toast.error(m)
    } finally {
      setBusyId(null)
    }
  }

  async function handleGrant(e) {
    e.preventDefault()
    const amount = Number(grantAmount)
    const selectedUsers = selectedGrantUsers
    const reason = grantReason.trim()

    if (selectedUsers.length === 0) return toast.error(t('apoints.grantUserRequired'))
    if (!Number.isInteger(amount) || amount <= 0 || amount > 100000) return toast.error(t('apoints.grantAmountInvalid'))
    if (reason.length < 3 || reason.length > 300) return toast.error(t('apoints.grantReasonInvalid'))

    const ok = await confirm({
      title: t('apoints.grantConfirmTitle'),
      message: t('apoints.grantConfirmMessage', {
        count: selectedUsers.length,
        names: selectedUsers.slice(0, 3).map(user => user.name).join(', '),
        amount,
        reason,
      }),
      confirmText: t('apoints.grantButton'),
    })
    if (!ok) return

    setGranting(true)
    try {
      const results = await Promise.allSettled(
        selectedUsers.map(user => pointsService.grantPoints(user.user_id, amount, reason)),
      )
      const successCount = results.filter(result => result.status === 'fulfilled').length
      const failedCount = results.length - successCount

      if (successCount > 0) toast.success(t('apoints.grantSuccess', { count: successCount }))
      if (failedCount > 0) {
        toast.error(t(successCount > 0 ? 'apoints.grantPartialSuccess' : 'apoints.grantFailed', {
          success: successCount,
          failed: failedCount,
          total: results.length,
        }))
      }

      setGrantUserIds([])
      setGrantUserQuery('')
      setGrantAmount('')
      setGrantReason('')
      await loadAll()
    } catch (err) {
      const message = err.message || ''
      if (/not_authorized/i.test(message)) toast.error(t('apoints.grantUnauthorized'))
      else if (/invalid_amount/i.test(message)) toast.error(t('apoints.grantAmountInvalid'))
      else if (/invalid_reason/i.test(message)) toast.error(t('apoints.grantReasonInvalid'))
      else if (/user_not_found_or_inactive/i.test(message)) toast.error(t('apoints.grantUserInactive'))
      else toast.error(t('apoints.grantFailed'))
    } finally {
      setGranting(false)
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <div className="max-w-2xl">
      <PageHeader title="Distribusi Poin" subtitle="Ke mana saja poin bergerak" />

      {isSuperAdmin && (
        <Card className="p-4 mb-4">
          <div className="flex items-start gap-2 mb-4">
            <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><Gift size={16} /></span>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{t('apoints.grantTitle')}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{t('apoints.grantDesc')}</p>
            </div>
          </div>
          <form onSubmit={handleGrant} className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm text-gray-600 font-medium">
                  {t('apoints.grantUser')}<span className="text-red-500 ml-0.5">*</span>
                </label>
                <span className="text-xs text-gray-400">
                  {t('apoints.grantUserSelected', { count: selectedGrantUsers.length })}
                </span>
              </div>
              <Input
                icon={Search}
                aria-label={t('apoints.grantUserSearchLabel')}
                placeholder={t('apoints.grantUserSearchPlaceholder')}
                value={grantUserQuery}
                onChange={e => setGrantUserQuery(e.target.value)}
              />
              <div
                role="listbox"
                aria-label={t('apoints.grantUserSearchLabel')}
                aria-multiselectable="true"
                className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-1"
              >
                {filteredGrantUsers.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-gray-400">{t('apoints.grantUserEmpty')}</p>
                ) : filteredGrantUsers.map(user => {
                  const selected = grantUserIds.includes(user.user_id)
                  return (
                    <button
                      key={user.user_id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => toggleGrantUser(user.user_id)}
                      className={`w-full min-h-11 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ${selected ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-control'}`}
                    >
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${selected ? 'border-brand-500 bg-brand-500 text-white' : 'border-gray-300 bg-surface text-transparent'}`}>
                        <Check size={13} strokeWidth={2.5} />
                      </span>
                      <Avatar name={user.name} src={user.photo_url} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{user.name}</span>
                        <span className="block truncate text-[11px] text-gray-400">{t('apoints.currentBalance', { points: user.points || 0 })}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            <Input label={t('apoints.grantAmount')} required type="number" min="1" max="100000" step="1" value={grantAmount} onChange={e => setGrantAmount(e.target.value)} placeholder={t('apoints.grantAmountPlaceholder')} />
            <Textarea label={t('apoints.grantReason')} required rows={2} maxLength={300} value={grantReason} onChange={e => setGrantReason(e.target.value)} placeholder={t('apoints.grantReasonPlaceholder')} />
            <Button type="submit" loading={granting} disabled={granting || selectedGrantUsers.length === 0} className="w-full">{t('apoints.grantButton')}</Button>
          </form>
        </Card>
      )}

      {/* Alert akses (yang diminta): halaman & aksi hapus khusus admin ber-Hak-Akses */}
      <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4">
        <ShieldAlert size={14} className="shrink-0 mt-0.5" />
        <span>Khusus admin yang diberi Hak Akses. Penghapusan poin juga ditegakkan di server.</span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 p-1 bg-control rounded-xl mb-4">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${tab === key ? 'bg-surface text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── Ringkasan ── */}
      {tab === 'ringkasan' && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Card className="p-3.5">
              <Wallet size={16} className="text-brand-500 mb-1.5" />
              <p className="text-[11px] text-gray-400">Beredar</p>
              <p className="text-lg font-bold text-gray-900">{totalBeredar}</p>
            </Card>
            <Card className="p-3.5">
              <TrendingUp size={16} className="text-green-500 mb-1.5" />
              <p className="text-[11px] text-gray-400">Diberikan</p>
              <p className="text-lg font-bold text-green-600">+{totalMasuk}</p>
            </Card>
            <Card className="p-3.5">
              <TrendingDown size={16} className="text-red-500 mb-1.5" />
              <p className="text-[11px] text-gray-400">Ditukar/kurang</p>
              <p className="text-lg font-bold text-red-500">{totalKeluar}</p>
            </Card>
          </div>

          <Card className="p-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3">
              <Coins size={16} className="text-brand-500" /> Distribusi per Sumber
            </h2>
            {bySource.length === 0 ? (
              <p className="text-sm text-gray-400">Belum ada transaksi poin.</p>
            ) : (
              <div className="space-y-2.5 max-h-[22rem] overflow-y-auto pr-1">
                {bySource.map(([desc, v]) => (
                  <div key={desc}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-700 truncate pr-2">{desc}</span>
                      <span className={`font-semibold shrink-0 ${v.amount >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {v.amount >= 0 ? '+' : ''}{v.amount}
                        <span className="text-[11px] text-gray-400 font-normal"> · {v.count}×</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full rounded-full ${v.amount >= 0 ? 'bg-green-400' : 'bg-red-400'}`} style={{ width: `${Math.max(4, (Math.abs(v.amount) / maxAbs) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* ── Per Kegiatan ── */}
      {tab === 'kegiatan' && (
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3">
              <Network size={16} className="text-brand-500" /> Poin dari Komsel
            </h2>
            {komselDist.length === 0 ? (
              <p className="text-sm text-gray-400">Belum ada poin kehadiran komsel.</p>
            ) : (
              <div className="space-y-2.5 max-h-[20rem] overflow-y-auto pr-1">
                {komselDist.map(([name, count]) => <BarRow key={name} label={name} value={count} max={komselMax} />)}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3">
              <BookOpen size={16} className="text-brand-500" /> Poin dari Kelas
            </h2>
            {classDist.length === 0 ? (
              <p className="text-sm text-gray-400">Belum ada poin kehadiran kelas.</p>
            ) : (
              <div className="space-y-2.5 max-h-[20rem] overflow-y-auto pr-1">
                {classDist.map(([name, count]) => <BarRow key={name} label={name} value={count} max={classMax} />)}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Riwayat ── */}
      {tab === 'riwayat' && (
        <>
          <div className="mb-3">
            <Input icon={Search} placeholder="Cari nama jemaat..." value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {filtered.length === 0 ? (
            <EmptyState icon={History} title="Tidak ada transaksi" description="Tidak ada transaksi poin yang cocok." />
          ) : (
            <Card className="divide-y divide-gray-100 max-h-[32rem] overflow-y-auto">
              {filtered.map(t => (
                <div key={t.transaction_id} className="flex items-center gap-3 p-3">
                  <Avatar name={t.users?.name} src={t.users?.photo_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{t.users?.name || '-'}</p>
                    <p className="text-[11px] text-gray-400 truncate">{displayDesc(t)} · {formatDate(t.created_at, 'd MMM yyyy · HH:mm')}</p>
                  </div>
                  <Badge color={t.amount >= 0 ? 'green' : 'red'}>{t.amount >= 0 ? '+' : ''}{t.amount}</Badge>
                  {t.amount > 0 && !isGembala && (
                    <button
                      onClick={() => handleRevoke(t)}
                      disabled={busyId === t.transaction_id}
                      title="Hapus poin ini"
                      className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-40 shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  )
}
