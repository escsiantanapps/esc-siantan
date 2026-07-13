import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Droplets, Heart, Baby, Calendar, ClipboardList, CreditCard } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { registrationService, eventsService } from '@/services/contentService'
import { Card, Spinner, EmptyState, GradientHeader, StatusBadge } from '@/components/ui'
import { useLang } from '@/hooks/useLang'
import { formatDate } from '@/lib/utils'

export default function RegistrationStatusPage() {
  const { profile } = useAuth()
  const { t } = useLang()
  const [baptism, setBaptism] = useState([])
  const [wedding, setWedding] = useState([])
  const [dedication, setDedication] = useState([])
  const [ktj, setKtj] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.user_id) return
    Promise.all([
      registrationService.getMyRegistrations(profile.user_id),
      eventsService.getMyRegistrations(profile.user_id),
    ])
      .then(([reg, evt]) => {
        setBaptism(reg.baptism)
        setWedding(reg.wedding)
        setDedication(reg.dedication)
        setKtj(reg.ktj || [])
        setEvents(evt)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [profile?.user_id])

  const isEmpty = !loading && baptism.length === 0 && wedding.length === 0 && dedication.length === 0 && ktj.length === 0 && events.length === 0

  return (
    <div className="pb-4">
      <GradientHeader title={t('regStatus.title')} subtitle={t('regStatus.subtitle')} />

      <div className="px-4 -mt-2 pt-4 space-y-5">
        {loading && <div className="flex justify-center py-8"><Spinner /></div>}

        {isEmpty && (
          <EmptyState icon={ClipboardList} title={t('regStatus.empty')} description={t('regStatus.emptyDesc')} />
        )}

        {!loading && baptism.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">{t('regStatus.baptism')}</h2>
            <div className="space-y-2.5">
              {baptism.map(item => (
                <Card key={item.baptism_id} className="p-3.5 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                    <Droplets size={18} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{item.full_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t('common.submitted')} {formatDate(item.created_at)}</p>
                    {item.admin_note && <p className="text-xs text-gray-500 mt-1">{t('common.note')}: {item.admin_note}</p>}
                  </div>
                  <StatusBadge status={item.status} />
                </Card>
              ))}
            </div>
          </div>
        )}

        {!loading && wedding.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">{t('regStatus.wedding')}</h2>
            <div className="space-y-2.5">
              {wedding.map(item => (
                <Card key={item.wedding_id} className="p-3.5 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center shrink-0">
                    <Heart size={18} className="text-pink-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{item.groom_name} & {item.bride_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t('common.submitted')} {formatDate(item.created_at)}</p>
                    {item.admin_note && <p className="text-xs text-gray-500 mt-1">{t('common.note')}: {item.admin_note}</p>}
                  </div>
                  <StatusBadge status={item.status} />
                </Card>
              ))}
            </div>
          </div>
        )}

        {!loading && dedication.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">{t('regStatus.dedication')}</h2>
            <div className="space-y-2.5">
              {dedication.map(item => (
                <Card key={item.dedication_id} className="p-3.5 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <Baby size={18} className="text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{item.child_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t('common.submitted')} {formatDate(item.created_at)}</p>
                    {item.admin_note && <p className="text-xs text-gray-500 mt-1">{t('common.note')}: {item.admin_note}</p>}
                  </div>
                  <StatusBadge status={item.status} />
                </Card>
              ))}
            </div>
          </div>
        )}

        {!loading && ktj.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('regStatus.ktj')}</h2>
            <div className="space-y-2.5">
              {ktj.map(item => (
                <Card key={item.ktj_id} className="p-3.5 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                    <CreditCard size={18} className="text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.full_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t('common.submitted')} {formatDate(item.created_at)}</p>
                    {item.status === 'Ditolak' && item.admin_note && (
                      <div className="mt-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-2.5 py-2">
                        <p className="text-xs font-semibold text-red-900 dark:text-red-200 mb-0.5">Alasan Penolakan:</p>
                        <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">{item.admin_note}</p>
                      </div>
                    )}
                    {item.status !== 'Ditolak' && item.admin_note && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('common.note')}: {item.admin_note}</p>
                    )}
                  </div>
                  <StatusBadge status={item.status} />
                </Card>
              ))}
            </div>
          </div>
        )}

        {!loading && events.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">{t('regStatus.event')}</h2>
            <div className="space-y-2.5">
              {events.map(item => (
                <Link key={item.ticket_id} to={`/events/${item.event_id}`} className="block">
                  <Card className="p-3.5 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
                      <Calendar size={18} className="text-brand-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{item.events?.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(item.events?.event_date)}</p>
                    </div>
                    <StatusBadge status="Terjadwal" />
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
