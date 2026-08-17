import { useEffect, useRef } from 'react'
import { ArrowLeft, Bell, Smartphone, X } from 'lucide-react'
import { useLang } from '@/hooks/useLang'

export default function NewsPortraitPreview({ title, content, thumbnailUrl, onClose }) {
  const { t } = useLang()
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previousFocus = document.activeElement
    closeRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus?.()
    }
  }, [])

  const displayTitle = title.trim() || t('anf.previewUntitled')
  const displayContent = content.trim() || t('anf.previewNoContent')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4"
      onClick={event => { if (event.target === event.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="news-preview-title"
        className="flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-100 bg-surface ambient-shadow"
      >
        <div className="flex items-center gap-3 border-b border-gray-100 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
            <Smartphone size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="news-preview-title" className="text-sm font-semibold text-gray-900">{t('anf.previewTitle')}</h2>
            <p className="text-xs text-gray-500">{t('anf.previewHint')}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('anf.previewClose')}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-control hover:text-gray-700"
          >
            <X size={19} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-control p-3 sm:p-5">
          <div className="mx-auto h-[68dvh] min-h-[440px] max-h-[640px] w-full max-w-[360px] overflow-y-auto rounded-[2rem] border-4 border-gray-800 bg-gray-50">
            <div className="gradient-main px-4 pb-8 pt-7 text-white">
              <div aria-hidden="true" className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-black/35" />
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
                  <ArrowLeft size={17} />
                </div>
                <p className="text-sm font-semibold">{t('anf.previewDetailTitle')}</p>
              </div>
            </div>

            <div className="p-4">
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-surface">
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt={t('anf.previewImageAlt', { title: displayTitle })}
                    className="aspect-video w-full object-cover"
                  />
                ) : (
                  <div className="gradient-main flex aspect-video w-full items-center justify-center">
                    <Bell size={32} className="text-white/85" strokeWidth={1.5} />
                  </div>
                )}
                <div className="space-y-3 p-4">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">{displayTitle}</h3>
                    <p className="mt-1 text-xs text-gray-500">{t('anf.previewDate')}</p>
                  </div>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-gray-600">{displayContent}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
