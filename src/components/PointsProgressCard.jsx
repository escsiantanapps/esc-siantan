import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Star, Gift, ChevronRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/hooks/useLang'
import { pointsService } from '@/services/pointsService'
import { Card } from '@/components/ui'

// Widget dashboard: saldo poin + progres menuju hadiah termurah yang belum
// terjangkau. Data dari kolom points (profil) + katalog redeemable_products
// yang sudah ada — tanpa backend baru. Menekan gamifikasi app.
export default function PointsProgressCard() {
  const { profile } = useAuth()
  const { t } = useLang()
  const [products, setProducts] = useState(null)
  const [failed, setFailed] = useState(false)
  const points = profile?.points ?? 0

  useEffect(() => {
    let active = true
    setProducts(null)
    setFailed(false)
    pointsService.getProducts()
      .then(list => { if (active) setProducts(list || []) })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [profile?.user_id])

  if (products === null && !failed) return null

  // Katalog kosong/gagal bukan berarti saldo cukup untuk seluruh hadiah.
  const available = (products || []).filter(product => product.stock !== 0)
  const target = available.filter(product => product.points_cost > points)
    .sort((a, b) => a.points_cost - b.points_cost)[0]

  const pct = target ? Math.min(100, Math.round((points / target.points_cost) * 100)) : 100
  const remaining = target ? target.points_cost - points : 0

  return (
    <section className="mb-5 animate-fade-in-up">
      <Link to="/poin" className="block">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Star size={20} className="fill-amber-500 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-gray-400">{t('home.points.title')}</p>
                <p className="text-lg font-bold text-gray-900 leading-tight">
                  {points} <span className="text-sm font-medium text-gray-400">{t('home.points.unit')}</span>
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-500">
              <Gift size={14} /> {t(failed || !available.length ? 'home.points.view' : 'home.points.redeem')} <ChevronRight size={14} />
            </span>
          </div>

          {!failed && target ? (
            <>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full gradient-main" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {t('home.points.remaining', { n: remaining })} · {t('home.points.toReward', { name: target.name })}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-600">
              {t(failed ? 'home.points.loadFailed' : !available.length ? 'home.points.empty' : 'home.points.allUnlocked')}
            </p>
          )}
        </Card>
      </Link>
    </section>
  )
}
