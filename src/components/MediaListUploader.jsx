import { useRef } from 'react'
import { UploadCloud, X, Video } from 'lucide-react'

function Spin() {
  return <span className="w-5 h-5 border-2 rounded-full animate-spin border-brand-500 border-t-transparent" />
}

// Uploader daftar media (foto ATAU video) — dipakai admin untuk mengelola
// galeri foto (maks 5) & video (maks 2) pada Kelas/Event/Informasi.
// Logika unggah tetap di pemanggil lewat onAdd(file) → mengembalikan URL.
// Foto diteruskan dalam rasio asli agar galeri dapat memuat landscape maupun portrait;
// video langsung diunggah.
export default function MediaListUploader({
  kind = 'image',        // 'image' | 'video'
  label, hint, max = 5,
  urls = [], onChange, uploading,
}) {
  const inputRef = useRef(null)
  const isVideo = kind === 'video'
  const full = urls.length >= max

  function pick() { if (!full) inputRef.current?.click() }
  function onFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    onChange({ type: 'add', file: f })
  }
  function remove(i) { onChange({ type: 'remove', index: i }) }

  return (
    <div className="space-y-2">

      {label && <label className="text-sm text-gray-600 font-medium">{label} <span className="text-gray-400 font-normal">({urls.length}/{max})</span></label>}
      <input
        ref={inputRef} type="file" className="hidden"
        accept={isVideo ? 'video/*' : 'image/*'}
        onChange={onFile}
      />

      <div className="grid grid-cols-3 gap-2">
        {urls.map((u, i) => (
          <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
            {isVideo
              ? <div className="w-full h-full flex items-center justify-center bg-gray-800"><Video size={20} className="text-white/80" /></div>
              : <img src={u} alt="" className="w-full h-full object-contain" />}
            <button
              type="button" onClick={() => remove(i)} aria-label="Hapus"
              className="absolute top-1 right-1 w-6 h-6 rounded-lg bg-black/50 hover:bg-red-500 text-white flex items-center justify-center"
            >
              <X size={13} />
            </button>
          </div>
        ))}

        {!full && (
          <button
            type="button" onClick={pick} disabled={uploading}
            className="aspect-square rounded-xl border-2 border-dashed border-gray-200 hover:border-brand-300 hover:bg-brand-50/40 transition-colors flex flex-col items-center justify-center gap-1 disabled:opacity-60"
          >
            {uploading ? <Spin /> : <UploadCloud size={20} className="text-brand-500" />}
            <span className="text-[11px] text-gray-500">{uploading ? '...' : 'Tambah'}</span>
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}
