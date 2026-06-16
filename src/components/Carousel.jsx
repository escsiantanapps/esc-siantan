import { useEffect, useRef, useState } from 'react'

// Carousel horizontal reusable: bisa digeser (scroll-snap), auto-geser, + dot.
// Pakai dengan `items` + `renderItem(item)`.
export default function Carousel({ items = [], renderItem, getKey, interval = 4500 }) {
  const trackRef = useRef(null)
  const [index, setIndex] = useState(0)
  const count = items.length

  function goTo(i) {
    const track = trackRef.current
    if (!track) return
    const child = track.children[i]
    if (child) track.scrollTo({ left: child.offsetLeft, behavior: 'smooth' })
  }

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

  function handleScroll() {
    const track = trackRef.current
    if (!track) return
    const i = Math.round(track.scrollLeft / track.clientWidth)
    if (i !== index) setIndex(i)
  }

  if (count === 0) return null

  return (
    <div>
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth gap-3 -mx-4 px-4 no-scrollbar"
      >
        {items.map((item, i) => (
          <div key={getKey ? getKey(item) : i} className="snap-center shrink-0 w-full">
            {renderItem(item)}
          </div>
        ))}
      </div>

      {count > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => { setIndex(i); goTo(i) }}
              aria-label={`Slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-brand-500' : 'w-1.5 bg-gray-300'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
