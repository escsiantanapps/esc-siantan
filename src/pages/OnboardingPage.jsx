/**
 * OnboardingPage.jsx — ESC Siantan
 *
 * Roadmap Pemuridan: 4 tahap perkembangan rohani jemaat (benih → tunas →
 * pohon → berbuah). Isi tahap (judul, fokus, karakteristik, sikap, gambar)
 * dimuat dinamis dari app_settings key 'discipleship_roadmap' — bisa diedit
 * Admin lewat /admin/roadmap. Bila belum ada di DB, pakai DEFAULT_ROADMAP.
 *
 * Frekuensi tayang diatur app_settings 'roadmap_show_count' (default 1):
 * jumlah penayangan di perangkat dilacak di localStorage — selama masih di
 * bawah batas, roadmap muncul lagi saat aplikasi dibuka.
 */

import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { appSettingsService } from '@/services/contentService'
import SheepLoader from '@/components/SheepLoader'

export const ONBOARDING_KEY = 'esc-onboarding-done'          // legacy (pra-v28)
export const ROADMAP_SEEN_KEY = 'esc-roadmap-seen-count'

// Gradien latar per tahap (kelas literal — jangan diinterpolasi).
const STAGE_GRADIENTS = [
  'from-sky-600 to-blue-800',
  'from-teal-600 to-cyan-800',
  'from-indigo-600 to-purple-800',
  'from-amber-500 to-orange-700',
]

// Konten bawaan — dipakai bila admin belum menyimpan template sendiri.
export const DEFAULT_ROADMAP = [
  {
    title: 'Benih — Lahir Baru',
    focus: 'Keselamatan & pertobatan',
    characteristics: 'Percaya kepada Tuhan Yesus, dibaptis, dan mulai membangun kebiasaan rohani.',
    attitude: 'Haus akan Firman, terbuka untuk dibimbing.',
    image: '/images/roadmap/tahap1.svg',
  },
  {
    title: 'Tunas — Bertumbuh',
    focus: 'Pengenalan akan Firman',
    characteristics: 'Rutin saat teduh, setia ibadah & komsel, mulai mengenal karunia.',
    attitude: 'Setia dalam persekutuan dan disiplin rohani.',
    image: '/images/roadmap/tahap2.svg',
  },
  {
    title: 'Pohon — Berakar Kuat',
    focus: 'Karakter Kristus & pelayanan',
    characteristics: 'Terlibat pelayanan, hidup jadi teladan, kuat menghadapi tantangan.',
    attitude: 'Rendah hati, setia, dapat dipercaya.',
    image: '/images/roadmap/tahap3.svg',
  },
  {
    title: 'Berbuah — Memuridkan',
    focus: 'Multiplikasi & memimpin',
    characteristics: 'Membimbing jiwa baru, memimpin kelompok, menjadi berkat bagi banyak orang.',
    attitude: 'Hati bapa: memberi hidup bagi orang lain.',
    image: '/images/roadmap/tahap4.svg',
  },
]

// Jumlah penayangan roadmap yang sudah terjadi di perangkat ini.
export function getRoadmapSeenCount() {
  try {
    const n = Number(localStorage.getItem(ROADMAP_SEEN_KEY))
    if (Number.isFinite(n) && n >= 0) return n
    // Migrasi dari flag lama: user lama yang sudah pernah lihat onboarding
    // dianggap sudah 1x tayang supaya tidak muncul lagi saat batas = 1.
    return localStorage.getItem(ONBOARDING_KEY) ? 1 : 0
  } catch { return 1 }
}

// Cek apakah roadmap masih perlu ditayangkan (dibanding batas dari admin).
export async function shouldShowOnboarding() {
  try {
    const limit = Number(await appSettingsService.get('roadmap_show_count'))
    const max = Number.isFinite(limit) && limit >= 0 ? limit : 1
    return getRoadmapSeenCount() < max
  } catch {
    return getRoadmapSeenCount() < 1
  }
}

function Dots({ total, active }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i === active ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/40'
          }`}
        />
      ))}
    </div>
  )
}

export default function OnboardingPage() {
  const navigate  = useNavigate()
  const [stages, setStages] = useState(null)
  const [index, setIndex] = useState(0)
  const [exiting, setExiting] = useState(false)
  const touchStartX = useRef(null)

  // Muat template dari DB; fallback diam-diam ke DEFAULT_ROADMAP.
  // stages = null sampai fetch selesai → render spinner, bukan flash default.
  useEffect(() => {
    appSettingsService.get('discipleship_roadmap')
      .then(v => {
        if (Array.isArray(v) && v.length > 0 && v.every(s => s && s.title)) setStages(v)
        else setStages(DEFAULT_ROADMAP)
      })
      .catch(() => setStages(DEFAULT_ROADMAP))
  }, [])

  // Tampilkan loading sampai data siap (mencegah flash konten default).
  if (!stages) {
    return <SheepLoader fullScreen size="xl" className="bg-gradient-to-br from-sky-600 to-blue-800" labelClassName="text-white/85" />
  }

  const slide = stages[index]
  const isLast = index === stages.length - 1

  // Catat 1 penayangan & pergi ke beranda.
  function finish() {
    try {
      localStorage.setItem(ROADMAP_SEEN_KEY, String(getRoadmapSeenCount() + 1))
      localStorage.setItem(ONBOARDING_KEY, '1')
    } catch { /* private mode */ }
    navigate('/', { replace: true })
  }

  function next() {
    if (isLast) { finish(); return }
    setExiting(true)
    setTimeout(() => {
      setIndex(i => i + 1)
      setExiting(false)
    }, 180)
  }

  // Swipe support
  function onTouchStart(e) { touchStartX.current = e.touches[0].clientX }
  function onTouchEnd(e) {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (diff > 50)  next()
    if (diff < -50 && index > 0) setIndex(i => i - 1)
    touchStartX.current = null
  }

  const gradient = STAGE_GRADIENTS[index % STAGE_GRADIENTS.length]

  return (
    <div
      className={`h-svh overflow-hidden bg-gradient-to-br ${gradient} flex flex-col transition-all duration-500`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Skip */}
      <div className="flex items-center justify-between px-5 pt-4 pb-1 shrink-0">
        <span className="text-xs font-bold tracking-widest uppercase text-white/60">Roadmap Pemuridan</span>
        <button
          onClick={finish}
          className="text-sm text-white/70 hover:text-white transition px-3 py-1.5 rounded-full hover:bg-white/10"
        >
          Lewati
        </button>
      </div>

      {/* Konten utama */}
      <div
        className={`flex-1 min-h-0 flex flex-col items-center justify-center px-8 text-center transition-all duration-180 ${
          exiting ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
        }`}
      >
        {/* Ilustrasi tahap */}
        {slide.image && (
          <img src={slide.image} alt={slide.title} className="w-36 h-36 mb-2 drop-shadow-lg select-none" draggable="false" />
        )}

        {/* Tag tahap */}
        <span className="text-xs font-bold tracking-widest uppercase text-white/70 mb-2">
          Tahap {index + 1} dari {stages.length}
        </span>

        {/* Judul */}
        <h1 className="text-2xl font-extrabold text-white leading-tight mb-4 whitespace-pre-line tracking-tight">
          {slide.title}
        </h1>

        {/* Kartu isi tahap */}
        <div className="w-full max-w-sm bg-white/15 border border-white/30 rounded-2xl px-6 py-4 backdrop-blur-sm text-left space-y-2.5">
          {slide.focus && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Fokus</p>
              <p className="text-white/95 text-sm leading-relaxed">{slide.focus}</p>
            </div>
          )}
          {slide.characteristics && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Karakteristik</p>
              <p className="text-white/95 text-sm leading-relaxed">{slide.characteristics}</p>
            </div>
          )}
          {slide.attitude && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Sikap</p>
              <p className="text-white/95 text-sm leading-relaxed">{slide.attitude}</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer: dots + tombol */}
      <div className="px-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1 flex items-center justify-between shrink-0">
        <Dots total={stages.length} active={index} />

        <button
          onClick={next}
          className={`
            px-7 py-3 rounded-2xl font-bold text-sm shadow-lg transition-all duration-200
            active:scale-95 hover:scale-105
            ${isLast
              ? 'bg-white text-[#111827]'
              : 'bg-white/20 border border-white/40 text-white hover:bg-white/30'
            }
          `}
        >
          {isLast ? 'Mulai 🚀' : 'Lanjut →'}
        </button>
      </div>
    </div>
  )
}
