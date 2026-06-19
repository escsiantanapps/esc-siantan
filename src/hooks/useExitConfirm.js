import { useEffect, useRef } from 'react'

// Konfirmasi "tekan sekali lagi untuk keluar" saat user menekan tombol back di
// halaman utama (root) — yang bila ditekan akan menutup aplikasi. Aktif hanya
// di halaman root (mis. '/'); halaman lain biarkan back berjalan normal.
//
// Cara kerja: pasang satu entri "perangkap" history. Back pertama ditangkap →
// tampilkan prompt + pasang lagi perangkap (tetap di app). Back kedua dalam 2
// detik → benar-benar keluar.
//
// Aman terhadap modal: hook useBackClose memasang state { overlayGuard }. Bila
// setelah back kita masih berada di atas perangkap/overlay, itu berarti yang
// ditutup adalah modal — bukan upaya keluar — jadi diabaikan.
export function useExitConfirm(active, onPrompt) {
  const promptRef = useRef(onPrompt)
  promptRef.current = onPrompt

  useEffect(() => {
    if (!active) return
    if (!window.history.state?.exitGuard) window.history.pushState({ exitGuard: true }, '')

    let primed = false
    let timer
    const onPop = () => {
      // Masih ada perangkap/overlay → bukan upaya keluar (mis. menutup modal).
      if (window.history.state?.exitGuard || window.history.state?.overlayGuard) return
      if (primed) {
        primed = false
        clearTimeout(timer)
        window.history.back() // tekan kedua → keluar betulan
        return
      }
      primed = true
      promptRef.current?.()
      window.history.pushState({ exitGuard: true }, '') // pasang lagi, tetap di app
      timer = setTimeout(() => { primed = false }, 2000)
    }

    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      clearTimeout(timer)
      // Bersihkan perangkap bila masih di puncak (keluar halaman bukan via back).
      if (window.history.state?.exitGuard) window.history.back()
    }
  }, [active])
}
