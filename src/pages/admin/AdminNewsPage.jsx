import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Plus, ChevronRight } from 'lucide-react'
import { newsService } from '@/services/contentService'
import { Card, PageHeader, Button, Spinner, EmptyState } from '@/components/ui'
import { formatDate, truncate } from '@/lib/utils'

export default function AdminNewsPage() {
  const [news, setNews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    newsService.getAll().then(setNews).catch(() => {}).finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <PageHeader
        title="Kelola Berita"
        subtitle={`${news.length} berita/pengumuman`}
        action={<Link to="/admin/berita/baru"><Button size="sm"><Plus size={15} /> Tambah Berita</Button></Link>}
      />

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && news.length === 0 && (
        <EmptyState icon={Bell} title="Belum ada berita" description="Tambahkan berita atau pengumuman pertama." />
      )}

      {!loading && news.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {news.map(item => (
            <Link key={item.news_id} to={`/admin/berita/${item.news_id}/edit`} className="flex items-center gap-3 p-3.5 hover:bg-gray-50 transition-colors">
              {item.thumbnail_url ? (
                <img src={item.thumbnail_url} alt={item.title} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                  <Bell size={20} className="text-orange-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                {item.content && <p className="text-xs text-gray-400 mt-0.5 truncate">{truncate(item.content, 70)}</p>}
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(item.created_at)}</p>
              </div>
              <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
            </Link>
          ))}
        </Card>
      )}
    </div>
  )
}
