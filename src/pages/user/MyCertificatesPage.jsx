import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Award, Eye } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { certificatesService } from '@/services/contentService'
import { Card, Spinner, EmptyState, GradientHeader } from '@/components/ui'
import { useLang } from '@/hooks/useLang'
import { formatDate } from '@/lib/utils'

export default function MyCertificatesPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { t } = useLang()
  const [certs, setCerts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.user_id) return
    certificatesService.getMine(profile.user_id)
      .then(setCerts)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [profile?.user_id])

  return (
    <div className="pb-4">
      <GradientHeader title={t('mycert.title')} subtitle={t('mycert.subtitle')} back={() => navigate('/pengaturan')} />

      <div className="px-4 -mt-2 pt-4 space-y-2.5">
        {loading && <div className="flex justify-center py-8"><Spinner /></div>}

        {!loading && certs.length === 0 && (
          <EmptyState icon={Award} title={t('mycert.empty')} description={t('mycert.emptyDesc')} />
        )}

        {!loading && certs.map(c => (
          <Card key={c.certificate_id} className="p-3.5 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <Award size={18} className="text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{c.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t('mycert.issuedOn')} {formatDate(c.issued_at)}</p>
              {c.note && <p className="text-xs text-gray-500 mt-1">{c.note}</p>}
              <a href={c.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-500 mt-1.5">
                <Eye size={12} /> {t('mycert.view')}
              </a>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
