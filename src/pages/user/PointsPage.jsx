import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { Sparkles, Trophy, Gift, History, QrCode, X, Crown, Medal, Award, TrendingUp, TrendingDown } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { useToast } from '@/hooks/useToast'
import { useBackClose } from '@/hooks/useBackClose'
import { pointsService } from '@/services/pointsService'
import { Card, Spinner, GradientHeader, EmptyState, Avatar, Button, StatusBadge } from '@/components/ui'
import { formatDate } from '@/lib/utils'

const LEADERBOARD_LIMIT = 10

const RANK_STYLES = {
  1: { icon: Crown, wrapper: 'bg-amber-100 text-amber-600', badge: 'bg-amber-500' },
  2: { icon: Medal, wrapper: 'bg-gray-100 text-gray-600', badge: 'bg-gray-500' },
  3: { icon: Award, wrapper: 'bg-orange-100 text-orange-600', badge: 'bg-orange-500' },
}


const TABS = [
  { key: 'katalog', label: 'Tukar Poin', icon: Gift },
  { key: 'kupon', labelKey: 'points.couponsTab', icon: QrCode },
  { key: 'peringkat', label: 'Peringkat', icon: Trophy },
  { key: 'riwayat', label: 'Riwayat', icon: History },
]

function RankBadge({ rank, label }) {
  const style = RANK_STYLES[rank]
  if (!style) {
    return <span className="w-10 text-center text-sm font-bold text-gray-400 tabular-nums" aria-label={label}>#{rank}</span>
  }
  const Icon = style.icon
  return (
    <div className="w-10 flex justify-center shrink-0" role="img" aria-label={label}>
      <div className="relative h-10 w-10">
        <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${style.wrapper}`}>
          <Icon size={19} strokeWidth={2.25} />
        </div>
        <span className={`absolute -right-0.5 -bottom-0.5 min-w-4 h-4 px-1 rounded-full text-[10px] leading-4 text-center font-extrabold text-white ${style.badge}`}>
          {rank}
        </span>
      </div>
    </div>
  )
}

export default function PointsPage() {
  const { profile } = useAuth()
  const { t } = useLang()
  const { toast, confirm } = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState('katalog')
  const [points, setPoints] = useState(profile?.points ?? 0)
  const [products, setProducts] = useState([])
  const [coupons, setCoupons] = useState([])
  const [activeCoupon, setActiveCoupon] = useState(null)
  const [couponQr, setCouponQr] = useState('')
  const [submittingProduct, setSubmittingProduct] = useState(null)
  const [cancellingCoupon, setCancellingCoupon] = useState(null)
  const [rankingRows, setRankingRows] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  useBackClose(!!activeCoupon, () => setActiveCoupon(null))

  const refreshRewards = useCallback(async () => {
    if (!profile?.user_id) return
    const [balance, catalog, myCoupons] = await Promise.all([
      pointsService.getMyPoints(profile.user_id),
      pointsService.getProducts(),
      pointsService.getMyRewardCoupons(profile.user_id),
    ])
    setPoints(balance)
    setProducts(catalog)
    setCoupons(myCoupons)
    return myCoupons
  }, [profile?.user_id])

  useEffect(() => {
    if (!profile?.user_id) return
    Promise.all([
      refreshRewards().catch(() => {}),
      pointsService.getLeaderboardWithMe(LEADERBOARD_LIMIT).then(setRankingRows).catch(() => {}),
      pointsService.getMyTransactions(profile.user_id).then(setTransactions).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [profile?.user_id, refreshRewards])

  useEffect(() => {
    function onFocus() {
      refreshRewards().then(rows => {
        setActiveCoupon(previous => previous
          ? rows.find(row => row.coupon_id === previous.coupon_id && row.status === 'Menunggu') || null
          : null)
      }).catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshRewards])

  useEffect(() => {
    if (!activeCoupon || activeCoupon.status !== 'Menunggu') { setCouponQr(''); return }
    let cancelled = false
    QRCode.toDataURL(`ESC-REWARD:${activeCoupon.coupon_id}`, {
      width: 360, margin: 2, color: { dark: '#111827', light: '#FFFFFF' },
    }).then(url => { if (!cancelled) setCouponQr(url) }).catch(() => { if (!cancelled) setCouponQr('') })
    return () => { cancelled = true }
  }, [activeCoupon])

  async function requestCoupon(product) {
    const ok = await confirm({
      title: t('points.redeemConfirmTitle'),
      message: t('points.redeemConfirmMessage', { name: product.name, cost: product.points_cost }),
      confirmText: t('points.redeemAction'),
    })
    if (!ok) return
    setSubmittingProduct(product.product_id)
    try {
      const result = await pointsService.requestRewardCoupon(product.product_id)
      if (!result?.ok) {
        toast.error(t(`points.error.${result?.reason || 'unknown'}`))
        return
      }
      setTab('kupon')
      toast.success(t(result.existing ? 'points.couponExisting' : 'points.couponCreated'))
      try {
        const latest = await refreshRewards()
        const coupon = latest?.find(row => row.coupon_id === result.coupon_id)
        if (coupon) setActiveCoupon(coupon)
        const [history, ranking] = await Promise.all([
          pointsService.getMyTransactions(profile.user_id),
          pointsService.getLeaderboardWithMe(LEADERBOARD_LIMIT),
        ])
        setTransactions(history)
        setRankingRows(ranking)
      } catch {
        toast.error(t('points.refreshFailed'))
      }
    } catch (error) {
      toast.error(error.message || t('points.error.unknown'))
    } finally { setSubmittingProduct(null) }
  }

  async function cancelCoupon(coupon) {
    const ok = await confirm({
      title: t('points.cancelTitle'),
      message: t('points.cancelMessage', { name: coupon.product_name, cost: coupon.points_cost }),
      confirmText: t('points.cancelAction'), danger: true,
    })
    if (!ok) return
    setCancellingCoupon(coupon.coupon_id)
    try {
      const result = await pointsService.cancelRewardCoupon(coupon.coupon_id)
      if (!result?.ok) { toast.error(t(`points.error.${result?.reason || 'unknown'}`)); return }
      setActiveCoupon(null)
      toast.success(t('points.cancelled'))
      try {
        await refreshRewards()
        setTransactions(await pointsService.getMyTransactions(profile.user_id))
      } catch {
        toast.error(t('points.refreshFailed'))
      }
    } catch (error) { toast.error(error.message || t('points.error.unknown')) }
    finally { setCancellingCoupon(null) }
  }

  const topLeaderboard = useMemo(
    () => rankingRows.filter(u => Number(u.rank_number) <= LEADERBOARD_LIMIT),
    [rankingRows]
  )
  const myStanding = useMemo(
    () => rankingRows.find(u => u.user_id === profile?.user_id) || null,
    [rankingRows, profile?.user_id]
  )
  const historySummary = useMemo(() => transactions.reduce((summary, transaction) => {
    const amount = Number(transaction.amount) || 0
    if (amount > 0) summary.earned += amount
    if (amount < 0) summary.spent += Math.abs(amount)
    return summary
  }, { earned: 0, spent: 0 }), [transactions])

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
          {TABS.map(({ key, label, labelKey, icon: Icon }) => (
            <button
              key={key} onClick={() => setTab(key)}
              className={`flex-1 min-h-11 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${tab === key ? 'bg-surface text-brand-600 shadow-sm' : 'text-gray-500'}`}
            >
              <Icon size={14} /> {labelKey ? t(labelKey) : label}
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
              <QrCode size={18} className="text-brand-500 shrink-0" />
              <p className="text-xs text-brand-700 flex-1">{t('points.redeemHint')}</p>
            </Card>
            {products.length === 0 ? (
              <EmptyState icon={Gift} title="Belum ada hadiah" description="Katalog penukaran poin akan muncul di sini." />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {products.map(p => {
                  const affordable = points >= p.points_cost
                  const pending = coupons.find(c => c.product_id === p.product_id && c.status === 'Menunggu')
                  const limited = p.stock_is_limited ?? (Number(p.stock) > 0)
                  const soldOut = limited && Number(p.stock) <= 0
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
                          {limited && <span className="text-[10px] text-gray-400 ml-auto">{soldOut ? t('points.soldOut') : t('points.stock', { count: p.stock })}</span>}
                        </div>
                        <Button size="sm" className="w-full min-h-11 mt-3" variant={pending ? 'outline' : 'primary'}
                          loading={submittingProduct === p.product_id}
                          disabled={!pending && (!affordable || soldOut || !!submittingProduct)}
                          onClick={() => pending ? setActiveCoupon(pending) : requestCoupon(p)}>
                          {pending ? t('points.showCoupon') : soldOut ? t('points.soldOut') : affordable ? t('points.redeemAction') : t('points.notEnough')}
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </>
        )}

        {!loading && tab === 'kupon' && (
          coupons.length === 0 ? (
            <EmptyState icon={QrCode} title={t('points.noCoupons')} description={t('points.noCouponsHint')}
              action={<Button onClick={() => setTab('katalog')}>{t('points.browseRewards')}</Button>} />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">{t('points.couponsHint')}</p>
              {coupons.map(coupon => (
                <Card key={coupon.coupon_id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{coupon.product_name}</p>
                      <p className="text-xs text-gray-500 mt-1">{coupon.points_cost} {t('home.points.unit')} · {formatDate(coupon.created_at, 'd MMM yyyy, HH:mm')}</p>
                    </div>
                    <StatusBadge status={coupon.status} />
                  </div>
                  {coupon.status === 'Menunggu' && (
                    <div className="flex gap-2 mt-4">
                      <Button className="flex-1 min-h-11" onClick={() => setActiveCoupon(coupon)}><QrCode size={16} />{t('points.showCoupon')}</Button>
                      <Button variant="outline" className="min-h-11" loading={cancellingCoupon === coupon.coupon_id}
                        onClick={() => cancelCoupon(coupon)}>{t('points.cancelAction')}</Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )
        )}

        {/* Leaderboard */}
        {!loading && tab === 'peringkat' && (
          topLeaderboard.length === 0 ? (
            <EmptyState icon={Trophy} title="Belum ada peringkat" />
          ) : (
            <Card className="divide-y divide-gray-100">
              {topLeaderboard.map((u, i) => {
                const rank = Number(u.rank_number) || i + 1
                const isMe = u.user_id === profile?.user_id
                return (
                  <div
                    key={u.user_id}
                    aria-current={isMe ? 'true' : undefined}
                    className={isMe
                      ? 'flex items-center gap-3 p-3.5 bg-brand-50'
                      : 'flex items-center gap-3 p-3.5'}
                  >
                    <RankBadge rank={rank} label={t('points.rankBadgeAria', { rank })} />
                    <Avatar name={u.name} src={u.photo_url} size="sm" />
                    <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">
                      {u.name}{isMe && <span className="text-brand-500"> ({t('points.you')})</span>}
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      <Sparkles size={13} className="text-brand-500" />
                      <span className="text-sm font-bold text-brand-600 tabular-nums">{u.points}</span>
                    </div>
                  </div>
                )
              })}
              {myStanding && Number(myStanding.rank_number) > LEADERBOARD_LIMIT && (
                <>
                  <div className="px-3.5 py-2 bg-control">
                    <p className="text-xs font-semibold text-gray-600">{t('points.yourRank')}</p>
                  </div>
                  <div
                    aria-current="true"
                    aria-label={t('points.rankAria', { rank: myStanding.rank_number })}
                    className="flex items-center gap-3 p-3.5 bg-brand-50"
                  >
                    <RankBadge rank={Number(myStanding.rank_number)} label={t('points.rankAria', { rank: myStanding.rank_number })} />
                    <Avatar name={myStanding.name} src={myStanding.photo_url} size="sm" />
                    <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">
                      {myStanding.name} <span className="text-brand-500">({t('points.you')})</span>
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      <Sparkles size={13} className="text-brand-500" />
                      <span className="text-sm font-bold text-brand-600 tabular-nums">{myStanding.points}</span>
                    </div>
                  </div>
                </>
              )}
            </Card>
          )
        )}
        {/* Riwayat transaksi poin */}
        {!loading && tab === 'riwayat' && (
          transactions.length === 0 ? (
            <EmptyState icon={History} title="Belum ada transaksi" description="Poin dari kehadiran & penukaran akan tercatat di sini." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Card className="p-3">
                  <div className="flex items-center gap-2 text-green-600">
                    <TrendingUp size={15} />
                    <span className="text-xs font-medium">{t('points.historyEarned')}</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900 mt-1">+{historySummary.earned}</p>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center gap-2 text-red-500">
                    <TrendingDown size={15} />
                    <span className="text-xs font-medium">{t('points.historySpent')}</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900 mt-1">-{historySummary.spent}</p>
                </Card>
              </div>
              <p className="text-xs text-gray-400 mb-2">{t('points.historyCount', { count: transactions.length })}</p>
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
            </>
          )
        )}
      </div>

      {activeCoupon && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('points.couponTitle')}>
          <Card className="w-full max-w-sm p-5 text-center">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-gray-900">{t('points.couponTitle')}</h2>
              <button type="button" aria-label={t('common.cancel')} onClick={() => setActiveCoupon(null)}
                className="min-w-11 min-h-11 flex items-center justify-center text-gray-500 hover:text-gray-900"><X size={20} /></button>
            </div>
            <p className="text-lg font-semibold text-gray-900 mt-3">{activeCoupon.product_name}</p>
            <p className="text-sm text-gray-500">{activeCoupon.points_cost} {t('home.points.unit')}</p>
            {couponQr ? <img src={couponQr} alt={t('points.couponQrAlt')} className="w-full max-w-64 mx-auto my-5 rounded-xl bg-white p-2" />
              : <div className="flex justify-center py-12"><Spinner /></div>}
            <p className="text-sm text-gray-600">{t('points.couponShowAdmin')}</p>
            <p className="text-xs text-gray-400 mt-2 break-all">{activeCoupon.coupon_id}</p>
          </Card>
        </div>
      )}
    </div>
  )
}
