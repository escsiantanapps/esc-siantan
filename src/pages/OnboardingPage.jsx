/**
 * OnboardingPage.jsx — ESC Siantan
 *
 * Slide perkenalan 4 layar dengan ayat Alkitab + motivasi.
 * Muncul HANYA sekali, pada login pertama di perangkat ini (ditandai
 * dengan localStorage key 'esc-onboarding-done').
 *
 * Setelah selesai → redirect ke beranda (/).
 */

import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

export const ONBOARDING_KEY = 'esc-onboarding-done'

// ─── Data slide ──────────────────────────────────────────────────────────────
const SLIDES = [
  {
    icon: '✝️',
    gradient: 'from-sky-600 to-blue-800',
    tag: 'Selamat Datang',
    title: 'Shalom di\nESC Siantan',
    verse: '"Kasihilah seorang akan yang lain,\nsebagaimana Aku telah mengasihi kamu."',
    ref: 'Yohanes 13:34',
    desc: 'Aplikasi ini hadir untuk mendekatkan kita satu sama lain — sebagai satu tubuh Kristus.',
  },
  {
    icon: '🙌',
    gradient: 'from-indigo-600 to-purple-800',
    tag: 'Ibadah & Komunitas',
    title: 'Bertumbuh\nBersama',
    verse: '"Janganlah kita menjauhkan diri dari pertemuan-pertemuan ibadah kita."',
    ref: 'Ibrani 10:25',
    desc: 'Cek jadwal ibadah, daftar event, dan pantau kehadiran — semua dalam satu tempat.',
  },
  {
    icon: '🕊️',
    gradient: 'from-teal-600 to-cyan-800',
    tag: 'Pelayanan',
    title: 'Melayani\ndengan Sukacita',
    verse: '"Layanilah seorang akan yang lain, sesuai dengan karunia yang telah diperoleh tiap-tiap orang."',
    ref: '1 Petrus 4:10',
    desc: 'Kelola tugas pelayanan, absensi, persembahan, dan kelas pembinaan dengan mudah.',
  },
  {
    icon: '🌟',
    gradient: 'from-amber-500 to-orange-700',
    tag: 'Siap Memulai',
    title: 'Segala Perkara\nDapat Kutanggung',
    verse: '"Segala perkara dapat kutanggung di dalam Dia yang memberi kekuatan kepadaku."',
    ref: 'Filipi 4:13',
    desc: 'Masuk atau daftarkan akun kamu, dan mulailah perjalanan bersama komunitas ESC Siantan.',
  },
]

// ─── Komponen dot indicator ───────────────────────────────────────────────────
function Dots({ total, active }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i === active
              ? 'w-6 h-2 bg-white'
              : 'w-2 h-2 bg-white/40'
          }`}
        />
      ))}
    </div>
  )
}

// ─── Halaman utama ────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const navigate  = useNavigate()
  const [index, setIndex] = useState(0)
  const [exiting, setExiting] = useState(false)
  const touchStartX = useRef(null)

  const slide = SLIDES[index]
  const isLast = index === SLIDES.length - 1

  // Simpan flag & pergi ke beranda
  function finish() {
    localStorage.setItem(ONBOARDING_KEY, '1')
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
    if (diff > 50)  next()                                     // swipe kiri → next
    if (diff < -50 && index > 0) setIndex(i => i - 1)        // swipe kanan → prev
    touchStartX.current = null
  }

  return (
    <div
      className={`h-dvh overflow-hidden bg-gradient-to-br ${slide.gradient} flex flex-col transition-all duration-500`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Skip */}
      <div className="flex justify-end px-5 pt-4 pb-1 shrink-0">
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
        {/* Icon besar */}
        <div className="text-6xl mb-3 drop-shadow-lg select-none">{slide.icon}</div>

        {/* Tag */}
        <span className="text-xs font-bold tracking-widest uppercase text-white/70 mb-2">
          {slide.tag}
        </span>

        {/* Judul */}
        <h1 className="text-2xl font-extrabold text-white leading-tight mb-4 whitespace-pre-line tracking-tight">
          {slide.title}
        </h1>

        {/* Kartu ayat */}
        <div className="w-full max-w-sm bg-white/15 border border-white/30 rounded-2xl px-6 py-4 mb-4 backdrop-blur-sm">
          <p className="text-white/95 text-sm leading-relaxed italic whitespace-pre-line mb-2">
            {slide.verse}
          </p>
          <p className="text-white/60 text-xs font-semibold tracking-wide">— {slide.ref}</p>
        </div>

        {/* Deskripsi */}
        <p className="text-white/80 text-sm leading-relaxed max-w-xs">{slide.desc}</p>
      </div>

      {/* Footer: dots + tombol */}
      <div className="px-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1 flex items-center justify-between shrink-0">
        <Dots total={SLIDES.length} active={index} />

        <button
          onClick={next}
          className={`
            px-7 py-3 rounded-2xl font-bold text-sm shadow-lg transition-all duration-200
            active:scale-95 hover:scale-105
            ${isLast
              ? 'bg-white text-gray-900'
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
