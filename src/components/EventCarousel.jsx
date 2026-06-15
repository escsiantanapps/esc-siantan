import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, MapPin } from 'lucide-react'
import { formatDate } from '@/lib/utils'

// Carousel event di beranda: bisa digeser (swipe) dengan scroll-snap, plus
// auto-geser tiap beberapa detik dan indikator titik.
export default function EventCarousel({ events = [], interval = 4500 }) {
  const trackRef = useRef(null)
  const [index, setIndex] = useState(0)
  const count = events.length

  // Geser ke slide tertentu.
  function goTo(i) {
    const track = trackRef.current
    if (!track) return
    const child = track.children[i]
    if (child) track.scrollTo({ left: child.offsetLeft, behavior: 'smooth' })
  }

  // Auto-geser; berhenti bila hanya 1 event.
  useEffect(() => {
    if (count <= 1) return
    const id = setInterval(() => {
      setIndex(prev => {
        const next = (prev + 1) % count
        goTo(next)
        return next
      })
    }, interval)
    return () => clearInterval(id)
  }, [count, interval])

  // Selaraskan indikator saat user menggeser manual.
  function handleScroll() {
    const track = trackRef.current
    if (!track) return
    const i = Math.round(track.scrollLeft / track.clientWidth)
    if (i !== index) setIndex(i)
  }

  if (count === 0) return null

  return (
    <div className="mb-6 animate-fade-in-up" style={{ animationDelay: '90ms' }}>
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth gap-3 -mx-4 px-4 no-scrollbar"
      >
        {events.map(ev => (
          <Link
            key={ev.event_id}
            to={`/events/${ev.event_id}`}
            className="snap-center shrink-0 w-full block"
          >
            <div className="relative rounded-3xl overflow-hidden ambient-shadow active:scale-[0.99] transition-transform">
              {ev.thumbnail_url
                ? <img src={ev.thumbnail_url} alt={ev.name} className="w-full h-44 object-cover" />
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
          </Link>
        ))}
      </div>

      {/* Indikator titik */}
      {count > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {events.map((_, i) => (
            <button
              key={i}
              onClick={() => { setIndex(i); goTo(i) }}
              aria-label={`Event ke-${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-brand-500' : 'w-1.5 bg-gray-300'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
