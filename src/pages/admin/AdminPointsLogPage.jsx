import { useEffect, useMemo, useState } from 'react'
import { Coins, TrendingUp, TrendingDown, Search, History, Wallet } from 'lucide-react'
import { pointsService } from '@/services/pointsService'
import { Card, PageHeader, Input, Spinner, EmptyState, Avatar, Badge } from '@/components/ui'
import { formatDate } from '@/lib/utils'

// Distribusi Poin (Admin) — audit ke mana saja poin bergerak: sumber pemberian
// (+), penukaran (−), dan riwayat transaksi per jemaat. Data dari
// point_transactions (RLS ptx_select: Admin/Super Admin baca semua). Halaman
// baca-saja; tidak menulis poin (poin hanya ditulis fungsi SECURITY DEFINER).
export default function AdminPointsLogPage() {
  const [tx, setTx] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    Promise.all([
      pointsService.getAllTransactions().catch(() => []),
      pointsService.getAllUserPoints().catch(() => []),
    ]).then(([t, u]) => { setTx(t); setUsers(u) }).finally(() => setLoading(false))
  }, [])

  // Total poin beredar = jumlah saldo seluruh jemaat aktif.
  const totalBeredar = useMemo(() => users.reduce((s, u) => s + (u.points || 0), 0), [users])
  const totalMasuk = useMemo(() => tx.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0), [tx])
  const totalKeluar = useMemo(() => tx.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0), [tx])

  // Distribusi per sumber (deskripsi): jumlah poin & banyak transaksi.
  const bySource = useMemo(() => {
    const map = {}
    for (const t of tx) {
      const m = (map[t.description] ||= { amount: 0, count: 0 })
      m.amount += t.amount; m.count += 1
    }
    return Object.entries(map).sort((a, b) => Math.abs(b[1].amount) - Math.abs(a[1].amount))
  }, [tx])

  const maxAbs = bySource.length ? Math.max(...bySource.map(([, v]) => Math.abs(v.amount))) : 1

  // Riwayat tersaring nama.
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return tx
    return tx.filter(t => (t.users?.name || '').toLowerCase().includes(s))
  }, [tx, q])

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <div className="max-w-2xl">
      <PageHeader title="Distribusi Poin" subtitle="Ke mana saja poin bergerak — sumber, penukaran & riwayat" />

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
          <p className="text-[11px] text-gray-400">Total ditukar</p>
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
                  <div
                    className={`h-full rounded-full ${v.amount >= 0 ? 'bg-green-400' : 'bg-red-400'}`}
                    style={{ width: `${Math.max(4, (Math.abs(v.amount) / maxAbs) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Riwayat transaksi (cari per nama) */}
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
                <p className="text-[11px] text-gray-400 truncate">{t.description} · {formatDate(t.created_at, 'd MMM yyyy · HH:mm')}</p>
              </div>
              <Badge color={t.amount >= 0 ? 'green' : 'red'}>{t.amount >= 0 ? '+' : ''}{t.amount}</Badge>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
