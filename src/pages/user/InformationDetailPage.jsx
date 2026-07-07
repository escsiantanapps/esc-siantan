import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Bell, MessageCircle, FileText } from 'lucide-react'
import { newsService } from '@/services/contentService'
import { Card, Spinner, GradientHeader, Button, EmptyState } from '@/components/ui'
import MediaGallery from '@/components/MediaGallery'
import { useLang } from '@/hooks/useLang'
import { formatDate, waLink } from '@/lib/utils'

export default function InformationDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useLang()
  const [news, setNews] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    newsService.getById(id).then(setNews).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  return (
    <div className="pb-4">
      <GradientHeader title={t('infoDetail.title')} back={() => navigate('/informasi')} />

      <div className="px-4 pt-4">
        {loading && <div className="flex justify-center py-8"><Spinner /></div>}

        {!loading && !news && (
          <EmptyState icon={Bell} title={t('infoDetail.notFound')} />
        )}

        {!loading && news && (
          <Card className="overflow-hidden">
            {news.thumbnail_url && (
              <img src={news.thumbnail_url} alt={news.title} className="w-full aspect-video object-cover" />
            )}
            <div className="p-4 space-y-3">
              <div>
                <h1 className="text-base font-bold text-gray-900">{news.title}</h1>
                <p className="text-xs text-gray-400 mt-1">{formatDate(news.created_at)}</p>
              </div>
              {news.content && (
                <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{news.content}</p>
              )}
              <MediaGallery photos={news.photo_urls} videos={news.video_urls} />

              {/* Lampiran PDF — dibuka di tab baru; browser/PWA menampilkannya
                  inline dengan viewer bawaan (bisa zoom, scroll, unduh). */}
              {Array.isArray(news.pdf_files) && news.pdf_files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500">{t('infoDetail.attachments')}</p>
                  {news.pdf_files.map((f, i) => (
                    <a
                      key={i}
                      href={f.url}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-control px-3 py-2.5 hover:border-brand-300 transition-colors"
                    >
                      <FileText size={18} className="text-red-500 shrink-0" />
                      <span className="flex-1 min-w-0 text-sm text-gray-700 truncate">{f.name}</span>
                      <span className="text-xs font-medium text-brand-500 shrink-0">{t('infoDetail.openPdf')}</span>
                    </a>
                  ))}
                </div>
              )}

              {waLink(news.contact_wa) && (
                <a
                  href={waLink(news.contact_wa)}
                  target="_blank" rel="noopener noreferrer"
                >
                  <Button variant="outline" className="w-full">
                    <MessageCircle size={16} /> {t('common.contactWa')}
                  </Button>
                </a>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
