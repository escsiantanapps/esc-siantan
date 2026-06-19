import { useEffect, useState } from 'react'
import { Sun, Moon, Star } from 'lucide-react'
import { useLang } from '@/hooks/useLang'

// Seekor domba (tampak samping, menghadap kiri).
function Sheep({ className, tone = '#f8fafc' }) {
  return (
    <svg className={className} width="24" height="17" viewBox="0 0 24 17" fill="none">
      <rect x="7" y="11.5" width="1.7" height="4.5" rx="0.6" fill="#334155" />
      <rect x="14" y="11.5" width="1.7" height="4.5" rx="0.6" fill="#334155" />
      <ellipse cx="12" cy="9" rx="7.5" ry="5" fill={tone} />
      <circle cx="7" cy="7" r="3" fill={tone} />
      <circle cx="12" cy="5" r="3.3" fill={tone} />
      <circle cx="16.5" cy="7" r="3" fill={tone} />
      <ellipse cx="4.6" cy="9.2" rx="2.3" ry="2.7" fill="#374151" />
      <ellipse cx="6.2" cy="7.4" rx="1.1" ry="0.7" fill="#374151" />
      <circle cx="4" cy="8.6" r="0.5" fill="#fff" />
    </svg>
  )
}

// Banner pemandangan alam beranimasi untuk hero profil:
// langit siang/malam, gunung tinggi, matahari/bulan, awan, burung, bintang,
// bukit, rumah, pagar, gembala & domba. Salam + jam berjalan di kiri atas.
// Domba: siang merumput di luar pagar; malam masuk ke dalam pagar (gembala pulang).
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

      {/* Gunung tinggi bersalju di kejauhan (di belakang awan & bukit) */}
      <svg className="absolute bottom-0 left-1/2 -translate-x-1/2" width="176" height="96" viewBox="0 0 176 96" fill="none">
        <path d="M50 40 L96 96 L8 96 Z" fill={isDay ? '#9ca3af' : '#3b3680'} opacity="0.5" />
        <path d="M88 8 L150 96 L26 96 Z" fill={isDay ? '#6b7280' : '#312e6b'} opacity="0.7" />
        {/* Salju puncak */}
        <path d="M73 30 L88 8 L104 31 L96 36 L88 27 L80 36 Z" fill={isDay ? '#f8fafc' : '#c7d2fe'} opacity="0.92" />
      </svg>

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

      {/* Pemandangan di sisi kanan (di atas bukit), agar tidak tertutup foto profil di kiri. */}
      {/* Rumah — viewBox diperluas ke atas (y negatif) untuk ruang asap.
          Malam: jendela menyala tetap + asap mengepul dari cerobong. */}
      <svg className="absolute bottom-3 right-4 drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]" width="34" height="44" viewBox="0 -14 34 44" fill="none">
        {!isDay && (
          <g fill="#cbd5e1">
            {[0, 1, 2].map(i => (
              <circle key={i} cx="24" cy="0" r="1.3" opacity="0">
                <animate attributeName="cy" values="0;-13" dur="3s" begin={`${i}s`} repeatCount="indefinite" />
                <animate attributeName="cx" values="24;26.5" dur="3s" begin={`${i}s`} repeatCount="indefinite" />
                <animate attributeName="r" values="1.1;2.6" dur="3s" begin={`${i}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;0.5;0" dur="3s" begin={`${i}s`} repeatCount="indefinite" />
              </circle>
            ))}
          </g>
        )}
        <rect x="22.5" y="-1" width="3.2" height="9" rx="0.4" fill={isDay ? '#b45309' : '#4c1d95'} />
        <rect x="6" y="13" width="22" height="15" rx="1.5" fill={isDay ? '#fef3c7' : '#a5b4fc'} stroke={isDay ? '#d97706' : '#6366f1'} strokeWidth="1" />
        <path d="M3 14 L17 3 L31 14 Z" fill={isDay ? '#dc2626' : '#7c3aed'} stroke={isDay ? '#991b1b' : '#5b21b6'} strokeWidth="1" strokeLinejoin="round" />
        <rect x="12.5" y="19" width="7" height="9" rx="0.8" fill={isDay ? '#92400e' : '#4c1d95'} />
        {!isDay && <circle cx="23" cy="19" r="5" fill="#fde68a" opacity="0.5" className="blur-[2px]" />}
        <rect x="20.5" y="16.5" width="5" height="5" rx="0.6" fill={isDay ? '#fffbeb' : '#fde047'} />
      </svg>

      {/* Domba dalam pagar (malam) — digambar SEBELUM pagar agar tampak di dalam. */}
      {!isDay && (
        <>
          <Sheep className="absolute bottom-2 right-[4rem] origin-bottom animate-[graze_5s_ease-in-out_infinite] drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]" />
          <Sheep className="absolute bottom-1.5 right-[5.6rem] origin-bottom animate-[graze_5.6s_ease-in-out_infinite] [animation-delay:-2s] drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]" tone="#e2e8f0" />
        </>
      )}

      {/* Pagar / kandang (selalu tampak) */}
      <svg className="absolute bottom-2 right-[3.4rem]" width="56" height="18" viewBox="0 0 56 18" fill="none"
        stroke={isDay ? '#92400e' : '#4c1d95'} strokeWidth="1.6" strokeLinecap="round">
        <line x1="2" y1="7" x2="54" y2="7" />
        <line x1="2" y1="13" x2="54" y2="13" />
        <line x1="3" y1="3" x2="3" y2="17" />
        <line x1="16" y1="3" x2="16" y2="17" />
        <line x1="29" y1="3" x2="29" y2="17" />
        <line x1="42" y1="3" x2="42" y2="17" />
        <line x1="54" y1="3" x2="54" y2="17" />
      </svg>

      {/* Siang: domba merumput di luar pagar + gembala menjaga */}
      {isDay && (
        <>
          <Sheep className="absolute bottom-2 right-[8rem] origin-bottom animate-[graze_4s_ease-in-out_infinite] drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]" />
          <Sheep className="absolute bottom-1.5 right-[11rem] origin-bottom animate-[graze_4.6s_ease-in-out_infinite] [animation-delay:-1.5s] drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]" tone="#f1f5f9" />
          <svg className="absolute bottom-2 right-[9.5rem] origin-bottom animate-[bobSoft_6s_ease-in-out_infinite] drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]" width="20" height="33" viewBox="0 0 20 33" fill="none">
            <path d="M16 6 q2.7 0 2.7 2.7 q0 2.3 -2.5 2.5 M16 6 L15 31" stroke="#a16207" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9.5 14 L4 31 L15 31 Z" fill="#2563eb" stroke="#1d4ed8" strokeWidth="0.6" />
            <path d="M9.8 17 L15.5 9.5" stroke="#2563eb" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="9.2" cy="9" r="3.5" fill="#f1c27d" />
            <path d="M5.7 9 a3.5 3.5 0 0 1 7 0 Z" fill="#1e3a8a" />
          </svg>
        </>
      )}

      {/* Salam + jam */}
      <div className="absolute top-4 left-4 text-white [text-shadow:_0_1px_4px_rgb(0_0_0_/_35%)]">
        <p className="text-xs font-medium text-white/90">{greeting}</p>
        <p className="text-2xl font-bold font-display tabular-nums leading-tight">{time}</p>
      </div>
    </div>
  )
}
