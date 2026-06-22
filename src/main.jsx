import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Ketika service worker baru mengambil alih (setelah deploy baru), reload otomatis
// agar chunk JS yang di-cache SW lama tidak bentrok dengan index.html baru.
// Ini mencegah white screen "Versi baru tersedia" pasca-deploy.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Hanya reload jika tab ini aktif & belum reload oleh SW update ini
    if (!sessionStorage.getItem('esc-sw-reloaded')) {
      sessionStorage.setItem('esc-sw-reloaded', '1')
      window.location.reload()
    }
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
