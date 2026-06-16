import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BookOpen, ChevronRight, Clock, MapPin } from 'lucide-react'
import { newsService, classesService } from '@/services/contentService'
import { Spinner, EmptyState, GradientHeader, StatusBadge } from '@/components/ui'
import Carousel from '@/components/Carousel'
import { formatDate, truncate } from '@/lib/utils'

export default function InformationPage() {
  const [news, setNews] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      newsService.getAll().then(setNews).catch(() => {}),
      classesService.getAll({ status: 'Aktif' }).then(setClasses).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  return (
    <div className="pb-4">
      <GradientHeader title="Informasi" subtitle="Pengumuman & kelas pembinaan gereja" />

      <div className="px-4 -mt-2 pt-4 space-y-7">
        {loading && <div className="flex justify-center py-8"><Spinner /></div>}

        {!loading && (
          <>
            {/* Section: Pengumuman */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Pengumuman</h3>
              </div>
              {news.length === 0 ? (
                <EmptyState icon={Bell} title="Belum ada pengumuman" description="Pengumuman terbaru akan muncul di sini." />
              ) : (
                <Carousel
                  items={news.slice(0, 8)}
                  getKey={n => n.news_id}
                  renderItem={item => (
                    <Link to={`/informasi/${item.news_id}`} className="block">
                      <div className="rounded-3xl overflow-hidden ambient-shadow bg-surface active:scale-[0.99] transition-transform">
                        <div className="relative h-36">
                          {item.thumbnail_url
                            ? <img src={item.thumbnail_url} alt={item.title} className="w-full h-full object-cover" />
                            : (
                              <div className="w-full h-full gradient-main flex items-center justify-center">
                                <Bell size={32} className="text-white/85" strokeWidth={1.5} />
                              </div>
                            )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                          <span className="absolute top-3 left-3 bg-surface/90 text-brand-600 text-[11px] font-semibold px-2.5 py-1 rounded-full">
                            PENGUMUMAN
                          </span>
                        </div>
                        <div className="p-3.5">
                          <p className="text-sm font-semibold text-gray-900 line-clamp-1">{item.title}</p>
                          {item.content && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{truncate(item.content, 100)}</p>}
                          <p className="text-xs text-gray-400 mt-1">{formatDate(item.created_at)}</p>
                        </div>
                      </div>
                    </Link>
                  )}
                />
              )}
            </section>

            {/* Section: Kelas */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Kelas & Pembinaan</h3>
                <Link to="/kelas" className="text-xs text-brand-500 flex items-center gap-0.5">
                  Semua <ChevronRight size={13} />
                </Link>
              </div>
              {classes.length === 0 ? (
                <EmptyState icon={BookOpen} title="Belum ada kelas" description="Kelas pembinaan akan muncul di sini." />
              ) : (
                <Carousel
                  items={classes.slice(0, 8)}
                  getKey={c => c.class_id}
                  renderItem={cls => (
                    <Link to={`/kelas/${cls.class_id}`} className="block">
                      <div className="rounded-3xl overflow-hidden ambient-shadow bg-surface active:scale-[0.99] transition-transform">
                        <div className="relative h-36">
                          {cls.thumbnail_url
                            ? <img src={cls.thumbnail_url} alt={cls.name} className="w-full h-full object-cover" />
                            : (
                              <div className="w-full h-full gradient-main flex items-center justify-center">
                                <BookOpen size={32} className="text-white/85" strokeWidth={1.5} />
                              </div>
                            )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                          <div className="absolute top-3 right-3"><StatusBadge status={cls.status} /></div>
                        </div>
                        <div className="p-3.5">
                          <p className="text-sm font-semibold text-gray-900 line-clamp-1">{cls.name}</p>
                          <div className="mt-1.5 space-y-0.5">
                            {cls.schedule && (
                              <p className="text-xs text-gray-400 flex items-center gap-1"><Clock size={11} /> {cls.schedule}</p>
                            )}
                            {cls.location && (
                              <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin size={11} /> {cls.location}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  )}
                />
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
