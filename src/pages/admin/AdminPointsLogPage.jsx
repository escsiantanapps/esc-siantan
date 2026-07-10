import { useEffect, useMemo, useState } from 'react'
import { Coins, TrendingUp, TrendingDown, Search, History, Wallet, Network, BookOpen, ShieldAlert, Trash2 } from 'lucide-react'
import { pointsService } from '@/services/pointsService'
import { useToast } from '@/hooks/useToast'
import { Card, PageHeader, Input, Spinner, EmptyState, Avatar, Badge } from '@/components/ui'
import { formatDate } from '@/lib/utils'

// Distribusi Poin (Admin) — audit ke mana saja poin bergerak: sumber pemberian
// (+), penukaran (−), rincian per komsel & kelas, dan riwayat per jemaat. Data
// dari point_transactions + tabel absensi (RLS: Admin/Super Admin baca semua).
// Hapus poin lewat RPC tepercaya (Migrasi v61, gated Hak Akses).

// Pengurangan akibat koreksi SQL / penyesuaian sistem / pembatalan tidak
// dipamerkan detailnya — cukup "Dikurangi oleh sistem". Penukaran hadiah
// (deskripsi "Tukar poin") tetap tampil apa adanya.
function displayDesc(tx) {
  if (tx.amount < 0 && !(tx.description || '').startsWith('Tukar poin')) return 'Dikurangi oleh sistem'
  return tx.description
}

// Agregasi { nama: jumlah } dari daftar breakdown absensi (komsel/kelas).
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

export default function AdminPointsLogPage() {
  const { toast, confirm } = useToast()
  const [tx, setTx] = useState([])
  const [users, setUsers] = useState([])
  const [komselRows, setKomselRows] = useState([])
  const [classRows, setClassRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [busyId, setBusyId] = useState(null)

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

  // Distribusi per sumber (deskripsi tampilan) — pengurangan sistem menyatu.
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

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <div className="max-w-2xl">
      <PageHeader title="Distribusi Poin" subtitle="Ke mana saja poin bergerak — sumber, penukaran & riwayat" />

      {/* Alert akses */}
      <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 mb-4">
        <ShieldAlert size={15} className="shrink-0 mt-0.5" />
        <span>Halaman ini hanya untuk admin yang diberi Hak Akses. Penghapusan poin juga ditegakkan di server berdasarkan Hak Akses `/admin/distribusi-poin`.</span>
      </div>

      {/* Ringkasan angka */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card className="p-3.5">
          <Wallet size={16} className="text-brand-500 mb-1.5" />
          <p className="text-[11px] text-gray-400">Poin beredar</p>
          <p className="text-lg font-bold text-gray-900">{totalBeredar}</p>
        </Card>
        <Card className="p-3.5">
          <TrendingUp size={16} className="text-green-500 mb-1.5" />
          <p className="text-[11px] text-gray-400">Total diberikan</p>
          <p className="text-lg font-bold text-green-600">+{totalMasuk}</p>
        </Card>
        <Card className="p-3.5">
          <TrendingDown size={16} className="text-red-500 mb-1.5" />
          <p className="text-[11px] text-gray-400">Total ditukar/kurang</p>
          <p className="text-lg font-bold text-red-500">{totalKeluar}</p>
        </Card>
      </div>

      {/* Distribusi per sumber */}
      <Card className="p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3">
          <Coins size={16} className="text-brand-500" /> Distribusi per Sumber
        </h2>
        {bySource.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada transaksi poin.</p>
        ) : (
          <div className="space-y-2.5">
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

      {/* Poin dari Komsel & Kelas */}
      <div className="grid gap-4 mb-4">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3">
            <Network size={16} className="text-brand-500" /> Poin dari Komsel
          </h2>
          {komselDist.length === 0 ? (
            <p className="text-sm text-gray-400">Belum ada poin kehadiran komsel.</p>
          ) : (
            <div className="space-y-2.5">
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
            <div className="space-y-2.5">
              {classDist.map(([name, count]) => <BarRow key={name} label={name} value={count} max={classMax} />)}
            </div>
          )}
        </Card>
      </div>

      {/* Riwayat transaksi */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <History size={16} className="text-brand-500" /> Riwayat Transaksi ({filtered.length})
        </h2>
      </div>
      <div className="mb-3">
        <Input icon={Search} placeholder="Cari nama jemaat..." value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={History} title="Tidak ada transaksi" description="Tidak ada transaksi poin yang cocok." />
      ) : (
        <Card className="divide-y divide-gray-100">
          {filtered.map(t => (
            <div key={t.transaction_id} className="flex items-center gap-3 p-3">
              <Avatar name={t.users?.name} src={t.users?.photo_url} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{t.users?.name || '-'}</p>
                <p className="text-[11px] text-gray-400 truncate">{displayDesc(t)} · {formatDate(t.created_at, 'd MMM yyyy · HH:mm')}</p>
              </div>
              <Badge color={t.amount >= 0 ? 'green' : 'red'}>{t.amount >= 0 ? '+' : ''}{t.amount}</Badge>
              {t.amount > 0 && (
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
    </div>
  )
}
