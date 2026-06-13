import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, ChevronRight } from 'lucide-react'
import { newsService } from '@/services/contentService'
import { Card, Spinner, EmptyState, GradientHeader } from '@/components/ui'
import { formatDate, truncate } from '@/lib/utils'

export default function InformationPage() {
  const [news, setNews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    newsService.getAll().then(setNews).catch(() => {}).finally(() => setLoading(false))
  }, [])

  return (
    <div className="pb-4">
      <GradientHeader title="Informasi & Pengumuman" subtitle="Berita dan pengumuman terbaru gereja" />

      <div className="px-4 -mt-2 pt-4">
        {loading && <div className="flex justify-center py-8"><Spinner /></div>}

        {!loading && news.length === 0 && (
          <EmptyState icon={Bell} title="Belum ada informasi" description="Pengumuman terbaru akan muncul di sini." />
        )}

        <div className="space-y-2.5">
          {news.map(item => (
            <Link key={item.news_id} to={`/informasi/${item.news_id}`}>
              <Card className="p-3.5 flex items-start gap-3">
                {item.thumbnail_url ? (
                  <img src={item.thumbnail_url} alt={item.title} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                    <Bell size={20} className="text-orange-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                  {item.content && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{truncate(item.content, 90)}</p>}
                  <p className="text-xs text-gray-400 mt-1">{formatDate(item.created_at)}</p>
                </div>
                <ChevronRight size={16} className="text-gray-300 flex-shrink-0 mt-1" />
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
