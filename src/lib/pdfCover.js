import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

const COVER_WIDTH = 480
const COVER_HEIGHT = 720
const COVER_QUALITY = 0.78

// Cover dibuat dari file lokal saat Admin mengunggah PDF. Untuk buku lama,
// sumber boleh berupa URL dan hanya dipanggil lewat aksi eksplisit Admin.
export async function createPdfCoverFile(source, filename = 'cover-buku.jpg') {
  const { GlobalWorkerOptions, getDocument } = await import('pdfjs-dist')
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  const sourceConfig = source instanceof Blob
    ? { data: new Uint8Array(await source.arrayBuffer()) }
    : {
        url: source,
        disableStream: true,
        disableAutoFetch: true,
        rangeChunkSize: 64 * 1024,
      }
  const loadingTask = getDocument(sourceConfig)

  try {
    const pdf = await loadingTask.promise
    const page = await pdf.getPage(1)
    const initial = page.getViewport({ scale: 1 })
    const scale = Math.min(COVER_WIDTH / initial.width, COVER_HEIGHT / initial.height)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(viewport.width))
    canvas.height = Math.max(1, Math.round(viewport.height))

    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Canvas tidak tersedia.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: context, viewport }).promise

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', COVER_QUALITY))
    if (!blob) throw new Error('Cover tidak dapat dibuat.')

    const base = String(filename).replace(/[.][^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || 'buku'
    return new File([blob], `${base}-cover.jpg`, { type: 'image/jpeg' })
  } finally {
    await loadingTask.destroy()
  }
}
