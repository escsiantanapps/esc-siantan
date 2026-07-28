import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Bell, MessageCircle, FileText, X } from 'lucide-react'
import { newsService } from '@/services/contentService'
import { Card, Spinner, GradientHeader, Button, EmptyState } from '@/components/ui'
import MediaGallery from '@/components/MediaGallery'
import { useLang } from '@/hooks/useLang'
import { formatDate, waLink } from '@/lib/utils'

function pdfEmbedUrl(url) {
  const cleanUrl = String(url || '').split('#')[0]
  return `${cleanUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`
}

export default function InformationDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useLang()
  const [news, setNews] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pdfViewer, setPdfViewer] = useState(null) // { url, name }
  const [pdfLoading, setPdfLoading] = useState(false)

  useEffect(() => {
    newsService.getById(id).then(setNews).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!pdfViewer) return undefined

    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setPdfViewer(null)
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [pdfViewer])

  function openPdf(file) {
    setPdfLoading(true)
    setPdfViewer({ url: file.url, name: file.name })
  }

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

              {/* Lampiran PDF — dibuka in-app (iframe) agar URL Supabase tidak terekspos */}
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

      {/* Viewer native menjaga pinch-zoom, sementara fragmen PDF menyembunyikan toolbar bawaan. */}
      {pdfViewer && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-gray-950"
          style={{ paddingTop: 'var(--safe-top, 0px)' }}
          role="dialog"
          aria-modal="true"
          aria-label={pdfViewer.name}
        >
          <div className="flex min-h-14 items-center gap-3 border-b border-white/10 bg-gray-900 px-3 shrink-0">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{pdfViewer.name}</p>
            <button
              type="button"
              onClick={() => setPdfViewer(null)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-200 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              title={t('infoDetail.closePdf')}
              aria-label={t('infoDetail.closePdf')}
            >
              <X size={20} />
            </button>
          </div>
          <div className="relative min-h-0 flex-1 bg-gray-800">
            {pdfLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gray-900 text-gray-200">
                <Spinner />
                <p className="text-sm">{t('infoDetail.loadingPdf')}</p>
              </div>
            )}
            <iframe
              src={pdfEmbedUrl(pdfViewer.url)}
              title={pdfViewer.name}
              className="h-full w-full border-0 bg-gray-100"
              style={{ touchAction: 'pan-x pan-y pinch-zoom' }}
              onLoad={() => setPdfLoading(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
