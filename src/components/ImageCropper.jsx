import { useEffect, useMemo, useRef, useState } from 'react'
import { Move, ZoomIn } from 'lucide-react'
import { Button } from '@/components/ui'
import { useLang } from '@/hooks/useLang'

// Pemotong/pembingkai foto: admin mengatur posisi & zoom foto di dalam bingkai
// rasio tetap SEBELUM diunggah, supaya tidak terpotong sembarangan saat tampil
// (thumbnail/carousel memakai object-cover pada rasio yang sama).
//
// Model: pada zoom=1 foto "menutupi" (cover) bingkai; user bisa geser & zoom
// lebih dekat. Hasil dipotong ke rasio bingkai dan dikirim sebagai File JPEG.
export default function ImageCropper({ file, aspect = 16 / 9, onCancel, onCropped }) {
  const { t } = useLang()
  const V_W = 300
  const V_H = Math.round(V_W / aspect)

  const url = useMemo(() => URL.createObjectURL(file), [file])
  const [img, setImg] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef(null)

  useEffect(() => {
    const image = new Image()
    image.onload = () => setImg(image)
    image.src = url
    return () => URL.revokeObjectURL(url)
  }, [url])

  const baseScale = img ? Math.max(V_W / img.naturalWidth, V_H / img.naturalHeight) : 1
  const eff = baseScale * zoom
  const dispW = img ? img.naturalWidth * eff : V_W
  const dispH = img ? img.naturalHeight * eff : V_H

  function clamp(o) {
    return {
      x: Math.min(0, Math.max(V_W - dispW, o.x)),
      y: Math.min(0, Math.max(V_H - dispH, o.y)),
    }
  }

  // Pusatkan saat gambar dimuat.
  useEffect(() => {
    if (!img) return
    setOffset({ x: (V_W - dispW) / 2, y: (V_H - dispH) / 2 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img])

  // Jaga tetap menutupi bingkai saat zoom berubah.
  useEffect(() => {
    setOffset(o => clamp(o))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom])

  function onDown(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y }
  }
  function onMove(e) {
    if (!drag.current) return
    setOffset(clamp({ x: drag.current.ox + (e.clientX - drag.current.sx), y: drag.current.oy + (e.clientY - drag.current.sy) }))
  }
  function onUp() { drag.current = null }

  function done() {
    if (!img) return
    const O_W = 1280
    const O_H = Math.round(O_W / aspect)
    const canvas = document.createElement('canvas')
    canvas.width = O_W
    canvas.height = O_H
    const ctx = canvas.getContext('2d')
    // Rect sumber (koordinat natural gambar) yang terlihat di bingkai.
    const sx = -offset.x / eff
    const sy = -offset.y / eff
    const sW = V_W / eff
    const sH = V_H / eff
    ctx.drawImage(img, sx, sy, sW, sH, 0, 0, O_W, O_H)
    canvas.toBlob(blob => {
      if (!blob) { onCancel(); return }
      const base = (file.name || 'foto').replace(/\.[^.]+$/, '')
      onCropped(new File([blob], `${base}.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.9)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-surface rounded-2xl p-4 space-y-4">
        <div className="flex items-center gap-1.5">
          <Move size={15} className="text-brand-500" />
          <h2 className="text-sm font-semibold text-gray-900">{t('uploader.cropTitle')}</h2>
        </div>
        <p className="text-xs text-gray-400 -mt-2">{t('uploader.cropHint')}</p>

        <div
          className="relative mx-auto rounded-xl overflow-hidden bg-gray-100 touch-none select-none cursor-move"
          style={{ width: V_W, height: V_H }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
        >
          {img ? (
            <img
              src={url} alt={t('uploader.cropImageAlt')} draggable="false"
              style={{ position: 'absolute', width: dispW, height: dispH, left: offset.x, top: offset.y, maxWidth: 'none' }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">{t('uploader.loading')}</div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <ZoomIn size={15} className="text-gray-400 shrink-0" />
          <input
            type="range" min="1" max="3" step="0.01" value={zoom}
            aria-label={t('uploader.zoomLabel')}
            onChange={e => setZoom(Number(e.target.value))}
            className="flex-1 accent-brand-500"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="ghost" className="flex-1" onClick={onCancel}>{t('a.cancel')}</Button>
          <Button className="flex-1" onClick={done} disabled={!img}>{t('uploader.usePhoto')}</Button>
        </div>
      </div>
    </div>
  )
}
