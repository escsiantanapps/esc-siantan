import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from 'lucide-react'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Spinner } from '@/components/ui'
import { useLang } from '@/hooks/useLang'

const MIN_ZOOM = 0.75
const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.25
const PAGE_RATIO_FALLBACK = 1.414

function PdfPage({ pdf, pageNumber, zoom, width, scrollRoot, label, errorText, retryText }) {
  const wrapperRef = useRef(null)
  const canvasRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [renderError, setRenderError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [pageSize, setPageSize] = useState(null)

  useEffect(() => {
    const element = wrapperRef.current
    if (!element || !scrollRoot) return undefined

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { root: scrollRoot, rootMargin: '100% 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [scrollRoot])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!visible || !pdf || !width) {
      if (!visible && canvas) {
        // Lepaskan bitmap halaman jauh dari viewport agar PDF panjang tidak
        // menghabiskan memori perangkat, sambil wrapper menjaga posisi scroll.
        canvas.width = 1
        canvas.height = 1
      }
      return undefined
    }

    let cancelled = false
    let renderTask
    setRendering(true)
    setRenderError(false)

    pdf.getPage(pageNumber).then((page) => {
      if (cancelled) return null

      const initialViewport = page.getViewport({ scale: 1 })
      const fitScale = Math.max(0.1, (width - 24) / initialViewport.width)
      const viewport = page.getViewport({ scale: fitScale * zoom })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const context = canvas?.getContext('2d')
      if (!canvas || !context) return null

      setPageSize({ width: viewport.width, height: viewport.height })
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
    }).catch((error) => {
      if (!cancelled && error?.name !== 'RenderingCancelledException') setRenderError(true)
    }).finally(() => {
      if (!cancelled) setRendering(false)
    })

    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [pdf, pageNumber, retryKey, visible, width, zoom])

  const fallbackWidth = Math.max(width - 24, 1) * zoom
  const displayWidth = pageSize?.width || fallbackWidth
  const displayHeight = pageSize?.height || fallbackWidth * PAGE_RATIO_FALLBACK

  return (
    <div
      ref={wrapperRef}
      data-pdf-page={pageNumber}
      className="relative flex shrink-0 items-center justify-center overflow-hidden bg-white"
      style={{ width: displayWidth, minHeight: displayHeight }}
    >
      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100" aria-hidden="true">
          <Spinner />
        </div>
      )}
      {renderError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gray-100 px-4 text-center">
          <p className="text-sm text-gray-700">{errorText}</p>
          <button
            type="button"
            onClick={() => setRetryKey((value) => value + 1)}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-control px-4 text-sm font-medium text-gray-800 transition-colors hover:bg-control-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <RotateCcw size={17} />
            {retryText}
          </button>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`block max-w-none bg-white ${rendering || renderError ? 'opacity-0' : 'opacity-100'}`}
        role="img"
        aria-label={label}
      />
    </div>
  )
}

export default function PdfViewerModal({
  file,
  onClose,
  bottomPanel = null,
  initialPage = 1,
  onPageChange,
  continuous = false,
}) {
  const { t } = useLang()
  const dialogRef = useRef(null)
  const closeButtonRef = useRef(null)
  const viewportRef = useRef(null)
  const [pdf, setPdf] = useState(null)
  const [width, setWidth] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [currentPage, setCurrentPage] = useState(Math.max(Number(initialPage) || 1, 1))
  const [turnDirection, setTurnDirection] = useState('next')
  const touchStartRef = useRef(null)

  const [jumpPage, setJumpPage] = useState('')

  useEffect(() => {
    setJumpPage(String(currentPage))
  }, [currentPage])

  function handleJumpSubmit(e) {
    e?.preventDefault?.()
    let p = parseInt(jumpPage, 10)
    if (isNaN(p)) {
      setJumpPage(String(currentPage))
      return
    }
    p = Math.min(Math.max(p, 1), pdf?.numPages || 1)
    if (p !== currentPage) {
      setTurnDirection(p > currentPage ? 'next' : 'previous')
      setCurrentPage(p)
    } else {
      setJumpPage(String(currentPage))
    }
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus())

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = [...(dialogRef.current?.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || [])]
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.body.style.overflow = 'hidden'
    document.body.classList.add('pdf-viewer-open')
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      document.body.classList.remove('pdf-viewer-open')
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus?.()
    }
  }, [onClose])

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    let loadingTask
    setLoading(true)
    setError(false)
    setPdf(null)

    import('pdfjs-dist').then(({ GlobalWorkerOptions, getDocument }) => {
      GlobalWorkerOptions.workerSrc = pdfWorkerUrl
      loadingTask = getDocument(file.url)
      return loadingTask.promise
    }).then((document) => {
      if (!cancelled) setPdf(document)
    }).catch(() => {
      if (!cancelled) setError(true)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
      loadingTask?.destroy()
    }
  }, [file.url, reloadKey])

  useEffect(() => {
    if (!pdf) return
    const restoredPage = Math.min(Math.max(Number(initialPage) || 1, 1), pdf.numPages)
    setCurrentPage(restoredPage)
  }, [file.url, initialPage, pdf])

  useEffect(() => {
    if (pdf) onPageChange?.(currentPage)
  }, [currentPage, onPageChange, pdf])

  function turnPage(step) {
    if (!pdf) return
    setCurrentPage((pageNumber) => {
      const nextPage = Math.min(Math.max(pageNumber + step, 1), pdf.numPages)
      if (nextPage !== pageNumber) setTurnDirection(step > 0 ? 'next' : 'previous')
      return nextPage
    })
  }

  function handleTouchStart(event) {
    if (continuous) return
    const touch = event.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  function handleTouchEnd(event) {
    if (continuous) return
    if (!touchStartRef.current) return
    if (zoom > 1) { touchStartRef.current = null; return }
    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - touchStartRef.current.x
    const deltaY = touch.clientY - touchStartRef.current.y
    touchStartRef.current = null
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return
    turnPage(deltaX < 0 ? 1 : -1)
  }

  useEffect(() => {
    const handlePageKeys = (event) => {
      if (continuous) return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return
      if (event.key === 'ArrowLeft') turnPage(-1)
      if (event.key === 'ArrowRight') turnPage(1)
    }
    document.addEventListener('keydown', handlePageKeys)
    return () => document.removeEventListener('keydown', handlePageKeys)
  })

  return (
    <div
      ref={dialogRef}
      className="pdf-viewer-shell fixed inset-0 z-[60] flex flex-col"
      style={{ paddingTop: 'var(--safe-top, 0px)' }}
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
      aria-busy={loading}
    >
      <div className="pdf-viewer-toolbar flex min-h-14 items-center gap-2 border-b border-white/10 px-2 shrink-0">
        <p className="min-w-0 flex-1 truncate px-1 text-sm font-semibold text-white">{file.name}</p>
        <button
          type="button"
          onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))}
          disabled={zoom <= MIN_ZOOM}
          className="flex h-12 w-12 items-center justify-center rounded-full text-gray-200 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-30"
          aria-label={t('infoDetail.zoomOutPdf')}
          title={t('infoDetail.zoomOutPdf')}
        >
          <Minus size={19} />
        </button>
        <span className="w-9 text-center text-xs font-medium tabular-nums text-gray-200" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))}
          disabled={zoom >= MAX_ZOOM}
          className="flex h-12 w-12 items-center justify-center rounded-full text-gray-200 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-30"
          aria-label={t('infoDetail.zoomInPdf')}
          title={t('infoDetail.zoomInPdf')}
        >
          <Plus size={19} />
        </button>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="flex h-12 w-12 items-center justify-center rounded-full text-gray-200 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          aria-label={t('infoDetail.closePdf')}
          title={t('infoDetail.closePdf')}
        >
          <X size={20} />
        </button>
      </div>

      <div ref={viewportRef} className="pdf-viewer-stage relative min-h-0 flex-1 overflow-auto overscroll-contain">
        {loading && (
          <div className="pdf-viewer-message absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Spinner />
            <p className="text-sm">{t('infoDetail.loadingPdf')}</p>
          </div>
        )}
        {error && (
          <div className="pdf-viewer-message absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-sm">{t('infoDetail.pdfLoadFailed')}</p>
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-control px-4 text-sm font-medium text-gray-800 transition-colors hover:bg-control-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <RotateCcw size={17} />
              {t('infoDetail.retryPdf')}
            </button>
          </div>
        )}
        {pdf && continuous && (
          <div className="flex min-h-full w-max min-w-full flex-col items-center gap-3 p-3">
            {Array.from({ length: pdf.numPages }, (_, index) => index + 1).map((pageNumber) => (
              <PdfPage
                key={pageNumber}
                pdf={pdf}
                pageNumber={pageNumber}
                zoom={zoom}
                width={width}
                scrollRoot={viewportRef.current}
                label={t('infoDetail.pdfPage', { page: pageNumber })}
                errorText={t('infoDetail.pdfPageFailed', { page: pageNumber })}
                retryText={t('infoDetail.retryPdf')}
              />
            ))}
          </div>
        )}
        {pdf && !continuous && (
          <div
            className="flex min-h-full min-w-full items-center justify-center p-3"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div
              key={`${currentPage}-${turnDirection}`}
              className={turnDirection === 'next' ? 'pdf-page-turn-next' : 'pdf-page-turn-previous'}
            >
              <PdfPage
                pdf={pdf}
                pageNumber={currentPage}
                zoom={zoom}
                width={width}
                scrollRoot={viewportRef.current}
                label={t('infoDetail.pdfPage', { page: currentPage })}
                errorText={t('infoDetail.pdfPageFailed', { page: currentPage })}
                retryText={t('infoDetail.retryPdf')}
              />
            </div>
          </div>
        )}
      </div>
      {pdf && !continuous && (
        <div className="pdf-viewer-toolbar flex min-h-14 shrink-0 items-center justify-between gap-3 border-t border-white/10 px-3">
          <button
            type="button"
            onClick={() => turnPage(-1)}
            disabled={currentPage <= 1}
            className="flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium text-gray-100 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-30"
            aria-label={t('infoDetail.previousPdfPage')}
          >
            <ChevronLeft size={20} />
            <span className="hidden min-[360px]:inline">{t('infoDetail.previousPdfPage')}</span>
          </button>
          <form onSubmit={handleJumpSubmit} className="flex items-center justify-center shrink-0">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={pdf?.numPages || 1}
              value={jumpPage}
              onChange={(e) => setJumpPage(e.target.value)}
              onBlur={handleJumpSubmit}
              className="w-12 rounded bg-white/10 px-1 py-1 text-center text-sm font-semibold tabular-nums text-white focus:bg-white/20 focus:outline-none"
              aria-label="Lompat ke halaman"
              title="Ketik angka lalu tekan enter untuk lompat halaman"
            />
            <span className="px-1.5 text-sm font-semibold text-gray-400">/</span>
            <span className="text-sm font-semibold tabular-nums text-white">{pdf.numPages}</span>
          </form>
          <button
            type="button"
            onClick={() => turnPage(1)}
            disabled={currentPage >= pdf.numPages}
            className="flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium text-gray-100 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-30"
            aria-label={t('infoDetail.nextPdfPage')}
          >
            <span className="hidden min-[360px]:inline">{t('infoDetail.nextPdfPage')}</span>
            <ChevronRight size={20} />
          </button>
        </div>
      )}
      {bottomPanel && <div className="shrink-0">{bottomPanel}</div>}
    </div>
  )
}
