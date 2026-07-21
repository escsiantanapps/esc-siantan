import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Image as ImageIcon, Video } from 'lucide-react'

// Galeri media untuk halaman detail Kelas/Event/Informasi.
// - Foto: carousel yang otomatis berpindah setiap 10 detik (auto-slide).
// - Video: pemutar autoplay (muted) saat halaman dibuka, tanpa auto-slide.
export default function MediaGallery({ photos = [], videos = [] }) {
  const pics = (photos || []).filter(Boolean).slice(0, 5)
  const vids = (videos || []).filter(Boolean).slice(0, 2)
  if (pics.length === 0 && vids.length === 0) return null

  return (
    <div className="space-y-4">
      {pics.length > 0 && <PhotoCarousel photos={pics} />}
      {vids.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
            <Video size={13} /> Video
          </p>
          <div className="space-y-3">
            {vids.map((src, i) => (
              <video
                key={i} src={src} controls autoPlay muted loop playsInline
                className="w-full rounded-2xl bg-black"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PhotoCarousel({ photos }) {
  const [idx, setIdx] = useState(0)

  // Auto-slide tiap 10 detik (berhenti bila hanya 1 foto).
  useEffect(() => {
    if (photos.length <= 1) return
    const timer = setInterval(() => setIdx(i => (i + 1) % photos.length), 10000)
    return () => clearInterval(timer)
  }, [photos.length])

  // Jaga indeks tetap valid bila jumlah foto berubah.
  useEffect(() => { if (idx >= photos.length) setIdx(0) }, [photos.length, idx])

  const go = d => setIdx(i => (i + d + photos.length) % photos.length)

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
        <ImageIcon size={13} /> Foto
      </p>
      {/* Tinggi container mengikuti foto aktif — tidak ada rasio paksa.
          object-contain agar foto tidak ter-crop; bg-gray-950 menutup area kosong. */}
      <div className="relative rounded-2xl overflow-hidden ambient-shadow bg-gray-950 min-h-32 max-h-[70vh]">
        {photos.map((src, i) => (
          <img
            key={i} src={src} alt=""
            className={`w-full max-h-[70vh] object-contain transition-opacity duration-700 ${i === idx ? 'opacity-100 relative' : 'opacity-0 absolute inset-0'}`}
            draggable="false"
          />
        ))}

        {photos.length > 1 && (
          <>
            <button
              onClick={() => go(-1)} aria-label="Sebelumnya"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/35 hover:bg-black/55 text-white flex items-center justify-center backdrop-blur transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => go(1)} aria-label="Berikutnya"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/35 hover:bg-black/55 text-white flex items-center justify-center backdrop-blur transition-colors"
            >
              <ChevronRight size={18} />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
              {photos.map((_, i) => (
                <button
                  key={i} onClick={() => setIdx(i)} aria-label={`Foto ${i + 1}`}
                  className={`rounded-full transition-all ${i === idx ? 'w-5 h-2 bg-white' : 'w-2 h-2 bg-white/50'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
