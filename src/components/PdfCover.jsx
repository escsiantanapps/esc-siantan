import { useEffect, useRef, useState } from 'react'
import { BookOpen } from 'lucide-react'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

export default function PdfCover({ url, label, className = 'w-16' }) {
  const frameRef = useRef(null)
  const canvasRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const element = frameRef.current
    if (!element || !url) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '200px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [url])

  useEffect(() => {
    const element = frameRef.current
    if (!element) return undefined
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!url || !visible || !size.width || !size.height) return undefined

    let cancelled = false
    let loadingTask
    let renderTask
    let document
    setReady(false)
    setError(false)

    import('pdfjs-dist').then(({ GlobalWorkerOptions, getDocument }) => {
      GlobalWorkerOptions.workerSrc = pdfWorkerUrl
      loadingTask = getDocument(url)
      return loadingTask.promise
    }).then((loadedDocument) => {
      document = loadedDocument
      return loadedDocument.getPage(1)
    }).then((page) => {
      if (cancelled) return null
      const initial = page.getViewport({ scale: 1 })
      const scale = Math.min(size.width / initial.width, size.height / initial.height)
      const viewport = page.getViewport({ scale })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (!canvas || !context) return null

      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
      })
      return renderTask.promise
    }).then(() => {
      if (!cancelled) setReady(true)
    }).catch((renderError) => {
      if (!cancelled && renderError?.name !== 'RenderingCancelledException') setError(true)
    })

    return () => {
      cancelled = true
      renderTask?.cancel()
      if (loadingTask) loadingTask.destroy()
      else document?.destroy()
    }
  }, [size.height, size.width, url, visible])

  return (
    <div
      ref={frameRef}
      className={`${className} aspect-[3/4] shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center`}
    >
      {(!url || error || !ready) && <BookOpen size={20} className="text-brand-400" aria-hidden="true" />}
      <canvas
        ref={canvasRef}
        className={ready ? 'block' : 'hidden'}
        role="img"
        aria-label={label}
      />
    </div>
  )
}
