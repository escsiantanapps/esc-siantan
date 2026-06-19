import { useLocation } from 'react-router-dom'

// Merpati "peliharaan" yang bertengger di bagian ATAS setiap halaman dan
// menukik terbang masuk kembali setiap kali pindah halaman (mengikuti pengguna).
// Murni dekoratif: pointer-events-none. Dipasang sekali di UserLayout (di luar
// <Outlet>) sehingga bertahan saat navigasi.
export default function DovePet() {
  const location = useLocation()
  return (
    // key per-path → animasi terbang-masuk diputar ulang tiap pindah halaman.
    <div
      key={location.pathname}
      className="absolute top-2.5 right-3 z-50 pointer-events-none animate-[doveFlyIn_0.9s_cubic-bezier(0.22,1,0.36,1)]"
      aria-hidden="true"
    >
      <div className="animate-[dovePerch_3.2s_ease-in-out_infinite] drop-shadow-[0_3px_4px_rgba(0,0,0,0.28)]">
        <svg width="46" height="38" viewBox="0 0 46 38" fill="none">
          {/* ekor */}
          <path d="M2 22 L14 18 L14 26 Z" fill="#e2e8f0" />
          {/* badan */}
          <path d="M12 24 Q15 11 29 12 Q37 12 41 17 Q36 21 29 21 Q19 23 15 28 Q12 28 12 24 Z" fill="#f8fafc" />
          {/* sayap mengepak (SMIL — andal di SVG) */}
          <g>
            <path d="M17 17 Q24 8 34 13 Q28 19 19 20 Q16 20 17 17 Z" fill="#e2e8f0" />
            <animateTransform attributeName="transform" type="rotate"
              values="0 21 17; -26 21 17; 0 21 17" dur="0.55s" repeatCount="indefinite" />
          </g>
          {/* kepala */}
          <circle cx="35" cy="14" r="4.4" fill="#f8fafc" />
          {/* paruh */}
          <path d="M39 13.5 L45 14.5 L39 16 Z" fill="#f59e0b" />
          {/* mata */}
          <circle cx="36" cy="13.2" r="0.85" fill="#334155" />
          {/* kaki bertengger */}
          <path d="M21 28 L21 33 M25 28 L25 33" stroke="#f59e0b" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}
