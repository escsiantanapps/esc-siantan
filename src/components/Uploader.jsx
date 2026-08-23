import { useRef, useState } from 'react'
import { UploadCloud, Paperclip, X, Eye } from 'lucide-react'
import ImageCropper from '@/components/ImageCropper'

function Spin({ light }) {
  return <span className={`w-5 h-5 border-2 rounded-full animate-spin ${light ? 'border-white border-t-transparent' : 'border-brand-500 border-t-transparent'}`} />
}

// Komponen upload presentasional yang rapi. Varian:
//   kind="image" → drop-area + pratinjau foto
//   kind="file"  → kartu file + tautan lihat
// Logika unggah tetap di pemanggil: `onFile(file)` dipanggil saat memilih.
// Bila crop=true (khusus kind="image"), foto dibingkai dulu lewat ImageCropper
// pada rasio `aspect` sebelum diteruskan ke onFile — supaya tidak terpotong.
export default function Uploader({
  kind = 'file', value, onFile, onClear, uploading,
  label, hint, accept, required, crop = false, aspect = 16 / 9,
  uploadLabel = 'Unggah Foto', replaceLabel = 'Ganti Foto',
  removeLabel = 'Hapus foto', uploadingLabel = 'Mengunggah...', imageAlt = '', beforeFile,
}) {
  const inputRef = useRef(null)
  const [pendingFile, setPendingFile] = useState(null)
  const pick = () => inputRef.current?.click()
  function onChange(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (beforeFile && beforeFile(f) === false) return
    if (crop && kind === 'image') setPendingFile(f)
    else onFile(f)
  }
  const defaultAccept = kind === 'image' ? 'image/*' : 'image/*,.pdf'

  return (
    <div className="space-y-1.5">
      {pendingFile && (
        <ImageCropper
          file={pendingFile} aspect={aspect}
          onCancel={() => setPendingFile(null)}
          onCropped={f => { setPendingFile(null); onFile(f) }}
        />
      )}
      {label && (
        <label className="text-sm text-gray-600 font-medium">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <input ref={inputRef} type="file" accept={accept || defaultAccept} className="hidden" onChange={onChange} />

      {kind === 'image' ? (
        value ? (
          <div
            className={`relative rounded-2xl overflow-hidden border border-gray-100 ${crop ? 'max-w-xs mx-auto min-h-40' : 'h-40'}`}
            style={crop ? { aspectRatio: String(aspect) } : undefined}
          >
            <img src={value} alt={imageAlt} className="w-full h-full object-cover" />
            {uploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Spin light /></div>
            )}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-2 bg-gradient-to-t from-black/60 to-transparent">
              <button type="button" onClick={pick} className="text-xs font-medium text-white bg-white/20 hover:bg-white/30 backdrop-blur px-3 py-1.5 rounded-lg transition-colors">
                {replaceLabel}
              </button>
              {onClear && (
                <button type="button" onClick={onClear} aria-label={removeLabel} className="w-7 h-7 rounded-lg bg-white/20 hover:bg-red-500/80 text-white flex items-center justify-center transition-colors">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button" onClick={pick} disabled={uploading}
            className={`w-full rounded-2xl border-2 border-dashed border-gray-200 hover:border-brand-300 hover:bg-brand-50/40 transition-colors flex flex-col items-center justify-center gap-2 disabled:opacity-60 ${crop ? 'max-w-xs mx-auto min-h-40' : 'h-40'}`}
            style={crop ? { aspectRatio: String(aspect) } : undefined}
          >
            {uploading ? <Spin /> : (
              <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center text-brand-500">
                <UploadCloud size={22} />
              </div>
            )}
            <span className="text-sm font-medium text-gray-600">{uploading ? uploadingLabel : uploadLabel}</span>
            <span className="text-xs text-gray-400">{hint || 'Ketuk untuk ambil/pilih foto'}</span>
          </button>
        )
      ) : (
        value ? (
          <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
            <div className="w-9 h-9 rounded-lg bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
              <Paperclip size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">File terunggah</p>
              <a href={value} target="_blank" rel="noreferrer" className="text-xs text-brand-500 inline-flex items-center gap-1">
                <Eye size={12} /> Lihat file
              </a>
            </div>
            {uploading ? <Spin /> : (
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={pick} className="text-xs text-gray-500 hover:text-brand-500 px-2 py-1">Ganti</button>
                {onClear && (
                  <button type="button" onClick={onClear} aria-label="Hapus file" className="w-7 h-7 rounded-lg text-gray-400 hover:text-red-500 flex items-center justify-center">
                    <X size={15} />
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <button
            type="button" onClick={pick} disabled={uploading}
            className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-gray-200 hover:border-brand-300 hover:bg-brand-50/40 transition-colors text-left disabled:opacity-60"
          >
            <div className="w-9 h-9 rounded-lg bg-control text-gray-400 flex items-center justify-center shrink-0">
              {uploading ? <Spin /> : <Paperclip size={16} />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-600">{uploading ? 'Mengunggah...' : 'Pilih file'}</p>
              <p className="text-xs text-gray-400">{hint || 'Gambar atau PDF'}</p>
            </div>
          </button>
        )
      )}
    </div>
  )
}
