import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'

// Nama komponen dipertahankan agar pemanggil lama tidak rusak. Komponen ini
// sengaja hanya membaca thumbnail cover, bukan membuka dokumen PDF.
export default function PdfCover({ url, label, className = 'w-16' }) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(url) && !failed

  useEffect(() => setFailed(false), [url])

  return (
    <div
      className={`${className} aspect-[3/4] shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center`}
      role={showImage ? undefined : 'img'}
      aria-label={showImage ? undefined : label}
    >
      {showImage ? (
        <img
          src={url}
          alt={label}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <BookOpen size={20} className="text-brand-400" aria-hidden="true" />
      )}
    </div>
  )
}
