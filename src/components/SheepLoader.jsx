import { useEffect, useState } from 'react'
import { DotLottieReact, setWasmUrl } from '@lottiefiles/dotlottie-react'
import dotLottieWasmUrl from '@lottiefiles/dotlottie-web/dotlottie-player.wasm?url'
import { useLang } from '@/hooks/useLang'

setWasmUrl(dotLottieWasmUrl)

const SHEEP_ANIMATION = '/animations/bouncing-sheep.lottie'
const SHEEP_ANIMATION_ID = '0bbc0269-6507-4216-a41c-594a4eda94b0'
const SIZE_CLASSES = {
  sm: 'h-7 w-7',
  md: 'h-14 w-14',
  lg: 'h-20 w-20',
  xl: 'h-28 w-28',
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ))

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!media) return
    const update = event => setReduced(event.matches)
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])

  return reduced
}

export default function SheepLoader({
  size = 'md',
  fullScreen = false,
  label,
  showLabel = fullScreen,
  className = '',
  labelClassName = '',
}) {
  const { t } = useLang()
  const reducedMotion = useReducedMotion()
  const loadingLabel = label || t('app.loading')

  const content = (
    <>
      <DotLottieReact
        src={SHEEP_ANIMATION}
        animationId={SHEEP_ANIMATION_ID}
        loop={!reducedMotion}
        autoplay={!reducedMotion}
        className={`${SIZE_CLASSES[size] || SIZE_CLASSES.md} drop-shadow-[0_8px_16px_rgba(244,81,30,0.18)]`}
        aria-hidden="true"
      />
      <span className={showLabel
        ? `text-sm font-medium text-gray-500 ${labelClassName}`
        : 'sr-only'}
      >
        {loadingLabel}
      </span>
    </>
  )

  if (fullScreen) {
    return (
      <div
        className={`min-h-svh w-full flex flex-col items-center justify-center gap-2 bg-gray-50 ${className}`}
        role="status"
        aria-live="polite"
      >
        {content}
      </div>
    )
  }

  return (
    <span className={`inline-flex items-center justify-center gap-2 ${className}`} role="status" aria-live="polite">
      {content}
    </span>
  )
}
