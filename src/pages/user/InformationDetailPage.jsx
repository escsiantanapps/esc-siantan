import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Bell, MessageCircle, FileText } from 'lucide-react'
import { newsService } from '@/services/contentService'
import { Card, Spinner, GradientHeader, Button, EmptyState } from '@/components/ui'
import MediaGallery from '@/components/MediaGallery'
import PdfViewerModal from '@/components/PdfViewerModal'
import { useLang } from '@/hooks/useLang'
import { formatDate, waLink } from '@/lib/utils'

export default function InformationDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useLang()
  const [news, setNews] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pdfViewer, setPdfViewer] = useState(null) // { url, name }

  useEffect(() => {
    newsService.getById(id).then(setNews).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  function openPdf(file) {
    setPdfViewer({ url: file.url, name: file.name })
  }

  const closePdf = useCallback(() => setPdfViewer(null), [])

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

              {/* Lampiran PDF dibuka melalui viewer PDF.js lokal di dalam aplikasi. */}
              {Array.isArray(news.pdf_files) && news.pdf_files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500">{t('infoDetail.attachments')}</p>
                  {news.pdf_files.map((f, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => openPdf(f)}
                      className="w-full flex items-center gap-2.5 rounded-xl border border-gray-100 bg-control px-3 py-2.5 hover:border-brand-300 transition-colors text-left"
                    >
                      <FileText size={18} className="text-red-500 shrink-0" />
                      <span className="text-sm text-gray-700 truncate flex-1">{f.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {news.contact_name && (
                <div className="pt-1 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-1">{t('infoDetail.contact')}</p>
                  <a
                    href={waLink(news.contact_phone, `Halo, saya ingin bertanya tentang: ${news.title}`)}
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-green-600 font-medium"
                  >
                    <MessageCircle size={15} />
                    {news.contact_name}
                  </a>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      {pdfViewer && <PdfViewerModal file={pdfViewer} onClose={closePdf} />}
    </div>
  )
}
