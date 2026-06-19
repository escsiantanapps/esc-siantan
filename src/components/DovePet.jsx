import { useLocation } from 'react-router-dom'

// Merpati "peliharaan" yang bertengger di setiap halaman dan terbang masuk
// kembali setiap kali pindah halaman (mengikuti pengguna). Murni dekoratif:
// pointer-events-none agar tidak menghalangi sentuhan. Dipasang sekali di
// UserLayout (di luar <Outlet>) sehingga bertahan saat navigasi.
export default function DovePet() {
  const location = useLocation()
  return (
    // key per-path → animasi terbang-masuk diputar ulang tiap pindah halaman.
    <div
      key={location.pathname}
      className="absolute right-3 bottom-24 z-40 pointer-events-none animate-[doveFlyIn_0.7s_cubic-bezier(0.22,1,0.36,1)]"
      aria-hidden="true"
    >
      <div className="animate-[dovePerch_3.2s_ease-in-out_infinite] drop-shadow-[0_3px_4px_rgba(0,0,0,0.18)]">
        <svg width="42" height="34" viewBox="0 0 42 34" fill="none">
          {/* ekor */}
          <path d="M2 20 L13 16 L13 24 Z" fill="#e2e8f0" />
          {/* badan */}
          <path d="M11 22 Q14 10 27 11 Q34 11 38 16 Q33 20 27 20 Q18 22 14 26 Q11 26 11 22 Z" fill="#f8fafc" />
          {/* sayap (mengepak halus) */}
          <g style={{ transformOrigin: '20px 16px' }} className="animate-[doveWing_2.4s_ease-in-out_infinite]">
            <path d="M16 16 Q22 8 31 12 Q26 18 18 19 Q15 19 16 16 Z" fill="#e2e8f0" />
          </g>
          {/* kepala */}
          <circle cx="33" cy="13" r="4.2" fill="#f8fafc" />
          {/* paruh */}
          <path d="M37 12.5 L41 13.5 L37 14.8 Z" fill="#f59e0b" />
          {/* mata */}
          <circle cx="34" cy="12.2" r="0.8" fill="#334155" />
          {/* kaki bertengger */}
          <path d="M20 26 L20 30 M24 26 L24 30" stroke="#f59e0b" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}
