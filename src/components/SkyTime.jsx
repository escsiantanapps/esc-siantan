import { useEffect, useState } from 'react'
import { Sun, Moon, Star } from 'lucide-react'
import { useLang } from '@/hooks/useLang'

// Banner pemandangan alam beranimasi untuk hero profil:
// langit siang/malam, matahari/bulan, awan melayang, burung, bintang berkelip,
// serta bukit & rumput bergoyang. Salam + jam berjalan di kiri atas.
export default function SkyTime() {
  const { lang, t } = useLang()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30 * 1000)
    return () => clearInterval(id)
  }, [])

  const h = now.getHours()
  const isDay = h >= 6 && h < 18
  const greeting =
    h < 11 ? t('greeting.morning') :
    h < 15 ? t('greeting.noon') :
    h < 18 ? t('greeting.afternoon') : t('greeting.night')
  const time = now.toLocaleTimeString(lang === 'en' ? 'en-GB' : 'id-ID', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Langit (gradien siang / malam) */}
      <div
        className="absolute inset-0 transition-colors duration-1000"
        style={{
          background: isDay
            ? 'linear-gradient(180deg,#38bdf8 0%,#60a5fa 45%,#bae6fd 100%)'
            : 'linear-gradient(180deg,#0f172a 0%,#312e81 55%,#4338ca 100%)',
        }}
      />

      {isDay ? (
        <>
          {/* Matahari + cahaya */}
          <div className="absolute top-3 right-6 w-16 h-16 rounded-full bg-yellow-200/60 blur-2xl animate-[sunGlow_5s_ease-in-out_infinite]" />
          <Sun size={34} strokeWidth={2}
            className="absolute top-5 right-8 text-yellow-100 animate-[spin_24s_linear_infinite]" />

          {/* Awan melayang */}
          <div className="absolute top-5 -left-10 w-16 h-5 rounded-full bg-white/85 blur-[2px] animate-[drift_26s_linear_infinite]" />
          <div className="absolute top-12 -left-10 w-12 h-4 rounded-full bg-white/70 blur-[2px] animate-[drift_34s_linear_infinite] [animation-delay:-8s]" />
          <div className="absolute top-2 -left-10 w-10 h-3.5 rounded-full bg-white/60 blur-[2px] animate-[drift_30s_linear_infinite] [animation-delay:-18s]" />

          {/* Burung */}
          <svg className="absolute top-7 -left-10 text-white/70 animate-[flyAcross_22s_linear_infinite]" width="22" height="10" viewBox="0 0 22 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M1 6 Q5 1 9 6 Q13 1 17 6" />
          </svg>
          <svg className="absolute top-3 -left-10 text-white/50 animate-[flyAcross_28s_linear_infinite] [animation-delay:-12s]" width="16" height="8" viewBox="0 0 22 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M1 6 Q5 1 9 6 Q13 1 17 6" />
          </svg>
        </>
      ) : (
        <>
          {/* Bulan + cahaya */}
          <div className="absolute top-3 right-6 w-14 h-14 rounded-full bg-indigo-200/30 blur-2xl animate-[sunGlow_6s_ease-in-out_infinite]" />
          <Moon size={28} fill="currentColor"
            className="absolute top-5 right-8 text-indigo-50 animate-[floatY_6s_ease-in-out_infinite]" />

          {/* Bintang berkelip */}
          <Star size={10} fill="currentColor" className="absolute top-3 right-20 text-white/90 animate-[twinkle_2.5s_ease-in-out_infinite]" />
          <Star size={7}  fill="currentColor" className="absolute top-10 right-16 text-white/70 animate-[twinkle_3.2s_ease-in-out_infinite] [animation-delay:0.6s]" />
          <Star size={6}  fill="currentColor" className="absolute top-6 right-28 text-white/60 animate-[twinkle_2.8s_ease-in-out_infinite] [animation-delay:1.1s]" />
          <Star size={8}  fill="currentColor" className="absolute top-12 right-32 text-white/70 animate-[twinkle_3.6s_ease-in-out_infinite] [animation-delay:0.3s]" />
          <Star size={5}  fill="currentColor" className="absolute top-2 right-40 text-white/50 animate-[twinkle_2.2s_ease-in-out_infinite] [animation-delay:1.5s]" />
          <Star size={6}  fill="currentColor" className="absolute top-9 right-48 text-white/60 animate-[twinkle_3s_ease-in-out_infinite] [animation-delay:0.9s]" />

          {/* Awan tipis malam */}
          <div className="absolute top-8 -left-10 w-14 h-4 rounded-full bg-white/15 blur-[2px] animate-[drift_40s_linear_infinite]" />
        </>
      )}

      {/* Bukit berlapis di dasar */}
      <svg className="absolute bottom-0 left-0 w-full h-16 animate-[sway_11s_ease-in-out_infinite]" viewBox="0 0 500 80" preserveAspectRatio="none" fill="none">
        <path d="M0 55 Q90 25 180 50 T380 45 T500 55 V80 H0 Z" fill={isDay ? '#16a34a' : '#0b3d2e'} opacity="0.85" />
      </svg>
      <svg className="absolute bottom-0 left-0 w-full h-12" viewBox="0 0 500 60" preserveAspectRatio="none" fill="none">
        <path d="M0 40 Q120 12 250 35 T500 38 V60 H0 Z" fill={isDay ? '#15803d' : '#072a20'} />
      </svg>

      {/* Salam + jam */}
      <div className="absolute top-4 left-4 text-white [text-shadow:_0_1px_4px_rgb(0_0_0_/_35%)]">
        <p className="text-xs font-medium text-white/90">{greeting}</p>
        <p className="text-2xl font-bold font-display tabular-nums leading-tight">{time}</p>
      </div>
    </div>
  )
}
