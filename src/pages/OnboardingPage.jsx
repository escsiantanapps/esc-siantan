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
import { useLang } from '@/hooks/useLang'
import { translations } from '@/lib/i18n'

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
export const DEFAULT_ROADMAP = [1, 2, 3, 4].map(stage => ({
  title: translations.id[`roadmap.stage${stage}.title`],
  focus: translations.id[`roadmap.stage${stage}.focus`],
  characteristics: translations.id[`roadmap.stage${stage}.characteristics`],
  attitude: translations.id[`roadmap.stage${stage}.attitude`],
  image: `/images/roadmap/tahap${stage}.svg`,
}))

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
    <div aria-hidden="true" className="flex items-center gap-2">
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
  const navigate = useNavigate()
  const { t } = useLang()
  const [stages, setStages] = useState(null)
  const [index, setIndex] = useState(0)
  const [exiting, setExiting] = useState(false)
  const touchStart = useRef(null)
  const transitionTimer = useRef(null)
  const transitionLocked = useRef(false)
  const finished = useRef(false)

  useEffect(() => () => clearTimeout(transitionTimer.current), [])

  // Muat template dari DB; fallback diam-diam ke DEFAULT_ROADMAP.
  // stages = null sampai fetch selesai → render spinner, bukan flash default.
  useEffect(() => {
    let active = true
    appSettingsService.get('discipleship_roadmap')
      .then(v => {
        if (!active) return
        if (Array.isArray(v) && v.length > 0 && v.every(s => s && s.title)) setStages(v)
        else setStages(DEFAULT_ROADMAP)
      })
      .catch(() => { if (active) setStages(DEFAULT_ROADMAP) })
    return () => { active = false }
  }, [])

  // Tampilkan loading sampai data siap (mencegah flash konten default).
  if (!stages) {
    return <SheepLoader fullScreen size="xl" className="bg-gradient-to-br from-sky-600 to-blue-800" labelClassName="text-white/85" />
  }

  const stage = stages[index]
  // Hanya konten bawaan diterjemahkan; teks yang ditulis admin tetap dipertahankan.
  const slide = stages === DEFAULT_ROADMAP ? {
    ...stage,
    ...Object.fromEntries(['title', 'focus', 'characteristics', 'attitude'].map(field => [field, t(`roadmap.stage${index + 1}.${field}`)])),
  } : stage
  const isLast = index === stages.length - 1

  // Catat 1 penayangan & pergi ke beranda.
  function finish() {
    if (finished.current) return
    finished.current = true
    clearTimeout(transitionTimer.current)
    try {
      localStorage.setItem(ROADMAP_SEEN_KEY, String(getRoadmapSeenCount() + 1))
      localStorage.setItem(ONBOARDING_KEY, '1')
    } catch { /* private mode */ }
    navigate('/', { replace: true })
  }

  function move(direction) {
    // Ref mengunci klik dan swipe di frame yang sama, sebelum React merender disabled.
    if (transitionLocked.current || finished.current) return
    if (direction > 0 && isLast) { finish(); return }
    if (direction < 0 && index === 0) return
    transitionLocked.current = true
    setExiting(true)
    transitionTimer.current = setTimeout(() => {
      setIndex(i => Math.max(0, Math.min(stages.length - 1, i + direction)))
      setExiting(false)
      transitionLocked.current = false
    }, 180)
  }

  function onTouchStart(e) {
    if (e.target.closest('button, a')) { touchStart.current = null; return }
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function onTouchEnd(e) {
    if (!touchStart.current) return
    const dx = touchStart.current.x - e.changedTouches[0].clientX
    const dy = touchStart.current.y - e.changedTouches[0].clientY
    touchStart.current = null
    // Scroll vertikal pada layar pendek tidak boleh dianggap pindah tahap.
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1)
  }

  const gradient = STAGE_GRADIENTS[index % STAGE_GRADIENTS.length]

  return (
    <div
      className={`min-h-svh overflow-x-hidden bg-gradient-to-br ${gradient} flex flex-col transition-colors duration-300 motion-reduce:transition-none`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => { touchStart.current = null }}
    >
      {/* Skip */}
      <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-[calc(var(--safe-top,env(safe-area-inset-top,0px))+0.75rem)] md:pt-4">
        <span className="text-xs font-bold tracking-widest uppercase text-white/90">{t('roadmap.title')}</span>
        <button
          onClick={finish}
          className="flex min-h-11 items-center rounded-full px-3 text-sm text-white/90 transition hover:bg-white/10 hover:text-white"
        >
          {t('roadmap.skip')}
        </button>
      </div>

      {/* Konten utama */}
      <div
        className={`flex-1 flex flex-col items-center justify-center px-6 py-6 text-center transition-opacity duration-150 motion-reduce:transition-none ${
          exiting ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {/* Ilustrasi tahap */}
        {slide.image && (
          <img src={slide.image} alt={slide.title} width="144" height="144" className="w-28 h-28 shrink-0 mb-4 select-none" draggable="false" />
        )}

        {/* Tag tahap */}
        <span className="text-xs font-bold tracking-widest uppercase text-white/90 mb-2">
          {t('roadmap.step', { n: index + 1, total: stages.length })}
        </span>

        {/* Judul */}
        <h1 className="text-2xl font-extrabold text-white leading-tight mb-4 whitespace-pre-line tracking-tight">
          {slide.title}
        </h1>

        {/* Kartu isi tahap */}
        <div className="w-full max-w-sm bg-black/15 border border-white/30 rounded-2xl px-5 py-4 text-left space-y-2.5">
          {slide.focus && (
            <div>
              <p className="text-xs font-semibold text-white/90">{t('roadmap.focus')}</p>
              <p className="text-white text-base leading-relaxed">{slide.focus}</p>
            </div>
          )}
          {slide.characteristics && (
            <div>
              <p className="text-xs font-semibold text-white/90">{t('roadmap.characteristics')}</p>
              <p className="text-white text-base leading-relaxed">{slide.characteristics}</p>
            </div>
          )}
          {slide.attitude && (
            <div>
              <p className="text-xs font-semibold text-white/90">{t('roadmap.attitude')}</p>
              <p className="text-white text-base leading-relaxed">{slide.attitude}</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer: dots + tombol */}
      <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 flex flex-wrap gap-4 items-center justify-between shrink-0">
        <Dots total={stages.length} active={index} />

        <button
          onClick={() => move(1)}
          disabled={exiting}
          aria-busy={exiting}
          className={`
            px-7 py-3 rounded-2xl font-semibold text-sm transition-colors duration-200 disabled:opacity-60
            ${isLast
              ? 'bg-white text-[#111827]'
              : 'bg-white/20 border border-white/40 text-white hover:bg-white/30'
            }
          `}
        >
          {t(isLast ? 'roadmap.start' : 'roadmap.next')}
        </button>
      </div>
    </div>
  )
}
