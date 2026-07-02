import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Trophy, Gift, History, ScanLine, Medal } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { pointsService } from '@/services/pointsService'
import { Card, Spinner, GradientHeader, EmptyState, Avatar, Button } from '@/components/ui'
import { formatDate } from '@/lib/utils'

const TABS = [
  { key: 'katalog', label: 'Tukar Poin', icon: Gift },
  { key: 'peringkat', label: 'Peringkat', icon: Trophy },
  { key: 'riwayat', label: 'Riwayat', icon: History },
]

export default function PointsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('katalog')
  const [points, setPoints] = useState(profile?.points ?? 0)
  const [products, setProducts] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.user_id) return
    Promise.all([
      pointsService.getMyPoints(profile.user_id).then(setPoints).catch(() => {}),
      pointsService.getProducts().then(setProducts).catch(() => {}),
      pointsService.getLeaderboard(10).then(setLeaderboard).catch(() => {}),
      pointsService.getMyTransactions(profile.user_id).then(setTransactions).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [profile?.user_id])

  const myRank = useMemo(
    () => leaderboard.findIndex(u => u.user_id === profile?.user_id),
    [leaderboard, profile?.user_id]
  )

  return (
    <div className="pb-6">
      <GradientHeader title="Poin Saya" subtitle="Kumpulkan poin dari kehadiran & tukarkan hadiah" back={() => navigate(-1)}>
        <div className="mt-3 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
            <Sparkles size={22} className="text-white" />
          </div>
          <div>
            <p className="text-3xl font-extrabold text-white leading-none">{points}</p>
            <p className="text-white/80 text-xs mt-1">poin tersedia</p>
          </div>
        </div>
      </GradientHeader>

      <div className="px-4 -mt-2 pt-4">
        {/* Tab */}
        <div className="flex gap-1 p-1 bg-control rounded-xl mb-4">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key} onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${tab === key ? 'bg-surface text-brand-600 shadow-sm' : 'text-gray-500'}`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {loading && <div className="flex justify-center py-10"><Spinner /></div>}

        {/* Katalog tukar poin */}
        {!loading && tab === 'katalog' && (
          <>
            {/* Banner promo Natal */}
            <div className="mb-4 rounded-2xl px-4 py-3 bg-gradient-to-r from-red-500 to-green-600 text-white flex items-center gap-3 shadow-sm">
              <Gift size={22} className="shrink-0" />
              <p className="text-sm font-semibold leading-snug">🎄 Tukarkan dengan hadiah natal di Tanggal 25 Desember</p>
            </div>

            <Card className="p-3.5 mb-4 flex items-center gap-3 bg-brand-50 border-brand-100">
              <ScanLine size={18} className="text-brand-500 shrink-0" />
              <p className="text-xs text-brand-700 flex-1">Tunjukkan tiket QR dari admin, lalu pindai lewat tombol Scan untuk menukar poin.</p>
              <Button size="sm" variant="outline" onClick={() => navigate('/scan')}>Scan</Button>
            </Card>
            {products.length === 0 ? (
              <EmptyState icon={Gift} title="Belum ada hadiah" description="Katalog penukaran poin akan muncul di sini." />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {products.map(p => {
                  const affordable = points >= p.points_cost
                  return (
                    <Card key={p.product_id} className="p-0 overflow-hidden">
                      <div className="aspect-square bg-gray-100">
                        {p.image_url
                          ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><Gift size={28} className="text-gray-300" /></div>}
                      </div>
                      <div className="p-2.5">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                        {p.description && <p className="text-[11px] text-gray-400 line-clamp-2 mt-0.5">{p.description}</p>}
                        <div className="flex items-center gap-1 mt-1.5">
                          <Sparkles size={13} className={affordable ? 'text-brand-500' : 'text-gray-300'} />
                          <span className={`text-sm font-bold ${affordable ? 'text-brand-600' : 'text-gray-400'}`}>{p.points_cost}</span>
                          {typeof p.stock === 'number' && p.stock > 0 && <span className="text-[10px] text-gray-400 ml-auto">stok {p.stock}</span>}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Leaderboard */}
        {!loading && tab === 'peringkat' && (
          leaderboard.length === 0 ? (
            <EmptyState icon={Trophy} title="Belum ada peringkat" />
          ) : (
            <Card className="divide-y divide-gray-100">
              {leaderboard.map((u, i) => {
                const isMe = u.user_id === profile?.user_id
                const medal = ['text-amber-500', 'text-gray-400', 'text-orange-400'][i]
                return (
                  <div key={u.user_id} className={`flex items-center gap-3 p-3.5 ${isMe ? 'bg-brand-50' : ''}`}>
                    <div className="w-7 flex justify-center shrink-0">
                      {i < 3
                        ? <Medal size={20} className={medal} />
                        : <span className="text-sm font-bold text-gray-400">{i + 1}</span>}
                    </div>
                    <Avatar name={u.name} src={u.photo_url} size="sm" />
                    <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">
                      {u.name}{isMe && <span className="text-brand-500"> (Anda)</span>}
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      <Sparkles size={13} className="text-brand-500" />
                      <span className="text-sm font-bold text-brand-600">{u.points}</span>
                    </div>
                  </div>
                )
              })}
              {myRank === -1 && (
                <div className="flex items-center gap-3 p-3.5 bg-brand-50">
                  <div className="w-7 flex justify-center shrink-0"><span className="text-sm font-bold text-gray-400">—</span></div>
                  <Avatar name={profile?.name} src={profile?.photo_url} size="sm" />
                  <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">{profile?.name} <span className="text-brand-500">(Anda)</span></p>
                  <div className="flex items-center gap-1 shrink-0">
                    <Sparkles size={13} className="text-brand-500" />
                    <span className="text-sm font-bold text-brand-600">{points}</span>
                  </div>
                </div>
              )}
            </Card>
          )
        )}

        {/* Riwayat transaksi poin */}
        {!loading && tab === 'riwayat' && (
          transactions.length === 0 ? (
            <EmptyState icon={History} title="Belum ada transaksi" description="Poin dari kehadiran & penukaran akan tercatat di sini." />
          ) : (
            <Card className="divide-y divide-gray-100">
              {transactions.map(tx => (
                <div key={tx.transaction_id} className="flex items-center gap-3 p-3.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tx.amount >= 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    <Sparkles size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{tx.description}</p>
                    <p className="text-xs text-gray-400">{formatDate(tx.created_at, 'd MMM yyyy, HH:mm')}</p>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ${tx.amount >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {tx.amount >= 0 ? '+' : ''}{tx.amount}
                  </span>
                </div>
              ))}
            </Card>
          )
        )}
      </div>
    </div>
  )
}
