import { useEffect, useState } from 'react'
import { Sun, Moon, Star } from 'lucide-react'

// Banner langit: salam + jam berjalan, dengan matahari (siang) atau bulan +
// bintang berkelip (malam). Dipasang di hero profil.
export default function SkyTime() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30 * 1000)
    return () => clearInterval(id)
  }, [])

  const h = now.getHours()
  const isDay = h >= 6 && h < 18
  const greeting =
    h < 11 ? 'Selamat pagi' :
    h < 15 ? 'Selamat siang' :
    h < 18 ? 'Selamat sore' : 'Selamat malam'
  const time = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="absolute inset-0 px-4 pt-4 text-white pointer-events-none overflow-hidden">
      <p className="text-xs font-medium text-white/80">{greeting}</p>
      <p className="text-2xl font-bold font-display tabular-nums leading-tight">{time}</p>

      {isDay ? (
        <>
          <div className="absolute top-2 right-4 w-14 h-14 rounded-full bg-yellow-200/30 blur-xl" />
          <Sun size={30} strokeWidth={2}
            className="absolute top-4 right-6 text-yellow-100 animate-[spin_18s_linear_infinite]" />
          <div className="absolute top-10 right-16 w-10 h-2.5 rounded-full bg-white/35 blur-[1px] animate-[floatX_9s_ease-in-out_infinite]" />
          <div className="absolute top-14 right-10 w-7 h-2 rounded-full bg-white/25 blur-[1px] animate-[floatX_12s_ease-in-out_infinite]" />
        </>
      ) : (
        <>
          <div className="absolute top-2 right-4 w-14 h-14 rounded-full bg-indigo-200/20 blur-xl" />
          <Moon size={26} fill="currentColor"
            className="absolute top-4 right-6 text-indigo-50 animate-[floatY_6s_ease-in-out_infinite]" />
          <Star size={9} fill="currentColor" className="absolute top-3 right-16 text-white/80 animate-[twinkle_2.5s_ease-in-out_infinite]" />
          <Star size={7} fill="currentColor" className="absolute top-10 right-12 text-white/70 animate-[twinkle_3.2s_ease-in-out_infinite] [animation-delay:0.6s]" />
          <Star size={6} fill="currentColor" className="absolute top-6 right-24 text-white/60 animate-[twinkle_2.8s_ease-in-out_infinite] [animation-delay:1.1s]" />
        </>
      )}
    </div>
  )
}
