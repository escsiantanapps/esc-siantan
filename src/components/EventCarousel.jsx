import { Link } from 'react-router-dom'
import { Calendar, MapPin } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import Carousel from '@/components/Carousel'
import { StatusBadge } from '@/components/ui'

// Carousel event di beranda (kartu hero bergambar). Memakai Carousel reusable.
export default function EventCarousel({ events = [], interval = 4500, variant = 'overlay' }) {
  if (events.length === 0) return null

  return (
    <div className="mb-6 animate-fade-in-up" style={{ animationDelay: '90ms' }}>
      <Carousel
        items={events}
        interval={interval}
        getKey={ev => ev.event_id}
        renderItem={ev => (
          <Link to={`/events/${ev.event_id}`} className="block">
            {variant === 'preview' ? (
              <div className="information-teaser-card glass-card rounded-3xl overflow-hidden active:scale-[0.99] transition-transform">
                <div className="information-teaser-media relative h-36">
                  {ev.thumbnail_url
                    ? <img src={ev.thumbnail_url} alt={ev.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    : <div className="w-full h-full gradient-main flex items-center justify-center"><Calendar size={32} className="text-white/85" strokeWidth={1.5} /></div>}
                  <div className="absolute top-3 right-3"><StatusBadge status={ev.status} /></div>
                </div>
                <div className="information-teaser-copy p-3.5">
                  <p className="information-teaser-title text-sm font-semibold text-gray-900 line-clamp-2">{ev.name}</p>
                  <div className="mt-1.5 space-y-0.5">
                    <p className="information-teaser-meta text-xs text-gray-500 flex items-center gap-1"><Calendar size={11} /> {formatDate(ev.event_date)}{ev.event_time ? ` · ${ev.event_time.slice(0, 5)}` : ''}</p>
                    {ev.location && <p className="information-teaser-meta text-xs text-gray-500 flex items-center gap-1"><MapPin size={11} /> {ev.location}</p>}
                  </div>
                </div>
              </div>
            ) : (
            <div className="relative rounded-3xl overflow-hidden ambient-shadow active:scale-[0.99] transition-transform">
              {ev.thumbnail_url
                ? <img src={ev.thumbnail_url} alt={ev.name} loading="lazy" decoding="async" className="w-full h-44 object-cover" />
                : <div className="w-full h-44 gradient-main" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
              <span className="absolute top-3 left-3 bg-surface/90 text-brand-600 text-[11px] font-semibold px-2.5 py-1 rounded-full">
                EVENT
              </span>
              <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                <p className="text-xs flex items-center gap-1 text-white/85">
                  <Calendar size={12} /> {formatDate(ev.event_date)}{ev.event_time ? ` · ${ev.event_time}` : ''}
                </p>
                <h2 className="text-lg font-bold mt-0.5 text-white">{ev.name}</h2>
                {ev.location && (
                  <p className="text-xs flex items-center gap-1 text-white/85 mt-0.5">
                    <MapPin size={12} /> {ev.location}
                  </p>
                )}
              </div>
            </div>
            )}
          </Link>
        )}
      />
    </div>
  )
}
