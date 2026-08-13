import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ─── Safe Area Detection ──────────────────────────────────
// env(safe-area-inset-top) sering bernilai 0 di Android WebView.
// Kita gunakan JS untuk mendeteksi tinggi status bar secara langsung.
function applyStatusBarHeight() {
  // Baca nilai CSS dari browser (berfungsi di iOS & beberapa Android)
  const cssVal = parseInt(
    getComputedStyle(document.documentElement)
      .getPropertyValue('--sat') || '0'
  )

  // Buat elemen uji untuk membaca env(safe-area-inset-top)
  const el = document.createElement('div')
  el.style.cssText = 'position:fixed;top:env(safe-area-inset-top,0px);left:0;width:1px;height:1px;opacity:0;pointer-events:none'
  document.body.appendChild(el)
  const fromEnv = el.getBoundingClientRect().top
  document.body.removeChild(el)

  // Gunakan nilai terbesar: dari CSS env, dari posisi elemen, atau fallback
  // Untuk Android/Samsung: screen.height - window.innerHeight saat keyboard tutup
  // bisa membantu tapi tidak selalu akurat. Kita pakai max dari semua sumber.
  const detected = Math.max(cssVal, fromEnv, 0)
  // Fallback: status bar Android standar adalah 24dp.
  // Pada Samsung flagship, biasanya 28-34px pada layar xxhdpi/xxxhdpi.
  const fallback = detected > 5 ? detected : 28

  document.documentElement.style.setProperty('--safe-top', `${fallback}px`)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyStatusBarHeight)
} else {
  applyStatusBarHeight()
}
// Juga jalankan ulang setelah 300ms (setelah Capacitor siap)
setTimeout(applyStatusBarHeight, 300)

// Ketika service worker baru mengambil alih (setelah deploy baru), reload otomatis
// agar chunk JS yang di-cache SW lama tidak bentrok dengan index.html baru.
// Ini mencegah white screen "Versi baru tersedia" pasca-deploy.
if ('serviceWorker' in navigator) {
  const reloadKey = 'esc-sw-reloaded'
  let lastUpdateCheck = 0

  // iOS standalone tidak menyediakan gesture refresh. Periksa pembaruan saat
  // web app kembali aktif agar versi terbaru tetap masuk tanpa ditutup manual.
  function checkForAppUpdate() {
    if (document.visibilityState === 'hidden') return
    const now = Date.now()
    if (now - lastUpdateCheck < 60_000) return
    lastUpdateCheck = now
    navigator.serviceWorker.ready
      .then(registration => registration.update())
      .catch(() => { /* tetap gunakan versi aktif bila sedang offline */ })
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Hanya reload sekali untuk satu pergantian controller agar tidak loop.
    if (!sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, '1')
      window.location.reload()
    }
  })

  window.addEventListener('pageshow', checkForAppUpdate)
  window.addEventListener('online', checkForAppUpdate)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForAppUpdate()
  })
  checkForAppUpdate()

  // Setelah halaman baru stabil, izinkan pembaruan berikutnya pada sesi PWA
  // yang sama. Tanpa ini, iPhone yang jarang ditutup hanya reload satu kali.
  window.setTimeout(() => sessionStorage.removeItem(reloadKey), 5_000)

}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
